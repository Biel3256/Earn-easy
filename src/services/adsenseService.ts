import { AdSenseSettings, DEFAULT_ADSENSE_SETTINGS } from '../types/earneasy';

export type AdConsentStatus = 'pending' | 'granted' | 'denied';

export interface AdConsentState {
  status: AdConsentStatus;
  personalized: boolean;
  updatedAt: number | null;
}

export type AdSlotPlacement =
  | 'games_hub_footer'
  | 'ranking_banner'
  | 'dashboard_banner'
  | 'invites_banner'
  | 'post_round_interstitial';

export interface AdLayoutContext {
  routePath?: string;
  activeTab?: string;
  isBackoffice?: boolean;
  isMaintenance?: boolean;
  isAuthGate?: boolean;
  isActiveGameplay?: boolean;
  hasBlockingModal?: boolean;
}

export interface AdSlotLayoutSpec {
  placement: AdSlotPlacement;
  format: 'auto' | 'horizontal' | 'rectangle';
  fullWidthResponsive: boolean;
  minHeightClass: string;
  maxHeightClass: string;
  clearanceClass: string;
  labelText: string;
}

export interface PushAdUnitOptions {
  slotId: string;
  placement: AdSlotPlacement;
  context?: AdLayoutContext;
}

export interface PushAdUnitResult {
  pushed: boolean;
  reason?:
    | 'unconfigured'
    | 'consent_required'
    | 'layout_ineligible'
    | 'invalid_slot'
    | 'density_limit_reached'
    | 'script_load_failed';
}

export interface RewardedAdPlayResult {
  completed: boolean;
  provider?: 'gam_gpt' | 'adsense_h5';
  reason?:
    | 'unconfigured'
    | 'consent_required'
    | 'dismissed'
    | 'no_fill'
    | 'script_load_failed'
    | 'busy';
  message?: string;
}

export interface GameRoundCompletedEvent {
  category: string;
  label?: string;
  score?: number;
  timestamp: number;
}

export type InterstitialShowResult = 'shown' | 'fallback' | 'blocked';

export interface AdSenseDiagnostics {
  enabled: boolean;
  source: 'firestore' | 'env' | 'none';
  clientId: string | null;
  defaultSlotId: string | null;
  hasDisplayConfig: boolean;
  rewardedProvider: AdSenseSettings['rewardedProvider'];
  rewardedAdUnitPath: string;
  hasRewardedConfig: boolean;
  consentStatus: AdConsentStatus;
  scriptLoaded: boolean;
}

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>> & {
      loaded?: boolean;
      requestNonPersonalizedAds?: 0 | 1;
      pauseAdRequests?: 0 | 1;
    };
    adConfig?: (config: Record<string, unknown>) => void;
    adBreak?: (options: Record<string, unknown>) => void;
    googletag?: {
      cmd: Array<() => void>;
      apiReady?: boolean;
      enums: {
        OutOfPageFormat: {
          REWARDED: unknown;
        };
      };
      defineOutOfPageSlot: (
        adUnitPath: string,
        format: unknown
      ) => {
        addService: (service: unknown) => unknown;
      } | null;
      pubads: () => {
        enableSingleRequest?: () => void;
        addEventListener: (event: string, cb: (event: { slot?: unknown; makeRewardedVisible?: () => void }) => void) => void;
        removeEventListener?: (event: string, cb: (event: { slot?: unknown; makeRewardedVisible?: () => void }) => void) => void;
      };
      enableServices: () => void;
      display: (slot: unknown) => void;
      destroySlots: (slots?: unknown[]) => boolean;
    };
    dataLayer?: unknown[];
  }
}

const CONSENT_STORAGE_KEY = 'earneasy_ads_consent_v1';
const ADSENSE_SCRIPT_SELECTOR = 'script[data-adsense-service="earneasy"]';
const GPT_SCRIPT_SELECTOR = 'script[data-gam-gpt-service="earneasy"]';
const ADSENSE_CLIENT_REGEX = /^ca-pub-\d{10,20}$/;
const ADSENSE_SLOT_REGEX = /^\d{6,20}$/;
const GAM_UNIT_PATH_REGEX = /^\/\d{4,20}\/[a-zA-Z0-9_.\-\/]{1,100}$/;

/**
 * Platform layout & AdSense policy guardrails:
 * - Never render inside backoffice, auth gates, maintenance screens, or active game/Pix flows
 * - Enforce vertical separation from clickable controls and mobile bottom navigation
 * - Limit visible ad density per screen to preserve clean visual hierarchy and zero CLS
 */
export const AD_LAYOUT_GUIDELINES = {
  maxAdsPerView: 2,
  minClearanceFromControlsPx: 16,
  blockedRoutes: ['/backoffice', '#/backoffice'] as readonly string[],
  blockedTabs: ['wallet', 'support', 'play_friends'] as readonly string[],
  interstitialBlockedTabs: ['wallet', 'support'] as readonly string[],
  eligiblePlacements: [
    'games_hub_footer',
    'ranking_banner',
    'dashboard_banner',
    'invites_banner',
    'post_round_interstitial',
  ] as readonly AdSlotPlacement[],
} as const;

const SLOT_LAYOUT_SPECS: Record<AdSlotPlacement, AdSlotLayoutSpec> = {
  games_hub_footer: {
    placement: 'games_hub_footer',
    format: 'horizontal',
    fullWidthResponsive: true,
    minHeightClass: 'min-h-[90px]',
    maxHeightClass: 'max-h-[120px]',
    clearanceClass: 'my-6',
    labelText: 'Publicidade',
  },
  ranking_banner: {
    placement: 'ranking_banner',
    format: 'horizontal',
    fullWidthResponsive: true,
    minHeightClass: 'min-h-[90px]',
    maxHeightClass: 'max-h-[120px]',
    clearanceClass: 'my-5',
    labelText: 'Publicidade',
  },
  dashboard_banner: {
    placement: 'dashboard_banner',
    format: 'auto',
    fullWidthResponsive: true,
    minHeightClass: 'min-h-[100px]',
    maxHeightClass: 'max-h-[250px]',
    clearanceClass: 'my-6',
    labelText: 'Publicidade',
  },
  invites_banner: {
    placement: 'invites_banner',
    format: 'horizontal',
    fullWidthResponsive: true,
    minHeightClass: 'min-h-[90px]',
    maxHeightClass: 'max-h-[120px]',
    clearanceClass: 'my-5',
    labelText: 'Publicidade',
  },
  post_round_interstitial: {
    placement: 'post_round_interstitial',
    format: 'auto',
    fullWidthResponsive: true,
    minHeightClass: 'min-h-[250px]',
    maxHeightClass: 'max-h-[320px]',
    clearanceClass: 'my-4',
    labelText: 'Publicidade',
  },
};

type ConsentListener = (state: AdConsentState) => void;
type ConfigListener = (settings: AdSenseSettings) => void;
type RoundCompletedListener = (event: GameRoundCompletedEvent) => void;

class AdSenseService {
  private scriptLoadPromise: Promise<boolean> | null = null;
  private gptLoadPromise: Promise<boolean> | null = null;
  private listeners = new Set<ConsentListener>();
  private configListeners = new Set<ConfigListener>();
  private roundCompletedListeners = new Set<RoundCompletedListener>();
  private runtimeClientId: string | null = null;
  private remoteSettings: AdSenseSettings = DEFAULT_ADSENSE_SETTINGS;
  private hasRemoteSettings = false;
  private rewardedAdInFlight = false;
  private interstitialInFlight = false;
  private lastInterstitialAt = 0;
  private readonly defaultInterstitialCooldownMs = 45_000;
  private h5Configured = false;

  private readEnv(key: string): string {
    if (typeof import.meta === 'undefined' || !import.meta.env) return '';
    const val = (import.meta.env as Record<string, unknown>)[key];
    return typeof val === 'string' ? val.trim() : '';
  }

  public applyRemoteSettings(settings: AdSenseSettings | null): void {
    if (!settings) {
      this.hasRemoteSettings = false;
      this.remoteSettings = DEFAULT_ADSENSE_SETTINGS;
    } else {
      this.hasRemoteSettings = true;
      this.remoteSettings = { ...DEFAULT_ADSENSE_SETTINGS, ...settings };
    }
    this.notifyConfigListeners();
  }

  public getEffectiveSettings(): AdSenseSettings {
    const envClient = this.readEnv('VITE_ADSENSE_CLIENT_ID');
    const envDefaultSlot = this.readEnv('VITE_ADSENSE_DEFAULT_SLOT');
    const envGamesSlot = this.readEnv('VITE_ADSENSE_SLOT_GAMES_FOOTER');
    const envRankingSlot = this.readEnv('VITE_ADSENSE_SLOT_RANKING');
    const envDashboardSlot = this.readEnv('VITE_ADSENSE_SLOT_DASHBOARD');
    const envInvitesSlot = this.readEnv('VITE_ADSENSE_SLOT_INVITES');

    return {
      ...this.remoteSettings,
      clientId: this.remoteSettings.clientId || envClient,
      defaultSlotId: this.remoteSettings.defaultSlotId || envDefaultSlot,
      gamesFooterSlotId: this.remoteSettings.gamesFooterSlotId || envGamesSlot,
      rankingSlotId: this.remoteSettings.rankingSlotId || envRankingSlot,
      dashboardSlotId: this.remoteSettings.dashboardSlotId || envDashboardSlot,
      invitesSlotId: this.remoteSettings.invitesSlotId || envInvitesSlot,
    };
  }

  public subscribeConfig(listener: ConfigListener): () => void {
    this.configListeners.add(listener);
    return () => {
      this.configListeners.delete(listener);
    };
  }

  private notifyConfigListeners(): void {
    const current = this.getEffectiveSettings();
    for (const listener of this.configListeners) {
      try {
        listener(current);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  public isEnabled(): boolean {
    return this.getEffectiveSettings().enabled !== false;
  }

  public getClientId(): string | null {
    if (!this.isEnabled()) return null;
    const raw = this.runtimeClientId ?? this.getEffectiveSettings().clientId ?? '';
    const trimmed = String(raw).trim();
    return ADSENSE_CLIENT_REGEX.test(trimmed) ? trimmed : null;
  }

  public setRuntimeClientId(clientId: string | null): void {
    if (!clientId) {
      this.runtimeClientId = null;
      this.notifyConfigListeners();
      return;
    }
    const trimmed = clientId.trim();
    if (!ADSENSE_CLIENT_REGEX.test(trimmed)) {
      throw new Error('ID de publicador AdSense inválido. Use o formato ca-pub-XXXXXXXXXXXXXXXX.');
    }
    this.runtimeClientId = trimmed;
    this.notifyConfigListeners();
  }

  public isConfigured(): boolean {
    return this.getClientId() !== null && (this.getDefaultSlotId() !== null || this.isRewardedEnabled());
  }

  public isValidClientId(clientId: string): boolean {
    return ADSENSE_CLIENT_REGEX.test(clientId.trim());
  }

  public isValidSlotId(slotId: string): boolean {
    return ADSENSE_SLOT_REGEX.test(slotId.trim());
  }

  public isValidGamUnitPath(path: string): boolean {
    return GAM_UNIT_PATH_REGEX.test(path.trim());
  }

  public getDefaultSlotId(): string | null {
    if (!this.isEnabled()) return null;
    const raw = String(this.getEffectiveSettings().defaultSlotId ?? '').trim();
    return this.isValidSlotId(raw) ? raw : null;
  }

  public getSlotIdForPlacement(placement: AdSlotPlacement): string | null {
    if (!this.isEnabled()) return null;
    const effective = this.getEffectiveSettings();
    const map: Record<AdSlotPlacement, string> = {
      games_hub_footer: effective.gamesFooterSlotId,
      ranking_banner: effective.rankingSlotId,
      dashboard_banner: effective.dashboardSlotId,
      invites_banner: effective.invitesSlotId,
      post_round_interstitial:
        this.readEnv('VITE_ADSENSE_SLOT_INTERSTITIAL') || effective.defaultSlotId,
    };
    const raw = (map[placement] || effective.defaultSlotId || '').trim();
    return this.isValidSlotId(raw) ? raw : null;
  }

  public isRewardedEnabled(): boolean {
    if (!this.isEnabled()) return false;
    const effective = this.getEffectiveSettings();
    if (effective.rewardedProvider === 'gam_gpt') {
      return this.isValidGamUnitPath(effective.rewardedAdUnitPath);
    }
    if (effective.rewardedProvider === 'adsense_h5') {
      return this.getClientId() !== null;
    }
    return false;
  }

  public getDiagnostics(): AdSenseDiagnostics {
    const effective = this.getEffectiveSettings();
    const clientId = this.getClientId();
    const defaultSlotId = this.getDefaultSlotId();
    const source: AdSenseDiagnostics['source'] =
      this.hasRemoteSettings && (this.remoteSettings.clientId || this.remoteSettings.rewardedAdUnitPath)
        ? 'firestore'
        : this.readEnv('VITE_ADSENSE_CLIENT_ID')
          ? 'env'
          : 'none';

    return {
      enabled: effective.enabled,
      source,
      clientId,
      defaultSlotId,
      hasDisplayConfig: Boolean(clientId && defaultSlotId),
      rewardedProvider: effective.rewardedProvider,
      rewardedAdUnitPath: effective.rewardedAdUnitPath,
      hasRewardedConfig: this.isRewardedEnabled(),
      consentStatus: this.getConsentState().status,
      scriptLoaded: this.isScriptLoaded(),
    };
  }

  private readConsentCookie(): string | null {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const prefix = `${CONSENT_STORAGE_KEY}=`;
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        try {
          return decodeURIComponent(trimmed.slice(prefix.length));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private writeConsentCookie(payload: string): void {
    if (typeof document === 'undefined') return;
    const secureFlag =
      typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(
      payload
    )}; Path=/; Max-Age=15552000; SameSite=Lax${secureFlag}`;
  }

  private clearConsentCookie(): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${CONSENT_STORAGE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  }

  public getConsentState(): AdConsentState {
    if (typeof window === 'undefined') {
      return { status: 'pending', personalized: false, updatedAt: null };
    }
    try {
      const raw = this.readConsentCookie() ?? window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!raw) {
        return { status: 'pending', personalized: false, updatedAt: null };
      }
      const parsed = JSON.parse(raw) as Partial<AdConsentState>;
      const status: AdConsentStatus =
        parsed.status === 'granted' || parsed.status === 'denied' ? parsed.status : 'pending';
      return {
        status,
        personalized: Boolean(parsed.personalized),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null,
      };
    } catch {
      return { status: 'pending', personalized: false, updatedAt: null };
    }
  }

  public hasConsent(): boolean {
    return this.getConsentState().status === 'granted';
  }

  public subscribeConsent(listener: ConsentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyConsentListeners(state: AdConsentState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private syncGoogleConsentSignals(state: AdConsentState): void {
    if (typeof window === 'undefined') return;
    const granted = state.status === 'granted';
    const personalized = granted && state.personalized;

    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.pauseAdRequests = granted ? 0 : 1;
    window.adsbygoogle.requestNonPersonalizedAds = personalized ? 0 : 1;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push([
      'consent',
      'update',
      {
        ad_storage: granted ? 'granted' : 'denied',
        ad_user_data: personalized ? 'granted' : 'denied',
        ad_personalization: personalized ? 'granted' : 'denied',
      },
    ]);
  }

  private persistConsent(state: AdConsentState): AdConsentState {
    if (typeof window !== 'undefined') {
      const serialized = JSON.stringify(state);
      try {
        this.writeConsentCookie(serialized);
      } catch {
        // Ignore cookie write errors
      }
      try {
        window.localStorage.setItem(CONSENT_STORAGE_KEY, serialized);
      } catch {
        // Ignore storage errors in private browsing
      }
      this.syncGoogleConsentSignals(state);
    }
    this.notifyConsentListeners(state);
    return state;
  }

  public grantConsent(personalized = true): AdConsentState {
    const next = this.persistConsent({
      status: 'granted',
      personalized,
      updatedAt: Date.now(),
    });
    if (this.getClientId() && this.isLayoutEligibleForAds()) {
      void this.loadScript();
    }
    return next;
  }

  public denyConsent(): AdConsentState {
    const next = this.persistConsent({
      status: 'denied',
      personalized: false,
      updatedAt: Date.now(),
    });
    this.unloadScripts();
    return next;
  }

  public resetConsent(): AdConsentState {
    if (typeof window !== 'undefined') {
      try {
        this.clearConsentCookie();
      } catch {
        // Ignore cookie clear errors
      }
      try {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    const next: AdConsentState = { status: 'pending', personalized: false, updatedAt: null };
    this.syncGoogleConsentSignals(next);
    this.unloadScripts();
    this.notifyConsentListeners(next);
    return next;
  }

  public isLayoutEligibleForAds(
    context: AdLayoutContext = {},
    allowInterstitial = false
  ): boolean {
    if (context.isBackoffice || context.isMaintenance || context.isAuthGate) {
      return false;
    }
    if (context.isActiveGameplay || context.hasBlockingModal) {
      return false;
    }

    const currentPath =
      context.routePath ??
      (typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.hash}`
        : '');

    if (
      AD_LAYOUT_GUIDELINES.blockedRoutes.some((blocked) =>
        currentPath.toLowerCase().includes(blocked.toLowerCase())
      )
    ) {
      return false;
    }

    const blockedTabs = allowInterstitial
      ? AD_LAYOUT_GUIDELINES.interstitialBlockedTabs
      : AD_LAYOUT_GUIDELINES.blockedTabs;

    if (context.activeTab && blockedTabs.includes(context.activeTab)) {
      return false;
    }

    return true;
  }

  public getSlotLayoutSpec(placement: AdSlotPlacement): AdSlotLayoutSpec {
    return SLOT_LAYOUT_SPECS[placement];
  }

  public countRenderedAdsInDom(): number {
    if (typeof document === 'undefined') return 0;
    return document.querySelectorAll('ins.adsbygoogle[data-adsense-mounted="true"]').length;
  }

  public isScriptLoaded(): boolean {
    if (typeof document === 'undefined') return false;
    return Boolean(document.querySelector(ADSENSE_SCRIPT_SELECTOR));
  }

  public unloadScripts(): void {
    this.scriptLoadPromise = null;
    this.gptLoadPromise = null;
    this.h5Configured = false;
    if (typeof document === 'undefined') return;
    document.querySelectorAll(ADSENSE_SCRIPT_SELECTOR).forEach((node) => node.parentNode?.removeChild(node));
    document.querySelectorAll(GPT_SCRIPT_SELECTOR).forEach((node) => node.parentNode?.removeChild(node));
  }

  public async loadScript(
    context: AdLayoutContext = {},
    allowInterstitial = false
  ): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    const clientId = this.getClientId();
    if (!clientId) {
      return false;
    }

    const consent = this.getConsentState();
    if (consent.status !== 'granted') {
      return false;
    }

    if (!this.isLayoutEligibleForAds(context, allowInterstitial)) {
      return false;
    }

    this.syncGoogleConsentSignals(consent);

    const existingScript = document.querySelector<HTMLScriptElement>(ADSENSE_SCRIPT_SELECTOR);
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        return true;
      }
      if (this.scriptLoadPromise) {
        return this.scriptLoadPromise;
      }
    }

    if (this.scriptLoadPromise) {
      return this.scriptLoadPromise;
    }

    this.scriptLoadPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
        clientId
      )}`;
      script.setAttribute('data-adsense-service', 'earneasy');

      script.onload = () => {
        if (!this.hasConsent()) {
          this.unloadScripts();
          resolve(false);
          return;
        }
        script.dataset.loaded = 'true';
        resolve(true);
      };

      script.onerror = () => {
        this.scriptLoadPromise = null;
        resolve(false);
      };

      document.head.appendChild(script);
    });

    return this.scriptLoadPromise;
  }

  private async loadGptScript(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }
    if (!this.hasConsent()) {
      return false;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(GPT_SCRIPT_SELECTOR);
    if (existingScript && existingScript.dataset.loaded === 'true') {
      return true;
    }
    if (this.gptLoadPromise) {
      return this.gptLoadPromise;
    }

    this.gptLoadPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
      script.setAttribute('data-gam-gpt-service', 'earneasy');

      script.onload = () => {
        if (!this.hasConsent()) {
          this.unloadScripts();
          resolve(false);
          return;
        }
        script.dataset.loaded = 'true';
        resolve(true);
      };

      script.onerror = () => {
        this.gptLoadPromise = null;
        resolve(false);
      };

      document.head.appendChild(script);
    });

    return this.gptLoadPromise;
  }

  public async pushAdUnit(
    slotElement: HTMLElement | null,
    options: PushAdUnitOptions
  ): Promise<PushAdUnitResult> {
    const isInterstitial = options.placement === 'post_round_interstitial';
    if (!this.getClientId()) {
      return { pushed: false, reason: 'unconfigured' };
    }
    if (!this.hasConsent()) {
      return { pushed: false, reason: 'consent_required' };
    }
    if (!this.isLayoutEligibleForAds(options.context, isInterstitial)) {
      return { pushed: false, reason: 'layout_ineligible' };
    }
    if (!this.isValidSlotId(options.slotId)) {
      return { pushed: false, reason: 'invalid_slot' };
    }
    if (!slotElement || slotElement.dataset.adsensePushed === 'true') {
      return { pushed: false, reason: 'layout_ineligible' };
    }

    const activeCount = this.countRenderedAdsInDom();
    if (activeCount > AD_LAYOUT_GUIDELINES.maxAdsPerView) {
      return { pushed: false, reason: 'density_limit_reached' };
    }

    const loaded = await this.loadScript(options.context, isInterstitial);
    if (!loaded || !this.hasConsent()) {
      return { pushed: false, reason: 'script_load_failed' };
    }

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
      slotElement.dataset.adsensePushed = 'true';
      return { pushed: true };
    } catch {
      return { pushed: false, reason: 'script_load_failed' };
    }
  }

  public async showRewardedAd(context: AdLayoutContext = {}): Promise<RewardedAdPlayResult> {
    if (this.rewardedAdInFlight) {
      return {
        completed: false,
        reason: 'busy',
        message: 'Já existe um anúncio em exibição. Aguarde a conclusão.',
      };
    }

    if (!this.hasConsent()) {
      return {
        completed: false,
        reason: 'consent_required',
        message: 'Aceite o consentimento de cookies para assistir a anúncios.',
      };
    }

    const effective = this.getEffectiveSettings();
    if (!this.isRewardedEnabled()) {
      return {
        completed: false,
        reason: 'unconfigured',
        message: 'Anúncios premiados ainda não estão configurados pelo administrador.',
      };
    }

    this.rewardedAdInFlight = true;

    try {
      if (effective.rewardedProvider === 'gam_gpt') {
        return await this.runGamGptRewarded(effective.rewardedAdUnitPath.trim());
      }
      if (effective.rewardedProvider === 'adsense_h5') {
        return await this.runAdSenseH5Rewarded(context);
      }
      return {
        completed: false,
        reason: 'unconfigured',
        message: 'Provedor de anúncio premiado inválido.',
      };
    } finally {
      this.rewardedAdInFlight = false;
    }
  }

  private async runGamGptRewarded(adUnitPath: string): Promise<RewardedAdPlayResult> {
    const loaded = await this.loadGptScript();
    if (!loaded || !window.googletag) {
      return {
        completed: false,
        reason: 'script_load_failed',
        message: 'Não foi possível carregar o Google Ad Manager (verifique bloqueadores de anúncio).',
      };
    }

    return new Promise<RewardedAdPlayResult>((resolve) => {
      let settled = false;
      let granted = false;
      let rewardedSlot: unknown = null;

      const googletag = window.googletag!;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          if (rewardedSlot) googletag.destroySlots([rewardedSlot]);
        } catch {
          // Ignore cleanup errors
        }
        resolve({
          completed: false,
          reason: 'no_fill',
          message: 'Nenhum anúncio disponível no momento. Tente novamente em instantes.',
        });
      }, 25000);

      const finish = (result: RewardedAdPlayResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        try {
          if (rewardedSlot) googletag.destroySlots([rewardedSlot]);
        } catch {
          // Ignore cleanup errors
        }
        resolve(result);
      };

      googletag.cmd = googletag.cmd || [];
      googletag.cmd.push(() => {
        try {
          rewardedSlot = googletag.defineOutOfPageSlot(
            adUnitPath,
            googletag.enums.OutOfPageFormat.REWARDED
          );
          if (!rewardedSlot) {
            finish({
              completed: false,
              reason: 'no_fill',
              message: 'Unidade premiada indisponível neste dispositivo.',
            });
            return;
          }

          const pubads = googletag.pubads();
          (rewardedSlot as { addService: (svc: unknown) => void }).addService(pubads);

          const onReady = (event: { slot?: unknown; makeRewardedVisible?: () => void }) => {
            if (event.slot !== rewardedSlot) return;
            window.clearTimeout(timeout);
            event.makeRewardedVisible?.();
          };

          const onGranted = (event: { slot?: unknown }) => {
            if (event.slot !== rewardedSlot) return;
            granted = true;
          };

          const onClosed = (event: { slot?: unknown }) => {
            if (event.slot !== rewardedSlot) return;
            pubads.removeEventListener?.('rewardedSlotReady', onReady);
            pubads.removeEventListener?.('rewardedSlotGranted', onGranted);
            pubads.removeEventListener?.('rewardedSlotClosed', onClosed);
            if (granted) {
              finish({ completed: true, provider: 'gam_gpt' });
            } else {
              finish({
                completed: false,
                reason: 'dismissed',
                message: 'Anúncio fechado antes do fim. Assista até liberar a recompensa.',
              });
            }
          };

          pubads.addEventListener('rewardedSlotReady', onReady);
          pubads.addEventListener('rewardedSlotGranted', onGranted);
          pubads.addEventListener('rewardedSlotClosed', onClosed);

          googletag.enableServices();
          googletag.display(rewardedSlot);
        } catch {
          finish({
            completed: false,
            reason: 'script_load_failed',
            message: 'Falha ao iniciar o player de anúncio premiado.',
          });
        }
      });
    });
  }

  private async runAdSenseH5Rewarded(context: AdLayoutContext): Promise<RewardedAdPlayResult> {
    const loaded = await this.loadScript(context);
    if (!loaded) {
      return {
        completed: false,
        reason: 'script_load_failed',
        message: 'Não foi possível carregar o script do Google AdSense H5 (verifique bloqueadores).',
      };
    }

    if (typeof window.adBreak !== 'function') {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = function adBreakFallback(o: Record<string, unknown>) {
        window.adsbygoogle!.push(o);
      };
      window.adConfig = function adConfigFallback(o: Record<string, unknown>) {
        window.adsbygoogle!.push(o);
      };
    }

    if (!this.h5Configured) {
      window.adConfig?.({ preloadAdBreaks: 'on', sound: 'on' });
      this.h5Configured = true;
    }

    return new Promise<RewardedAdPlayResult>((resolve) => {
      let settled = false;
      const finish = (result: RewardedAdPlayResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(result);
      };

      const timer = window.setTimeout(() => {
        finish({
          completed: false,
          reason: 'no_fill',
          message: 'Nenhum anúncio em vídeo disponível no momento para sua conta AdSense H5.',
        });
      }, 15000);

      try {
        window.adBreak?.({
          type: 'reward',
          name: 'earneasy_rewarded_watch',
          beforeReward: (showAdFn: () => void) => {
            window.clearTimeout(timer);
            showAdFn();
          },
          adDismissed: () => {
            finish({
              completed: false,
              reason: 'dismissed',
              message: 'Você fechou o anúncio antes do término. Nenhum ponto foi creditado.',
            });
          },
          adViewed: () => {
            finish({ completed: true, provider: 'adsense_h5' });
          },
          adBreakDone: (placementInfo: { breakStatus?: string }) => {
            if (!settled && placementInfo?.breakStatus !== 'viewed') {
              finish({
                completed: false,
                reason: 'no_fill',
                message: 'Sem anúncio disponível no momento (' + (placementInfo?.breakStatus || 'no-fill') + ').',
              });
            }
          },
        });
      } catch {
        finish({
          completed: false,
          reason: 'script_load_failed',
          message: 'Falha ao chamar o anúncio premiado AdSense H5.',
        });
      }
    });
  }

  public notifyGameRoundCompleted(event: Omit<GameRoundCompletedEvent, 'timestamp'>): void {
    const payload: GameRoundCompletedEvent = {
      ...event,
      timestamp: Date.now(),
    };
    for (const listener of this.roundCompletedListeners) {
      try {
        listener(payload);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  public subscribeRoundCompleted(listener: RoundCompletedListener): () => void {
    this.roundCompletedListeners.add(listener);
    return () => {
      this.roundCompletedListeners.delete(listener);
    };
  }

  public setInterstitialInFlight(inFlight: boolean): void {
    this.interstitialInFlight = inFlight;
  }

  public markInterstitialShown(): void {
    this.lastInterstitialAt = Date.now();
  }

  public getInterstitialCooldownRemainingMs(
    cooldownMs = this.defaultInterstitialCooldownMs
  ): number {
    if (!this.lastInterstitialAt) return 0;
    return Math.max(0, cooldownMs - (Date.now() - this.lastInterstitialAt));
  }

  public canTriggerInterstitial(
    context: AdLayoutContext = {},
    cooldownMs = this.defaultInterstitialCooldownMs
  ): boolean {
    if (!this.isEnabled()) return false;
    if (!this.hasConsent()) return false;
    if (!this.getClientId()) return false;
    if (this.rewardedAdInFlight || this.interstitialInFlight) return false;
    if (!this.isLayoutEligibleForAds(context, true)) return false;
    return this.getInterstitialCooldownRemainingMs(cooldownMs) === 0;
  }

  public async tryShowH5NextInterstitial(
    context: AdLayoutContext = {}
  ): Promise<InterstitialShowResult> {
    if (!this.hasConsent() || !this.isEnabled() || !this.getClientId()) {
      return 'blocked';
    }
    if (!this.isLayoutEligibleForAds(context, true)) {
      return 'blocked';
    }
    if (this.rewardedAdInFlight || this.interstitialInFlight) {
      return 'blocked';
    }

    const loaded = await this.loadScript(context, true);
    if (!loaded || !this.hasConsent()) {
      return 'blocked';
    }

    const effective = this.getEffectiveSettings();
    const shouldTryH5 =
      effective.rewardedProvider === 'adsense_h5' || typeof window.adBreak === 'function';
    if (!shouldTryH5) {
      return 'fallback';
    }

    if (typeof window.adBreak !== 'function') {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = function adBreakFallback(o: Record<string, unknown>) {
        window.adsbygoogle!.push(o);
      };
      window.adConfig = function adConfigFallback(o: Record<string, unknown>) {
        window.adsbygoogle!.push(o);
      };
    }

    if (!this.h5Configured) {
      window.adConfig?.({ preloadAdBreaks: 'on', sound: 'on' });
      this.h5Configured = true;
    }

    this.interstitialInFlight = true;
    return new Promise<InterstitialShowResult>((resolve) => {
      let settled = false;
      let adOpened = false;

      const finish = (result: InterstitialShowResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.interstitialInFlight = false;
        if (result === 'shown') {
          this.markInterstitialShown();
        }
        resolve(result);
      };

      const timer = window.setTimeout(() => {
        if (!adOpened) {
          finish(this.hasConsent() ? 'fallback' : 'blocked');
        }
      }, 2200);

      try {
        window.adBreak?.({
          type: 'next',
          name: 'post_round_interstitial',
          beforeAd: () => {
            adOpened = true;
            window.clearTimeout(timer);
          },
          afterAd: () => {
            finish('shown');
          },
          adBreakDone: (placementInfo: { breakStatus?: string }) => {
            if (!this.hasConsent()) {
              finish('blocked');
              return;
            }
            if (placementInfo?.breakStatus === 'viewed') {
              finish('shown');
              return;
            }
            finish('fallback');
          },
        });
      } catch {
        finish(this.hasConsent() ? 'fallback' : 'blocked');
      }
    });
  }
}

export const adsenseService = new AdSenseService();
