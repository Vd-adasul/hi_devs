import { Volume2, VolumeX } from 'lucide-react';
import { useTTS } from '../../hooks/useVoice.js';

interface VoiceOutputProps {
  text: string;
  label?: string;
}

export function VoiceOutput({ text, label = 'Read aloud' }: VoiceOutputProps) {
  const { speaking, speak, stop } = useTTS();

  return (
    <button
      type="button"
      onClick={speaking ? stop : () => speak(text)}
      className={`p-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
        speaking
          ? 'bg-indigo-100 text-indigo-700 font-semibold'
          : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'
      }`}
    >
      {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
      <span>{speaking ? 'Stop' : label}</span>
    </button>
  );
}
export default VoiceOutput;
