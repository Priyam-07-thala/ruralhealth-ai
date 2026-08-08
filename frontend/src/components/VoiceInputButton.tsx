import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, AlertCircle, Keyboard, Plus, WifiOff } from 'lucide-react';
import { translations, type Language } from '../i18n/translations';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  lang: Language;
  isOnline: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  lang,
  isOnline,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Offline typed-input state
  const [showOfflinePanel, setShowOfflinePanel] = useState(false);
  const [typedText, setTypedText] = useState('');
  const offlineInputRef = useRef<HTMLTextAreaElement>(null);

  const t = translations[lang];

  // Auto-focus the offline text area when it opens
  useEffect(() => {
    if (showOfflinePanel && offlineInputRef.current) {
      offlineInputRef.current.focus();
    }
  }, [showOfflinePanel]);

  // ─── OFFLINE MODE ────────────────────────────────────────────────────────────
  // The Web Speech API (webkitSpeechRecognition) sends audio to Google/Microsoft
  // cloud servers for processing and REQUIRES an active internet connection.
  // When offline we swap the mic button for a keyboard-input panel so the ASHA
  // worker can still enter symptom text quickly without losing the feature.
  if (!isOnline) {
    const handleOfflineSubmit = () => {
      const trimmed = typedText.trim();
      if (!trimmed) return;
      onTranscript(trimmed);
      setTypedText('');
      setShowOfflinePanel(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Cmd+Enter submits
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleOfflineSubmit();
      }
      // Escape closes panel
      if (e.key === 'Escape') {
        setShowOfflinePanel(false);
        setTypedText('');
      }
    };

    return (
      <div className="inline-flex flex-col items-start gap-2 w-full">
        {/* Offline badge + toggle button */}
        <button
          type="button"
          onClick={() => setShowOfflinePanel((v) => !v)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm border ${
            showOfflinePanel
              ? 'bg-amber-600 text-white border-amber-700 shadow-amber-200'
              : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 active:scale-95'
          }`}
          title="Voice unavailable offline — click to type input"
        >
          <WifiOff className="w-4 h-4" />
          <Keyboard className="w-4 h-4" />
          <span>{t.voiceOfflineLabel}</span>
        </button>

        {/* Inline offline text-entry panel */}
        {showOfflinePanel && (
          <div className="w-full bg-amber-50 border border-amber-300 rounded-2xl p-3 shadow-md animate-fade-in space-y-2">
            {/* Hint banner */}
            <p className="text-[11px] text-amber-700 font-semibold flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {t.voiceOfflineHint}
            </p>

            {/* Text area */}
            <textarea
              ref={offlineInputRef}
              rows={2}
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.voiceTypeHere}
              className="w-full text-sm font-semibold p-2.5 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all bg-white resize-none"
            />

            {/* Action row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-amber-600 font-medium">
                Ctrl+Enter to add
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowOfflinePanel(false);
                    setTypedText('');
                  }}
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleOfflineSubmit}
                  disabled={!typedText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.voiceSubmitBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── ONLINE MODE — Web Speech API ────────────────────────────────────────────
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

      if (lang === 'hi') recognition.lang = 'hi-IN';
      else if (lang === 'bn') recognition.lang = 'bn-IN';
      else recognition.lang = 'en-IN';

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onTranscript(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access denied. Please allow microphone permission.');
        } else if (event.error === 'network') {
          setErrorMsg('Network error — voice recognition requires internet connection.');
        } else {
          setErrorMsg(t.voiceNotSupported);
        }
      };

      recognition.onend = () => setIsListening(false);

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
