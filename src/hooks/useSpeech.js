import { useCallback, useEffect } from 'react';

export function useSpeech() {
  // Pre-warm voices on first call (some browsers load lazily)
  useEffect(() => {
    window.speechSynthesis?.getVoices();
  }, []);

  const speak = useCallback((text, { rate = 1.05, urgent = false } = {}) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang   = 'it-IT';
    utt.rate   = urgent ? 1.1 : rate;
    utt.volume = 1;
    // Prefer an Italian voice if available
    const voices = window.speechSynthesis.getVoices();
    const itVoice = voices.find(v => v.lang.startsWith('it'));
    if (itVoice) utt.voice = itVoice;
    window.speechSynthesis.speak(utt);
  }, []);

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, cancel };
}
