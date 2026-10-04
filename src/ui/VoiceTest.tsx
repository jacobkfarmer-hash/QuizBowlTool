import { useEffect, useRef, useState } from 'react';
import type { Config } from '../core/types';
import { ReaderManager, sharedKokoro } from '../reader/manager';
import { unlockReaderAudio } from '../reader/audio-gesture';

export function VoiceTest({ config }: { config: Config }) {
  const reader = useRef<ReaderManager | null>(null);
  const [result, setResult] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => () => reader.current?.dispose(), []);
  const testVoice = () => {
    // Deliberately before read(), IndexedDB, voice enumeration or model loading.
    void unlockReaderAudio();
    reader.current ??= new ReaderManager(sharedKokoro, false);
    setBusy(true); setResult('Preparing voice…');
    void reader.current.read('Quiz bowl reader ready.', { ...config, presentation: 'both' }, {
      onAudioStart: engine => { setResult(engine === 'kokoro' ? 'High-quality voice ready' : 'System voice ready'); setBusy(false); },
      onStatus: status => { if (status === 'Reading · text') { setResult('Audio could not start'); setBusy(false); } },
      onProgress: progress => { if (progress.ended) setBusy(false); },
    }, 'preview').catch(() => { setResult('Audio could not start'); setBusy(false); });
  };
  return <section className="panel"><h2>Reader</h2><p>Test your selected voice before a session. The reader will say “Quiz bowl reader ready.”</p><div className="button-row"><button disabled={busy} onClick={testVoice}>Test voice</button>{reader.current && <button onClick={() => { reader.current?.stop(); setBusy(false); }}>Stop voice test</button>}</div><p role="status">{result}</p></section>;
}
