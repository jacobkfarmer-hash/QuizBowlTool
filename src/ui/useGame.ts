import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { adjudicate } from '../core/adjudication';
import { canResume, converted, gameReducer, newGame } from '../core/game';
import type { Config, GameState } from '../core/types';
import { QuestionPools } from '../data/pools';
import { saveGame } from '../data/db';
import { sharedReader } from '../reader/manager';
import type { Progress } from '../reader/playback';
import { tokenize } from '../reader/text';
export function useGame(config: Config, recovery?: GameState) {
  const [s, dispatch] = useReducer(gameReducer, { config, recovery }, input => input.recovery ?? newGame(input.config)); const state = useRef(s); state.current = s;
  const pools = useRef<QuestionPools | null>(null); pools.current ??= new QuestionPools(config);
  const reader = useRef(sharedReader);
  const prefetched = useRef<Promise<Awaited<ReturnType<QuestionPools['reserveDraw']>>> | null>(null);
  const [status, setStatus] = useState('Preparing session…'); const [ready, setReady] = useState(false); const [bonusTokens, setBonusTokens] = useState(0); const [bonusEnded, setBonusEnded] = useState(false); const [storageError, setStorageError] = useState(''); const [readerRestart, setReaderRestart] = useState(0);
  const operation = useRef(0); const lastSave = useRef(0);
  useEffect(() => { const now = Date.now(); if (s.phase === 'READING_TOSSUP' && now - lastSave.current < 1000 && !s.ended) return; lastSave.current = now; void saveGame(s).catch(() => setStorageError('Local storage failed. Keep this tab open; history may not survive a refresh.')); }, [s]);
  useEffect(() => { pools.current!.warmBonus(); return () => { operation.current++; reader.current!.stop(); }; }, []);
  useEffect(() => {
    if (!['LOADING_TOSSUP', 'LOADING_BONUS'].includes(s.phase)) return;
    const id = ++operation.current; const generation = s.generation;
    setReady(false); setStatus(s.phase === 'LOADING_TOSSUP' ? 'Loading tossup from QBReader…' : 'Loading bonus from QBReader…');
    const run = async () => {
      if (s.phase === 'LOADING_TOSSUP') {
        const next = prefetched.current ?? pools.current!.reserveDraw(); prefetched.current = null; const result = await next;
        if (id !== operation.current) return; await pools.current!.heard(result.question._id, 'tossup'); if (id !== operation.current) return;
        dispatch({ type: 'LOAD', ...result, generation });
        if (s.number < config.count) { prefetched.current = pools.current!.reserveDraw(); void prefetched.current.catch(() => { prefetched.current = null; }); }
      } else { const result = await pools.current!.reserveBonus(); if (id !== operation.current) return; await pools.current!.heard(result.question._id, 'bonus'); if (id !== operation.current) return; dispatch({ type: 'BONUS_LOAD', ...result, generation }); }
    };
    void run().catch(e => { if (id === operation.current) dispatch({ type: 'ERROR', message: e instanceof Error ? e.message : String(e) }); });
    return () => { operation.current++; };
  }, [s.phase, s.generation, s.number, config.count]);
  useEffect(() => {
    const current = state.current;
    let text: string | undefined;
    if (current.phase === 'READING_TOSSUP') text = current.question?.question;
    else if (current.phase === 'BONUS_LEADIN') text = current.bonus?.leadin;
    else if (current.phase === 'BONUS_PART') text = current.bonus?.parts[current.part];
    if (!text) return;
    let active = true; setReady(false); setBonusTokens(0); setBonusEnded(false);
    const isTossup = current.phase === 'READING_TOSSUP';
    const onProgress = (p: Progress) => { if (!active) return; if (isTossup) dispatch({ type: 'PROGRESS', ...p }); else { setBonusTokens(p.tokens); setBonusEnded(p.ended); } };
    void reader.current!.read(text, current.session.config, { startToken: isTossup ? current.tokens : 0, onProgress, onStatus: setStatus }).then(handle => { if (!active || !handle) return; setReady(true); if (state.current.paused) handle.pause(); }).catch(e => { if (active) dispatch({ type: 'ERROR', message: String(e) }); });
    return () => { active = false; reader.current!.stop(); };
  }, [s.question?._id, s.bonus?._id, s.part, s.generation, readerRestart]);
  const buzz = useCallback(() => { const current = state.current; if (current.phase !== 'READING_TOSSUP' || current.locked || !ready || (!config.interrupts && !current.ended)) return; reader.current!.pause(); const p = reader.current!.current(); dispatch({ type: 'BUZZ', tokens: p?.tokens ?? current.tokens, elapsedMs: p?.elapsedMs ?? current.elapsedMs, durationMs: p?.durationMs }); }, [ready, config.interrupts]);
  const giveUp = () => { reader.current!.stop(); dispatch({ type: 'GIVE_UP' }); };
  const submit = async (answer: string) => {
    const current = state.current; const bonus = ['BONUS_PART', 'BONUS_PROMPTED'].includes(current.phase);
    if (!answer.trim() || (!bonus && !['BUZZED', 'PROMPTED'].includes(current.phase))) return;
    reader.current!.pause(); const id = ++operation.current; const generation = current.generation;
    dispatch({ type: bonus ? 'BONUS_CHECK' : 'CHECK' });
    try { const answerline = bonus ? current.bonus!.answers[current.part] : current.question!.answer; const ruling = await adjudicate(answerline, answer.trim(), current.pendingAnswers); if (id === operation.current && generation === state.current.generation) dispatch({ type: bonus ? 'BONUS_RULING' : 'RULING', ruling, answer: answer.trim() }); } catch (e) { if (id === operation.current) dispatch({ type: 'ERROR', message: e instanceof Error ? e.message : String(e) }); }
  };
  const proceed = () => { const current = state.current; if (canResume(current)) { dispatch({ type: 'RESUME_NEG' }); if (reader.current!.current()) reader.current!.resume(); else setReaderRestart(n => n + 1); } else if (current.phase === 'TOSSUP_RESOLVED' && converted(current) && config.bonuses) { reader.current!.stop(); dispatch({ type: 'REQUEST_BONUS' }); } else if (['BONUS_LEADIN', 'BONUS_PART_RESOLVED'].includes(current.phase)) { reader.current!.stop(); dispatch({ type: 'BONUS_NEXT' }); } else { reader.current!.stop(); dispatch({ type: 'NEXT' }); } };
  const pause = () => { if (s.paused) reader.current!.resume(); else reader.current!.pause(); dispatch({ type: 'PAUSE' }); };
  const skipBonusPart = () => { reader.current!.stop(); dispatch({ type: 'BONUS_CHECK' }); dispatch({ type: 'BONUS_RULING', ruling: { directive: 'reject' }, answer: '' }); };
  const switchReader = () => { reader.current!.useSystem(); dispatch({ type: 'READER_SYSTEM' }); };
  const totalTokens = useMemo(() => s.question ? tokenize(s.question.question).tokens.length : 0, [s.question]);
  return { s, dispatch, status, ready, bonusTokens, bonusEnded, buzz, giveUp, submit, proceed, pause, skipBonusPart, switchReader, storageError, totalTokens };
}
