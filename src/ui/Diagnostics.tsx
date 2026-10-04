import { useEffect, useRef, useState } from 'react';
import type { Config } from '../core/types';
import { pronunciationPipeline } from '../reader/pronunciation';
import { KokoroEngine } from '../reader/kokoro';
import { db } from '../data/db';
import type { PersonalPronunciation } from '../data/pronunciations';
export default function Diagnostics({ config }: { config: Config }) {
  const [input, setInput] = useState('This Greek hero is named Diomedes ("dye-oh-MEE-deez"). For 10 points, name him.'); const [entries, setEntries] = useState<PersonalPronunciation[]>([]); const [phonemes, setPhonemes] = useState<string[]>([]); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false); const engine = useRef<KokoroEngine | null>(null);
  useEffect(() => { void db.pronunciations.toArray().then(setEntries); return () => engine.current?.dispose(); }, []);
  const pipeline = pronunciationPipeline(input, entries);
  const run = async () => { setBusy(true); setPhonemes([]); try { engine.current ??= new KokoroEngine(); await engine.current.initialize(setStatus); const values: string[] = []; for (const s of pipeline.segments) { const r = await engine.current.diagnose(s.text, config.voice.startsWith('system:') ? 'af_heart' : config.voice); values.push((r.phonemes ?? []).join(' ')); setPhonemes([...values]); setStatus(`${r.backend} · ${r.samples?.length} samples · voice ${config.voice}`); } } catch (e) { setStatus(String(e)); } finally { setBusy(false); } };
  return <section className="panel diagnostics"><h1>Reader diagnostics · development only</h1><label>Original question HTML<textarea value={input} onChange={e => { setInput(e.target.value); setPhonemes([]); }} rows={5}/></label><h2>Canonical display text</h2><pre>{pipeline.canonicalDisplayText}</pre><h2>Normalized TTS input</h2><pre>{pipeline.spokenText}</pre><h2>Speech chunks</h2>{pipeline.segments.map((s, i) => <div key={i}><pre>{i + 1}. [{s.start}, {s.end}) {s.text}</pre>{phonemes[i] && <pre aria-label={`Phonemes ${i + 1}`}>{phonemes[i]}</pre>}</div>)}<button disabled={busy} onClick={() => void run()}>Generate Kokoro phonemes</button><p className="help">This invokes the public kokoro-js stream API and displays the exact phonemes accompanying generated audio. It downloads the model if needed. No phonemes are guessed.</p><p role="status">{status}</p></section>;
}
