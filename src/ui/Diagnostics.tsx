import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Config } from '../core/types';
import { pronunciationPipeline } from '../reader/pronunciation';
import { KokoroEngine } from '../reader/kokoro';
import { db } from '../data/db';
import type { PersonalPronunciation } from '../data/pronunciations';
import { sharedAudio } from '../reader/audio-context';
import { recordTTS, ttsDiagnostics, ttsError } from '../reader/tts-diagnostics';
import { isEnglishVoice, loadSystemVoices } from '../reader/system';
export default function Diagnostics({ config }: { config: Config }) {
  const audio = useSyncExternalStore(sharedAudio.subscribe, sharedAudio.getSnapshot);
  const diagnostic = useSyncExternalStore(ttsDiagnostics.subscribe, ttsDiagnostics.getSnapshot);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechAvailable = 'speechSynthesis' in window;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.userAgent));
  useEffect(() => {
    if (!speechAvailable) return;
    let active = true;
    const refresh = () => { if (active) setVoices(speechSynthesis.getVoices()); };
    refresh(); speechSynthesis.addEventListener('voiceschanged', refresh);
    void loadSystemVoices().then(loaded => { if (active) setVoices(loaded); });
    return () => { active = false; speechSynthesis.removeEventListener('voiceschanged', refresh); };
  }, [speechAvailable]);
  const [input, setInput] = useState('This Greek hero is named Diomedes ("dye-oh-MEE-deez"). For 10 points, name him.'); const [entries, setEntries] = useState<PersonalPronunciation[]>([]); const [phonemes, setPhonemes] = useState<string[]>([]); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false); const engine = useRef<KokoroEngine | null>(null);
  useEffect(() => { void db.pronunciations.toArray().then(setEntries); return () => engine.current?.dispose(); }, []);
  const pipeline = pronunciationPipeline(input, entries);
  const run = async () => { setBusy(true); setPhonemes([]); try { engine.current ??= new KokoroEngine(); await engine.current.initialize(setStatus); const values: string[] = []; for (const s of pipeline.segments) { const r = await engine.current.diagnose(s.text, config.voice.startsWith('system:') ? 'af_heart' : config.voice); values.push((r.phonemes ?? []).join(' ')); setPhonemes([...values]); setStatus(`${r.backend} · ${r.samples?.length} samples · voice ${config.voice}`); } } catch (e) { recordTTS({ lastError: ttsError(e) }); setStatus(String(e)); } finally { setBusy(false); } };
  return <section className="panel diagnostics"><h1>Reader diagnostics · development only</h1><h2>Browser audio</h2><dl><dt>User agent</dt><dd>{navigator.userAgent}</dd><dt>Mobile indication</dt><dd>{String(mobile)}</dd><dt>speechSynthesis available</dt><dd>{String(speechAvailable)}</dd><dt>Voices returned</dt><dd>{voices.length}</dd><dt>English voices returned</dt><dd>{voices.filter(isEnglishVoice).length}</dd><dt>AudioContext state</dt><dd>{audio.state}</dd><dt>WebGPU available</dt><dd>{String("gpu" in navigator)}</dd><dt>Selected Kokoro backend</dt><dd>{diagnostic.backend}</dd><dt>Last TTS error</dt><dd>{diagnostic.lastError || "None"}</dd><dt>Fallback reason</dt><dd>{diagnostic.fallbackReason || "None"}</dd></dl><ul>{voices.map(voice => <li key={voice.voiceURI}>{voice.name} · {voice.lang} · localService: {String(voice.localService)}</li>)}</ul><p className="help">These diagnostics stay in this tab. No telemetry is sent.</p><label>Original question HTML<textarea value={input} onChange={e => { setInput(e.target.value); setPhonemes([]); }} rows={5}/></label><h2>Canonical display text</h2><pre>{pipeline.canonicalDisplayText}</pre><h2>Normalized TTS input</h2><pre>{pipeline.spokenText}</pre><h2>Speech chunks</h2>{pipeline.segments.map((s, i) => <div key={i}><pre>{i + 1}. [{s.start}, {s.end}) {s.text}</pre>{phonemes[i] && <pre aria-label={`Phonemes ${i + 1}`}>{phonemes[i]}</pre>}</div>)}<button disabled={busy} onClick={() => void run()}>Generate Kokoro phonemes</button><p className="help">This invokes the public kokoro-js stream API and displays the exact phonemes accompanying generated audio. It downloads the model if needed. No phonemes are guessed.</p><p role="status">{status}</p></section>;
}
