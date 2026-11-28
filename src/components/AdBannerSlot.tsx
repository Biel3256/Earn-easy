import React, { useEffect, useRef, useState } from 'react';
import {
  AdConsentState,
  AdLayoutContext,
  AdSlotPlacement,
  adsenseService,
} from '../services/adsenseService';
import { AdSenseSettings } from '../types/earneasy';

interface AdBannerSlotProps {
  placement: AdSlotPlacement;
  slotId?: string;
  layoutContext?: AdLayoutContext;
  className?: string;
}

export const AdBannerSlot: React.FC<AdBannerSlotProps> = ({
  placement,
  slotId,
  layoutContext,
  className = '',
}) => {
  const insRef = useRef<HTMLModElement | null>(null);
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

  const clientId = adsenseService.getClientId();
  const resolvedSlotId = (slotId || adsenseService.getSlotIdForPlacement(placement) || '').trim();
  const isSlotValid = adsenseService.isValidSlotId(resolvedSlotId);
  const isEligible = adsenseService.isLayoutEligibleForAds(layoutContext);
  const canRender =
    Boolean(clientId) &&
    consent.status === 'granted' &&
    isSlotValid &&
    isEligible;

  useEffect(() => {
    if (!canRender || !insRef.current) return;
    let active = true;
    const el = insRef.current;

    void adsenseService
      .pushAdUnit(el, {
        slotId: resolvedSlotId,
        placement,
        context: layoutContext,
      })
      .then(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [canRender, resolvedSlotId, placement, layoutContext]);

  if (!canRender || !clientId) {
    return null;
  }

  const spec = adsenseService.getSlotLayoutSpec(placement);

  return (
    <aside
      aria-label={spec.labelText}
      className={`${spec.clearanceClass} ${className}`.trim()}
    >
      <div className="rounded-2xl border border-slate-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#0e1319]/85 p-3 sm:p-4 overflow-hidden">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          <span>{spec.labelText}</span>
          <span>Google AdSense</span>
        </div>
        <div className={`w-full overflow-hidden ${spec.minHeightClass} ${spec.maxHeightClass}`}>
          <ins
            ref={insRef}
            className={`adsbygoogle block w-full overflow-hidden ${spec.minHeightClass} ${spec.maxHeightClass}`}
            data-adsense-mounted="true"
            data-ad-client={clientId}
            data-ad-slot={resolvedSlotId}
            data-ad-format={spec.format}
            data-full-width-responsive={spec.fullWidthResponsive ? 'true' : 'false'}
          />
        </div>
      </div>
    </aside>
  );
};
