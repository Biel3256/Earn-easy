import React, { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { AdConsentState, adsenseService } from '../services/adsenseService';

interface AdConsentBannerProps {
  onOpenSettings?: () => void;
}

export const AdConsentBanner: React.FC<AdConsentBannerProps> = ({ onOpenSettings }) => {
  const [consent, setConsent] = useState<AdConsentState>(() => adsenseService.getConsentState());
  const [isConfigured, setIsConfigured] = useState<boolean>(() => adsenseService.isConfigured());

  useEffect(() => {
    const unsubConsent = adsenseService.subscribeConsent((next) => {
      setConsent(next);
    });
    const unsubConfig = adsenseService.subscribeConfig(() => {
      setIsConfigured(adsenseService.isConfigured());
    });
    return () => {
      unsubConsent();
      unsubConfig();
    };
  }, []);

  if (!isConfigured || consent.status !== 'pending') {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Consentimento de privacidade e anúncios"
      className="fixed bottom-36 md:bottom-5 left-3.5 right-3.5 md:left-[284px] md:right-auto md:max-w-md z-40 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-xl p-4 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xs font-extrabold text-slate-900 dark:text-white">
              Consentimento de Cookies & Anúncios
            </h2>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
              Os scripts e tags do Google AdSense só são carregados dinamicamente após você aceitar o consentimento nos cookies. Você pode escolher anúncios personalizados, não personalizados ou recusar.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => adsenseService.denyConsent()}
          aria-label="Recusar anúncios"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => adsenseService.grantConsent(true)}
          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
        >
          Aceitar Anúncios
        </button>
        <button
          type="button"
          onClick={() => adsenseService.grantConsent(false)}
          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          Não Personalizados
        </button>
        <button
          type="button"
          onClick={() => adsenseService.denyConsent()}
          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          Recusar
        </button>
      </div>

      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-2 text-[11px] font-medium text-emerald-700 dark:text-lime-400 hover:underline cursor-pointer"
        >
          Gerenciar preferências em Configurações
        </button>
      )}
    </div>
  );
};
