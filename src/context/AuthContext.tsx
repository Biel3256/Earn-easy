import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
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
  CENTS_PER_BLOCK,
  DailyCheckin,
  EmailNotification,
  FraudEvent,
  GameCategory,
  GameSession,
  LevelReward,
  MIN_PIX_WITHDRAWAL_CENTS,
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
} from '../types/earneasy';
import {
  generateId,
  getDeviceFingerprint,
  sha256Hex,
  verifyGameSessionWithServer,
} from '../utils/antifraud';
import { PLAYER_LEVELS } from '../utils/levels';
import { checkUsernameProfanity, validateUsernameInput } from '../utils/moderation';
import { formatBRL, getTodayUtcDate, getUtcDateDaysAgo } from '../utils/pix';

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  userAccount: UserAccount | null;
  privateInfo: UserPrivateInfo | null;
  isAdmin: boolean;
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
  needsOnboarding: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  createUserAccount: (params: {
    displayName: string;
    photoURL: string;
    referralCode?: string;
  }) => Promise<{ status: 'active' | 'suspended'; message?: string; referralApplied?: boolean }>;
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
}): Promise<EmailNotification['deliveryStatus']> {
  let deliveryStatus: EmailNotification['deliveryStatus'] = 'logged_in_app';
  try {
    const res = await fetch('/api/notifications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.deliveryStatus === 'sent_smtp' || data.deliveryStatus === 'logged_in_app') {
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
      recipientEmail: params.recipientEmail,
      eventType: params.eventType,
      subject: params.subject.slice(0, 160),
      summary: params.summary.slice(0, 500),
      deliveryStatus,
      referenceId: params.referenceId,
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
  const [authError, setAuthError] = useState<string | null>(null);
  const lastSyncedLbSigRef = React.useRef<string>('');

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);

      if (!user) {
        setUserAccount(null);
        setPrivateInfo(null);
        setIsAdmin(false);
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
        lastSyncedLbSigRef.current = '';
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
              email: (user.email || 'sem-email@earneasy.app').slice(0, 160),
              defaultPixKeyType: 'none',
              defaultPixKey: '',
              deviceFingerprint: fingerprint,
              updatedAt: serverTimestamp(),
            });
          } else {
            setPrivateInfo(privSnap.data() as UserPrivateInfo);
          }

          const userData = userSnap.data() as UserAccount;
          setUserAccount(userData);

          if (userData.status === 'active') {
            const lbRef = doc(db, 'leaderboard', user.uid);
            const lbSnap = await getDoc(lbRef);
            const lbData = lbSnap.exists() ? lbSnap.data() : null;
            if (
              !lbData ||
              lbData.brlBalanceCents !== userData.brlBalanceCents ||
              lbData.pointsBalance !== userData.pointsBalance ||
              lbData.gamesPlayed !== userData.gamesPlayed ||
              lbData.displayName !== userData.displayName ||
              lbData.photoURL !== userData.photoURL ||
              lbData.status !== userData.status
            ) {
              await setDoc(lbRef, {
                uid: userData.uid,
                displayName: userData.displayName,
                photoURL: userData.photoURL,
                brlBalanceCents: userData.brlBalanceCents,
                pointsBalance: userData.pointsBalance,
                gamesPlayed: userData.gamesPlayed,
                status: userData.status,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }

        // Check admin status (bootstrapped email or /admins/{uid})
        let adminCheck = user.email === ADMIN_BOOTSTRAP_EMAIL && user.emailVerified;
        if (!adminCheck) {
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            adminCheck = adminSnap.exists();
          } catch {
            adminCheck = false;
          }
        }
        setIsAdmin(adminCheck);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Erro ao carregar perfil.');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubAuth();
  }, []);

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
          if (uData.status === 'active') {
            const sig = `${uData.pointsBalance}|${uData.brlBalanceCents}|${uData.gamesPlayed}|${uData.displayName}|${uData.photoURL}|${uData.status}`;
            if (lastSyncedLbSigRef.current && lastSyncedLbSigRef.current !== sig) {
              setDoc(doc(db, 'leaderboard', uid), {
                uid: uData.uid,
                displayName: uData.displayName,
                photoURL: uData.photoURL,
                brlBalanceCents: uData.brlBalanceCents,
                pointsBalance: uData.pointsBalance,
                gamesPlayed: uData.gamesPlayed,
                status: uData.status,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
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
      (snap) => setMyWithdrawals(snap.docs.map((d) => d.data() as PixWithdrawal)),
      (error) => handleFirestoreError(error, OperationType.LIST, 'withdrawals')
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'emailNotifications'), where('userId', '==', uid), orderBy('createdAt', 'desc')),
      (snap) => setMyNotifications(snap.docs.map((d) => d.data() as EmailNotification)),
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

    return () => {
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
    };
  }, [authReady, firebaseUser]);

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
    if (userAccount.status !== 'active') {
      throw new Error('Sua conta está em revisão antifraude ou suspensa. Contate o administrador.');
    }

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

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const referralRef = doc(db, 'referrals', firebaseUser.uid);
        const [snap, refSnap] = await Promise.all([tx.get(userRef), tx.get(referralRef)]);
        if (!snap.exists()) throw new Error('Conta de usuário não encontrada.');
        const current = snap.data() as UserAccount;
        if (current.status !== 'active') {
          throw new Error('Conta bloqueada para pontuação.');
        }

        const commission = credited > 0 ? Math.floor(credited * REFERRAL_COMMISSION_RATE) : 0;
        let activeReferrerData: Referral | null = null;
        if (refSnap.exists() && commission >= 1) {
          const candidateRef = refSnap.data() as Referral;
          const refLbSnap = await tx.get(doc(db, 'leaderboard', candidateRef.referrerUid));
          if (refLbSnap.exists() && refLbSnap.data().status === 'active') {
            activeReferrerData = candidateRef;
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
          pointsBalance: current.pointsBalance + credited,
          lifetimePoints: current.lifetimePoints + credited,
          gamesPlayed: current.gamesPlayed + 1,
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

        tx.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: current.displayName,
          photoURL: current.photoURL,
          brlBalanceCents: current.brlBalanceCents,
          pointsBalance: current.pointsBalance + credited,
          gamesPlayed: current.gamesPlayed + 1,
          status: current.status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
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

        tx.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: current.displayName,
          photoURL: current.photoURL,
          brlBalanceCents: current.brlBalanceCents + brlCentsCredited,
          pointsBalance: current.pointsBalance - validPoints,
          gamesPlayed: current.gamesPlayed,
          status: current.status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `conversions/${conversionId}`);
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

  const requestPixWithdrawal = async (params: {
    amountCents: number;
    pixKeyType: PixKeyType;
    pixKey: string;
    saveAsDefault: boolean;
  }) => {
    if (!firebaseUser || !userAccount) {
      throw new Error('Usuário não autenticado.');
    }
    if (params.amountCents < MIN_PIX_WITHDRAWAL_CENTS) {
      throw new Error('O valor mínimo para saque via Pix é de R$ 5,00.');
    }
    if (params.amountCents > userAccount.brlBalanceCents) {
      throw new Error('Saldo em reais insuficiente para este saque.');
    }

    const withdrawalId = generateId('pix');
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
        if (current.brlBalanceCents < params.amountCents) {
          throw new Error('Saldo insuficiente.');
        }

        tx.update(userRef, {
          brlBalanceCents: current.brlBalanceCents - params.amountCents,
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

        if (params.saveAsDefault) {
          tx.update(doc(db, 'users', firebaseUser.uid, 'private', 'info'), {
            defaultPixKeyType: params.pixKeyType,
            defaultPixKey: params.pixKey.slice(0, 140),
            deviceFingerprint: fingerprint,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: current.displayName,
          photoURL: current.photoURL,
          brlBalanceCents: current.brlBalanceCents - params.amountCents,
          pointsBalance: current.pointsBalance,
          gamesPlayed: current.gamesPlayed,
          status: current.status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `withdrawals/${withdrawalId}`);
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
    const cleanPhoto = params.photoURL.trim().slice(0, 500);
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
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(privateRef, {
          uid: firebaseUser.uid,
          email: (firebaseUser.email || 'sem-email@earneasy.app').slice(0, 160),
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

      batch.set(userRef, {
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        uid: firebaseUser.uid,
        email: (firebaseUser.email || 'sem-email@earneasy.app').slice(0, 160),
        defaultPixKeyType: 'none',
        defaultPixKey: '',
        deviceFingerprint: fingerprint,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'leaderboard', firebaseUser.uid), {
        uid: firebaseUser.uid,
        displayName: cleanName,
        photoURL: cleanPhoto,
        brlBalanceCents: 0,
        pointsBalance: 0,
        gamesPlayed: 0,
        status: 'active',
        updatedAt: serverTimestamp(),
      });

      if (validReferrerUid) {
        batch.set(doc(db, 'referrals', firebaseUser.uid), {
          referralId: firebaseUser.uid,
          referrerUid: validReferrerUid,
          invitedUid: firebaseUser.uid,
          invitedDisplayName: cleanName,
          signupBonusPoints: REFERRAL_SIGNUP_BONUS_POINTS,
          commissionRatePct: 12,
          totalCommissionPointsEarned: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', validReferrerUid), {
          pointsBalance: increment(REFERRAL_SIGNUP_BONUS_POINTS),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      try {
        window.localStorage.removeItem('earneasy_ref_uid');
      } catch {
        // Ignore storage error
      }
      return { status: 'active', referralApplied: Boolean(validReferrerUid) };
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
    const cleanPhoto = params.photoURL.trim().slice(0, 500);
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
        batch.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: userAccount.displayName,
          photoURL: userAccount.photoURL,
          brlBalanceCents: userAccount.brlBalanceCents,
          pointsBalance: userAccount.pointsBalance,
          gamesPlayed: userAccount.gamesPlayed,
          status: 'suspended',
          updatedAt: serverTimestamp(),
        });
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
      if (userAccount.status === 'active') {
        batch.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: cleanName,
          photoURL: cleanPhoto,
          brlBalanceCents: userAccount.brlBalanceCents,
          pointsBalance: userAccount.pointsBalance,
          gamesPlayed: userAccount.gamesPlayed,
          status: userAccount.status,
          updatedAt: serverTimestamp(),
        });
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
    if (userAccount.status !== 'active') {
      throw new Error('Sua conta está em revisão antifraude.');
    }

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
    const prevSum = prevWindow.reduce((sum, c) => sum + c.pointsAwarded, 0);

    let minPts = 143;
    let maxPts = 172;
    if (prevWindow.length >= 6) {
      minPts = Math.max(120, Math.min(200, 1000 - prevSum));
      maxPts = Math.max(minPts, Math.min(200, 1200 - prevSum));
    }

    const pointsAwarded = minPts + Math.floor(Math.random() * (maxPts - minPts + 1));
    const weekTotalAfter = Math.min(1400, prevSum + pointsAwarded);
    const hadPreviousCheckinsBeforeYesterday = myCheckins.some((c) => c.checkinDate < yesterday);

    let streakDay = 1;
    let brlBonusCents = 0;
    let streakBroken = false;

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const checkinRef = doc(db, 'dailyCheckins', checkinId);
        const yesterdayRef = doc(db, 'dailyCheckins', yesterdayCheckinId);
        const referralRef = doc(db, 'referrals', firebaseUser.uid);
        const [userSnap, checkinSnap, yesterdaySnap, refSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(checkinRef),
          tx.get(yesterdayRef),
          tx.get(referralRef),
        ]);

        if (!userSnap.exists()) throw new Error('Conta de usuário não encontrada.');
        if (checkinSnap.exists()) {
          throw new Error('Check-in diário de hoje já foi coletado.');
        }

        const current = userSnap.data() as UserAccount;
        if (current.status !== 'active') {
          throw new Error('Sua conta está em revisão antifraude.');
        }

        const commission = Math.floor(pointsAwarded * REFERRAL_COMMISSION_RATE);
        let activeReferrerData: Referral | null = null;
        if (refSnap.exists() && commission >= 1) {
          const candidateRef = refSnap.data() as Referral;
          const refLbSnap = await tx.get(doc(db, 'leaderboard', candidateRef.referrerUid));
          if (refLbSnap.exists() && refLbSnap.data().status === 'active') {
            activeReferrerData = candidateRef;
          }
        }

        if (yesterdaySnap.exists()) {
          const yData = yesterdaySnap.data() as Partial<DailyCheckin>;
          const prevStreak = typeof yData.streakDay === 'number' ? yData.streakDay : 1;
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
          pointsBalance: current.pointsBalance + pointsAwarded,
          lifetimePoints: current.lifetimePoints + pointsAwarded,
          brlBalanceCents: current.brlBalanceCents + brlBonusCents,
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

        tx.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: current.displayName,
          photoURL: current.photoURL,
          brlBalanceCents: current.brlBalanceCents + brlBonusCents,
          pointsBalance: current.pointsBalance + pointsAwarded,
          gamesPlayed: current.gamesPlayed,
          status: current.status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `dailyCheckins/${checkinId}`);
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

        const currentXp = Math.max(0, Math.round(current.lifetimePoints)) + Math.max(0, Math.round(current.gamesPlayed)) * 25;
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

        tx.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: current.displayName,
          photoURL: current.photoURL,
          brlBalanceCents: current.brlBalanceCents,
          pointsBalance: current.pointsBalance + tier.rewardPoints,
          gamesPlayed: current.gamesPlayed,
          status: current.status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `levelRewards/${rewardId}`);
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

        tx.set(doc(db, 'leaderboard', firebaseUser.uid), {
          uid: firebaseUser.uid,
          displayName: current.displayName,
          photoURL: current.photoURL,
          brlBalanceCents: current.brlBalanceCents,
          pointsBalance: current.pointsBalance + promo.pointsValue,
          gamesPlayed: current.gamesPlayed,
          status: current.status,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `promoRedemptions/${redemptionId}`);
      throw error;
    }

    return {
      code,
      title: redeemedTitle,
      pointsAwarded: redeemedPoints,
    };
  };

  const needsOnboarding = authReady && Boolean(firebaseUser) && !userAccount;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        userAccount,
        privateInfo,
        isAdmin,
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
        needsOnboarding,
        authError,
        signInWithGoogle,
        logout,
        createUserAccount,
        recordGameReward,
        convertDailyPoints,
        requestPixWithdrawal,
        logFraudAttempt,
        updateUserProfile,
        claimDailyCheckin,
        claimLevelReward,
        redeemPromoCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
