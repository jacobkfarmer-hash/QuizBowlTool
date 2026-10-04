import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../../data/db';
import { checkStudyAnswer } from '../answers';
import { advanceStudy, newStudySession, submitAttempt } from '../storage';
import type { PracticeSpec, StudySession } from '../types';
import { SessionSummary } from './SessionSummary';
export function PracticeSession({ spec, resumed, onPractice, onRandom, onBack }: { spec: PracticeSpec; resumed?: StudySession; onPractice(spec: PracticeSpec): void; onRandom(): void; onBack(): void }) {
  const [session, setSession] = useState(() => resumed || newStudySession(spec)), [ready, setReady] = useState(false);
  const [given, setGiven] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [revealed, setRevealed] = useState(false);
  const input = useRef<HTMLInputElement>(null), lock = useRef(false);
  const card = spec.cards[session.position], appearance = session.appearances[session.position];
  useEffect(() => { void db.studySessions.put(session).then(() => setReady(true)).catch(e => setError(`Could not save the study session: ${String(e)}`)); }, []); // Initial checkpoint; later writes are transactional.
  useEffect(() => { input.current?.focus(); }, [session.position, ready, busy]);
  const advance = useCallback(async () => {
    if (lock.current || !appearance?.correct) return;
    lock.current = true; setBusy(true); setError('');
    try { setSession(await advanceStudy(session)); setGiven(''); setFeedback(''); setRevealed(false); }
    catch (e) { setError(`Could not save progress. Try Next card again. ${String(e)}`); }
    finally { lock.current = false; setBusy(false); }
  }, [appearance?.correct, session]);
  useEffect(() => { if (!appearance?.correct || error) return; const timer = setTimeout(() => void advance(), 900); return () => clearTimeout(timer); }, [appearance?.correct, advance, error]);
  const submit = async () => {
    if (lock.current || !card || !ready) return;
    if (appearance.correct) { await advance(); return; }
    if (!given.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await checkStudyAnswer(given, card.answer, card.aliases);
      setSession(await submitAttempt(session, card, given, result.correct));
      setFeedback(result.correct ? 'Correct' : result.prompt || result.warning || 'Try again');
      if (!result.correct) { setGiven(''); input.current?.focus(); }
    } catch (e) { setError(`Your attempt could not be saved. Retry without leaving this page. ${String(e)}`); }
    finally { lock.current = false; setBusy(false); }
  };
  if (session.completedAt || session.position >= spec.cards.length) return <SessionSummary session={session} spec={spec} onPractice={onPractice} onRandom={onRandom} onBack={onBack}/>;
  return <div className="study-practice"><div className="study-heading"><div><span className="eyebrow">{spec.label}</span><h1>Recall the answer.</h1></div><button onClick={onBack}>Leave study</button></div><div className="study-flashcard panel"><div className="study-card-meta"><small>{card.category}{card.subcategory ? ` · ${card.subcategory}` : ''}</small><small>Card {session.position + 1} / {spec.cards.length}</small></div><p className="study-clue" data-testid="flashcard-clue">{card.clueText}</p><form className="study-answer" onSubmit={e => { e.preventDefault(); void submit(); }}><label htmlFor="study-answer-input">Your answer</label><div><input id="study-answer-input" ref={input} autoComplete="off" autoCapitalize="none" spellCheck={false} value={given} placeholder="Type answer…" disabled={busy || !ready} onChange={e => setGiven(e.target.value)}/><button className="primary" disabled={busy || !ready || (!appearance.correct && !given.trim())}>{appearance.correct ? 'Next card' : busy ? 'Checking…' : 'Submit'}</button></div></form><p className={`study-feedback ${appearance.correct ? 'success' : appearance.attempts ? 'incorrect' : ''}`} role="status" aria-live="polite" data-testid="study-feedback">{appearance.attempts ? `${appearance.correct ? '✅' : '❌'} ${appearance.correct ? 1 : 0}/${appearance.attempts} · ${feedback}` : 'Enter to submit. Each card stays until you answer correctly.'}</p>{error && <p className="error-message" role="alert">{error}</p>}<button className="study-reveal" onClick={() => { setRevealed(!revealed); input.current?.focus(); }}>{revealed ? 'Hide answer' : 'Reveal answer'}</button>{revealed && <p className="study-revealed">{card.answer}</p>}</div><p className="help">Progress and every attempt are saved on this device. You can resume from the Study library.</p></div>;
}
