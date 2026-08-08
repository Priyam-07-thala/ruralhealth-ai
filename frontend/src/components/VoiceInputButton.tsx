import React, { useState } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { translations, type Language } from '../i18n/translations';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  lang: Language;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ onTranscript, lang }) => {
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const t = translations[lang];

  const toggleListening = () => {
    setErrorMsg(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg(t.voiceNotSupported);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      // Select speech recognition language
      if (lang === 'hi') recognition.lang = 'hi-IN';
      else if (lang === 'bn') recognition.lang = 'bn-IN';
      else recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onTranscript(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access denied.');
        } else {
          setErrorMsg(t.voiceNotSupported);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
      setErrorMsg(t.voiceNotSupported);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggleListening}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm ${
          isListening
            ? 'bg-rose-600 text-white animate-pulse shadow-rose-200'
            : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 active:scale-95'
        }`}
        title="Dictate symptoms using voice"
      >
        {isListening ? (
          <>
            <MicOff className="w-5 h-5 animate-spin" />
            <span>{t.speakNow}</span>
          </>
        ) : (
          <>
            <Mic className="w-5 h-5 text-emerald-600" />
            <span>🎤 Voice Input (बोलें)</span>
          </>
        )}
      </button>

      {errorMsg && (
        <span className="text-xs text-amber-700 font-medium flex items-center gap-1 mt-1 bg-amber-50 px-2 py-1 rounded border border-amber-200">
          <AlertCircle className="w-3.5 h-3.5" />
          {errorMsg}
        </span>
      )}
    </div>
  );
};
