import { useCallback, useEffect, useRef } from 'react';

export function useSpeech() {
  const voicesRef = useRef([]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const refresh = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) voicesRef.current = v;
    };
    refresh();
    // Android WebView loads voices asynchronously — must listen for voiceschanged
    window.speechSynthesis.addEventListener('voiceschanged', refresh);

    // Android Chrome pauses synthesis when the app goes to background.
    // On resume, force a cancel so the next speak() starts cleanly.
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        window.speechSynthesis.cancel();
      }
    };
    document.addEventListener('visibilitychange', onResume);

    // Chrome bug: speechSynthesis.speaking can get stuck forever on long silence.
    // Keep-alive: call resume() every 10 s while speaking to prevent Android from pausing.
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
    }, 10_000);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
      document.removeEventListener('visibilitychange', onResume);
      clearInterval(keepAlive);
    };
  }, []);

  const speak = useCallback((text, { rate = 1.05, urgent = false } = {}) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utt  = new SpeechSynthesisUtterance(text);
    utt.lang   = 'it-IT';
    utt.rate   = urgent ? 1.1 : rate;
    utt.volume = 1;
    // Prefer "Google italiano" (best on Android), then avoid compact/low-quality voices
    const itVoices = voicesRef.current.filter((v) => v.lang.startsWith('it'));
    const itVoice  =
      itVoices.find((v) => v.name.toLowerCase().includes('google')) ??
      itVoices.find((v) => !v.name.toLowerCase().includes('compact')) ??
      itVoices[0] ?? null;
    if (itVoice) utt.voice = itVoice;
    // Android WebView needs a brief gap after cancel() before speak() is reliable
    setTimeout(() => window.speechSynthesis.speak(utt), 50);
  }, []);

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, cancel };
}
