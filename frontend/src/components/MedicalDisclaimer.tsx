import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { translations, type Language } from '../i18n/translations';

interface MedicalDisclaimerProps {
  lang: Language;
}

export const MedicalDisclaimer: React.FC<MedicalDisclaimerProps> = ({ lang }) => {
  const t = translations[lang];

  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl my-4 text-amber-900 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-sm uppercase tracking-wider text-amber-900 flex items-center gap-2">
            <span>{t.disclaimerTitle}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-700 inline" />
          </h4>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            {t.disclaimerText}
          </p>
        </div>
      </div>
    </div>
  );
};
