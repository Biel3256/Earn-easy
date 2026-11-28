import React, { useEffect, useState } from 'react';
import { Clapperboard, Coins, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AdConsentState, adsenseService } from '../services/adsenseService';
import { AdSenseSettings } from '../types/earneasy';
import { extractReadableError, formatPoints } from '../utils/pix';

function getTodayUtcStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const RewardedAdCard: React.FC = () => {
  const { firebaseUser, adsenseSettings, myAdRewards, claimRewardedAdPoints } = useAuth();
  const { showToast } = useToast();

  const [consent, setConsent] = useState<AdConsentState>(() => adsenseService.getConsentState());
  const [effectiveConfig, setEffectiveConfig] = useState<AdSenseSettings>(() =>
    adsenseService.getEffectiveSettings()
  );
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    const unsubConsent = adsenseService.subscribeConsent(setConsent);
    const unsubConfig = adsenseService.subscribeConfig(setEffectiveConfig);
    return () => {
      unsubConsent();
      unsubConfig();
    };
  }, []);

  if (!adsenseService.isRewardedEnabled()) {
    return null;
  }

  const todayUtc = getTodayUtcStr();
  const todayWatches = myAdRewards.filter((r) => r.rewardDate === todayUtc).length;
  const dailyLimit = Math.max(1, Math.min(20, adsenseSettings.rewardedDailyLimit || 8));
  const pointsPerWatch = Math.max(10, Math.min(200, adsenseSettings.rewardedPointsPerWatch || 30));
  const remaining = Math.max(0, dailyLimit - todayWatches);

  const handleWatchRewardedAd = async () => {
    if (!firebaseUser) {
      showToast({
        type: 'error',
        title: 'Login necessário',
        message: 'Faça login com sua conta Google para assistir e receber pontos.',
      });
      return;
    }
    if (remaining <= 0) {
      showToast({
        type: 'info',
        title: 'Limite diário concluído',
        message: 'Você já atingiu o limite diário de anúncios premiados hoje.',
      });
      return;
    }
    if (consent.status !== 'granted') {
      adsenseService.grantConsent(true);
    }

    setWatching(true);
    try {
      const result = await adsenseService.showRewardedAd({ activeTab: 'games' });
      if (!result.completed || !result.provider) {
        showToast({
          type: 'info',
          title: 'Anúncio não concluído',
          message: result.message || 'O anúncio não pôde ser concluído no momento.',
        });
        return;
      }

      const claimed = await claimRewardedAdPoints(result.provider);
      showToast({
        type: 'success',
        title: 'Pontos creditados!',
        message: `+${formatPoints(claimed.pointsAwarded)} pontos creditados por assistir ao anúncio.`,
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Erro na recompensa',
        message: extractReadableError(err, 'Não foi possível creditar a recompensa do anúncio.'),
      });
    } finally {
      setWatching(false);
    }
  };

  return (
    <section
      aria-label="Anúncios Premiados"
      className="rounded-3xl border border-emerald-200/80 dark:border-lime-500/30 bg-gradient-to-br from-emerald-50 via-white to-lime-50/70 dark:from-[#0f1914] dark:via-[#0e1319] dark:to-[#0a120d] p-5 sm:p-6 shadow-sm"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-lime-400/20 border border-lime-400/40 text-emerald-700 dark:text-lime-300 flex items-center justify-center shrink-0">
            <Clapperboard className="w-6 h-6" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 dark:text-white">
                Assistir Anúncio Premiado
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-lime-400 text-slate-950">
                <Coins className="w-3 h-3" />+{formatPoints(pointsPerWatch)} pts
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Assista a um anúncio oficial completo (
              {effectiveConfig.rewardedProvider === 'gam_gpt'
                ? 'Google Ad Manager'
                : 'Google AdSense H5'}
              ) e receba moedas na hora na sua carteira.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
              <span>
                Hoje:{' '}
                <strong className="text-slate-900 dark:text-zinc-100 tabular-nums">
                  {todayWatches}/{dailyLimit}
                </strong>{' '}
                assistidos
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-lime-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                {consent.status === 'granted' ? 'Cookies aceitos' : 'Aceita cookies ao iniciar'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2.5 shrink-0">
          <button
            type="button"
            disabled={watching || remaining <= 0 || !firebaseUser}
            onClick={handleWatchRewardedAd}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-2xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs sm:text-sm font-extrabold shadow-md shadow-lime-500/15 transition-colors cursor-pointer whitespace-nowrap"
          >
            {!firebaseUser ? (
              <>
                <Lock className="w-4 h-4" />
                Entre para Assistir
              </>
            ) : watching ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                Carregando anúncio...
              </>
            ) : remaining <= 0 ? (
              <>Limite diário concluído</>
            ) : (
              <>
                <Clapperboard className="w-4 h-4" />
                Assistir Agora (+{formatPoints(pointsPerWatch)} pts)
              </>
            )}
          </button>

          <progress
            value={todayWatches}
            max={dailyLimit}
            aria-label="Progresso diário de anúncios assistidos"
            className="w-full md:w-48 h-1.5 rounded-full overflow-hidden accent-lime-400 bg-slate-200 dark:bg-zinc-800"
          />
        </div>
      </div>
    </section>
  );
};
