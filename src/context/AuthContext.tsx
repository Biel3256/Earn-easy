import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  CasinoCurrency,
  CasinoSession,
  CENTS_PER_BLOCK,
  DailyCheckin,
  DEFAULT_MAINTENANCE_SETTINGS,
  DEFAULT_WITHDRAWAL_SETTINGS,
  EmailNotification,
  FraudEvent,
  GameCategory,
  GameSession,
  isOwnerIdentity,
  LevelReward,
  MailboxMessage,
  MaintenanceSettings,
  MAX_CONFIGURABLE_WITHDRAWAL_CENTS,
  MIN_CONFIGURABLE_WITHDRAWAL_CENTS,
  MultiplayerMatchRecord,
  MultiplayerSettlementPayload,
  PixKeyType,
  PixWithdrawal,
  POINTS_PER_TEN_CENTS,
  PointConversion,
  PromoCode,
  PromoRedemption,
  REFERRAL_COMMISSION_RATE,
  REFERRAL_SIGNUP_BONUS_POINTS,
  Referral,
  STREAK_REWARD_CENTS,
  STREAK_TARGET_DAYS,
  UserAccount,
  UserPrivateInfo,
  VerificationDocumentType,
  VerificationRequest,
  VerifiedBadgeTier,
  WithdrawalAttemptStatus,
  WithdrawalSettings,
  WithdrawalStatus,
} from '../types/earneasy';
import {
  generateId,
  getDeviceFingerprint,
  sha256Hex,
  verifyGameSessionWithServer,
} from '../utils/antifraud';
import { formatCpfMask, isValidBirthDateStr, isValidCPF, onlyDigits } from '../utils/cpf';
import {
  BrowserNotificationPermissionState,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
} from '../utils/browserNotifications';
import { PLAYER_LEVELS } from '../utils/levels';
import { resolveVerifiedBadgeTier } from '../components/VerifiedBadge';

function getSuspensionExpiryMs(account: UserAccount | null | undefined): number | null {
  if (!account || account.status !== 'suspended' || !account.suspensionUntil) return null;
  const value = account.suspensionUntil as { toMillis?: () => number } | number | string | Date;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

function isAccountCurrentlyActive(account: Partial<UserAccount> | null | undefined): boolean {
  if (!account) return false;
  if (!account.status || account.status === 'active') return true;
  if (account.status === 'suspended') {
    const expiry = getSuspensionExpiryMs(account as UserAccount);
    return expiry !== null && expiry <= Date.now();
  }
  return false;
}

import { checkUsernameProfanity, validateUsernameInput } from '../utils/moderation';
import {
  formatBRL,
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  getServerNowMs,
  getTodayUtcDate,
  getUtcDateDaysAgo,
  syncServerUtcClock,
  timestampToMillis,
} from '../utils/pix';

function buildLeaderboardPayload(
  userData: Pick<
    UserAccount,
    | 'uid'
    | 'displayName'
    | 'photoURL'
    | 'brlBalanceCents'
    | 'pointsBalance'
    | 'lifetimePoints'
    | 'gamesPlayed'
    | 'status'
    | 'identityVerified'
    | 'verifiedBadge'
  >,
  overrides: Partial<{
    uid: string;
    displayName: string;
    photoURL: string;
    brlBalanceCents: number;
    pointsBalance: number;
    lifetimePoints: number;
    gamesPlayed: number;
    status: UserAccount['status'];
    identityVerified: boolean;
    verifiedBadge: VerifiedBadgeTier;
  }> = {}
) {
  const safeNum = (val: unknown): number =>
    typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : 0;
  const rawName = (
    overrides.displayName !== undefined
      ? overrides.displayName.trim()
      : (userData.displayName ?? '')
  ).slice(0, 80);
  const rawPhoto = overrides.photoURL ?? userData.photoURL ?? '';
  const identityVerified = overrides.identityVerified ?? Boolean(userData.identityVerified);
  const verifiedBadge =
    overrides.verifiedBadge !== undefined
      ? overrides.verifiedBadge
      : userData.verifiedBadge ?? resolveVerifiedBadgeTier(undefined, identityVerified);
  return {
    uid: (overrides.uid ?? userData.uid ?? '').trim(),
    displayName: rawName || 'Jogador',
    photoURL: typeof rawPhoto === 'string' ? rawPhoto : '',
    brlBalanceCents: safeNum(overrides.brlBalanceCents ?? userData.brlBalanceCents),
    pointsBalance: safeNum(overrides.pointsBalance ?? userData.pointsBalance),
    lifetimePoints: safeNum(overrides.lifetimePoints ?? userData.lifetimePoints),
    gamesPlayed: safeNum(overrides.gamesPlayed ?? userData.gamesPlayed),
    status: overrides.status ?? userData.status ?? 'active',
    identityVerified,
    verifiedBadge,
    updatedAt: serverTimestamp(),
  };
}

function isFirestoreSdkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: unknown; name?: unknown };
  return (
    typeof maybe.code === 'string' ||
    maybe.name === 'FirebaseError'
  );
}

function handleTransactionError(
  error: unknown,
  operationType: OperationType,
  path: string
): never {
  if (isFirestoreSdkError(error)) {
    handleFirestoreError(error, operationType, path);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

function sanitizePhotoUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    if (trimmed.length > 60000) {
      throw new Error('A imagem da galeria excedeu o tamanho máximo permitido. Escolha outra foto menor.');
    }
    return trimmed;
  }
  if (trimmed.startsWith('data:')) {
    throw new Error('Formato de imagem inválido. Use JPEG, PNG ou WebP.');
  }
  return trimmed.slice(0, 1000);
}

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  userAccount: UserAccount | null;
  privateInfo: UserPrivateInfo | null;
  isAdmin: boolean;
  isOwner: boolean;
  mySessions: GameSession[];
  myConversions: PointConversion[];
  myWithdrawals: PixWithdrawal[];
  myNotifications: EmailNotification[];
  myFraudLogs: FraudEvent[];
  myCheckins: DailyCheckin[];
  myLevelRewards: LevelReward[];
  myReferral: Referral | null;
  myInvitedReferrals: Referral[];
  publicPromoEvents: PromoCode[];
  myPromoRedemptions: PromoRedemption[];
  mailboxMessages: MailboxMessage[];
  readMailboxIds: string[];
  unreadMailboxCount: number;
  withdrawalSettings: WithdrawalSettings;
  maintenanceSettings: MaintenanceSettings;
  isFirstWithdrawalEligible: boolean;
  activeMinWithdrawalCents: number;
  needsOnboarding: boolean;
  authError: string | null;
  browserNotifPermission: BrowserNotificationPermissionState;
  browserNotifEnabled: boolean;
  requestBrowserNotifications: () => Promise<BrowserNotificationPermissionState>;
  setBrowserNotifEnabled: (enabled: boolean) => void;
  sendTestBrowserNotification: () => boolean;
  markMailboxRead: (messageId: string) => void;
  markAllMailboxRead: () => void;
  deleteMailboxMessage: (messageId: string) => Promise<void>;
  clearAllMailboxMessages: () => Promise<void>;
  deleteEmailNotification: (notificationId: string) => Promise<void>;
  updateMaintenanceSettings: (params: {
    enabled: boolean;
    title: string;
    message: string;
    estimatedReturn: string;
  }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  createUserAccount: (params: {
    displayName: string;
    photoURL: string;
    referralCode?: string;
  }) => Promise<{ status: 'active' | 'suspended'; message?: string; referralApplied?: boolean }>;
  myVerificationRequest: VerificationRequest | null;
  submitVerificationRequest: (params: {
    fullName: string;
    cpf: string;
    birthDate: string;
    documentType: VerificationDocumentType;
    documentNumber: string;
  }) => Promise<void>;
  approveVerificationRequest: (targetUid: string) => Promise<void>;
  rejectVerificationRequest: (targetUid: string, reason: string) => Promise<void>;
  setUserBlueVerified: (targetUid: string, granted: boolean) => Promise<void>;
  settleDoubleRound: (params: {
    currency: CasinoCurrency;
    stakeAmount: number;
    choice: 'red' | 'black' | 'white';
  }) => Promise<{
    sessionId: string;
    slot: number;
    winningColor: 'red' | 'black' | 'white';
    won: boolean;
    payoutAmount: number;
    stakeAmount: number;
    currency: CasinoCurrency;
    multiplier: number;
    netDelta: number;
  }>;
  startMinesSession: (params: {
    currency: CasinoCurrency;
    stakeAmount: number;
    minesCount: number;
  }) => Promise<{
    sessionId: string;
    currency: CasinoCurrency;
    stakeAmount: number;
    minesCount: number;
    nextMultiplier: number;
  }>;
  finishMinesSession: (params: {
    sessionId: string;
    won: boolean;
    payoutAmount: number;
    multiplier: number;
    details: string;
    integrityHash: string;
  }) => Promise<void>;
  recordGameReward: (params: {
    gameCategory: GameCategory;
    scoreEarned: number;
    durationMs: number;
    movesCount: number;
  }) => Promise<{
    credited: number;
    verificationStatus: 'verified' | 'flagged' | 'rejected';
    fraudReason: string;
  }>;
  convertDailyPoints: (pointsToConvert: number) => Promise<{
    brlCentsCredited: number;
    emailStatus: string;
  }>;
  requestPixWithdrawal: (params: {
    amountCents: number;
    pixKeyType: PixKeyType;
    pixKey: string;
    saveAsDefault: boolean;
  }) => Promise<{
    withdrawalId: string;
    emailStatus: string;
  }>;
  logFraudAttempt: (
    eventType: FraudEvent['eventType'],
    severity: FraudEvent['severity'],
    details: string
  ) => Promise<void>;
  logWithdrawalAttempt: (params: {
    status: WithdrawalAttemptStatus;
    amountCents: number;
    pixKeyType: 'none' | PixKeyType;
    pixKey: string;
    withdrawalId?: string;
    details: string;
  }) => Promise<void>;
  updateUserProfile: (params: {
    displayName: string;
    photoURL: string;
  }) => Promise<void>;
  claimDailyCheckin: () => Promise<{
    pointsAwarded: number;
    weekTotal: number;
    streakDay: number;
    brlBonusCents: number;
    streakBroken: boolean;
  }>;
  claimLevelReward: (level: number) => Promise<{
    level: number;
    title: string;
    rewardPoints: number;
  }>;
  redeemPromoCode: (rawCode: string) => Promise<{
    code: string;
    title: string;
    pointsAwarded: number;
  }>;
  sendInviteEmail: (
    recipientEmail: string,
    customMessage?: string
  ) => Promise<{
    deliveryStatus: EmailNotification['deliveryStatus'];
    referenceId: string;
  }>;
  myMultiplayerMatches: MultiplayerMatchRecord[];
  settleMultiplayerMatch: (
    settlement: MultiplayerSettlementPayload
  ) => Promise<{ alreadySettled: boolean; transferredPoints: number }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}

async function dispatchEmailNotification(params: {
  userId: string;
  recipientEmail: string;
  eventType: EmailNotification['eventType'];
  subject: string;
  summary: string;
  referenceId: string;
  amountBrl?: string;
  pixKey?: string;
  inviterName?: string;
  inviteLink?: string;
  inviteCode?: string;
  invitedDisplayName?: string;
  bonusPoints?: number;
  commissionPct?: number;
  customMessage?: string;
}): Promise<EmailNotification['deliveryStatus']> {
  let deliveryStatus: EmailNotification['deliveryStatus'] = 'logged_in_app';
  try {
    const res = await fetch('/api/notifications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (
        data.deliveryStatus === 'sent_smtp' ||
        data.deliveryStatus === 'logged_in_app' ||
        data.deliveryStatus === 'failed'
      ) {
        deliveryStatus = data.deliveryStatus;
      }
    }
  } catch {
    deliveryStatus = 'logged_in_app';
  }

  const notificationId = generateId('mail');
  const notifPath = `emailNotifications/${notificationId}`;
  try {
    await setDoc(doc(db, 'emailNotifications', notificationId), {
      notificationId,
      userId: params.userId,
      recipientEmail: params.recipientEmail.slice(0, 160),
      eventType: params.eventType,
      subject: params.subject.slice(0, 160),
      summary: params.summary.slice(0, 500),
      deliveryStatus,
      referenceId: params.referenceId.slice(0, 128),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, notifPath);
  }

  return deliveryStatus;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [mySessions, setMySessions] = useState<GameSession[]>([]);
  const [myConversions, setMyConversions] = useState<PointConversion[]>([]);
  const [myWithdrawals, setMyWithdrawals] = useState<PixWithdrawal[]>([]);
  const [myNotifications, setMyNotifications] = useState<EmailNotification[]>([]);
  const [myFraudLogs, setMyFraudLogs] = useState<FraudEvent[]>([]);
  const [myCheckins, setMyCheckins] = useState<DailyCheckin[]>([]);
  const [myLevelRewards, setMyLevelRewards] = useState<LevelReward[]>([]);
  const [myReferral, setMyReferral] = useState<Referral | null>(null);
  const [myInvitedReferrals, setMyInvitedReferrals] = useState<Referral[]>([]);
  const [publicPromoEvents, setPublicPromoEvents] = useState<PromoCode[]>([]);
  const [myPromoRedemptions, setMyPromoRedemptions] = useState<PromoRedemption[]>([]);
  const [myMultiplayerMatches, setMyMultiplayerMatches] = useState<MultiplayerMatchRecord[]>([]);
  const [myVerificationRequest, setMyVerificationRequest] = useState<VerificationRequest | null>(null);
  const [rawMailboxMessages, setRawMailboxMessages] = useState<MailboxMessage[]>([]);
  const [deletedMailboxIds, setDeletedMailboxIds] = useState<string[]>([]);
  const [readMailboxIds, setReadMailboxIds] = useState<string[]>([]);
  const [withdrawalSettings, setWithdrawalSettings] =
    useState<WithdrawalSettings>(DEFAULT_WITHDRAWAL_SETTINGS);
  const [maintenanceSettings, setMaintenanceSettings] =
    useState<MaintenanceSettings>(DEFAULT_MAINTENANCE_SETTINGS);
  const [authError, setAuthError] = useState<string | null>(null);
  const [browserNotifPermission, setBrowserNotifPermission] =
    useState<BrowserNotificationPermissionState>(() => getBrowserNotificationPermission());
  const [browserNotifEnabled, setBrowserNotifEnabledState] = useState<boolean>(true);
  const lastSyncedLbSigRef = React.useRef<string>('');
  const browserNotifPrefsRef = React.useRef({
    permission: getBrowserNotificationPermission(),
    enabled: true,
  });
  const withdrawalsInitRef = React.useRef(false);
  const prevWithdrawalStatusRef = React.useRef<Map<string, WithdrawalStatus>>(new Map());
  const promosInitRef = React.useRef(false);
  const mailboxInitRef = React.useRef(false);
  const notificationsInitRef = React.useRef(false);
  const seenReleasedPromoCodesRef = React.useRef<Set<string>>(new Set());
  const seenReleasedMailboxIdsRef = React.useRef<Set<string>>(new Set());
  const dispatchedReferralNotifsRef = React.useRef<Set<string>>(new Set());

  const canDispatchBrowserNotification = () => {
    const { permission, enabled } = browserNotifPrefsRef.current;
    return permission === 'granted' && enabled;
  };

  useEffect(() => {
    browserNotifPrefsRef.current = {
      permission: browserNotifPermission,
      enabled: browserNotifEnabled,
    };
  }, [browserNotifPermission, browserNotifEnabled]);

  useEffect(() => {
    const syncPermission = () => {
      const next = getBrowserNotificationPermission();
      setBrowserNotifPermission(next);
      browserNotifPrefsRef.current.permission = next;
    };
    syncPermission();
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);

      if (!user) {
        setUserAccount(null);
        setPrivateInfo(null);
        setIsAdmin(false);
        setIsOwner(false);
        setMySessions([]);
        setMyConversions([]);
        setMyWithdrawals([]);
        setMyNotifications([]);
        setMyFraudLogs([]);
        setMyCheckins([]);
        setMyLevelRewards([]);
        setMyReferral(null);
        setMyInvitedReferrals([]);
        setPublicPromoEvents([]);
        setMyPromoRedemptions([]);
        setMyMultiplayerMatches([]);
        setMyVerificationRequest(null);
        setRawMailboxMessages([]);
        setDeletedMailboxIds([]);
        setReadMailboxIds([]);
        setWithdrawalSettings(DEFAULT_WITHDRAWAL_SETTINGS);
        lastSyncedLbSigRef.current = '';
        withdrawalsInitRef.current = false;
        prevWithdrawalStatusRef.current.clear();
        promosInitRef.current = false;
        mailboxInitRef.current = false;
        notificationsInitRef.current = false;
        seenReleasedPromoCodesRef.current.clear();
        seenReleasedMailboxIdsRef.current.clear();
        dispatchedReferralNotifsRef.current.clear();
        setAuthReady(true);
        return;
      }

      try {
        // Load existing user account; new Google users must complete username onboarding first
        const userRef = doc(db, 'users', user.uid);
        const privateRef = doc(db, 'users', user.uid, 'private', 'info');
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setUserAccount(null);
          setPrivateInfo(null);
        } else {
          const fingerprint = await getDeviceFingerprint();
          const privSnap = await getDoc(privateRef);
          if (!privSnap.exists()) {
            await setDoc(privateRef, {
              uid: user.uid,
              email: (user.email || user.providerData?.[0]?.email || 'sem-email@earneasy.app').slice(0, 160),
              defaultPixKeyType: 'none',
              defaultPixKey: '',
              deviceFingerprint: fingerprint,
              updatedAt: serverTimestamp(),
            });
          } else {
            setPrivateInfo(privSnap.data() as UserPrivateInfo);
          }

          let userData = userSnap.data() as UserAccount;
          const ownerCheck = isOwnerIdentity(user.email, user.uid) && user.emailVerified;

          // Auto-restore platform Owner if another admin previously altered Owner status/badge
          if (
            ownerCheck &&
            (userData.verifiedBadge !== 'owner' ||
              userData.status !== 'active' ||
              !userData.identityVerified)
          ) {
            try {
              const restoredFields = {
                status: 'active' as const,
                riskScore: 0,
                banReason: '',
                banExplanation: '',
                bannedBy: '',
                suspensionUntil: null,
                identityVerified: true,
                verifiedBadge: 'owner' as const,
                verificationStatus: 'approved' as const,
                verificationNote: '',
                updatedAt: serverTimestamp(),
              };
              await updateDoc(userRef, restoredFields);
              userData = {
                ...userData,
                status: 'active',
                riskScore: 0,
                banReason: '',
                banExplanation: '',
                bannedBy: '',
                suspensionUntil: null,
                identityVerified: true,
                verifiedBadge: 'owner',
                verificationStatus: 'approved',
                verificationNote: '',
              };
            } catch {
              // Ignore recovery write error if rules not yet deployed
            }
          }

          setUserAccount(userData);

          if (!userData.status || userData.status === 'active') {
            const lbRef = doc(db, 'leaderboard', user.uid);
            const lbSnap = await getDoc(lbRef);
            const lbData = lbSnap.exists() ? lbSnap.data() : null;
            const expectedBadge =
              userData.verifiedBadge ?? resolveVerifiedBadgeTier(undefined, userData.identityVerified);
            if (
              !lbData ||
              lbData.brlBalanceCents !== userData.brlBalanceCents ||
              lbData.pointsBalance !== userData.pointsBalance ||
              lbData.lifetimePoints !== userData.lifetimePoints ||
              lbData.gamesPlayed !== userData.gamesPlayed ||
              lbData.displayName !== userData.displayName ||
              lbData.photoURL !== userData.photoURL ||
              lbData.status !== (userData.status || 'active') ||
              Boolean(lbData.identityVerified) !== Boolean(userData.identityVerified) ||
              lbData.verifiedBadge !== expectedBadge
            ) {
              await setDoc(lbRef, buildLeaderboardPayload(userData, { uid: userData.uid || user.uid })).catch(() => {});
            }
          }
        }

        // Check Owner & admin status (bootstrapped Owner or /admins/{uid})
        const ownerCheck = isOwnerIdentity(user.email, user.uid) && user.emailVerified;
        let adminCheck = ownerCheck;
        if (!adminCheck) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            adminCheck = adminSnap.exists();
          } catch {
            adminCheck = false;
          }
        }
        setIsOwner(ownerCheck);
        setIsAdmin(adminCheck);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Erro ao carregar perfil.');
      } finally {
        setAuthReady(true);
      }
    });

    void syncServerUtcClock();

    return () => unsubAuth();
  }, []);

  // Global listener for platform Maintenance Mode (readable even before sign-in)
  useEffect(() => {
    const unsubMaintenance = onSnapshot(
      doc(db, 'appSettings', 'maintenance'),
      (snap) => {
        if (!snap.exists()) {
          setMaintenanceSettings(DEFAULT_MAINTENANCE_SETTINGS);
          return;
        }
        const raw = snap.data() as Partial<MaintenanceSettings>;
        setMaintenanceSettings({
          settingId: 'maintenance',
          enabled: Boolean(raw.enabled),
          title:
            typeof raw.title === 'string' && raw.title.trim()
              ? raw.title.trim()
              : DEFAULT_MAINTENANCE_SETTINGS.title,
          message:
            typeof raw.message === 'string' && raw.message.trim()
              ? raw.message.trim()
              : DEFAULT_MAINTENANCE_SETTINGS.message,
          estimatedReturn:
            typeof raw.estimatedReturn === 'string'
              ? raw.estimatedReturn.trim()
              : DEFAULT_MAINTENANCE_SETTINGS.estimatedReturn,
          updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : 'admin',
          updatedAt: raw.updatedAt ?? null,
        });
      },
      () => {
        // Fallback smoothly if maintenance document does not exist yet
      }
    );
    return () => unsubMaintenance();
  }, []);


  // Automatically restore access when a temporary suspension reaches its deadline.
  useEffect(() => {
    if (!firebaseUser || !userAccount || userAccount.status !== 'suspended') return;
    const expiresAt = getSuspensionExpiryMs(userAccount);
    if (expiresAt === null) return;
    let timer: number | undefined;
    const scheduleReactivation = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        updateDoc(doc(db, 'users', firebaseUser.uid), {
          status: 'active',
          riskScore: 0,
          suspensionUntil: null,
          banReason: '',
          banExplanation: '',
          bannedBy: '',
          updatedAt: serverTimestamp(),
        }).then(() => setDoc(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(userAccount, { status: 'active' })
        )).catch(() => {});
        return;
      }
      // Browser timers have a ~24.8-day maximum; reschedule longer suspensions safely.
      timer = window.setTimeout(scheduleReactivation, Math.min(remaining, 2147000000));
    };
    scheduleReactivation();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [firebaseUser?.uid, userAccount?.uid, userAccount?.status, userAccount?.suspensionUntil]);

  // Attach real-time Firestore listeners ONLY when authReady && firebaseUser
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const uid = firebaseUser.uid;

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const uData = snap.data() as UserAccount;
          setUserAccount(uData);
          if (!uData.status || uData.status === 'active') {
            const resolvedTier =
              uData.verifiedBadge ?? resolveVerifiedBadgeTier(undefined, uData.identityVerified);
            const sig = `${uData.pointsBalance}|${uData.lifetimePoints}|${uData.brlBalanceCents}|${uData.gamesPlayed}|${uData.displayName}|${uData.photoURL}|${uData.status || 'active'}|${Boolean(uData.identityVerified)}|${resolvedTier}`;
            if (lastSyncedLbSigRef.current && lastSyncedLbSigRef.current !== sig) {
              setDoc(doc(db, 'leaderboard', uid), buildLeaderboardPayload(uData, { uid: uData.uid || uid })).catch(() => {});
            }
            lastSyncedLbSigRef.current = sig;
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}`)
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users', uid, 'private', 'info'),
      (snap) => {
        if (snap.exists()) {
          setPrivateInfo(snap.data() as UserPrivateInfo);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}/private/info`)
    );

    const unsubSessions = onSnapshot(
      query(collection(db, 'gameSessions'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
      (snap) => setMySessions(snap.docs.map((d) => d.data() as GameSession)),
      (error) => handleFirestoreError(error, OperationType.LIST, 'gameSessions')
    );

    const unsubConversions = onSnapshot(
      query(collection(db, 'conversions'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
      (snap) => setMyConversions(snap.docs.map((d) => d.data() as PointConversion)),
      (error) => handleFirestoreError(error, OperationType.LIST, 'conversions')
    );

    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawals'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PixWithdrawal);
        setMyWithdrawals(list);

        if (!withdrawalsInitRef.current) {
          const initialMap = new Map<string, WithdrawalStatus>();
          list.forEach((w) => initialMap.set(w.withdrawalId, w.status));
          prevWithdrawalStatusRef.current = initialMap;
          withdrawalsInitRef.current = true;
          return;
        }

        const prevMap = prevWithdrawalStatusRef.current;
        for (const w of list) {
          const prevStatus = prevMap.get(w.withdrawalId);
          const transitionedToProcessed =
            prevStatus !== undefined &&
            prevStatus !== w.status &&
            (w.status === 'approved' || w.status === 'paid' || w.status === 'rejected');
          const arrivedAlreadyProcessed =
            prevStatus === undefined &&
            (w.status === 'approved' || w.status === 'paid' || w.status === 'rejected');

          if ((transitionedToProcessed || arrivedAlreadyProcessed) && canDispatchBrowserNotification()) {
            const amountLabel = formatBRL(w.amountCents);
            if (w.status === 'paid') {
              sendBrowserNotification({
                title: 'Pix pago — Earn Easy',
                body: `Seu saque de ${amountLabel} foi pago na chave ${w.pixKey}.`,
                tag: `pix_${w.withdrawalId}_paid`,
              });
            } else if (w.status === 'approved') {
              sendBrowserNotification({
                title: 'Saque Pix aprovado — Earn Easy',
                body: `Seu saque de ${amountLabel} foi aprovado e está em processamento.`,
                tag: `pix_${w.withdrawalId}_approved`,
              });
            } else if (w.status === 'rejected') {
              sendBrowserNotification({
                title: 'Saque Pix recusado — Earn Easy',
                body: w.adminNote
                  ? `Seu saque de ${amountLabel} foi recusado: ${w.adminNote}`
                  : `Seu saque de ${amountLabel} foi recusado e o saldo foi estornado.`,
                tag: `pix_${w.withdrawalId}_rejected`,
              });
            }
          }
          prevMap.set(w.withdrawalId, w.status);
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals')
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'emailNotifications'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
      (snap) => {
        setMyNotifications(snap.docs.map((d) => d.data() as EmailNotification));
        notificationsInitRef.current = true;
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'emailNotifications')
    );

    const unsubFraud = onSnapshot(
      query(collection(db, 'fraudLogs'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
      (snap) => setMyFraudLogs(snap.docs.map((d) => d.data() as FraudEvent)),
      (error) => handleFirestoreError(error, OperationType.LIST, 'fraudLogs')
    );

    const unsubCheckins = onSnapshot(
      query(collection(db, 'dailyCheckins'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as DailyCheckin)
          .sort((a, b) => b.checkinDate.localeCompare(a.checkinDate));
        setMyCheckins(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'dailyCheckins')
    );

    const unsubLevelRewards = onSnapshot(
      query(collection(db, 'levelRewards'), where('userId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as LevelReward)
          .sort((a, b) => a.level - b.level);
        setMyLevelRewards(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'levelRewards')
    );

    const unsubMyReferral = onSnapshot(
      doc(db, 'referrals', uid),
      (snap) => {
        setMyReferral(snap.exists() ? (snap.data() as Referral) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `referrals/${uid}`)
    );

    const unsubInvitedReferrals = onSnapshot(
      query(collection(db, 'referrals'), where('referrerUid', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Referral)
          .sort((a, b) => b.totalCommissionPointsEarned - a.totalCommissionPointsEarned);
        setMyInvitedReferrals(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'referrals')
    );

    const unsubPublicPromoEvents = onSnapshot(
      query(
        collection(db, 'promoCodes'),
        where('active', '==', true),
        where('publicEvent', '==', true)
      ),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PromoCode)
          .sort((a, b) => b.pointsValue - a.pointsValue);
        setPublicPromoEvents(list);

        const now = Date.now();
        if (!promosInitRef.current) {
          list.forEach((p) => {
            const publishMs = timestampToMillis(p.publishAt);
            if (publishMs === 0 || publishMs <= now) {
              seenReleasedPromoCodesRef.current.add(p.code);
            }
          });
          promosInitRef.current = true;
          return;
        }

        for (const p of list) {
          const publishMs = timestampToMillis(p.publishAt);
          const isReleased = publishMs === 0 || publishMs <= now;
          if (isReleased && !seenReleasedPromoCodesRef.current.has(p.code)) {
            seenReleasedPromoCodesRef.current.add(p.code);
            if (canDispatchBrowserNotification()) {
              sendBrowserNotification({
                title: 'Novo código liberado — Earn Easy',
                body: `${p.code} (${p.title}) vale +${formatPoints(p.pointsValue)} moedas! Resgate na aba Convidar.`,
                tag: `promo_${p.code}`,
              });
            }
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'promoCodes')
    );

    const unsubPromoRedemptions = onSnapshot(
      query(collection(db, 'promoRedemptions'), where('userId', '==', uid)),
      (snap) => {
        setMyPromoRedemptions(snap.docs.map((d) => d.data() as PromoRedemption));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'promoRedemptions')
    );

    const unsubMailbox = onSnapshot(
      query(collection(db, 'mailboxMessages'), where('active', '==', true)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MailboxMessage)
          .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
        setRawMailboxMessages(list);

        const now = Date.now();
        if (!mailboxInitRef.current) {
          list.forEach((m) => {
            const publishMs = timestampToMillis(m.publishAt);
            if (publishMs === 0 || publishMs <= now) {
              seenReleasedMailboxIdsRef.current.add(m.messageId);
              if (m.promoCode) {
                seenReleasedPromoCodesRef.current.add(m.promoCode);
              }
            }
          });
          mailboxInitRef.current = true;
          return;
        }

        for (const m of list) {
          const publishMs = timestampToMillis(m.publishAt);
          const isReleased = publishMs === 0 || publishMs <= now;
          if (isReleased && !seenReleasedMailboxIdsRef.current.has(m.messageId)) {
            seenReleasedMailboxIdsRef.current.add(m.messageId);
            const alreadyNotifiedByPromo = Boolean(
              m.promoCode && seenReleasedPromoCodesRef.current.has(m.promoCode)
            );
            if (m.promoCode) {
              seenReleasedPromoCodesRef.current.add(m.promoCode);
            }
            if (m.category === 'promo_event' && !alreadyNotifiedByPromo && canDispatchBrowserNotification()) {
              sendBrowserNotification({
                title: 'Novo código na Caixa de Correio — Earn Easy',
                body: m.promoCode
                  ? `Código ${m.promoCode} liberado (+${formatPoints(m.pointsValue)} moedas). Abra sua Caixa de Correio!`
                  : m.title,
                tag: m.promoCode ? `promo_${m.promoCode}` : `mail_${m.messageId}`,
              });
            }
          }
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'mailboxMessages')
    );

    const unsubDeletedMailbox = onSnapshot(
      collection(db, 'users', uid, 'deletedMailbox'),
      (snap) => {
        setDeletedMailboxIds(snap.docs.map((d) => d.id));
      },
      () => {
        setDeletedMailboxIds([]);
      }
    );

    const unsubWithdrawalSettings = onSnapshot(
      doc(db, 'appSettings', 'withdrawal'),
      (snap) => {
        if (!snap.exists()) {
          setWithdrawalSettings(DEFAULT_WITHDRAWAL_SETTINGS);
          return;
        }
        const raw = snap.data() as Partial<WithdrawalSettings>;
        const clamp = (val: unknown, fallback: number) => {
          const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
          return Math.min(MAX_CONFIGURABLE_WITHDRAWAL_CENTS, Math.max(MIN_CONFIGURABLE_WITHDRAWAL_CENTS, n));
        };
        const quickList = Array.isArray(raw.quickAmountsCents)
          ? raw.quickAmountsCents
              .filter(
                (v): v is number =>
                  typeof v === 'number' &&
                  Number.isFinite(v) &&
                  v >= MIN_CONFIGURABLE_WITHDRAWAL_CENTS &&
                  v <= MAX_CONFIGURABLE_WITHDRAWAL_CENTS
              )
              .sort((a, b) => a - b)
          : DEFAULT_WITHDRAWAL_SETTINGS.quickAmountsCents;

        setWithdrawalSettings({
          settingId: 'withdrawal',
          firstWithdrawalMinCents: clamp(
            raw.firstWithdrawalMinCents,
            DEFAULT_WITHDRAWAL_SETTINGS.firstWithdrawalMinCents
          ),
          standardWithdrawalMinCents: clamp(
            raw.standardWithdrawalMinCents,
            DEFAULT_WITHDRAWAL_SETTINGS.standardWithdrawalMinCents
          ),
          quickAmountsCents:
            quickList.length > 0 ? quickList : DEFAULT_WITHDRAWAL_SETTINGS.quickAmountsCents,
          updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : 'admin',
          updatedAt: raw.updatedAt ?? null,
        });
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'appSettings/withdrawal')
    );

    const unsubMultiplayerMatches = onSnapshot(
      query(collection(db, 'multiplayerMatches'), where('participantUids', 'array-contains', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as MultiplayerMatchRecord)
          .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
        setMyMultiplayerMatches(list);
      },
      () => {
        setMyMultiplayerMatches([]);
      }
    );

    const unsubVerificationRequest = onSnapshot(
      doc(db, 'verificationRequests', uid),
      (snap) => {
        setMyVerificationRequest(snap.exists() ? (snap.data() as VerificationRequest) : null);
      },
      () => {
        setMyVerificationRequest(null);
      }
    );

    try {
      const saved = window.localStorage.getItem(`earneasy_read_mail_${uid}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setReadMailboxIds(parsed.filter((item): item is string => typeof item === 'string'));
        }
      } else {
        setReadMailboxIds([]);
      }
    } catch {
      setReadMailboxIds([]);
    }

    try {
      const notifPref = window.localStorage.getItem(`earneasy_browser_notif_enabled_${uid}`);
      const nextEnabled = notifPref !== '0';
      setBrowserNotifEnabledState(nextEnabled);
      browserNotifPrefsRef.current.enabled = nextEnabled;
    } catch {
      setBrowserNotifEnabledState(true);
      browserNotifPrefsRef.current.enabled = true;
    }

    return () => {
      withdrawalsInitRef.current = false;
      prevWithdrawalStatusRef.current.clear();
      promosInitRef.current = false;
      mailboxInitRef.current = false;
      seenReleasedPromoCodesRef.current.clear();
      seenReleasedMailboxIdsRef.current.clear();
      unsubUser();
      unsubPrivate();
      unsubSessions();
      unsubConversions();
      unsubWithdrawals();
      unsubNotifications();
      unsubFraud();
      unsubCheckins();
      unsubLevelRewards();
      unsubMyReferral();
      unsubInvitedReferrals();
      unsubPublicPromoEvents();
      unsubPromoRedemptions();
      unsubMailbox();
      unsubDeletedMailbox();
      unsubWithdrawalSettings();
      unsubMultiplayerMatches();
      unsubVerificationRequest();
    };
  }, [authReady, firebaseUser]);

  // Monitor scheduled promo codes & mailbox events so browser alerts fire as soon as publishAt arrives
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const interval = window.setInterval(() => {
      if (!promosInitRef.current && !mailboxInitRef.current) return;
      const now = Date.now();

      for (const p of publicPromoEvents) {
        const publishMs = timestampToMillis(p.publishAt);
        if (publishMs > 0 && publishMs <= now && !seenReleasedPromoCodesRef.current.has(p.code)) {
          seenReleasedPromoCodesRef.current.add(p.code);
          if (canDispatchBrowserNotification()) {
            sendBrowserNotification({
              title: 'Código programado liberado — Earn Easy',
              body: `O código ${p.code} (+${formatPoints(p.pointsValue)} moedas) acabou de ser liberado!`,
              tag: `promo_${p.code}`,
            });
          }
        }
      }

      for (const m of rawMailboxMessages) {
        const publishMs = timestampToMillis(m.publishAt);
        if (publishMs > 0 && publishMs <= now && !seenReleasedMailboxIdsRef.current.has(m.messageId)) {
          seenReleasedMailboxIdsRef.current.add(m.messageId);
          const alreadyNotifiedByPromo = Boolean(
            m.promoCode && seenReleasedPromoCodesRef.current.has(m.promoCode)
          );
          if (m.promoCode) {
            seenReleasedPromoCodesRef.current.add(m.promoCode);
          }
          if (m.category === 'promo_event' && !alreadyNotifiedByPromo && canDispatchBrowserNotification()) {
            sendBrowserNotification({
              title: 'Código liberado na Caixa de Correio — Earn Easy',
              body: m.promoCode
                ? `Código ${m.promoCode} (+${formatPoints(m.pointsValue)} moedas) já pode ser resgatado!`
                : m.title,
              tag: m.promoCode ? `promo_${m.promoCode}` : `mail_${m.messageId}`,
            });
          }
        }
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [authReady, firebaseUser, publicPromoEvents, rawMailboxMessages]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Não foi possível concluir o login social.');
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const logFraudAttempt = async (
    eventType: FraudEvent['eventType'],
    severity: FraudEvent['severity'],
    details: string
  ) => {
    if (!firebaseUser) return;
    const logId = generateId('fraud');
    try {
      await setDoc(doc(db, 'fraudLogs', logId), {
        logId,
        userId: firebaseUser.uid,
        eventType,
        severity,
        details: details.slice(0, 400),
        resolved: false,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `fraudLogs/${logId}`);
    }
  };

  const recordGameReward = async (params: {
    gameCategory: GameCategory;
    scoreEarned: number;
    durationMs: number;
    movesCount: number;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para registrar sua pontuação.');
    }
    if (!isAccountCurrentlyActive(userAccount)) {
      throw new Error('Sua conta está em revisão antifraude ou suspensa. Contate o administrador.');
    }

    await syncServerUtcClock();
    const safeDuration = Math.max(3000, Math.round(params.durationMs));
    const verification = await verifyGameSessionWithServer({
      userId: firebaseUser.uid,
      gameCategory: params.gameCategory,
      scoreEarned: params.scoreEarned,
      durationMs: safeDuration,
      movesCount: Math.max(1, params.movesCount),
    });

    const credited = verification.verificationStatus === 'verified' ? verification.verifiedScore : 0;
    const sessionId = generateId('sess');
    const playedDate = getTodayUtcDate();

    const runRewardTx = async (includeReferralCommission: boolean) => {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const referralRef = doc(db, 'referrals', firebaseUser.uid);
        const [snap, refSnap] = await Promise.all([
          tx.get(userRef),
          includeReferralCommission ? tx.get(referralRef) : Promise.resolve(null),
        ]);
        if (!snap.exists()) throw new Error('Conta de usuário não encontrada.');
        const current = snap.data() as UserAccount;
        if (!isAccountCurrentlyActive(current)) {
          throw new Error('Conta bloqueada para pontuação.');
        }

        const prevPoints =
          typeof current.pointsBalance === 'number' && Number.isFinite(current.pointsBalance)
            ? current.pointsBalance
            : 0;
        const prevLifetime =
          typeof current.lifetimePoints === 'number' && Number.isFinite(current.lifetimePoints)
            ? current.lifetimePoints
            : 0;
        const prevGames =
          typeof current.gamesPlayed === 'number' && Number.isFinite(current.gamesPlayed)
            ? current.gamesPlayed
            : 0;

        const commission = credited > 0 ? Math.floor((credited * 12) / 100) : 0;
        let activeReferrerData: Referral | null = null;
        if (includeReferralCommission && refSnap && refSnap.exists() && commission >= 1) {
          const candidateRef = refSnap.data() as Referral;
          if (candidateRef.referrerUid && candidateRef.referrerUid !== firebaseUser.uid) {
            const refLbSnap = await tx.get(doc(db, 'leaderboard', candidateRef.referrerUid));
            if (refLbSnap.exists() && refLbSnap.data().status === 'active') {
              activeReferrerData = candidateRef;
            }
          }
        }

        tx.set(doc(db, 'gameSessions', sessionId), {
          sessionId,
          userId: firebaseUser.uid,
          gameCategory: params.gameCategory,
          scoreEarned: credited,
          durationMs: safeDuration,
          movesCount: Math.max(1, params.movesCount),
          integrityHash: verification.integrityHash,
          verificationStatus: verification.verificationStatus,
          fraudReason: verification.fraudReason.slice(0, 200),
          playedDate,
          createdAt: serverTimestamp(),
        });

        tx.update(userRef, {
          pointsBalance: prevPoints + credited,
          lifetimePoints: prevLifetime + credited,
          gamesPlayed: prevGames + 1,
          updatedAt: serverTimestamp(),
        });

        if (activeReferrerData && commission >= 1) {
          tx.update(referralRef, {
            totalCommissionPointsEarned: activeReferrerData.totalCommissionPointsEarned + commission,
            updatedAt: serverTimestamp(),
          });
          tx.update(doc(db, 'users', activeReferrerData.referrerUid), {
            pointsBalance: increment(commission),
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            pointsBalance: prevPoints + credited,
            lifetimePoints: prevLifetime + credited,
            gamesPlayed: prevGames + 1,
          })
        );
      });
    };

    try {
      try {
        await runRewardTx(true);
      } catch (firstErr) {
        if (isFirestoreSdkError(firstErr)) {
          await runRewardTx(false);
        } else {
          throw firstErr;
        }
      }
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
    }

    if (verification.verificationStatus !== 'verified') {
      await logFraudAttempt(
        'speed_anomaly',
        'medium',
        `Partida em ${params.gameCategory} sinalizada: ${verification.fraudReason}`
      );
    }

    return {
      credited,
      verificationStatus: verification.verificationStatus,
      fraudReason: verification.fraudReason,
    };
  };

  const convertDailyPoints = async (pointsToConvert: number) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Usuário não autenticado.');
    }
    await syncServerUtcClock(true);
    const today = getTodayUtcDate();
    if (userAccount.lastConversionDate === today) {
      await logFraudAttempt(
        'double_conversion_attempt',
        'medium',
        `Tentativa de segunda conversão no mesmo dia (${today}).`
      );
      throw new Error('Você já realizou sua conversão diária hoje. Volte após 00:00 UTC.');
    }

    const validPoints = Math.floor(pointsToConvert / POINTS_PER_TEN_CENTS) * POINTS_PER_TEN_CENTS;
    if (validPoints < POINTS_PER_TEN_CENTS) {
      throw new Error('É necessário no mínimo 1.000 pontos para converter em R$ 0,10.');
    }
    if (validPoints > userAccount.pointsBalance) {
      throw new Error('Saldo de pontos insuficiente para essa conversão.');
    }

    const brlCentsCredited = (validPoints / POINTS_PER_TEN_CENTS) * CENTS_PER_BLOCK;
    const conversionId = generateId('conv');
    const integrityToken = await sha256Hex(`${firebaseUser.uid}|${validPoints}|${today}|${conversionId}`);

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Conta não encontrada.');
        const current = snap.data() as UserAccount;

        if (current.status !== 'active') {
          throw new Error('Conta em revisão antifraude.');
        }
        if (current.lastConversionDate === today) {
          throw new Error('Conversão diária já utilizada hoje.');
        }
        if (current.pointsBalance < validPoints) {
          throw new Error('Saldo de pontos insuficiente.');
        }

        tx.update(userRef, {
          pointsBalance: current.pointsBalance - validPoints,
          brlBalanceCents: current.brlBalanceCents + brlCentsCredited,
          lastConversionDate: today,
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'conversions', conversionId), {
          conversionId,
          userId: firebaseUser.uid,
          pointsConverted: validPoints,
          brlCentsCredited,
          conversionDate: today,
          captchaVerified: true,
          integrityToken: integrityToken.slice(0, 64),
          createdAt: serverTimestamp(),
        });

        tx.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            brlBalanceCents: current.brlBalanceCents + brlCentsCredited,
            pointsBalance: current.pointsBalance - validPoints,
          })
        );
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `conversions/${conversionId}`);
    }

    const recipientEmail = privateInfo?.email || firebaseUser.email || 'usuario@earneasy.app';
    const emailStatus = await dispatchEmailNotification({
      userId: firebaseUser.uid,
      recipientEmail,
      eventType: 'conversion_confirmed',
      subject: `Conversão diária de ${validPoints.toLocaleString('pt-BR')} pontos confirmada`,
      summary: `Você converteu ${validPoints.toLocaleString('pt-BR')} pontos em ${formatBRL(brlCentsCredited)} na sua carteira Earn Easy.`,
      referenceId: conversionId,
      amountBrl: formatBRL(brlCentsCredited),
    });

    return { brlCentsCredited, emailStatus };
  };

  const isFirstWithdrawalEligible = Boolean(
    userAccount &&
      userAccount.totalWithdrawnCents === 0 &&
      !userAccount.firstWithdrawalUsed &&
      !myWithdrawals.some((w) => w.status !== 'rejected')
  );

  const activeMinWithdrawalCents = isFirstWithdrawalEligible
    ? withdrawalSettings.firstWithdrawalMinCents
    : withdrawalSettings.standardWithdrawalMinCents;

  const logWithdrawalAttempt = async (params: {
    status: WithdrawalAttemptStatus;
    amountCents: number;
    pixKeyType: 'none' | PixKeyType;
    pixKey: string;
    withdrawalId?: string;
    details: string;
  }) => {
    if (!firebaseUser) return;
    const attemptId = generateId('wat');
    try {
      const fingerprint = await getDeviceFingerprint();
      const safeAmount = Number.isFinite(params.amountCents)
        ? Math.min(10_000_000, Math.max(0, Math.round(params.amountCents)))
        : 0;
      const safeName = (
        userAccount?.displayName ||
        firebaseUser.displayName ||
        'Jogador'
      )
        .trim()
        .slice(0, 80) || 'Jogador';
      const safeDetails = params.details.trim().slice(0, 300) || 'Tentativa de saque Pix';

      await setDoc(doc(db, 'withdrawalAttempts', attemptId), {
        attemptId,
        userId: firebaseUser.uid,
        userDisplayName: safeName,
        withdrawalId: (params.withdrawalId || '').slice(0, 128),
        amountCents: safeAmount,
        pixKeyType: params.pixKeyType,
        pixKey: params.pixKey.slice(0, 140),
        status: params.status,
        details: safeDetails.length >= 2 ? safeDetails : 'Tentativa registrada',
        deviceFingerprint: fingerprint.slice(0, 128),
        actorUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Do not break user flow if auxiliary audit logging fails
    }
  };

  const requestPixWithdrawal = async (params: {
    amountCents: number;
    pixKeyType: PixKeyType;
    pixKey: string;
    saveAsDefault: boolean;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Usuário não autenticado.');
    }
    if (params.amountCents < activeMinWithdrawalCents) {
      void logWithdrawalAttempt({
        status: 'blocked_min_amount',
        amountCents: params.amountCents,
        pixKeyType: params.pixKeyType,
        pixKey: params.pixKey,
        details: `Bloqueado abaixo do mínimo vigente (${formatBRL(activeMinWithdrawalCents)}).`,
      });
      throw new Error(
        `O valor mínimo para ${isFirstWithdrawalEligible ? 'o seu primeiro saque' : 'saque'} via Pix é de ${formatBRL(activeMinWithdrawalCents)}.`
      );
    }
    if (params.amountCents > userAccount.brlBalanceCents) {
      void logWithdrawalAttempt({
        status: 'blocked_insufficient_balance',
        amountCents: params.amountCents,
        pixKeyType: params.pixKeyType,
        pixKey: params.pixKey,
        details: `Saldo insuficiente (${formatBRL(userAccount.brlBalanceCents)} disponível para pedido de ${formatBRL(params.amountCents)}).`,
      });
      throw new Error('Saldo em reais insuficiente para este saque.');
    }

    const withdrawalId = generateId('pix');
    const attemptId = generateId('wat');
    const requestedDate = getTodayUtcDate();
    const fingerprint = await getDeviceFingerprint();

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Conta não encontrada.');
        const current = snap.data() as UserAccount;

        if (current.status !== 'active') {
          throw new Error('Sua conta está bloqueada para saques no momento.');
        }

        const firstEligibleNow = current.totalWithdrawnCents === 0 && !current.firstWithdrawalUsed;
        const requiredMinNow = firstEligibleNow
          ? withdrawalSettings.firstWithdrawalMinCents
          : withdrawalSettings.standardWithdrawalMinCents;

        if (params.amountCents < requiredMinNow) {
          throw new Error(`O valor mínimo para saque via Pix é de ${formatBRL(requiredMinNow)}.`);
        }
        if (current.brlBalanceCents < params.amountCents) {
          throw new Error('Saldo insuficiente.');
        }

        tx.update(userRef, {
          brlBalanceCents: current.brlBalanceCents - params.amountCents,
          firstWithdrawalUsed: true,
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'withdrawals', withdrawalId), {
          withdrawalId,
          userId: firebaseUser.uid,
          userDisplayName: current.displayName,
          amountCents: params.amountCents,
          pixKeyType: params.pixKeyType,
          pixKey: params.pixKey.slice(0, 140),
          status: 'pending',
          fraudCheckPassed: current.riskScore < 50,
          adminNote: '',
          pixTransactionId: '',
          requestedDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'withdrawalAttempts', attemptId), {
          attemptId,
          userId: firebaseUser.uid,
          userDisplayName: current.displayName.slice(0, 80),
          withdrawalId,
          amountCents: params.amountCents,
          pixKeyType: params.pixKeyType,
          pixKey: params.pixKey.slice(0, 140),
          status: 'submitted_pending',
          details: firstEligibleNow
            ? `1º saque Pix enviado (${formatBRL(params.amountCents)}) — aguardando análise administrativa.`
            : `Saque Pix enviado (${formatBRL(params.amountCents)}) — aguardando análise administrativa.`,
          deviceFingerprint: fingerprint.slice(0, 128),
          actorUid: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });

        if (params.saveAsDefault) {
          tx.update(doc(db, 'users', firebaseUser.uid, 'private', 'info'), {
            defaultPixKeyType: params.pixKeyType,
            defaultPixKey: params.pixKey.slice(0, 140),
            deviceFingerprint: fingerprint,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            brlBalanceCents: current.brlBalanceCents - params.amountCents,
          })
        );
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Falha na transação de saque Pix.';
      const isAccountBlocked = msg.toLowerCase().includes('bloqueada');
      void logWithdrawalAttempt({
        status: isAccountBlocked ? 'blocked_account_status' : 'failed_transaction',
        amountCents: params.amountCents,
        pixKeyType: params.pixKeyType,
        pixKey: params.pixKey,
        details: msg,
      });
      handleTransactionError(error, OperationType.WRITE, `withdrawals/${withdrawalId}`);
    }

    const recipientEmail = privateInfo?.email || firebaseUser.email || 'usuario@earneasy.app';
    const emailStatus = await dispatchEmailNotification({
      userId: firebaseUser.uid,
      recipientEmail,
      eventType: 'withdrawal_requested',
      subject: `Solicitação de saque Pix de ${formatBRL(params.amountCents)} recebida`,
      summary: `Sua solicitação de saque via Pix (${params.pixKeyType.toUpperCase()}: ${params.pixKey}) no valor de ${formatBRL(params.amountCents)} entrou em análise antifraude e será processada pelo painel administrativo.`,
      referenceId: withdrawalId,
      amountBrl: formatBRL(params.amountCents),
      pixKey: params.pixKey,
    });

    return { withdrawalId, emailStatus };
  };

  const createUserAccount = async (params: {
    displayName: string;
    photoURL: string;
    referralCode?: string;
  }): Promise<{ status: 'active' | 'suspended'; message?: string; referralApplied?: boolean }> => {
    if (!firebaseUser) {
      throw new Error('Autentique-se com sua conta Google primeiro.');
    }

    const formatCheck = validateUsernameInput(params.displayName);
    if (!formatCheck.valid) {
      throw new Error(formatCheck.error || 'Nome de usuário inválido.');
    }

    const cleanName = formatCheck.clean;
    const cleanPhoto = sanitizePhotoUrl(params.photoURL);
    const profanity = checkUsernameProfanity(cleanName);
    const fingerprint = await getDeviceFingerprint();
    const userRef = doc(db, 'users', firebaseUser.uid);
    const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');

    const candidateRefUid = (params.referralCode || '').trim();
    let validReferrerUid: string | null = null;
    if (
      !profanity.blocked &&
      candidateRefUid &&
      candidateRefUid !== firebaseUser.uid &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(candidateRefUid)
    ) {
      try {
        const refLbSnap = await getDoc(doc(db, 'leaderboard', candidateRefUid));
        if (refLbSnap.exists() && refLbSnap.data().status === 'active') {
          validReferrerUid = candidateRefUid;
        }
      } catch {
        validReferrerUid = null;
      }
    }

    try {
      const batch = writeBatch(db);
      if (profanity.blocked) {
        const logId = generateId('fraud');
        batch.set(userRef, {
          uid: firebaseUser.uid,
          displayName: 'Conta Banida',
          photoURL: '',
          pointsBalance: 0,
          lifetimePoints: 0,
          brlBalanceCents: 0,
          totalWithdrawnCents: 0,
          lastConversionDate: '',
          status: 'suspended',
          riskScore: 100,
          gamesPlayed: 0,
          identityVerified: false,
          verifiedBadge: 'none',
          verificationStatus: 'none',
          verificationNote: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(privateRef, {
          uid: firebaseUser.uid,
          email: (firebaseUser.email || firebaseUser.providerData?.[0]?.email || 'sem-email@earneasy.app').slice(0, 160),
          defaultPixKeyType: 'none',
          defaultPixKey: '',
          deviceFingerprint: fingerprint,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'fraudLogs', logId), {
          logId,
          userId: firebaseUser.uid,
          eventType: 'profanity_username_ban',
          severity: 'critical',
          details: 'Banimento imediato no cadastro por tentativa de uso de palavrão ou termo ofensivo no nome de usuário.',
          resolved: false,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        return {
          status: 'suspended',
          message:
            'Nome de usuário bloqueado por conter palavrão ou termo ofensivo. Sua conta foi banida imediatamente.',
        };
      }

      const commitActiveSignup = async (referrerUid: string | null) => {
        const activeBatch = writeBatch(db);
        activeBatch.set(userRef, {
          uid: firebaseUser.uid,
          displayName: cleanName,
          photoURL: cleanPhoto,
          pointsBalance: 0,
          lifetimePoints: 0,
          brlBalanceCents: 0,
          totalWithdrawnCents: 0,
          lastConversionDate: '',
          status: 'active',
          riskScore: 0,
          gamesPlayed: 0,
          identityVerified: false,
          verifiedBadge: 'none',
          verificationStatus: 'none',
          verificationNote: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        activeBatch.set(privateRef, {
          uid: firebaseUser.uid,
          email: (firebaseUser.email || firebaseUser.providerData?.[0]?.email || 'sem-email@earneasy.app').slice(0, 160),
          defaultPixKeyType: 'none',
          defaultPixKey: '',
          deviceFingerprint: fingerprint,
          updatedAt: serverTimestamp(),
        });
        activeBatch.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: cleanName,
          photoURL: cleanPhoto,
          brlBalanceCents: 0,
          pointsBalance: 0,
          lifetimePoints: 0,
          gamesPlayed: 0,
          status: 'active',
          identityVerified: false,
          updatedAt: serverTimestamp(),
        });

        if (referrerUid) {
          activeBatch.set(doc(db, 'referrals', firebaseUser.uid), {
            referralId: firebaseUser.uid,
            referrerUid,
            invitedUid: firebaseUser.uid,
            invitedDisplayName: cleanName,
            signupBonusPoints: REFERRAL_SIGNUP_BONUS_POINTS,
            commissionRatePct: 12,
            totalCommissionPointsEarned: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          activeBatch.update(doc(db, 'users', referrerUid), {
            pointsBalance: increment(REFERRAL_SIGNUP_BONUS_POINTS),
            updatedAt: serverTimestamp(),
          });
        }

        await activeBatch.commit();
      };

      let appliedReferrerUid: string | null = validReferrerUid;
      try {
        await commitActiveSignup(appliedReferrerUid);
      } catch (firstErr) {
        if (appliedReferrerUid && isFirestoreSdkError(firstErr)) {
          appliedReferrerUid = null;
          await commitActiveSignup(null);
        } else {
          throw firstErr;
        }
      }

      try {
        window.localStorage.removeItem('earneasy_ref_uid');
      } catch {
        // Ignore storage error
      }

      if (appliedReferrerUid && firebaseUser.email) {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : 'https://earneasy.app';
        void dispatchEmailNotification({
          userId: firebaseUser.uid,
          recipientEmail: firebaseUser.email,
          eventType: 'referral_welcome',
          subject: 'Convite vinculado com sucesso no Earn Easy!',
          summary: `Sua conta (${cleanName}) foi criada através de um link de convite oficial. Você já pode jogar, fazer check-ins e converter seus pontos em Pix — e quem te convidou acabou de receber +${REFERRAL_SIGNUP_BONUS_POINTS} pontos!`,
          referenceId: appliedReferrerUid,
          inviteCode: firebaseUser.uid,
          inviteLink: `${origin}/?ref=${firebaseUser.uid}`,
          bonusPoints: REFERRAL_SIGNUP_BONUS_POINTS,
          commissionPct: 12,
        });
      }

      return { status: 'active', referralApplied: Boolean(appliedReferrerUid) };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${firebaseUser.uid}`);
      throw error;
    }
  };

  const updateUserProfile = async (params: {
    displayName: string;
    photoURL: string;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para editar seu perfil.');
    }

    const formatCheck = validateUsernameInput(params.displayName);
    if (!formatCheck.valid) {
      throw new Error(formatCheck.error || 'Informe um nome de usuário válido.');
    }

    const cleanName = formatCheck.clean;
    const cleanPhoto = sanitizePhotoUrl(params.photoURL);
    const profanity = checkUsernameProfanity(cleanName);

    if (profanity.blocked) {
      try {
        const batch = writeBatch(db);
        const logId = generateId('fraud');
        batch.update(doc(db, 'users', firebaseUser.uid), {
          status: 'suspended',
          riskScore: 100,
          updatedAt: serverTimestamp(),
        });
        batch.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(userAccount, { status: 'suspended' })
        );
        batch.set(doc(db, 'fraudLogs', logId), {
          logId,
          userId: firebaseUser.uid,
          eventType: 'profanity_username_ban',
          severity: 'critical',
          details: 'Banimento imediato ao tentar alterar o nome de usuário para termo ofensivo/palavrão.',
          resolved: false,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
      throw new Error('Uso de palavrão ou termo ofensivo detectado. Sua conta foi banida imediatamente.');
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', firebaseUser.uid), {
        displayName: cleanName,
        photoURL: cleanPhoto,
        updatedAt: serverTimestamp(),
      });
      if (!userAccount.status || userAccount.status === 'active') {
        batch.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(userAccount, {
            uid: userAccount.uid || firebaseUser.uid,
            displayName: cleanName,
            photoURL: cleanPhoto,
            status: 'active',
          })
        );
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    }
  };

  const claimDailyCheckin = async () => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para coletar seu check-in diário.');
    }
    if (!isAccountCurrentlyActive(userAccount)) {
      throw new Error('Sua conta está em revisão antifraude.');
    }

    await syncServerUtcClock(true);
    const today = getTodayUtcDate();
    const yesterday = getUtcDateDaysAgo(1);
    const checkinId = `chk_${firebaseUser.uid}_${today}`;
    const yesterdayCheckinId = `chk_${firebaseUser.uid}_${yesterday}`;
    if (myCheckins.some((c) => c.checkinDate === today || c.checkinId === checkinId)) {
      throw new Error('Você já coletou seu check-in diário hoje. Volte amanhã!');
    }

    const windowStartStr = getUtcDateDaysAgo(6);
    const prevWindow = myCheckins.filter(
      (c) => c.checkinDate >= windowStartStr && c.checkinDate < today
    );
    const prevSum = Math.max(0, prevWindow.reduce((sum, c) => sum + c.pointsAwarded, 0));

    let minPts = 143;
    let maxPts = 172;
    if (prevWindow.length >= 6) {
      minPts = Math.max(120, Math.min(200, 1000 - prevSum));
      maxPts = Math.max(minPts, Math.min(200, 1200 - prevSum));
    }

    const pointsAwarded = minPts + Math.floor(Math.random() * (maxPts - minPts + 1));
    const weekTotalAfter = Math.max(pointsAwarded, Math.min(1400, prevSum + pointsAwarded));
    const hadPreviousCheckinsBeforeYesterday = myCheckins.some((c) => c.checkinDate < yesterday);

    let streakDay = 1;
    let brlBonusCents = 0;
    let streakBroken = false;

    const runCheckinTx = async (includeReferralCommission: boolean) => {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const checkinRef = doc(db, 'dailyCheckins', checkinId);
        const yesterdayRef = doc(db, 'dailyCheckins', yesterdayCheckinId);
        const referralRef = doc(db, 'referrals', firebaseUser.uid);
        const [userSnap, checkinSnap, yesterdaySnap, refSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(checkinRef),
          tx.get(yesterdayRef),
          includeReferralCommission ? tx.get(referralRef) : Promise.resolve(null),
        ]);

        if (!userSnap.exists()) throw new Error('Conta de usuário não encontrada.');
        if (checkinSnap.exists()) {
          throw new Error('Check-in diário de hoje já foi coletado.');
        }

        const current = userSnap.data() as UserAccount;
        if (!isAccountCurrentlyActive(current)) {
          throw new Error('Sua conta está em revisão antifraude.');
        }

        const prevPoints =
          typeof current.pointsBalance === 'number' && Number.isFinite(current.pointsBalance)
            ? current.pointsBalance
            : 0;
        const prevLifetime =
          typeof current.lifetimePoints === 'number' && Number.isFinite(current.lifetimePoints)
            ? current.lifetimePoints
            : 0;
        const prevBrl =
          typeof current.brlBalanceCents === 'number' && Number.isFinite(current.brlBalanceCents)
            ? current.brlBalanceCents
            : 0;

        const commission = Math.floor((pointsAwarded * 12) / 100);
        let activeReferrerData: Referral | null = null;
        if (includeReferralCommission && refSnap && refSnap.exists() && commission >= 1) {
          const candidateRef = refSnap.data() as Referral;
          if (candidateRef.referrerUid && candidateRef.referrerUid !== firebaseUser.uid) {
            const refLbSnap = await tx.get(doc(db, 'leaderboard', candidateRef.referrerUid));
            if (refLbSnap.exists() && refLbSnap.data().status === 'active') {
              activeReferrerData = candidateRef;
            }
          }
        }

        if (yesterdaySnap.exists()) {
          const yData = yesterdaySnap.data() as Partial<DailyCheckin>;
          const prevStreak =
            typeof yData.streakDay === 'number' && Number.isFinite(yData.streakDay)
              ? Math.max(1, Math.min(STREAK_TARGET_DAYS, Math.round(yData.streakDay)))
              : 1;
          streakDay = prevStreak >= STREAK_TARGET_DAYS ? 1 : prevStreak + 1;
          streakBroken = false;
        } else {
          streakDay = 1;
          streakBroken = hadPreviousCheckinsBeforeYesterday;
        }

        brlBonusCents = streakDay === STREAK_TARGET_DAYS ? STREAK_REWARD_CENTS : 0;

        tx.set(checkinRef, {
          checkinId,
          userId: firebaseUser.uid,
          checkinDate: today,
          pointsAwarded,
          weekTotalAfter,
          streakDay,
          brlBonusCents,
          createdAt: serverTimestamp(),
        });

        tx.update(userRef, {
          pointsBalance: prevPoints + pointsAwarded,
          lifetimePoints: prevLifetime + pointsAwarded,
          brlBalanceCents: prevBrl + brlBonusCents,
          updatedAt: serverTimestamp(),
        });

        if (activeReferrerData && commission >= 1) {
          tx.update(referralRef, {
            totalCommissionPointsEarned: activeReferrerData.totalCommissionPointsEarned + commission,
            updatedAt: serverTimestamp(),
          });
          tx.update(doc(db, 'users', activeReferrerData.referrerUid), {
            pointsBalance: increment(commission),
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            brlBalanceCents: prevBrl + brlBonusCents,
            pointsBalance: prevPoints + pointsAwarded,
            lifetimePoints: prevLifetime + pointsAwarded,
          })
        );
      });
    };

    try {
      try {
        await runCheckinTx(true);
      } catch (firstErr) {
        if (isFirestoreSdkError(firstErr)) {
          await runCheckinTx(false);
        } else {
          throw firstErr;
        }
      }
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `dailyCheckins/${checkinId}`);
    }

    if (brlBonusCents > 0) {
      const recipientEmail = privateInfo?.email || firebaseUser.email || 'usuario@earneasy.app';
      await dispatchEmailNotification({
        userId: firebaseUser.uid,
        recipientEmail,
        eventType: 'streak_bonus_credited',
        subject: 'Parabéns! Prêmio de R$ 10,00 por 30 dias seguidos creditado',
        summary: `Você completou ${STREAK_TARGET_DAYS} dias consecutivos de check-in diário sem falhar nenhum dia e ganhou ${formatBRL(brlBonusCents)} diretamente no seu saldo para saque Pix.`,
        referenceId: checkinId,
        amountBrl: formatBRL(brlBonusCents),
      });
    }

    return {
      pointsAwarded,
      weekTotal: weekTotalAfter,
      streakDay,
      brlBonusCents,
      streakBroken,
    };
  };

  const claimLevelReward = async (level: number) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para resgatar recompensas de nível.');
    }
    if (userAccount.status !== 'active') {
      throw new Error('Sua conta está em revisão antifraude.');
    }

    const tier = PLAYER_LEVELS.find((t) => t.level === level);
    if (!tier || tier.rewardPoints <= 0) {
      throw new Error('Este nível não possui recompensa resgatável.');
    }
    if (myLevelRewards.some((r) => r.level === level)) {
      throw new Error(`A recompensa do Nível ${level} já foi resgatada.`);
    }

    const rewardId = `lvl_${firebaseUser.uid}_${level}`;

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const rewardRef = doc(db, 'levelRewards', rewardId);
        const [userSnap, rewardSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(rewardRef),
        ]);

        if (!userSnap.exists()) throw new Error('Conta não encontrada.');
        if (rewardSnap.exists()) {
          throw new Error(`Recompensa do Nível ${level} já resgatada.`);
        }

        const current = userSnap.data() as UserAccount;
        if (current.status !== 'active') {
          throw new Error('Sua conta está suspensa.');
        }

        const rawLifetime =
          typeof current.lifetimePoints === 'number' && Number.isFinite(current.lifetimePoints)
            ? current.lifetimePoints
            : 0;
        const rawGames =
          typeof current.gamesPlayed === 'number' && Number.isFinite(current.gamesPlayed)
            ? current.gamesPlayed
            : 0;
        const currentXp = Math.max(0, Math.floor(rawLifetime)) + Math.max(0, Math.floor(rawGames)) * 25;
        if (currentXp < tier.minXp) {
          throw new Error(`Você precisa de ${tier.minXp.toLocaleString('pt-BR')} XP para desbloquear o Nível ${level}.`);
        }

        tx.set(rewardRef, {
          rewardId,
          userId: firebaseUser.uid,
          level: tier.level,
          rewardPoints: tier.rewardPoints,
          xpAtClaim: currentXp,
          createdAt: serverTimestamp(),
        });

        tx.update(userRef, {
          pointsBalance: current.pointsBalance + tier.rewardPoints,
          updatedAt: serverTimestamp(),
        });

        tx.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            pointsBalance: current.pointsBalance + tier.rewardPoints,
          })
        );
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `levelRewards/${rewardId}`);
    }

    return {
      level: tier.level,
      title: tier.title,
      rewardPoints: tier.rewardPoints,
    };
  };

  const redeemPromoCode = async (rawCode: string) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para resgatar códigos promocionais.');
    }
    if (userAccount.status !== 'active') {
      throw new Error('Sua conta está suspensa ou em revisão antifraude.');
    }

    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
      throw new Error('Código inválido. Use apenas letras maiúsculas, números, "-" ou "_" (mínimo 3 caracteres).');
    }
    if (myPromoRedemptions.some((r) => r.code === code)) {
      throw new Error(`Você já resgatou o código ${code}.`);
    }

    await syncServerUtcClock();
    const redemptionId = `prm_${firebaseUser.uid}_${code}`;
    let redeemedTitle = '';
    let redeemedPoints = 0;

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const promoRef = doc(db, 'promoCodes', code);
        const redemptionRef = doc(db, 'promoRedemptions', redemptionId);
        const [userSnap, promoSnap, redemptionSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(promoRef),
          tx.get(redemptionRef),
        ]);

        if (!userSnap.exists()) throw new Error('Conta de usuário não encontrada.');
        const current = userSnap.data() as UserAccount;
        if (current.status !== 'active') {
          throw new Error('Sua conta está suspensa.');
        }

        if (!promoSnap.exists()) {
          throw new Error('Código não encontrado. Confira se digitou exatamente como enviado pelo admin.');
        }
        const promo = promoSnap.data() as PromoCode;
        if (!promo.active) {
          throw new Error('Este evento de código já foi encerrado ou pausado pelo administrador.');
        }
        const publishMs = timestampToMillis(promo.publishAt);
        const nowMs = getServerNowMs();
        if (publishMs > nowMs) {
          throw new Error(
            `Este código está agendado para ser publicado às ${formatScheduleTime(publishMs)} (falta ${formatScheduleRemaining(publishMs, nowMs)}).`
          );
        }
        if (promo.redemptionCount >= promo.maxRedemptions) {
          throw new Error('Este código atingiu o limite máximo de resgates disponíveis.');
        }
        if (redemptionSnap.exists()) {
          throw new Error(`Você já resgatou o código ${code} anteriormente.`);
        }

        redeemedTitle = promo.title;
        redeemedPoints = promo.pointsValue;

        tx.set(redemptionRef, {
          redemptionId,
          code,
          userId: firebaseUser.uid,
          pointsAwarded: promo.pointsValue,
          createdAt: serverTimestamp(),
        });

        tx.update(promoRef, {
          redemptionCount: promo.redemptionCount + 1,
          updatedAt: serverTimestamp(),
        });

        tx.update(userRef, {
          pointsBalance: current.pointsBalance + promo.pointsValue,
          lastPromoCode: code,
          updatedAt: serverTimestamp(),
        });

        tx.set(
          doc(db, 'leaderboard', firebaseUser.uid),
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            pointsBalance: current.pointsBalance + promo.pointsValue,
          })
        );
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `promoRedemptions/${redemptionId}`);
    }

    return {
      code,
      title: redeemedTitle,
      pointsAwarded: redeemedPoints,
    };
  };

  // Automatic email notification whenever a friend registers via this user's invite link
  useEffect(() => {
    if (!firebaseUser || !userAccount || !notificationsInitRef.current) return;
    const recipientEmail = privateInfo?.email || firebaseUser.email;
    if (!recipientEmail || !recipientEmail.includes('@')) return;

    const alreadyNotifiedIds = new Set(
      myNotifications
        .filter((n) => n.eventType === 'referral_bonus_credited')
        .map((n) => n.referenceId)
    );

    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://earneasy.app';

    for (const ref of myInvitedReferrals) {
      const storageKey = `earneasy_ref_mail_${firebaseUser.uid}_${ref.referralId}`;
      let persisted = false;
      try {
        persisted = window.localStorage.getItem(storageKey) === '1';
      } catch {
        persisted = false;
      }

      if (
        alreadyNotifiedIds.has(ref.referralId) ||
        dispatchedReferralNotifsRef.current.has(ref.referralId) ||
        persisted
      ) {
        dispatchedReferralNotifsRef.current.add(ref.referralId);
        continue;
      }

      dispatchedReferralNotifsRef.current.add(ref.referralId);
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // Ignore storage error
      }

      const bonusPts = ref.signupBonusPoints || REFERRAL_SIGNUP_BONUS_POINTS;
      void dispatchEmailNotification({
        userId: firebaseUser.uid,
        recipientEmail,
        eventType: 'referral_bonus_credited',
        subject: `Seu amigo ${ref.invitedDisplayName} aceitou seu convite (+${bonusPts} pts)!`,
        summary: `${ref.invitedDisplayName} se cadastrou usando seu link de convite. Você ganhou +${bonusPts} pontos imediatos e receberá ${ref.commissionRatePct || 12}% extras sobre tudo o que ele pontuar nos jogos e check-ins.`,
        referenceId: ref.referralId,
        invitedDisplayName: ref.invitedDisplayName,
        inviteCode: userAccount.uid,
        inviteLink: `${origin}/?ref=${userAccount.uid}`,
        bonusPoints: bonusPts,
        commissionPct: ref.commissionRatePct || 12,
      });
    }
  }, [firebaseUser, userAccount, privateInfo, myInvitedReferrals, myNotifications]);

  const sendInviteEmail = async (
    recipientEmail: string,
    customMessage?: string
  ): Promise<{
    deliveryStatus: EmailNotification['deliveryStatus'];
    referenceId: string;
  }> => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para enviar convites por e-mail.');
    }
    const cleanEmail = recipientEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 160) {
      throw new Error('Informe um endereço de e-mail válido para enviar o convite.');
    }
    if (
      (privateInfo?.email && cleanEmail === privateInfo.email.toLowerCase()) ||
      (firebaseUser.email && cleanEmail === firebaseUser.email.toLowerCase())
    ) {
      throw new Error('Você não pode enviar um convite para o seu próprio e-mail.');
    }

    const cleanNote = (customMessage || '').trim().slice(0, 220);
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://earneasy.app';
    const inviteLink = `${origin}/?ref=${userAccount.uid}`;
    const referenceId = generateId('inv');

    const summary = cleanNote
      ? `${userAccount.displayName} convidou você para o Earn Easy! "${cleanNote}" — Cadastre-se pelo link abaixo para jogar, acumular pontos e sacar via Pix.`
      : `${userAccount.displayName} convidou você para jogar no Earn Easy! Acumule pontos em desafios diários e converta para sacar via Pix.`;

    const deliveryStatus = await dispatchEmailNotification({
      userId: firebaseUser.uid,
      recipientEmail: cleanEmail,
      eventType: 'invite_sent',
      subject: `${userAccount.displayName} convidou você para o Earn Easy`,
      summary,
      referenceId,
      inviterName: userAccount.displayName,
      inviteLink,
      inviteCode: userAccount.uid,
      bonusPoints: REFERRAL_SIGNUP_BONUS_POINTS,
      commissionPct: 12,
      customMessage: cleanNote || undefined,
    });

    return { deliveryStatus, referenceId };
  };

  const mailboxMessages = rawMailboxMessages.filter(
    (m) => !deletedMailboxIds.includes(m.messageId)
  );

  const persistReadMailboxIds = (nextIds: string[]) => {
    setReadMailboxIds(nextIds);
    if (!firebaseUser) return;
    try {
      window.localStorage.setItem(`earneasy_read_mail_${firebaseUser.uid}`, JSON.stringify(nextIds));
    } catch {
      // Ignore storage error
    }
  };

  const markMailboxRead = (messageId: string) => {
    if (!messageId || readMailboxIds.includes(messageId)) return;
    persistReadMailboxIds([...readMailboxIds, messageId]);
  };

  const markAllMailboxRead = () => {
    const allIds = mailboxMessages.map((m) => m.messageId);
    const merged = Array.from(new Set([...readMailboxIds, ...allIds]));
    persistReadMailboxIds(merged);
  };

  const deleteMailboxMessage = async (messageId: string) => {
    if (!firebaseUser || !messageId) return;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(messageId)) return;
    try {
      await setDoc(doc(db, 'users', firebaseUser.uid, 'deletedMailbox', messageId), {
        messageId,
        deletedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}/deletedMailbox/${messageId}`);
      throw error;
    }
  };

  const clearAllMailboxMessages = async () => {
    if (!firebaseUser) return;
    if (mailboxMessages.length === 0) return;
    try {
      const batch = writeBatch(db);
      mailboxMessages.slice(0, 450).forEach((m) => {
        if (/^[a-zA-Z0-9_-]{1,128}$/.test(m.messageId)) {
          batch.set(doc(db, 'users', firebaseUser.uid, 'deletedMailbox', m.messageId), {
            messageId: m.messageId,
            deletedAt: serverTimestamp(),
          });
        }
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}/deletedMailbox`);
      throw error;
    }
  };

  const deleteEmailNotification = async (notificationId: string) => {
    if (!firebaseUser || !notificationId) return;
    try {
      await deleteDoc(doc(db, 'emailNotifications', notificationId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `emailNotifications/${notificationId}`);
      throw error;
    }
  };

  const updateMaintenanceSettings = async (params: {
    enabled: boolean;
    title: string;
    message: string;
    estimatedReturn: string;
  }) => {
    if (!firebaseUser || !isAdmin) {
      throw new Error('Somente administradores podem configurar o modo de manutenção.');
    }
    const cleanTitle = params.title.trim().slice(0, 120);
    const cleanMessage = params.message.trim().slice(0, 500);
    const cleanReturn = params.estimatedReturn.trim().slice(0, 120);
    if (cleanTitle.length < 3 || cleanMessage.length < 3) {
      throw new Error('Informe título e mensagem de manutenção com pelo menos 3 caracteres.');
    }

    try {
      await setDoc(doc(db, 'appSettings', 'maintenance'), {
        settingId: 'maintenance',
        enabled: Boolean(params.enabled),
        title: cleanTitle,
        message: cleanMessage,
        estimatedReturn: cleanReturn,
        updatedBy: (firebaseUser.email || firebaseUser.uid).slice(0, 160),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'appSettings/maintenance');
      throw error;
    }
  };

  const setBrowserNotifEnabled = (enabled: boolean) => {
    setBrowserNotifEnabledState(enabled);
    browserNotifPrefsRef.current.enabled = enabled;
    if (!firebaseUser) return;
    try {
      window.localStorage.setItem(
        `earneasy_browser_notif_enabled_${firebaseUser.uid}`,
        enabled ? '1' : '0'
      );
    } catch {
      // Ignore storage error
    }
  };

  const requestBrowserNotifications = async (): Promise<BrowserNotificationPermissionState> => {
    const result = await requestBrowserNotificationPermission();
    setBrowserNotifPermission(result);
    browserNotifPrefsRef.current.permission = result;
    if (result === 'granted') {
      setBrowserNotifEnabled(true);
      sendBrowserNotification({
        title: 'Alertas ativados — Earn Easy',
        body: 'Você receberá avisos quando seus saques Pix forem processados ou novos códigos forem liberados.',
        tag: 'earneasy_notif_enabled',
      });
    }
    return result;
  };

  const sendTestBrowserNotification = (): boolean => {
    if (!canDispatchBrowserNotification()) return false;
    return sendBrowserNotification({
      title: 'Teste de alerta — Earn Easy',
      body: 'Notificações nativas funcionando para saques Pix e novos códigos.',
      tag: 'earneasy_notif_test',
    });
  };

  const settleMultiplayerMatch = async (
    settlement: MultiplayerSettlementPayload
  ): Promise<{ alreadySettled: boolean; transferredPoints: number }> => {
    if (!firebaseUser) {
      throw new Error('Faça login para confirmar o resultado da partida.');
    }
    if (!settlement.participantUids.includes(firebaseUser.uid)) {
      throw new Error('Somente participantes da partida podem confirmar o resultado.');
    }

    // Validate server HMAC proof first to prevent forged match results
    const verifyRes = await fetch('/api/multiplayer/verify-settlement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settlement),
    });
    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}));
      throw new Error(errData?.error || 'Não foi possível validar o comprovante da partida no servidor.');
    }
    const verifyJson = await verifyRes.json();
    if (!verifyJson?.valid) {
      throw new Error('Comprovante criptográfico da partida inválido.');
    }

    const matchRef = doc(db, 'multiplayerMatches', settlement.matchId);

    try {
      return await runTransaction(db, async (tx) => {
        const matchSnap = await tx.get(matchRef);
        if (matchSnap.exists()) {
          const existingMatch = matchSnap.data() as MultiplayerMatchRecord;
          return {
            alreadySettled: true,
            transferredPoints: existingMatch.stakePoints || 0,
          };
        }

        const rawStake = Math.max(0, Math.floor(Number(settlement.stakePoints || 0)));
        const hasDeclaredWinner =
          !settlement.isDraw &&
          Boolean(settlement.winnerUid) &&
          Boolean(settlement.loserUid) &&
          settlement.winnerUid !== settlement.loserUid &&
          rawStake > 0;

        const winnerRef = hasDeclaredWinner ? doc(db, 'users', settlement.winnerUid) : null;
        const loserRef = hasDeclaredWinner ? doc(db, 'users', settlement.loserUid) : null;

        const [winnerSnap, loserSnap] = hasDeclaredWinner && winnerRef && loserRef
          ? await Promise.all([tx.get(winnerRef), tx.get(loserRef)])
          : [null, null];

        let effectiveStake = 0;
        let winnerData: UserAccount | null = null;
        let loserData: UserAccount | null = null;

        if (hasDeclaredWinner && winnerSnap?.exists() && loserSnap?.exists()) {
          winnerData = winnerSnap.data() as UserAccount;
          loserData = loserSnap.data() as UserAccount;
          if (
            winnerData.status === 'active' &&
            loserData.status === 'active' &&
            loserData.pointsBalance >= rawStake
          ) {
            effectiveStake = rawStake;
          }
        }

        tx.set(matchRef, {
          matchId: settlement.matchId,
          roomCode: settlement.roomCode,
          gameId: settlement.gameId,
          participantUids: settlement.participantUids,
          winnerUid: effectiveStake > 0 || !settlement.isDraw ? settlement.winnerUid : '',
          loserUid: effectiveStake > 0 || !settlement.isDraw ? settlement.loserUid : '',
          stakePoints: effectiveStake,
          settledByUid: firebaseUser.uid,
          integrityHash: settlement.settlementProof,
          createdAt: serverTimestamp(),
        });

        if (effectiveStake > 0 && winnerRef && loserRef && winnerData && loserData) {
          const nextWinnerPoints = winnerData.pointsBalance + effectiveStake;
          const nextWinnerLifetime = winnerData.lifetimePoints + effectiveStake;
          const nextWinnerGames = winnerData.gamesPlayed + 1;

          const nextLoserPoints = loserData.pointsBalance - effectiveStake;
          const nextLoserGames = loserData.gamesPlayed + 1;

          tx.update(winnerRef, {
            pointsBalance: nextWinnerPoints,
            lifetimePoints: nextWinnerLifetime,
            gamesPlayed: nextWinnerGames,
            lastMpMatchId: settlement.matchId,
            updatedAt: serverTimestamp(),
          });

          tx.update(loserRef, {
            pointsBalance: nextLoserPoints,
            gamesPlayed: nextLoserGames,
            lastMpMatchId: settlement.matchId,
            updatedAt: serverTimestamp(),
          });

          tx.set(
            doc(db, 'leaderboard', winnerData.uid),
            buildLeaderboardPayload(winnerData, {
              pointsBalance: nextWinnerPoints,
              lifetimePoints: nextWinnerLifetime,
              gamesPlayed: nextWinnerGames,
            })
          );

          tx.set(
            doc(db, 'leaderboard', loserData.uid),
            buildLeaderboardPayload(loserData, {
              pointsBalance: nextLoserPoints,
              gamesPlayed: nextLoserGames,
            })
          );
        }

        return {
          alreadySettled: false,
          transferredPoints: effectiveStake,
        };
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `multiplayerMatches/${settlement.matchId}`);
    }
  };

  const submitVerificationRequest = async (params: {
    fullName: string;
    cpf: string;
    birthDate: string;
    documentType: VerificationDocumentType;
    documentNumber: string;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para solicitar o Verificado Azul.');
    }
    if (userAccount.status && userAccount.status !== 'active') {
      throw new Error('Sua conta precisa estar ativa para solicitar verificação.');
    }
    if (resolveVerifiedBadgeTier(userAccount.verifiedBadge, userAccount.identityVerified) !== 'none') {
      throw new Error('Seu perfil já possui o selo Verificado ativo!');
    }

    const cleanFullName = params.fullName.trim().slice(0, 120);
    if (cleanFullName.length < 5) {
      throw new Error('Informe seu nome completo (mínimo 5 caracteres).');
    }
    if (!isValidCPF(params.cpf)) {
      throw new Error('O CPF informado é inválido. Confira os dígitos e tente novamente.');
    }
    const formattedCpf = formatCpfMask(onlyDigits(params.cpf));
    if (!isValidBirthDateStr(params.birthDate)) {
      throw new Error('Informe uma data de nascimento válida.');
    }
    const cleanDocNumber = params.documentNumber.trim().slice(0, 32);
    if (cleanDocNumber.length < 4) {
      throw new Error('Informe o número do documento com pelo menos 4 caracteres.');
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'verificationRequests', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: (userAccount.displayName || 'Jogador').trim().slice(0, 80) || 'Jogador',
        fullName: cleanFullName,
        cpf: formattedCpf,
        birthDate: params.birthDate,
        documentType: params.documentType,
        documentNumber: cleanDocNumber,
        status: 'pending',
        rejectionReason: '',
        reviewedBy: '',
        submittedAt: serverTimestamp(),
        reviewedAt: null,
      });
      batch.update(doc(db, 'users', firebaseUser.uid), {
        verificationStatus: 'pending',
        verificationNote: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `verificationRequests/${firebaseUser.uid}`);
      throw error;
    }
  };

  const approveVerificationRequest = async (targetUid: string) => {
    if (!firebaseUser || !isAdmin) {
      throw new Error('Somente administradores podem aprovar o Verificado Azul.');
    }

    const reviewerLabel = (firebaseUser.email || firebaseUser.uid).slice(0, 160);
    const vrRef = doc(db, 'verificationRequests', targetUid);
    const userRef = doc(db, 'users', targetUid);
    const lbRef = doc(db, 'leaderboard', targetUid);

    try {
      await runTransaction(db, async (tx) => {
        const [vrSnap, userSnap] = await Promise.all([tx.get(vrRef), tx.get(userRef)]);
        if (!vrSnap.exists()) {
          throw new Error('Solicitação de Verificado Azul não encontrada.');
        }
        if (!userSnap.exists()) {
          throw new Error('Usuário alvo não encontrado.');
        }

        const current = userSnap.data() as UserAccount;
        const nextBadge: VerifiedBadgeTier = current.verifiedBadge === 'owner' ? 'owner' : 'blue';

        tx.update(vrRef, {
          status: 'approved',
          rejectionReason: '',
          reviewedBy: reviewerLabel,
          reviewedAt: serverTimestamp(),
        });

        tx.update(userRef, {
          identityVerified: true,
          verifiedBadge: nextBadge,
          verificationStatus: 'approved',
          verificationNote: '',
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (!current.status || current.status === 'active') {
          tx.set(
            lbRef,
            buildLeaderboardPayload(current, {
              uid: current.uid || targetUid,
              identityVerified: true,
              verifiedBadge: nextBadge,
            })
          );
        }
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `verificationRequests/${targetUid}`);
    }
  };

  const rejectVerificationRequest = async (targetUid: string, reason: string) => {
    if (!firebaseUser || !isAdmin) {
      throw new Error('Somente administradores podem recusar solicitações.');
    }
    const cleanReason = reason.trim().slice(0, 240);
    if (cleanReason.length < 3) {
      throw new Error('Informe o motivo da recusa com pelo menos 3 caracteres.');
    }

    const reviewerLabel = (firebaseUser.email || firebaseUser.uid).slice(0, 160);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'verificationRequests', targetUid), {
        status: 'rejected',
        rejectionReason: cleanReason,
        reviewedBy: reviewerLabel,
        reviewedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', targetUid), {
        verificationStatus: 'rejected',
        verificationNote: cleanReason,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `verificationRequests/${targetUid}`);
      throw error;
    }
  };

  const setUserBlueVerified = async (targetUid: string, granted: boolean) => {
    if (!firebaseUser || !isAdmin) {
      throw new Error('Somente administradores podem gerenciar selos de verificação.');
    }

    const reviewerLabel = (firebaseUser.email || firebaseUser.uid).slice(0, 160);
    const userRef = doc(db, 'users', targetUid);
    const lbRef = doc(db, 'leaderboard', targetUid);
    const vrRef = doc(db, 'verificationRequests', targetUid);

    try {
      await runTransaction(db, async (tx) => {
        const [userSnap, vrSnap] = await Promise.all([tx.get(userRef), tx.get(vrRef)]);
        if (!userSnap.exists()) {
          throw new Error('Usuário alvo não encontrado.');
        }

        const current = userSnap.data() as UserAccount;
        if (current.verifiedBadge === 'owner' || isOwnerIdentity(null, targetUid)) {
          throw new Error('O selo oficial do Dono é exclusivo e protegido.');
        }

        const nextBadge: VerifiedBadgeTier = granted ? 'blue' : 'none';
        tx.update(userRef, {
          identityVerified: granted,
          verifiedBadge: nextBadge,
          verificationStatus: granted ? 'approved' : 'none',
          verificationNote: '',
          verifiedAt: granted ? serverTimestamp() : null,
          updatedAt: serverTimestamp(),
        });

        if (!current.status || current.status === 'active') {
          tx.set(
            lbRef,
            buildLeaderboardPayload(current, {
              uid: current.uid || targetUid,
              identityVerified: granted,
              verifiedBadge: nextBadge,
            })
          );
        }

        if (vrSnap.exists() && granted) {
          tx.update(vrRef, {
            status: 'approved',
            rejectionReason: '',
            reviewedBy: reviewerLabel,
            reviewedAt: serverTimestamp(),
          });
        }
      });
    } catch (error) {
      handleTransactionError(error, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const settleDoubleRound = async (params: {
    currency: CasinoCurrency;
    stakeAmount: number;
    choice: 'red' | 'black' | 'white';
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para jogar Double.');
    }
    if (!isAccountCurrentlyActive(userAccount)) {
      throw new Error('Sua conta precisa estar ativa para apostar no cassino.');
    }

    const res = await fetch('/api/casino/double/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: firebaseUser.uid,
        currency: params.currency,
        stakeAmount: params.stakeAmount,
        choice: params.choice,
      }),
    });
    const rollData = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(rollData?.error || 'Não foi possível sortear a rodada do Double.');
    }

    const sessionId = String(rollData.sessionId || generateId('dbl'));
    const stake = Number(rollData.stakeAmount) || params.stakeAmount;
    const payout = Number(rollData.payoutAmount) || 0;
    const multiplier = Number(rollData.multiplier) || 0;
    const won = Boolean(rollData.won);
    const winningColor = (rollData.winningColor || 'red') as 'red' | 'black' | 'white';
    const slot = Number(rollData.slot) || 0;
    const currency: CasinoCurrency = rollData.currency === 'brl' ? 'brl' : 'points';
    const integrityHash = String(rollData.integrityHash || 'double_server_hash');

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const sessionRef = doc(db, 'casinoSessions', sessionId);
        const lbRef = doc(db, 'leaderboard', firebaseUser.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Conta de usuário não encontrada.');
        const current = userSnap.data() as UserAccount;
        if (!isAccountCurrentlyActive(current)) {
          throw new Error('Sua conta precisa estar ativa para continuar.');
        }

        const prevPoints =
          typeof current.pointsBalance === 'number' && Number.isFinite(current.pointsBalance)
            ? current.pointsBalance
            : 0;
        const prevBrl =
          typeof current.brlBalanceCents === 'number' && Number.isFinite(current.brlBalanceCents)
            ? current.brlBalanceCents
            : 0;

        const available = currency === 'points' ? prevPoints : prevBrl;
        if (available < stake) {
          throw new Error('Saldo insuficiente para concluir esta aposta no Double.');
        }

        const nextPoints = currency === 'points' ? prevPoints - stake + payout : prevPoints;
        const nextBrl = currency === 'brl' ? prevBrl - stake + payout : prevBrl;

        tx.set(sessionRef, {
          sessionId,
          userId: firebaseUser.uid,
          gameType: 'double',
          currency,
          stakeAmount: stake,
          payoutAmount: payout,
          multiplier,
          status: won ? 'won' : 'lost',
          details: `Double · Escolha ${params.choice} · Casa ${slot} (${winningColor})`.slice(0, 200),
          integrityHash: integrityHash.slice(0, 128),
          createdAt: serverTimestamp(),
          settledAt: serverTimestamp(),
        });

        tx.update(userRef, {
          ...(currency === 'points' ? { pointsBalance: nextPoints } : { brlBalanceCents: nextBrl }),
          lastCasinoSessionId: sessionId,
          updatedAt: serverTimestamp(),
        });

        tx.set(
          lbRef,
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            pointsBalance: nextPoints,
            brlBalanceCents: nextBrl,
          })
        );
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `casinoSessions/${sessionId}`);
    }

    return {
      sessionId,
      slot,
      winningColor,
      won,
      payoutAmount: payout,
      stakeAmount: stake,
      currency,
      multiplier,
      netDelta: payout - stake,
    };
  };

  const startMinesSession = async (params: {
    currency: CasinoCurrency;
    stakeAmount: number;
    minesCount: number;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para jogar Mines.');
    }
    if (!isAccountCurrentlyActive(userAccount)) {
      throw new Error('Sua conta precisa estar ativa para apostar no cassino.');
    }

    const sessionId = generateId('mns');
    const res = await fetch('/api/casino/mines/deal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: firebaseUser.uid,
        currency: params.currency,
        stakeAmount: params.stakeAmount,
        minesCount: params.minesCount,
        sessionId,
      }),
    });
    const dealData = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(dealData?.error || 'Não foi possível iniciar a partida de Mines.');
    }

    const confirmedSessionId = String(dealData.sessionId || sessionId);
    const currency: CasinoCurrency = dealData.currency === 'brl' ? 'brl' : 'points';
    const stake = Number(dealData.stakeAmount) || params.stakeAmount;
    const minesCount = Number(dealData.minesCount) || params.minesCount;
    const nextMultiplier = Number(dealData.nextMultiplier) || 1;
    const integrityHash = String(dealData.integrityHash || 'mines_deal_hash');

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const sessionRef = doc(db, 'casinoSessions', confirmedSessionId);
        const lbRef = doc(db, 'leaderboard', firebaseUser.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Conta de usuário não encontrada.');
        const current = userSnap.data() as UserAccount;
        if (!isAccountCurrentlyActive(current)) {
          throw new Error('Sua conta precisa estar ativa para iniciar a rodada.');
        }

        const prevPoints =
          typeof current.pointsBalance === 'number' && Number.isFinite(current.pointsBalance)
            ? current.pointsBalance
            : 0;
        const prevBrl =
          typeof current.brlBalanceCents === 'number' && Number.isFinite(current.brlBalanceCents)
            ? current.brlBalanceCents
            : 0;

        const available = currency === 'points' ? prevPoints : prevBrl;
        if (available < stake) {
          throw new Error('Saldo insuficiente para iniciar esta partida de Mines.');
        }

        const nextPoints = currency === 'points' ? prevPoints - stake : prevPoints;
        const nextBrl = currency === 'brl' ? prevBrl - stake : prevBrl;

        tx.set(sessionRef, {
          sessionId: confirmedSessionId,
          userId: firebaseUser.uid,
          gameType: 'mines',
          currency,
          stakeAmount: stake,
          payoutAmount: 0,
          multiplier: 1,
          status: 'active',
          details: `Mines · ${minesCount} bombas em andamento`.slice(0, 200),
          integrityHash: integrityHash.slice(0, 128),
          createdAt: serverTimestamp(),
          settledAt: null,
        });

        tx.update(userRef, {
          ...(currency === 'points' ? { pointsBalance: nextPoints } : { brlBalanceCents: nextBrl }),
          lastCasinoSessionId: confirmedSessionId,
          updatedAt: serverTimestamp(),
        });

        tx.set(
          lbRef,
          buildLeaderboardPayload(current, {
            uid: current.uid || firebaseUser.uid,
            pointsBalance: nextPoints,
            brlBalanceCents: nextBrl,
          })
        );
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `casinoSessions/${confirmedSessionId}`);
    }

    return {
      sessionId: confirmedSessionId,
      currency,
      stakeAmount: stake,
      minesCount,
      nextMultiplier,
    };
  };

  const finishMinesSession = async (params: {
    sessionId: string;
    won: boolean;
    payoutAmount: number;
    multiplier: number;
    details: string;
    integrityHash: string;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Faça login para encerrar a partida de Mines.');
    }

    try {
      await runTransaction(db, async (tx) => {
        const sessionRef = doc(db, 'casinoSessions', params.sessionId);
        const userRef = doc(db, 'users', firebaseUser.uid);
        const lbRef = doc(db, 'leaderboard', firebaseUser.uid);

        const [sessionSnap, userSnap] = await Promise.all([tx.get(sessionRef), tx.get(userRef)]);
        if (!sessionSnap.exists()) throw new Error('Sessão de Mines não encontrada.');
        if (!userSnap.exists()) throw new Error('Conta de usuário não encontrada.');

        const sessionData = sessionSnap.data() as CasinoSession;
        if (sessionData.userId !== firebaseUser.uid) {
          throw new Error('Sessão pertence a outro jogador.');
        }
        if (sessionData.status !== 'active') {
          return;
        }

        const current = userSnap.data() as UserAccount;
        const maxPossiblePayout = sessionData.stakeAmount * 50;
        const creditAmount = params.won
          ? Math.min(maxPossiblePayout, Math.max(0, Math.floor(params.payoutAmount)))
          : 0;

        tx.update(sessionRef, {
          status: params.won ? 'won' : 'lost',
          payoutAmount: creditAmount,
          multiplier: params.won ? Math.min(50, Math.max(0, Number(params.multiplier) || 1)) : 0,
          details: params.details.slice(0, 200),
          integrityHash: params.integrityHash.slice(0, 128),
          settledAt: serverTimestamp(),
        });

        if (creditAmount > 0) {
          const prevPoints =
            typeof current.pointsBalance === 'number' && Number.isFinite(current.pointsBalance)
              ? current.pointsBalance
              : 0;
          const prevBrl =
            typeof current.brlBalanceCents === 'number' && Number.isFinite(current.brlBalanceCents)
              ? current.brlBalanceCents
              : 0;
          const nextPoints =
            sessionData.currency === 'points' ? prevPoints + creditAmount : prevPoints;
          const nextBrl = sessionData.currency === 'brl' ? prevBrl + creditAmount : prevBrl;

          tx.update(userRef, {
            ...(sessionData.currency === 'points'
              ? { pointsBalance: nextPoints }
              : { brlBalanceCents: nextBrl }),
            updatedAt: serverTimestamp(),
          });

          tx.set(
            lbRef,
            buildLeaderboardPayload(current, {
              uid: current.uid || firebaseUser.uid,
              pointsBalance: nextPoints,
              brlBalanceCents: nextBrl,
            })
          );
        }
      });
    } catch (error) {
      handleTransactionError(error, OperationType.WRITE, `casinoSessions/${params.sessionId}`);
    }
  };

  const unreadMailboxCount = mailboxMessages.filter(
    (m) => !readMailboxIds.includes(m.messageId)
  ).length;

  const needsOnboarding = authReady && Boolean(firebaseUser) && !userAccount;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        userAccount,
        privateInfo,
        isAdmin,
        isOwner,
        mySessions,
        myConversions,
        myWithdrawals,
        myNotifications,
        myFraudLogs,
        myCheckins,
        myLevelRewards,
        myReferral,
        myInvitedReferrals,
        publicPromoEvents,
        myPromoRedemptions,
        myMultiplayerMatches,
        myVerificationRequest,
        mailboxMessages,
        readMailboxIds,
        unreadMailboxCount,
        withdrawalSettings,
        maintenanceSettings,
        isFirstWithdrawalEligible,
        activeMinWithdrawalCents,
        needsOnboarding,
        authError,
        browserNotifPermission,
        browserNotifEnabled,
        requestBrowserNotifications,
        setBrowserNotifEnabled,
        sendTestBrowserNotification,
        signInWithGoogle,
        logout,
        createUserAccount,
        recordGameReward,
        convertDailyPoints,
        requestPixWithdrawal,
        logFraudAttempt,
        logWithdrawalAttempt,
        updateUserProfile,
        claimDailyCheckin,
        claimLevelReward,
        redeemPromoCode,
        sendInviteEmail,
        markMailboxRead,
        markAllMailboxRead,
        deleteMailboxMessage,
        clearAllMailboxMessages,
        deleteEmailNotification,
        updateMaintenanceSettings,
        settleMultiplayerMatch,
        submitVerificationRequest,
        approveVerificationRequest,
        rejectVerificationRequest,
        setUserBlueVerified,
        settleDoubleRound,
        startMinesSession,
        finishMinesSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
