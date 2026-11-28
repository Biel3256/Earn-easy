import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import {
  AdConsentState,
  AdLayoutContext,
  GameRoundCompletedEvent,
  adsenseService,
} from '../services/adsenseService';
import { AdSenseSettings } from '../types/earneasy';

interface AdInterstitialManagerProps {
  layoutContext?: AdLayoutContext;
}

interface ActiveInterstitialState {
  event: GameRoundCompletedEvent;
  clientId: string;
  slotId: string;
}

const POST_ROUND_SETTLE_DELAY_MS = 750;

/**
 * Gerenciador de Anúncios Intersticiais Pós-Rodada (Google AdSense):
 * - Escuta conclusões de rodadas (jogos solo, Double, Mines e multiplayer)
 * - Só carrega scripts ou exibe anúncios quando o consentimento de cookies está 'granted'
 * - Tenta AdSense H5 (adBreak type='next') e utiliza unidade Display responsiva como fallback
 * - Aplica intervalo mínimo (cooldown) e separação visual para evitar cliques acidentais
 */
export const AdInterstitialManager: React.FC<AdInterstitialManagerProps> = ({
  layoutContext,
}) => {
  const [consent, setConsent] = useState<AdConsentState>(() => adsenseService.getConsentState());
  const [config, setConfig] = useState<AdSenseSettings>(() => adsenseService.getEffectiveSettings());
  const [activeInterstitial, setActiveInterstitial] = useState<ActiveInterstitialState | null>(null);
  const [adStatus, setAdStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const insRef = useRef<HTMLModElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const layoutContextRef = useRef<AdLayoutContext | undefined>(layoutContext);

  useEffect(() => {
    layoutContextRef.current = layoutContext;
  }, [layoutContext]);

  const closeInterstitial = useCallback(() => {
    setActiveInterstitial(null);
    setAdStatus('loading');
    adsenseService.setInterstitialInFlight(false);
  }, []);

  useEffect(() => {
    const unsubConsent = adsenseService.subscribeConsent((next) => {
      setConsent(next);
    });
    const unsubConfig = adsenseService.subscribeConfig((next) => {
      setConfig(next);
    });
    return () => {
      unsubConsent();
      unsubConfig();
    };
  }, []);

  // Reage imediatamente se consentimento for revogado ou se o usuário entrar em rota inelegível
  useEffect(() => {
    const isAllowedNow =
      consent.status === 'granted' &&
      adsenseService.isEnabled() &&
      adsenseService.isLayoutEligibleForAds(layoutContext, true);

    if (!isAllowedNow) {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (activeInterstitial) {
        closeInterstitial();
      }
      if (consent.status !== 'granted') {
        adsenseService.unloadScripts();
      }
    }
  }, [
    consent.status,
    config.enabled,
    layoutContext,
    activeInterstitial,
    closeInterstitial,
  ]);

  // Escuta eventos de conclusão de rodada
  useEffect(() => {
    const unsubRound = adsenseService.subscribeRoundCompleted((event) => {
      const ctx = layoutContextRef.current;
      if (!adsenseService.hasConsent()) return;
      if (!adsenseService.canTriggerInterstitial(ctx)) return;

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }

      settleTimerRef.current = window.setTimeout(async () => {
        settleTimerRef.current = null;
        const latestCtx = layoutContextRef.current;

        if (!adsenseService.hasConsent()) return;
        if (!adsenseService.canTriggerInterstitial(latestCtx)) return;

        const h5Result = await adsenseService.tryShowH5NextInterstitial(latestCtx);
        if (h5Result === 'shown' || h5Result === 'blocked') {
          return;
        }

        if (!adsenseService.hasConsent()) return;
        if (!adsenseService.canTriggerInterstitial(latestCtx)) return;

        const clientId = adsenseService.getClientId();
        const slotId =
          adsenseService.getSlotIdForPlacement('post_round_interstitial') ??
          adsenseService.getDefaultSlotId();

        if (!clientId || !slotId) return;

        adsenseService.setInterstitialInFlight(true);
        adsenseService.markInterstitialShown();
        setAdStatus('loading');
        setActiveInterstitial({
          event,
          clientId,
          slotId,
        });
      }, POST_ROUND_SETTLE_DELAY_MS);
    });

    return () => {
      unsubRound();
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      adsenseService.setInterstitialInFlight(false);
    };
  }, []);

  // Carrega e inicializa o bloco AdSense dentro do modal somente com consentimento ativo
  useEffect(() => {
    if (!activeInterstitial || !insRef.current) return;
    if (!adsenseService.hasConsent()) {
      closeInterstitial();
      return;
    }

    let cancelled = false;
    const slotElement = insRef.current;

    void adsenseService
      .pushAdUnit(slotElement, {
        slotId: activeInterstitial.slotId,
        placement: 'post_round_interstitial',
        context: layoutContextRef.current,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.pushed) {
          setAdStatus('ready');
          return;
        }
        if (res.reason === 'consent_required' || res.reason === 'layout_ineligible') {
          closeInterstitial();
          return;
        }
        setAdStatus('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [activeInterstitial, closeInterstitial]);

  useEffect(() => {
    if (!activeInterstitial) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeInterstitial();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeInterstitial, closeInterstitial]);

  if (!activeInterstitial || consent.status !== 'granted') {
    return null;
  }

  const spec = adsenseService.getSlotLayoutSpec('post_round_interstitial');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interstitial-ad-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0e1319] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  id="interstitial-ad-title"
                  className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white"
                >
                  {spec.labelText}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  Google AdSense
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
                {activeInterstitial.event.label
                  ? `Após sua rodada em ${activeInterstitial.event.label}`
                  : 'Intervalo entre rodadas'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeInterstitial}
            aria-label="Fechar anúncio intersticial"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/90 text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`${spec.clearanceClass} rounded-2xl border border-slate-200/80 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-[#090d12] p-3 overflow-hidden`}
        >
          <div className={`w-full overflow-hidden ${spec.minHeightClass} ${spec.maxHeightClass}`}>
            <ins
              ref={insRef}
              className={`adsbygoogle block w-full overflow-hidden ${spec.minHeightClass} ${spec.maxHeightClass}`}
              data-adsense-mounted="true"
              data-ad-client={activeInterstitial.clientId}
              data-ad-slot={activeInterstitial.slotId}
              data-ad-format={spec.format}
              data-full-width-responsive={spec.fullWidthResponsive ? 'true' : 'false'}
            />
          </div>
          {adStatus === 'unavailable' && (
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-zinc-400">
              Nenhum anúncio disponível no momento.
            </p>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={closeInterstitial}
            className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer"
          >
            Continuar Jogando
          </button>
        </div>
      </div>
    </div>
  );
};
