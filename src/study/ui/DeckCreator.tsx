import { useMemo, useState } from 'react';
import { createDraft } from '../generation';
import { importTerms } from '../import';
import type { Deck } from '../types';

export function DifficultyPicker({ value, onChange, disabled }: { value: number[]; onChange(value: number[]): void; disabled?: boolean }) {
  return <fieldset className="study-difficulties" disabled={disabled}><legend>QBReader difficulty</legend>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <label key={n}><input type="checkbox" checked={value.includes(n)} onChange={e => onChange(e.target.checked ? [...value, n].sort((a, b) => a - b) : value.filter(d => d !== n))}/>{n}</label>)}</fieldset>;
}
export function SetSizeInput({ value, onChange }: { value: number; onChange(value: number): void }) {
  return <label className="study-field">Cards per set<select aria-label="Cards per set" value={[10, 20, 25, 50].includes(value) ? value : 'custom'} onChange={e => onChange(e.target.value === 'custom' ? 30 : Number(e.target.value))}>{[10, 20, 25, 50].map(n => <option key={n}>{n}</option>)}<option value="custom">Custom</option></select>{![10, 20, 25, 50].includes(value) && <input aria-label="Custom set size" type="number" min="1" max="1000" value={value} onChange={e => onChange(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}/>}</label>;
}
export function DeckCreator({ onCreated, onCancel }: { onCreated(deck: Deck): void; onCancel(): void }) {
  const [name, setName] = useState(''), [text, setText] = useState(''), [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [difficulties, setDifficulties] = useState([2, 3, 4]), [setSize, setSetSize] = useState(20);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const parsed = useMemo(() => { try { return { terms: importTerms(text, format), error: '' }; } catch (e) { return { terms: [], error: String(e) }; } }, [text, format]);
  const submit = async () => {
    setBusy(true); setError('');
    try { onCreated(await createDraft(name, parsed.terms, difficulties, setSize)); }
    catch (e) { setError(String(e)); setBusy(false); }
  };
  return <section className="panel study-creator"><h1>Create deck</h1><p className="help">One compact card per answer, drawn from QBReader tossups and bonuses. Drafts and completed cards are saved as analysis progresses.</p><label className="study-field">Deck name<input autoFocus value={name} maxLength={160} onChange={e => setName(e.target.value)}/></label><div className="study-import-row"><label className="import-button">Upload TXT or CSV<input type="file" accept=".txt,.csv,text/plain,text/csv" disabled={busy} onChange={e => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError('Choose a term list under 4 MB.'); return; }
    void file.text().then(value => { setFormat(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'txt'); setText(value); setError(''); }).catch(e => setError(String(e)));
  }}/></label><label>Paste format<select aria-label="Paste format" value={format} onChange={e => setFormat(e.target.value as 'txt' | 'csv')}><option value="txt">One answer per line</option><option value="csv">CSV</option></select></label></div><label className="study-field">Answer terms<textarea rows={10} value={text} placeholder="A Streetcar Named Desire&#10;Tennessee Williams&#10;Claude Monet" onChange={e => setText(e.target.value)}/></label><p role="status">{parsed.terms.length} unique imported terms</p><p className="help">CSV supports an answer column, with optional category and type columns. Blank lines and duplicate answers are removed.</p><DifficultyPicker value={difficulties} onChange={setDifficulties}/><SetSizeInput value={setSize} onChange={setSetSize}/>{(error || parsed.error) && <p className="error-message" role="alert">{error || parsed.error}</p>}<div className="button-row"><button className="primary" disabled={busy || !name.trim() || !parsed.terms.length || !difficulties.length || !!parsed.error} onClick={() => void submit()}>{busy ? 'Creating draft…' : 'Analyze QBReader'}</button><button disabled={busy} onClick={onCancel}>Cancel</button></div></section>;
}
