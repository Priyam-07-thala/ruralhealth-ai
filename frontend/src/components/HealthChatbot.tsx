/**
 * HealthChatbot.tsx
 *
 * Floating AI health assistant powered by OpenAI GPT (via /api/chat backend endpoint).
 * The API key NEVER touches the browser — all calls go through the FastAPI backend.
 *
 * Features:
 *  - Floating button (bottom-right) that expands into a full chat panel
 *  - Multi-turn conversation with message history
 *  - Markdown-style response rendering (bold, bullets)
 *  - Medical disclaimer on every AI response
 *  - Multilingual: EN / HI / BN
 *  - Graceful error handling (no key, backend down, etc.)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  X, MessageCircleHeart, Send, Loader2, AlertCircle, Bot, User, ChevronDown,
} from 'lucide-react';
import { type Language } from '../i18n/translations';

interface Props {
  lang: Language;
  isOnline: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Quick-prompt suggestion pills shown in empty state ────────────────────────
const QUICK_PROMPTS: Record<Language, string[]> = {
  en: [
    'I have fever for 2 days, what should I do?',
    'My child has cough and cold. Home remedies?',
    'I feel dizzy and have a headache. Is it serious?',
    'I have high blood sugar. What foods to avoid?',
    'My BP reading is 160/100. What should I do?',
  ],
  hi: [
    'मुझे 2 दिन से बुखार है, क्या करूं?',
    'मेरे बच्चे को खांसी-जुकाम है। घरेलू उपाय?',
    'चक्कर आ रहे हैं और सिर दर्द है। गंभीर है?',
    'ब्लड शुगर ज़्यादा है। क्या न खाएं?',
    'बीपी 160/100 है। क्या करें?',
  ],
  bn: [
    'আমার ২ দিন ধরে জ্বর, কী করব?',
    'আমার শিশুর সর্দি-কাশি। ঘরোয়া উপায়?',
    'মাথা ঘুরছে ও ব্যথা হচ্ছে। গুরুতর?',
    'রক্তে শর্করা বেশি। কী খাব না?',
    'বিপি ১৬০/১০০। কী করব?',
  ],
};

const UI_STRINGS: Record<Language, {
  title: string; subtitle: string; placeholder: string;
  send: string; offline: string; thinking: string;
  emptyHint: string; disclaimer: string;
}> = {
  en: {
    title: 'Health Assistant AI',
    subtitle: 'Ask about symptoms, home care & when to see a doctor',
    placeholder: 'Describe your symptoms...',
    send: 'Send',
    offline: 'Chatbot requires internet connection.',
    thinking: 'Thinking...',
    emptyHint: 'Try a quick question:',
    disclaimer: 'AI guidance only — not a medical diagnosis',
  },
  hi: {
    title: 'स्वास्थ्य सहायक AI',
    subtitle: 'लक्षण, घरेलू उपाय और डॉक्टर के बारे में पूछें',
    placeholder: 'अपने लक्षण बताएं...',
    send: 'भेजें',
    offline: 'चैटबॉट के लिए इंटरनेट आवश्यक है।',
    thinking: 'सोच रहा है...',
    emptyHint: 'एक प्रश्न आज़माएं:',
    disclaimer: 'केवल AI मार्गदर्शन — चिकित्सा निदान नहीं',
  },
  bn: {
    title: 'স্বাস্থ্য সহায়ক AI',
    subtitle: 'উপসর্গ, ঘরোয়া যত্ন ও ডাক্তার দেখানো নিয়ে জিজ্ঞেস করুন',
    placeholder: 'আপনার উপসর্গ বলুন...',
    send: 'পাঠান',
    offline: 'চ্যাটবটের জন্য ইন্টারনেট প্রয়োজন।',
    thinking: 'ভাবছে...',
    emptyHint: 'একটি প্রশ্ন চেষ্টা করুন:',
    disclaimer: 'শুধুমাত্র AI নির্দেশনা — চিকিৎসা নির্ণয় নয়',
  },
};

// ── Simple inline markdown renderer (bold + bullets) ──────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, i) => {
    // Bold: **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      // Italic: *text*
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={j} className="italic opacity-80">{part.slice(1, -1)}</em>;
      }
      return part;
    });

    // Bullet point
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex items-start gap-1.5 ml-2">
          <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
          <span>{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</span>
        </div>
      );
    }
    // Empty line → spacer
    if (!line.trim()) return <div key={i} className="h-1" />;

    return <div key={i}>{parts.map((p, j) => <React.Fragment key={j}>{p}</React.Fragment>)}</div>;
  });
}

export const HealthChatbot: React.FC<Props> = ({ lang, isOnline }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ui = UI_STRINGS[lang];
  const quickPrompts = QUICK_PROMPTS[lang];

  // Scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    const content = text.trim();
    if (!content || isLoading) return;

    setInput('');
    setError(null);

    const newMessages: Message[] = [...messages, { role: 'user', content }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, language: lang }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Open health chatbot"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${
          isOpen
            ? 'bg-slate-700 shadow-slate-900/40'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/40 animate-bounce-subtle'
        }`}
      >
        {isOpen
          ? <ChevronDown className="w-6 h-6 text-white" />
          : <MessageCircleHeart className="w-7 h-7 text-white" />
        }
        {/* Unread indicator dot when closed */}
        {!isOpen && messages.length === 0 && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-amber-400 border-2 border-white rounded-full" />
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] sm:w-[400px] max-h-[600px] flex flex-col rounded-3xl shadow-2xl border border-slate-700/60 overflow-hidden bg-slate-900 animate-slide-up">

          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <MessageCircleHeart className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-extrabold text-white text-sm leading-tight">{ui.title}</p>
                <p className="text-[10px] text-emerald-100 font-medium leading-tight mt-0.5">{ui.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="text-[10px] font-bold text-white/70 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-all"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Offline banner */}
          {!isOnline && (
            <div className="bg-amber-900/60 border-b border-amber-700/40 px-4 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs text-amber-300 font-semibold">{ui.offline}</span>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0" style={{ maxHeight: '380px' }}>

            {/* Empty state — quick prompts */}
            {messages.length === 0 && !isLoading && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span>{ui.emptyHint}</span>
                </div>
                {quickPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={!isOnline}
                    onClick={() => sendMessage(prompt)}
                    className="w-full text-left text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2.5 rounded-xl border border-slate-700 hover:border-emerald-600/50 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 items-start ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center ${
                  msg.role === 'user'
                    ? 'bg-emerald-600'
                    : 'bg-teal-700'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-4 h-4 text-white" />
                    : <Bot className="w-4 h-4 text-white" />
                  }
                </div>

                {/* Bubble */}
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-md'
                    : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tl-md'
                }`}>
                  {msg.role === 'assistant'
                    ? <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
                    : <p>{msg.content}</p>
                  }
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-xl bg-teal-700 shrink-0 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-md px-3.5 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span className="text-xs text-slate-400 font-medium">{ui.thinking}</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-rose-900/40 border border-rose-700/40 rounded-2xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300 font-medium">{error}</p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Disclaimer strip */}
          <div className="px-4 py-1.5 bg-slate-800/60 border-t border-slate-700/40">
            <p className="text-[10px] text-slate-500 font-medium text-center">
              ⚕️ {ui.disclaimer}
            </p>
          </div>

          {/* Input area */}
          <div className="px-3 pb-3 pt-2 bg-slate-900 border-t border-slate-800">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={handleKeyDown}
                disabled={!isOnline || isLoading}
                placeholder={isOnline ? ui.placeholder : ui.offline}
                className="flex-1 bg-slate-800 text-slate-100 placeholder-slate-500 text-sm font-medium px-3.5 py-2.5 rounded-2xl border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none resize-none transition-all disabled:opacity-40"
                style={{ minHeight: '42px', maxHeight: '100px' }}
              />
              <button
                type="button"
                disabled={!input.trim() || isLoading || !isOnline}
                onClick={() => sendMessage(input)}
                className="w-10 h-10 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow transition-all active:scale-90 shrink-0"
              >
                {isLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />
                }
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5 text-center">
              Powered by GPT-4o mini · Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
};
