import { useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useSTT } from '../../hooks/useVoice.js';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
}

export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const { transcript, listening, startListening, stopListening } = useSTT();

  useEffect(() => {
    if (transcript) {
      onTranscript(transcript);
    }
  }, [transcript, onTranscript]);

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) return null; // hide on unsupported browsers

  return (
    <button
      type="button"
      onClick={listening ? stopListening : startListening}
      className={`p-2 rounded-full transition-all ${
        listening
          ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-400'
          : 'bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600'
      }`}
      title={listening ? 'Stop listening' : 'Start voice typing'}
    >
      {listening ? <MicOff size={18} /> : <Mic size={18} />}
    </button>
  );
}
export default VoiceInput;
