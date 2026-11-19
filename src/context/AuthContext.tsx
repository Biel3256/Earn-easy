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
  EmailNotification,
  FraudEvent,
  GameCategory,
  GameSession,
  MIN_PIX_WITHDRAWAL_CENTS,
  PixKeyType,
  PixWithdrawal,
  POINTS_PER_TEN_CENTS,
  PointConversion,
  UserAccount,
  UserPrivateInfo,
} from '../types/earneasy';
import {
  generateId,
  getDeviceFingerprint,
  sha256Hex,
  verifyGameSessionWithServer,
} from '../utils/antifraud';
import { formatBRL, getTodayUtcDate } from '../utils/pix';

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
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
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
    if (res.ok) {
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
  const [authError, setAuthError] = useState<string | null>(null);

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
        setAuthReady(true);
        return;
      }

      try {
        // Bootstrap or load user account and isolated PII document
        const userRef = doc(db, 'users', user.uid);
        const privateRef = doc(db, 'users', user.uid, 'private', 'info');
        const userSnap = await getDoc(userRef);
        const fingerprint = await getDeviceFingerprint();

        if (!userSnap.exists()) {
          const batch = writeBatch(db);
          const safeName = (user.displayName || user.email?.split('@')[0] || 'Jogador').slice(0, 80);
          batch.set(userRef, {
            uid: user.uid,
            displayName: safeName,
            photoURL: (user.photoURL || '').slice(0, 500),
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
            uid: user.uid,
            email: (user.email || 'sem-email@earneasy.app').slice(0, 160),
            defaultPixKeyType: 'none',
            defaultPixKey: '',
            deviceFingerprint: fingerprint,
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } else {
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
          setUserAccount(snap.data() as UserAccount);
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

    return () => {
      unsubUser();
      unsubPrivate();
      unsubSessions();
      unsubConversions();
      unsubWithdrawals();
      unsubNotifications();
      unsubFraud();
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
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Conta de usuário não encontrada.');
        const current = snap.data() as UserAccount;
        if (current.status !== 'active') {
          throw new Error('Conta bloqueada para pontuação.');
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
        authError,
        signInWithGoogle,
        logout,
        recordGameReward,
        convertDailyPoints,
        requestPixWithdrawal,
        logFraudAttempt,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
