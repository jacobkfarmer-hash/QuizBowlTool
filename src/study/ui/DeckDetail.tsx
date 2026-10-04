import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../../data/db';
import { emptyCard, generateDeck, type GenerationProgress } from '../generation';
import { normalizeAnswer } from '../answers';
import { deckCards, removeCard, saveDeck } from '../storage';
import type { Deck, Flashcard, PracticeSpec } from '../types';
import { CardReview } from './CardReview';
import { DifficultyPicker, SetSizeInput } from './DeckCreator';
import { SetPicker } from './SetPicker';
export function DeckDetail({ initial, analyze, onBack, onPractice }: { initial: Deck; analyze?: boolean; onBack(): void; onPractice(spec: PracticeSpec): void }) {
  const [deck, setDeck] = useState(initial), [cards, setCards] = useState<Flashcard[]>([]), [name, setName] = useState(initial.name);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState<GenerationProgress>(), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [freshSources, setFreshSources] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined), started = useRef(false);
  const refresh = useCallback(async () => { const latest = await db.decks.get(initial.id); if (latest) { setDeck(latest); setCards(await deckCards(latest)); } }, [initial.id]);
  const generate = useCallback(async (current: Deck, selected: Flashcard[], fresh = false) => {
    if (controller.current || !selected.length) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError(''); setMessage('');
    try { await generateDeck(current, selected, abort.signal, setProgress, fresh); setMessage(abort.signal.aborted ? 'Analysis stopped. Generated cards are saved; continue when ready.' : 'Analysis complete. Review or save your deck.'); }
    catch (e) { setError(String(e)); }
    finally { controller.current = undefined; setBusy(false); await refresh(); }
  }, [refresh]);
  useEffect(() => { void refresh().catch(e => setError(String(e))); }, [refresh]);
  useEffect(() => {
    // Defer startup so React StrictMode’s setup/cleanup cycle cannot cancel the first generation.
    const timer = setTimeout(() => { if (analyze && !started.current) { started.current = true; void deckCards(initial).then(c => generate(initial, c)).catch(e => setError(String(e))); } }, 0);
    return () => { clearTimeout(timer); controller.current?.abort(); };
  }, [analyze, initial, generate]);
  const updateSettings = async (changes: Partial<Deck>) => { const next = { ...deck, ...changes, updatedAt: new Date().toISOString() }; await db.decks.put(next); setDeck(next); };
  const regenerateAll = async () => {
    // Retain existing IDs for statistics, and restore original targets removed during review.
    const current = await deckCards(deck), keys = new Set(current.map(c => normalizeAnswer(c.sourceTerm)));
    const added = deck.sourceTerms.filter(t => !keys.has(normalizeAnswer(t.answer))).map(t => emptyCard(t, deck.id));
    const next = { ...deck, cardOrder: [...deck.cardOrder, ...added.map(c => c.id)] };
    await db.transaction('rw', db.decks, db.flashcards, async () => { await db.flashcards.bulkAdd(added); await db.decks.put(next); });
    setDeck(next); await generate(next, [...current, ...added], freshSources);
  };
  const pending = cards.filter(c => c.generationStatus === 'pending' || c.generationStatus === 'error' || !!c.error);
  const usable = cards.filter(c => c.clueText.trim() && !['pending', 'error', 'no-matches'].includes(c.generationStatus));
  return <div className="study-detail"><button onClick={onBack}>← Deck library</button><div className="study-heading"><div><span className="eyebrow">{deck.status === 'draft' ? 'DRAFT DECK' : 'YOUR DECK'}</span><h1>{deck.name}</h1><p className="help">{cards.length} cards · {usable.length} with usable clues</p></div><button className="primary" disabled={busy || !cards.length} onClick={() => void saveDeck(deck).then(() => { setMessage('Deck saved to your library.'); return refresh(); }).catch(e => setError(String(e)))}>{deck.status === 'draft' ? 'Save Deck' : 'Save changes'}</button></div><details className="panel"><summary>Deck settings & regeneration</summary><label className="study-field">Deck name<input value={name} onChange={e => setName(e.target.value)} maxLength={160}/></label><button disabled={busy || !name.trim()} onClick={() => void updateSettings({ name: name.trim() }).catch(e => setError(String(e)))}>Rename deck</button><DifficultyPicker value={deck.difficulties} disabled={busy} onChange={difficulties => void updateSettings({ difficulties }).catch(e => setError(String(e)))}/><SetSizeInput value={deck.setSize} onChange={setSize => void updateSettings({ setSize }).catch(e => setError(String(e)))}/><p className="help">New difficulty settings apply when you regenerate. Regenerating the entire deck restores the original imported terms and keeps IDs and statistics for existing cards.</p><label className="study-import-row"><input type="checkbox" checked={freshSources} disabled={busy} onChange={e => setFreshSources(e.target.checked)}/>Refresh QBReader source data</label><p className="help">Regeneration normally reuses sources cached for up to 30 days. Select refresh to query QBReader again.</p><button disabled={busy || !deck.difficulties.length} onClick={() => void regenerateAll().catch(e => setError(String(e)))}>Regenerate entire deck</button></details>{busy && progress && <section className="panel" aria-label="Generation progress"><h2>Analyzing QBReader</h2><progress max={progress.total || 1} value={progress.completed}/><p role="status">{progress.completed} / {progress.total} terms · {progress.failed} failed<br/>{progress.answer}</p><button onClick={() => controller.current?.abort()}>Stop analysis</button></section>}{!busy && pending.length > 0 && <section className="recovery-banner"><span>{pending.length} unfinished or failed terms. Already generated cards are saved.</span><button disabled={!deck.difficulties.length} onClick={() => void generate(deck, pending)}>Continue / retry failed terms</button></section>}{message && <p role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}{!busy && usable.length > 0 && deck.status === 'saved' && <SetPicker deck={deck} cards={usable} onPractice={onPractice}/>}<CardReview cards={cards} busy={busy} onChanged={() => void refresh().catch(e => setError(String(e)))} onRemove={card => void removeCard(deck, card.id).then(next => { setDeck(next); return refresh(); }).catch(e => setError(String(e)))} onRegenerate={card => void generate(deck, [card], freshSources)}/></div>;
}
