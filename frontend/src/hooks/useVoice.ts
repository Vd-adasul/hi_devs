import { useState, useRef, useCallback } from 'react';

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useSTT() {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = 'en-IN'; // Indian English - matches legal corpus
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      setTranscript(Array.from(e.results).map((r: any) => r[0].transcript).join(''));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  return {
    transcript,
    listening,
    startListening,
    stopListening,
    reset: () => setTranscript(''),
  };
}

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-IN';
    utt.rate = 0.95; // slightly slower - clearer for legal terms
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === 'en-IN') ||
                      voices.find(v => v.lang.startsWith('en'));
    if (preferred) utt.voice = preferred;
    
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { speaking, speak, stop };
}
export default useSTT;
