import React from 'react';
import { Activity, RefreshCw, Globe, PlusCircle, Stethoscope, Users, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { translations, type Language } from '../i18n/translations';

interface HeaderProps {
  currentTab: 'asha' | 'phc' | 'patients' | 'high-risk';
  onTabChange: (tab: 'asha' | 'phc' | 'patients' | 'high-risk') => void;
  lang: Language;
  onLangChange: (lang: Language) => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onSyncTrigger: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  lang,
  onLangChange,
  isOnline,
  pendingSyncCount,
  onSyncTrigger,
  isSyncing
}) => {
  const t = translations[lang];

  return (
    <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-emerald-900/40">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
                  {t.appTitle}
                </h1>
                <p className="text-[11px] text-emerald-300 font-medium tracking-wide">
                  {t.appSubtitle}
                </p>
              </div>
            </div>

            {/* Mobile Connection status & Sync */}
            <div className="flex lg:hidden items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                  isOnline
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                    : 'bg-rose-950 text-rose-400 border border-rose-700'
                }`}
              >
                {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {isOnline ? t.online : t.offline}
              </span>
            </div>
          </div>

          {/* Core Navigation Links */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700 w-full lg:w-auto justify-center">
            
            {/* Prominent New Assessment Button */}
            <button
              onClick={() => onTabChange('asha')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${
                currentTab === 'asha'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/30 scale-105'
                  : 'bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 border border-emerald-500/30'
              }`}
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <span>+ New Assessment</span>
            </button>

            <button
              onClick={() => onTabChange('phc')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                currentTab === 'phc'
                  ? 'bg-teal-400 text-slate-950 shadow-md shadow-teal-400/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => onTabChange('patients')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                currentTab === 'patients'
                  ? 'bg-emerald-400 text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Patients</span>
            </button>

            <button
              onClick={() => onTabChange('high-risk')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                currentTab === 'high-risk'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>High-Risk Cases</span>
            </button>

          </div>

          {/* Actions & Utilities (Language, Sync, Online Status) */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Language Selector */}
            <div className="relative flex items-center bg-slate-800 border border-slate-700 rounded-xl px-2 py-1">
              <Globe className="w-4 h-4 text-slate-400 mr-1.5" />
              <select
                value={lang}
                onChange={(e) => onLangChange(e.target.value as Language)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer pr-1"
              >
                <option value="en" className="bg-slate-900 text-white">English</option>
                <option value="hi" className="bg-slate-900 text-white">हिन्दी (Hindi)</option>
                <option value="bn" className="bg-slate-900 text-white">বাংলা (Bengali)</option>
              </select>
            </div>

            {/* Sync Status Button */}
            {pendingSyncCount > 0 && (
              <button
                onClick={onSyncTrigger}
                disabled={isSyncing || !isOnline}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 transition-all disabled:opacity-50"
                title="Sync offline records with server"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{pendingSyncCount} Pending</span>
              </button>
            )}

            {/* Network Status Pill */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                isOnline
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                  : 'bg-rose-950 text-rose-300 border-rose-700/60 animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-rose-400" />}
              <span>{isOnline ? t.online : t.offline}</span>
            </span>
          </div>

        </div>
      </div>
    </header>
  );
};
