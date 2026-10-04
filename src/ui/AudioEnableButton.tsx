import { useSyncExternalStore } from 'react';
import { sharedAudio } from '../reader/audio-context';
import { unlockReaderAudio } from '../reader/audio-gesture';
import { sharedReader } from '../reader/manager';

export function AudioEnableButton() {
  const audio = useSyncExternalStore(sharedAudio.subscribe, sharedAudio.getSnapshot);
  if (!audio.needsGesture) return null;
  return <div className="recovery-banner" role="status"><span>Audio needs your permission to start or resume.</span><button onClick={() => { void unlockReaderAudio().then(() => sharedReader.retryAudio()); }}>Tap to enable audio</button></div>;
}
