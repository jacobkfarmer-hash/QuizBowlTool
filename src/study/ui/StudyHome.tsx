import { useCallback, useEffect, useState } from 'react';
import { db } from '../../data/db';
import { randomCards } from '../practice';
import { deleteDeck } from '../storage';
import type { CardAttempt, Deck, Flashcard, PracticeSpec, StudySession } from '../types';
import { DeckCreator } from './DeckCreator';
import { DeckDetail } from './DeckDetail';
import { PracticeSession } from './PracticeSession';
import { RandomPractice } from './SetPicker';
import { StudyStats } from './StudyStats';
import './study.css';

export default function StudyHome() {
  const [decks, setDecks] = useState<Deck[]>([]), [cards, setCards] = useState<Flashcard[]>([]), [attempts, setAttempts] = useState<CardAttempt[]>([]), [sessions, setSessions] = useState<StudySession[]>([]);
  const [view, setView] = useState<'library' | 'create' | 'detail' | 'practice' | 'stats'>('library');
  const [selected, setSelected] = useState<Deck>(), [analyze, setAnalyze] = useState(false), [run, setRun] = useState<{ spec: PracticeSpec; resumed?: StudySession; key: string }>();
  const [error, setError] = useState(''), [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const data = await Promise.all([db.decks.orderBy('updatedAt').reverse().toArray(), db.flashcards.toArray(), db.cardAttempts.toArray(), db.studySessions.orderBy('createdAt').reverse().toArray()]);
    setDecks(data[0]); setCards(data[1]); setAttempts(data[2]); setSessions(data[3]); setLoaded(true);
  }, []);
  useEffect(() => { void refresh().catch(e => { setError(String(e)); setLoaded(true); }); }, [refresh]);
  const library = () => { setView('library'); setRun(undefined); void refresh().catch(e => setError(String(e))); };
  const detail = (deck: Deck, startAnalysis = false) => { setSelected(deck); setAnalyze(startAnalysis); setView('detail'); };
  const practice = (spec: PracticeSpec, resumed?: StudySession) => { if (!spec.cards.length) return; setRun({ spec, resumed, key: crypto.randomUUID() }); setView('practice'); };
  const backFromPractice = () => { if (run?.spec.deckId && selected?.id === run.spec.deckId) detail(selected); else library(); };
  const anotherRandom = async () => {
    if (!run?.spec.random) return;
    const { count, filters } = run.spec.random;
    const savedIds = new Set((await db.decks.where('status').equals('saved').toArray()).map(d => d.id));
    const pool = (await db.flashcards.toArray()).filter(c => savedIds.has(c.deckId));
    practice({ ...run.spec, cards: randomCards(pool, count, filters) });
  };
  if (view === 'create') return <div className="study-page"><DeckCreator onCreated={deck => detail(deck, true)} onCancel={library}/></div>;
  if (view === 'detail' && selected) return <div className="study-page"><DeckDetail key={selected.id} initial={selected} analyze={analyze} onBack={library} onPractice={spec => { setAnalyze(false); practice(spec); }}/></div>;
  if (view === 'practice' && run) return <div className="study-page"><PracticeSession key={run.key} spec={run.spec} resumed={run.resumed} onPractice={practice} onRandom={() => void anotherRandom().catch(e => setError(String(e)))} onBack={backFromPractice}/>{error && <p className="error-message" role="alert">{error}</p>}</div>;
  const savedDecks = decks.filter(d => d.status === 'saved'), savedIds = new Set(savedDecks.map(d => d.id));
  const unfinished = sessions.filter(s => !s.completedAt && !s.abandonedAt).slice(0, 5);
  return <div className="study-page"><div className="study-heading"><div><span className="eyebrow">YOUR CLUE LIBRARY</span><h1>Study</h1><p className="help">Compact clues. Repeated recall. Progress saved on this device.</p></div><button className="primary" onClick={() => setView('create')}>Create Deck</button></div><div className="tabs"><button className={view === 'library' ? 'active' : ''} onClick={library}>Deck library</button><button className={view === 'stats' ? 'active' : ''} onClick={() => { setView('stats'); void refresh().catch(e => setError(String(e))); }}>Study stats</button></div>{error && <p className="error-message" role="alert">{error}</p>}{!loaded ? <p>Opening your decks…</p> : view === 'stats' ? <StudyStats attempts={attempts} decks={decks} sessions={sessions}/> : <>{unfinished.map(s => <div key={s.id} className="recovery-banner"><span>{s.label} · {s.appearances.filter(a => a.correct).length}/{s.cardIds.length} complete</span><div className="button-row"><button onClick={() => {
    const pool = new Map(cards.map(c => [c.id, c])); const resolved = s.cardIds.map(id => pool.get(id));
    if (resolved.some(c => !c)) { setError('Some cards in this run were removed. Start a new set or dismiss this saved run.'); return; }
    const deck = decks.find(d => d.id === s.deckId); if (deck) setSelected(deck);
    practice({ label: s.label, deckId: s.deckId, cards: resolved as Flashcard[] }, s);
  }}>Resume study</button><button onClick={() => void db.studySessions.update(s.id, { abandonedAt: new Date().toISOString() }).then(refresh).catch(e => setError(String(e)))}>Dismiss run</button></div></div>)}<section className="study-library" aria-label="Deck library">{decks.map(deck => {
    const count = cards.filter(c => c.deckId === deck.id).length;
    return <article className="panel" key={deck.id}><div className="study-row"><h2>{deck.name}</h2><small>{deck.status === 'draft' ? 'Draft' : `${Math.ceil(count / deck.setSize)} sets`}</small></div><p className="help">{count} cards · {deck.setSize} per set · Difficulties {deck.difficulties.join(', ')}</p><div className="button-row"><button onClick={() => detail(deck)}>{deck.status === 'draft' ? 'Continue draft' : 'Study'}</button><button onClick={() => detail(deck)}>Review / Edit Cards</button><button aria-label={`Delete deck ${deck.name}`} onClick={() => { if (window.confirm(`Delete “${deck.name}” and its cards? Historical study statistics will remain.`)) void deleteDeck(deck.id).then(refresh).catch(e => setError(String(e))); }}>Delete</button></div></article>;
  })}{!decks.length && <section className="panel empty-state"><h2>Build your first clue deck.</h2><p>Paste your answer list, or upload a TXT or CSV file. Cadence finds recurring QBReader clues and makes one card per answer.</p><button className="primary" onClick={() => setView('create')}>Create your first deck</button></section>}</section><RandomPractice cards={cards.filter(c => savedIds.has(c.deckId))} decks={savedDecks} onPractice={practice}/></>}</div>;
}
