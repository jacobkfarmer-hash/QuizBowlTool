import { useEffect, useRef, useState } from 'react';
import type { Config } from '../core/types';
import { DEFAULT_CONFIG } from '../core/config';
import { readSetting, savePronunciation } from '../data/db';
import { spokenSpelling, validatePronunciation, type PersonalPronunciation } from '../data/pronunciations';
import { ReaderManager, sharedKokoro } from '../reader/manager';
import { plainText } from '../api/parser';
import { unlockReaderAudio } from '../reader/audio-gesture';

export function PronunciationEditor({ initial, question = '', config, onClose, onSaved }: { initial?: PersonalPronunciation; question?: string; config?: Config; onClose(): void; onSaved?(): void }) {
  const [canonical, setCanonical] = useState(initial?.canonical ?? ''); const [spoken, setSpoken] = useState(initial?.spoken ?? ''); const [caseSensitive, setCaseSensitive] = useState(initial?.caseSensitive ?? false); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const reader = useRef<ReaderManager | null>(null);
  useEffect(() => { dialog.current?.showModal(); return () => { reader.current?.dispose(); }; }, []);
  const preview = async () => {
    void unlockReaderAudio();
    reader.current ??= new ReaderManager(sharedKokoro, false); setBusy(true);
    try { validatePronunciation({ canonical: canonical || 'Preview', spoken }); const c = config ?? await readSetting<Config>('config') ?? DEFAULT_CONFIG;
      // Preview respelling directly so an existing lexicon entry cannot rewrite it again.
      await reader.current.read(`This clue refers to ${spokenSpelling(spoken)}.`, { ...c, presentation: 'both' }, { onStatus: setStatus, onProgress: p => { if (p.ended) setBusy(false); } }, 'preview');
    } catch (e) { setStatus(String(e)); } finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="pronunciation-dialog" onCancel={onClose}><form onSubmit={e => { e.preventDefault(); reader.current?.stop(); void savePronunciation({ canonical, spoken, caseSensitive, notes: initial?.notes }, initial?.id).then(() => { onSaved?.(); onClose(); }).catch(e => setStatus(String(e))); }}><div className="section-title"><h2>Fix pronunciation</h2><button type="button" aria-label="Close pronunciation editor" onClick={onClose}>×</button></div><p className="help">Only the reader changes. Your question text stays exactly as supplied.</p>{question && <details><summary>Choose a term from this question</summary><p className="pronunciation-source">{plainText(question)}</p><select aria-label="Choose problem term" defaultValue="" onChange={e => setCanonical(e.target.value)}><option value="" disabled>Select a word, or enter a full name below</option>{[...new Set(plainText(question).split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean))].map(w => <option key={w}>{w}</option>)}</select></details>}<label>Word or full name<input autoFocus required maxLength={160} value={canonical} onChange={e => setCanonical(e.target.value)} placeholder="Diomedes" /></label><label>Spoken spelling<input required maxLength={160} value={spoken} onChange={e => setSpoken(e.target.value)} placeholder="dye oh MEE deez" /></label><label className="checkbox-label"><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)}/> Match capitalization exactly</label><p className="help">Whole words and names only. Preview uses your selected voice and reading speed. Respellings are approximate; adjust them after listening.</p><div className="button-row"><button type="button" disabled={!spoken.trim() || busy} onClick={() => void preview()}>Preview selected voice</button><button type="button" onClick={() => { reader.current?.stop(); setBusy(false); setStatus('Preview stopped.'); }}>Stop preview</button><button className="primary">Save correction</button></div><p role="status" className="help">{status}</p></form></dialog>;
}
export function FixPronunciation({ question, config }: { question: string; config?: Config }) { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Fix pronunciation</button>{open && <PronunciationEditor question={question} config={config} onClose={() => setOpen(false)}/>}</>; }
