import React, { useEffect, useState } from 'react';
import {
  AdConsentState,
  AdLayoutContext,
  AdSlotPlacement,
  adsenseService,
} from '../services/adsenseService';
import { AdSenseSettings } from '../types/earneasy';
import { AdBannerSlot } from './AdBannerSlot';
import { AdConsentBanner } from './AdConsentBanner';
import { AdInterstitialManager } from './AdInterstitialManager';

interface AdSenseManagerProps {
  placement?: AdSlotPlacement;
  layoutContext?: AdLayoutContext;
  onOpenSettings?: () => void;
  showSlot?: boolean;
  className?: string;
}

/**
 * Gerenciador de AdSense:
 * - Integra variáveis VITE_ADSENSE_CLIENT_ID / VITE_ADSENSE_DEFAULT_SLOT e configuração do Painel Admin (Firestore)
 * - Aguarda consentimento explícito em cookies antes de carregar scripts/tags
 * - Orquestra banners, consentimento e anúncios intersticiais pós-rodada respeitando as diretrizes da plataforma
 */
export const AdSenseManager: React.FC<AdSenseManagerProps> = ({
  placement = 'games_hub_footer',
  layoutContext,
  onOpenSettings,
  showSlot = true,
  className = '',
}) => {
  const [consent, setConsent] = useState<AdConsentState>(() => adsenseService.getConsentState());
  const [, setConfigTick] = useState<AdSenseSettings>(() => adsenseService.getEffectiveSettings());

  useEffect(() => {
    const unsubConsent = adsenseService.subscribeConsent((next) => {
      setConsent(next);
    });
    const unsubConfig = adsenseService.subscribeConfig((next) => {
      setConfigTick(next);
    });
    return () => {
      unsubConsent();
      unsubConfig();
    };
  }, []);

  const resolvedClientId = adsenseService.getClientId();
  const resolvedSlotId =
    adsenseService.getSlotIdForPlacement(placement) ?? adsenseService.getDefaultSlotId();
  const isLayoutEligible = adsenseService.isLayoutEligibleForAds(layoutContext);

  useEffect(() => {
    if (!resolvedClientId) return;
    if (consent.status !== 'granted') {
      adsenseService.unloadScripts();
      return;
    }
    if (!isLayoutEligible) return;

    void adsenseService.loadScript(layoutContext);
  }, [resolvedClientId, consent.status, isLayoutEligible, layoutContext]);

  return (
    <>
      {showSlot &&
        resolvedClientId &&
        resolvedSlotId &&
        consent.status === 'granted' &&
        isLayoutEligible && (
          <AdBannerSlot
            placement={placement}
            slotId={resolvedSlotId}
            layoutContext={layoutContext}
            className={className}
          />
        )}

      {!layoutContext?.isBackoffice &&
        !layoutContext?.isMaintenance &&
        !layoutContext?.isAuthGate && (
          <>
            <AdInterstitialManager layoutContext={layoutContext} />
            <AdConsentBanner onOpenSettings={onOpenSettings} />
          </>
        )}
    </>
  );
};
