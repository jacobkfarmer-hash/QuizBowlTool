import { sharedAudio } from './audio-context';
import { primeSystemSpeech } from './system';

export function unlockReaderAudio() {
  // Both calls happen in the original gesture stack, before model/voice loading.
  const audio = sharedAudio.unlockFromGesture();
  primeSystemSpeech();
  return audio;
}
