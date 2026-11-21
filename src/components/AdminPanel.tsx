import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  Ban,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Headset,
  History,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Mail,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  UserCheck,
  Users,
  Webhook,
  Wrench,
  X,
  XCircle,
  MessageCircle,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EnterpriseIntegration,
  FACE_VERIFICATION_BONUS_POINTS,
  FaceVerificationRequest,
  FraudEvent,
  GAME_LABELS,
  GameSession,
  MAX_CONFIGURABLE_WITHDRAWAL_CENTS,
  MAX_PROMO_CODE_POINTS,
  MIN_CONFIGURABLE_WITHDRAWAL_CENTS,
  PixWithdrawal,
  PromoCode,
  Referral,
  SupportMessage,
  SupportTicket,
  UserAccount,
  UserPrivateInfo,
  WithdrawalAttemptLog,
  WithdrawalAttemptStatus,
} from '../types/earneasy';
import { calculateAgeFromBirthDate, formatBirthDateBr } from '../utils/age';
import { generateId, sha256Hex } from '../utils/antifraud';
import {
  extractReadableError,
  formatBRL,
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  timestampToMillis,
} from '../utils/pix';
import { VerifiedBadge } from './VerifiedBadge';

type AdminTab = 'overview' | 'verification' | 'payouts' | 'users' | 'codes' | 'support' | 'chat' | 'antifraud' | 'api';

const ATTEMPT_STATUS_META: Record<
  WithdrawalAttemptStatus,
  { label: string; badgeClass: string; category: 'blocked' | 'submitted_pending' | 'approved' | 'paid' | 'rejected' }
> = {
  submitted_pending: {
    label: 'Solicitado (Pendente)',
    badgeClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    category: 'submitted_pending',
  },
  approved: {
    label: 'Aprovado pelo Admin',
    badgeClass: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    category: 'approved',
  },
  paid: {
    label: 'Pago via Pix',
    badgeClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    category: 'paid',
  },
  rejected: {
    label: 'Recusado & Estornado',
    badgeClass: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    category: 'rejected',
  },
  blocked_min_amount: {
    label: 'Bloqueado: Abaixo do Mínimo',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    category: 'blocked',
  },
  blocked_insufficient_balance: {
    label: 'Bloqueado: Saldo Insuficiente',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    category: 'blocked',
  },
  blocked_invalid_pix: {
    label: 'Bloqueado: Chave Pix Inválida',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    category: 'blocked',
  },
  blocked_captcha: {
    label: 'Bloqueado: Desafio Antibot',
    badgeClass: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    category: 'blocked',
  },
  blocked_account_status: {
    label: 'Bloqueado: Conta Restrita',
    badgeClass: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    category: 'blocked',
  },
  failed_transaction: {
    label: 'Falha na Transação',
    badgeClass: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    category: 'blocked',
  },
};

function formatAttemptTimestamp(ts: unknown): string {
  const ms = timestampToMillis(ts);
  if (!ms) return 'Agora mesmo';
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildRandomPromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `EE-${suffix}`;
}

const ADMIN_QUICK_AMOUNT_CHOICES = [1, 5, 10, 25, 50, 100, 200, 500, 1000, 2000];

export const AdminPanel: React.FC = React.memo(() => {
  const {
    firebaseUser,
    userAccount,
    isAdmin,
    withdrawalSettings,
    maintenanceSettings,
    updateMaintenanceSettings,
    approveFaceVerification,
    rejectFaceVerification,
  } = useAuth();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, UserPrivateInfo>>({});
  const [withdrawals, setWithdrawals] = useState<PixWithdrawal[]>([]);
  const [fraudLogs, setFraudLogs] = useState<FraudEvent[]>([]);
  const [flaggedSessions, setFlaggedSessions] = useState<GameSession[]>([]);
  const [integrations, setIntegrations] = useState<EnterpriseIntegration[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [withdrawalAttempts, setWithdrawalAttempts] = useState<WithdrawalAttemptLog[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportFilter, setSupportFilter] = useState<'all' | 'waiting_human' | 'active_human' | 'closed'>('all');
  const [supportReplyDraft, setSupportReplyDraft] = useState('');
  const [supportBusy, setSupportBusy] = useState(false);
  const [globalChatMessages, setGlobalChatMessages] = useState<Array<{ id: string; senderName?: string; senderUid?: string; text?: string; createdAt?: Timestamp }>>([]);
  const [faceVerifications, setFaceVerifications] = useState<FaceVerificationRequest[]>([]);
  const [faceFilter, setFaceFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [faceRejectReasons, setFaceRejectReasons] = useState<Record<string, string>>({});
  const [faceBusyUid, setFaceBusyUid] = useState<string | null>(null);
  const [zoomSelfie, setZoomSelfie] = useState<FaceVerificationRequest | null>(null);

  const [payoutFilter, setPayoutFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'rejected'>('all');
  const [attemptFilter, setAttemptFilter] = useState<
    'all' | 'blocked' | 'submitted_pending' | 'approved' | 'paid' | 'rejected'
  >('all');
  const [attemptSearch, setAttemptSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [txIds, setTxIds] = useState<Record<string, string>>({});

  // Maintenance settings form state
  const [maintEnabled, setMaintEnabled] = useState(maintenanceSettings.enabled);
  const [maintTitle, setMaintTitle] = useState(maintenanceSettings.title);
  const [maintMessage, setMaintMessage] = useState(maintenanceSettings.message);
  const [maintReturn, setMaintReturn] = useState(maintenanceSettings.estimatedReturn);
  const [savingMaint, setSavingMaint] = useState(false);

  useEffect(() => {
    setMaintEnabled(maintenanceSettings.enabled);
    setMaintTitle(maintenanceSettings.title);
    setMaintMessage(maintenanceSettings.message);
    setMaintReturn(maintenanceSettings.estimatedReturn);
  }, [maintenanceSettings]);

  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      setGlobalChatMessages([]);
      return;
    }
    const chatQuery = query(collection(db, 'globalMessages'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      chatQuery,
      (snap) => setGlobalChatMessages(snap.docs.map((item) => ({ id: item.id, ...item.data() } as { id: string; senderName?: string; senderUid?: string; text?: string; createdAt?: Timestamp }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'globalMessages')
    );
  }, [firebaseUser, isAdmin]);

  // Pix withdrawal minimum & values settings state
  const [firstMinReais, setFirstMinReais] = useState(
    (withdrawalSettings.firstWithdrawalMinCents / 100).toFixed(2)
  );
  const [standardMinReais, setStandardMinReais] = useState(
    (withdrawalSettings.standardWithdrawalMinCents / 100).toFixed(2)
  );
  const [quickAmountsSelected, setQuickAmountsSelected] = useState<number[]>(
    withdrawalSettings.quickAmountsCents
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    setFirstMinReais((withdrawalSettings.firstWithdrawalMinCents / 100).toFixed(2));
    setStandardMinReais((withdrawalSettings.standardWithdrawalMinCents / 100).toFixed(2));
    setQuickAmountsSelected(withdrawalSettings.quickAmountsCents);
  }, [
    withdrawalSettings.firstWithdrawalMinCents,
    withdrawalSettings.standardWithdrawalMinCents,
    withdrawalSettings.quickAmountsCents,
  ]);

  // Promo Code Event form state
  const [promoCodeInput, setPromoCodeInput] = useState(() => buildRandomPromoCode());
  const [promoTitle, setPromoTitle] = useState('');
  const [promoPoints, setPromoPoints] = useState('500');
  const [promoMaxRedemptions, setPromoMaxRedemptions] = useState('100');
  const [promoDelayMinutes, setPromoDelayMinutes] = useState('0');
  const [promoPublicEvent, setPromoPublicEvent] = useState(true);
  const [sendMailboxMsg, setSendMailboxMsg] = useState(true);
  const [promoSubmitting, setPromoSubmitting] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Direct Broadcast Notice to Mailbox
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeSending, setNoticeSending] = useState(false);

  // Ban modal state
  const [banTarget, setBanTarget] = useState<UserAccount | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banExplanation, setBanExplanation] = useState('');
  const [banDuration, setBanDuration] = useState('24h');
  const [banError, setBanError] = useState<string | null>(null);
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [pointsTarget, setPointsTarget] = useState<UserAccount | null>(null);
  const [pointsOperation, setPointsOperation] = useState<'add' | 'remove'>('add');
  const [pointsAmount, setPointsAmount] = useState('100');
  const [pointsReason, setPointsReason] = useState('');
  const [pointsSubmitting, setPointsSubmitting] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);

  // Enterprise API form state
  const [apiName, setApiName] = useState('');
  const [providerType, setProviderType] = useState<EnterpriseIntegration['providerType']>('erp_webhook');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [generatedRawKey, setGeneratedRawKey] = useState<string | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null);

  // Nodemailer SMTP status & test state
  const [smtpStatus, setSmtpStatus] = useState<{
    configured: boolean;
    host: string;
    port: number;
    secure: boolean;
    from: string;
    userMasked: string;
    missingVars: string[];
    verified?: boolean;
    verificationError?: string | null;
  } | null>(null);
  const [smtpChecking, setSmtpChecking] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTestSending, setSmtpTestSending] = useState(false);
  const [smtpTestMsg, setSmtpTestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!firebaseUser || !isAdmin) return;

    const uAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => setAdminUids(snap.docs.map((adminDoc) => adminDoc.id)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
    );

    const u1 = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserAccount);
        setUsers(list);
        list.forEach(async (u) => {
          try {
            const pSnap = await getDoc(doc(db, 'users', u.uid, 'private', 'info'));
            if (pSnap.exists()) {
              setPrivateMap((prev) => ({ ...prev, [u.uid]: pSnap.data() as UserPrivateInfo }));
            }
          } catch {
            // Ignore single read error
          }
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const u2 = onSnapshot(
      query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc')),
      (snap) => setWithdrawals(snap.docs.map((d) => d.data() as PixWithdrawal)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals')
    );

    const u3 = onSnapshot(
      query(collection(db, 'fraudLogs'), orderBy('createdAt', 'desc')),
      (snap) => setFraudLogs(snap.docs.map((d) => d.data() as FraudEvent)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'fraudLogs')
    );

    const u4 = onSnapshot(
      query(collection(db, 'gameSessions'), orderBy('createdAt', 'desc')),
      (snap) =>
        setFlaggedSessions(
          snap.docs.map((d) => d.data() as GameSession).filter((s) => s.verificationStatus !== 'verified')
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'gameSessions')
    );

    const u5 = onSnapshot(
      query(collection(db, 'integrations'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as EnterpriseIntegration);
        setIntegrations(list);
        list.forEach((intg) => {
          fetch('/api/v1/keys/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              integrationId: intg.integrationId,
              name: intg.name,
              keyHash: intg.apiKeyHash,
              active: intg.active,
            }),
          }).catch(() => {});
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'integrations')
    );

    const u6 = onSnapshot(
      query(collection(db, 'promoCodes'), orderBy('createdAt', 'desc')),
      (snap) => setPromoCodes(snap.docs.map((d) => d.data() as PromoCode)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'promoCodes')
    );

    const u7 = onSnapshot(
      query(collection(db, 'referrals'), orderBy('createdAt', 'desc')),
      (snap) => setReferrals(snap.docs.map((d) => d.data() as Referral)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'referrals')
    );

    const u8 = onSnapshot(
      query(collection(db, 'withdrawalAttempts'), orderBy('createdAt', 'desc')),
      (snap) => setWithdrawalAttempts(snap.docs.map((d) => d.data() as WithdrawalAttemptLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawalAttempts')
    );

    const u9 = onSnapshot(
      query(collection(db, 'supportTickets'), orderBy('updatedAt', 'desc')),
      (snap) => setSupportTickets(snap.docs.map((d) => d.data() as SupportTicket)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'supportTickets')
    );

    const u10 = onSnapshot(
      query(collection(db, 'faceVerifications'), orderBy('submittedAt', 'desc')),
      (snap) => setFaceVerifications(snap.docs.map((d) => d.data() as FaceVerificationRequest)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'faceVerifications')
    );

    return () => {
      uAdmins();
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
      u10();
    };
  }, [firebaseUser, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !selectedTicketId) {
      setSupportMessages([]);
      return;
    }
    const msgsQ = query(
      collection(db, 'supportTickets', selectedTicketId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(
      msgsQ,
      (snap) => setSupportMessages(snap.docs.map((d) => d.data() as SupportMessage)),
      (err) => handleFirestoreError(err, OperationType.LIST, `supportTickets/${selectedTicketId}/messages`)
    );
  }, [isAdmin, selectedTicketId]);

  useEffect(() => {
    if (!isAdmin) return;
    const totalPointsCirculating = users.reduce((acc, u) => acc + u.pointsBalance, 0);
    const totalBrlLiabilityCents = users.reduce((acc, u) => acc + u.brlBalanceCents, 0);
    const totalPaidWithdrawalsCents = withdrawals
      .filter((w) => w.status === 'paid')
      .reduce((acc, w) => acc + w.amountCents, 0);
    const pendingWithdrawalsCount = withdrawals.filter(
      (w) => w.status === 'pending' || w.status === 'approved'
    ).length;

    fetch('/api/v1/ledger/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalUsers: users.length,
        totalPointsCirculating,
        totalBrlLiabilityCents,
        totalPaidWithdrawalsCents,
        pendingWithdrawalsCount,
        payouts: withdrawals.slice(0, 50).map((w) => ({
          withdrawalId: w.withdrawalId,
          userId: w.userId,
          userDisplayName: w.userDisplayName,
          amountCents: w.amountCents,
          amountBrl: formatBRL(w.amountCents),
          pixKeyType: w.pixKeyType,
          status: w.status,
          requestedDate: w.requestedDate,
          pixTransactionId: w.pixTransactionId,
        })),
      }),
    }).catch(() => {});
  }, [isAdmin, users, withdrawals]);

  useEffect(() => {
    if (!isAdmin) return;
    if (firebaseUser?.email && !smtpTestEmail) {
      setSmtpTestEmail(firebaseUser.email);
    }
    fetch('/api/notifications/smtp-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSmtpStatus(data);
      })
      .catch(() => {});
  }, [isAdmin, firebaseUser?.email]);

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    setSavingMaint(true);
    try {
      await updateMaintenanceSettings({
        enabled: maintEnabled,
        title: maintTitle,
        message: maintMessage,
        estimatedReturn: maintReturn,
      });
      setActionMsg(
        maintEnabled
          ? 'Modo Manutenção ATIVADO! Todos os jogadores agora veem a tela de manutenção organizada.'
          : 'Modo Manutenção DESATIVADO! A plataforma voltou a ficar online para todos os usuários.'
      );
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao atualizar configurações de manutenção.'));
    } finally {
      setSavingMaint(false);
    }
  };

  const handleVerifySmtp = async () => {
    setSmtpChecking(true);
    setSmtpTestMsg(null);
    try {
      const res = await fetch('/api/notifications/smtp-status?verify=true');
      const data = await res.json();
      setSmtpStatus(data);
      if (data.verified) {
        setSmtpTestMsg({
          type: 'success',
          text: `Conexão SMTP autenticada com sucesso em ${data.host}:${data.port}.`,
        });
      } else {
        setSmtpTestMsg({
          type: 'error',
          text: data.verificationError || 'SMTP não configurado ou credenciais inválidas.',
        });
      }
    } catch {
      setSmtpTestMsg({ type: 'error', text: 'Erro ao consultar status SMTP no servidor.' });
    } finally {
      setSmtpChecking(false);
    }
  };

  const handleSendSmtpTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpTestEmail.trim()) return;
    setSmtpTestSending(true);
    setSmtpTestMsg(null);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: smtpTestEmail.trim() }),
      });
      const data = await res.json();
      if (data.deliveryStatus === 'sent_smtp') {
        setSmtpTestMsg({
          type: 'success',
          text: `E-mail de teste enviado via Nodemailer para ${smtpTestEmail.trim()} (ID: ${data.messageId || 'ok'}).`,
        });
      } else {
        setSmtpTestMsg({
          type: 'error',
          text:
            data.error ||
            data.message ||
            'Configure SMTP_HOST, SMTP_USER e SMTP_PASS nas variáveis de ambiente para disparar e-mails reais.',
        });
      }
    } catch {
      setSmtpTestMsg({ type: 'error', text: 'Falha de comunicação ao testar envio Nodemailer.' });
    } finally {
      setSmtpTestSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-10 text-center max-w-lg mx-auto">
        <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
          Apenas contas administrativas autorizadas podem gerenciar usuários, pagamentos Pix, manutenção e suporte.
        </p>
      </div>
    );
  }

  const sendAdminEmailReceipt = async (
    w: PixWithdrawal,
    eventType: 'withdrawal_approved' | 'withdrawal_paid' | 'withdrawal_rejected',
    subject: string,
    summary: string
  ) => {
    let email = privateMap[w.userId]?.email || '';
    if (!email) {
      try {
        const pSnap = await getDoc(doc(db, 'users', w.userId, 'private', 'info'));
        if (pSnap.exists()) {
          const priv = pSnap.data() as UserPrivateInfo;
          email = priv.email || '';
          setPrivateMap((prev) => ({ ...prev, [w.userId]: priv }));
        }
      } catch {
        // Fallback below
      }
    }
    if (!email) email = 'usuario@earneasy.app';

    let deliveryStatus: 'sent_smtp' | 'logged_in_app' | 'failed' = 'logged_in_app';
    try {
      const res = await fetch('/api/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: email,
          eventType,
          subject,
          summary,
          referenceId: w.pixTransactionId || w.withdrawalId,
          amountBrl: formatBRL(w.amountCents),
          pixKey: w.pixKey,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const d = await res.json();
        if (
          d.deliveryStatus === 'sent_smtp' ||
          d.deliveryStatus === 'logged_in_app' ||
          d.deliveryStatus === 'failed'
        ) {
          deliveryStatus = d.deliveryStatus;
        }
      }
    } catch {
      // Fallback logged_in_app
    }

    const notificationId = generateId('mail');
    await setDoc(doc(db, 'emailNotifications', notificationId), {
      notificationId,
      userId: w.userId,
      recipientEmail: email.slice(0, 160),
      eventType,
      subject: subject.slice(0, 160),
      summary: summary.slice(0, 500),
      deliveryStatus,
      referenceId: w.withdrawalId,
      createdAt: serverTimestamp(),
    });
  };

  const handleWithdrawalDecision = async (
    w: PixWithdrawal,
    nextStatus: 'approved' | 'paid' | 'rejected'
  ) => {
    setActionMsg(null);
    setActionErr(null);
    const pixTxId = (txIds[w.withdrawalId] || `PIX_${Date.now()}`).slice(0, 120);

    try {
      await runTransaction(db, async (tx) => {
        const wRef = doc(db, 'withdrawals', w.withdrawalId);
        const uRef = doc(db, 'users', w.userId);
        const uSnap = await tx.get(uRef);
        if (!uSnap.exists()) throw new Error('Usuário não encontrado.');
        const uData = uSnap.data() as UserAccount;

        tx.update(wRef, {
          status: nextStatus,
          pixTransactionId: nextStatus === 'paid' ? pixTxId : w.pixTransactionId,
          adminNote:
            nextStatus === 'paid'
              ? 'Pago via Pix pelo administrativo'
              : nextStatus === 'rejected'
                ? 'Recusado e estornado ao saldo do usuário'
                : 'Aprovado para liquidação Pix',
          updatedAt: serverTimestamp(),
        });

        if (nextStatus === 'paid') {
          tx.update(uRef, {
            totalWithdrawnCents: uData.totalWithdrawnCents + w.amountCents,
            updatedAt: serverTimestamp(),
          });
        } else if (nextStatus === 'rejected') {
          const hasOtherActiveWithdrawal = withdrawals.some(
            (other) =>
              other.userId === w.userId &&
              other.withdrawalId !== w.withdrawalId &&
              other.status !== 'rejected'
          );
          tx.update(uRef, {
            brlBalanceCents: uData.brlBalanceCents + w.amountCents,
            ...(uData.totalWithdrawnCents === 0 && !hasOtherActiveWithdrawal
              ? { firstWithdrawalUsed: false }
              : {}),
            updatedAt: serverTimestamp(),
          });
          if (uData.status === 'active') {
            tx.set(doc(db, 'leaderboard', w.userId), {
              uid: uData.uid,
              displayName: uData.displayName,
              photoURL: uData.photoURL,
              brlBalanceCents: uData.brlBalanceCents + w.amountCents,
              pointsBalance: uData.pointsBalance,
              lifetimePoints: uData.lifetimePoints,
              gamesPlayed: uData.gamesPlayed,
              status: uData.status,
              identityVerified: Boolean(uData.identityVerified),
              updatedAt: serverTimestamp(),
            });
          }
        }

        const attemptId = generateId('wat');
        const attemptDetails =
          nextStatus === 'paid'
            ? `Pagamento Pix liquidado pelo admin. Comprovante: ${pixTxId}.`
            : nextStatus === 'rejected'
              ? `Solicitação recusada na análise admin; ${formatBRL(w.amountCents)} estornados.`
              : 'Solicitação aprovada pelo admin e encaminhada para liquidação Pix.';
        tx.set(doc(db, 'withdrawalAttempts', attemptId), {
          attemptId,
          userId: w.userId,
          userDisplayName: (w.userDisplayName || uData.displayName || 'Jogador').slice(0, 80),
          withdrawalId: w.withdrawalId,
          amountCents: w.amountCents,
          pixKeyType: w.pixKeyType,
          pixKey: w.pixKey.slice(0, 140),
          status: nextStatus,
          details: attemptDetails.slice(0, 300),
          deviceFingerprint: (privateMap[w.userId]?.deviceFingerprint || 'admin-review').slice(0, 128),
          actorUid: firebaseUser?.uid || 'admin',
          createdAt: serverTimestamp(),
        });
      });

      if (nextStatus === 'approved') {
        await sendAdminEmailReceipt(
          w,
          'withdrawal_approved',
          `Saque Pix de ${formatBRL(w.amountCents)} aprovado`,
          `Sua solicitação de saque via Pix para a chave ${w.pixKey} foi aprovada na revisão administrativa e entrou na fila de pagamento.`
        );
      } else if (nextStatus === 'paid') {
        await sendAdminEmailReceipt(
          { ...w, pixTransactionId: pixTxId },
          'withdrawal_paid',
          `Pagamento Pix de ${formatBRL(w.amountCents)} concluído`,
          `Seu saque via Pix para a chave ${w.pixKey} foi transferido com sucesso. Comprovante: ${pixTxId}.`
        );
      } else if (nextStatus === 'rejected') {
        await sendAdminEmailReceipt(
          w,
          'withdrawal_rejected',
          `Saque Pix de ${formatBRL(w.amountCents)} recusado e estornado`,
          `Sua solicitação de saque Pix foi recusada na revisão administrativa e o valor de ${formatBRL(w.amountCents)} foi estornado integralmente para sua carteira Earn Easy.`
        );
      }

      setActionMsg(`Saque ${w.withdrawalId} atualizado para "${nextStatus}".`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao atualizar saque Pix.'));
    }
  };

  const toggleQuickAmountChoice = (cents: number) => {
    setQuickAmountsSelected((prev) => {
      if (prev.includes(cents)) {
        if (prev.length <= 1) return prev;
        return prev.filter((v) => v !== cents);
      }
      return [...prev, cents].sort((a, b) => a - b);
    });
  };

  const handleSaveWithdrawalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setSettingsError(null);

    const parsedFirst = Math.round(Number(firstMinReais.replace(',', '.')) * 100);
    const parsedStandard = Math.round(Number(standardMinReais.replace(',', '.')) * 100);

    if (
      !Number.isFinite(parsedFirst) ||
      parsedFirst < MIN_CONFIGURABLE_WITHDRAWAL_CENTS ||
      parsedFirst > MAX_CONFIGURABLE_WITHDRAWAL_CENTS
    ) {
      setSettingsError('O mínimo do 1º saque deve ficar entre R$ 0,01 e R$ 20,00.');
      return;
    }
    if (
      !Number.isFinite(parsedStandard) ||
      parsedStandard < MIN_CONFIGURABLE_WITHDRAWAL_CENTS ||
      parsedStandard > MAX_CONFIGURABLE_WITHDRAWAL_CENTS
    ) {
      setSettingsError('O mínimo dos demais saques deve ficar entre R$ 0,01 e R$ 20,00.');
      return;
    }

    const sanitizedQuick = quickAmountsSelected
      .filter(
        (v) =>
          Number.isFinite(v) &&
          v >= MIN_CONFIGURABLE_WITHDRAWAL_CENTS &&
          v <= MAX_CONFIGURABLE_WITHDRAWAL_CENTS
      )
      .sort((a, b) => a - b);

    const finalQuick = sanitizedQuick.length > 0 ? sanitizedQuick.slice(0, 10) : [parsedFirst, parsedStandard];

    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'appSettings', 'withdrawal'), {
        settingId: 'withdrawal',
        firstWithdrawalMinCents: parsedFirst,
        standardWithdrawalMinCents: parsedStandard,
        quickAmountsCents: finalQuick,
        updatedBy: (firebaseUser.email || firebaseUser.uid).slice(0, 160),
        updatedAt: serverTimestamp(),
      });
      setActionMsg(
        `Valores de saque atualizados: 1º saque mínimo ${formatBRL(parsedFirst)} · Demais saques a partir de ${formatBRL(parsedStandard)}.`
      );
    } catch (err) {
      setSettingsError(extractReadableError(err, 'Erro ao salvar configurações de saque.'));
    } finally {
      setSavingSettings(false);
    }
  };

  const BAN_REASON_SUGGESTIONS = [
    'Uso de bot / automação',
    'Fraude em saque Pix',
    'Múltiplas contas',
    'Manipulação de pontuação',
    'Linguagem ofensiva / Assédio',
  ];

  const openBanModal = (u: UserAccount) => {
    setBanTarget(u);
    setBanReason('');
    setBanExplanation('');
    setBanDuration('24h');
    setBanError(null);
  };

  const closeBanModal = () => {
    if (banSubmitting) return;
    setBanTarget(null);
    setBanReason('');
    setBanExplanation('');
    setBanDuration('24h');
    setBanError(null);
  };

  useEffect(() => {
    if (!banTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeBanModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [banTarget, banSubmitting]);

  const confirmBanUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banTarget) return;

    const trimmedReason = banReason.trim().slice(0, 120);
    const trimmedExplanation = banExplanation.trim().slice(0, 400);
    const durationMs: Record<string, number> = {
      '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const suspensionUntil = banDuration === 'permanent'
      ? null
      : Timestamp.fromMillis(Date.now() + durationMs[banDuration]);

    if (trimmedReason.length < 3) {
      setBanError('Informe o motivo do banimento (mínimo 3 caracteres).');
      return;
    }
    if (trimmedExplanation.length < 5) {
      setBanError('Explique o porquê do banimento com pelo menos 5 caracteres.');
      return;
    }

    setBanError(null);
    setBanSubmitting(true);
    try {
      const adminActor = (firebaseUser?.email || firebaseUser?.uid || 'admin').slice(0, 160);
      await updateDoc(doc(db, 'users', banTarget.uid), {
        status: 'suspended',
        riskScore: 100,
        banReason: trimmedReason,
        banExplanation: trimmedExplanation,
        bannedBy: adminActor,
        suspensionUntil,
        updatedAt: serverTimestamp(),
      });

      await deleteDoc(doc(db, 'leaderboard', banTarget.uid)).catch(() => {});

      const logId = generateId('ban');
      await setDoc(doc(db, 'fraudLogs', logId), {
        logId,
        userId: banTarget.uid,
        eventType: 'admin_ban',
        severity: 'critical',
        details: `Bloqueio ${banDuration === 'permanent' ? 'permanente' : `até ${suspensionUntil?.toDate().toLocaleString('pt-BR')}`} (${trimmedReason}): ${trimmedExplanation}`.slice(0, 400),
        resolved: false,
        createdAt: serverTimestamp(),
      });

      setActionMsg(`Usuário ${banTarget.displayName} bloqueado ${banDuration === 'permanent' ? 'permanentemente' : 'temporariamente'}. Motivo: "${trimmedReason}".`);
      setBanTarget(null);
      setBanReason('');
      setBanExplanation('');
    } catch (err) {
      setBanError(extractReadableError(err, 'Erro ao aplicar banimento.'));
    } finally {
      setBanSubmitting(false);
    }
  };


  const openPointsModal = (u: UserAccount) => {
    setPointsTarget(u);
    setPointsOperation('add');
    setPointsAmount('100');
    setPointsReason('');
    setPointsError(null);
  };

  const closePointsModal = () => {
    if (pointsSubmitting) return;
    setPointsTarget(null);
    setPointsError(null);
  };

  const confirmPointsAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointsTarget || !firebaseUser) return;
    const amount = Math.floor(Number(pointsAmount));
    const reason = pointsReason.trim().slice(0, 180);
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
      setPointsError('Informe uma quantidade entre 1 e 1.000.000 pontos.');
      return;
    }
    if (reason.length < 4) {
      setPointsError('Informe o motivo do ajuste (mínimo 4 caracteres).');
      return;
    }
    setPointsSubmitting(true);
    setPointsError(null);
    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', pointsTarget.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error('Usuário não encontrado.');
        const current = userSnap.data() as UserAccount;
        const nextBalance = pointsOperation === 'add'
          ? current.pointsBalance + amount
          : current.pointsBalance - amount;
        if (nextBalance < 0) throw new Error('O usuário não possui pontos suficientes para essa retirada.');
        tx.update(userRef, {
          pointsBalance: nextBalance,
          ...(pointsOperation === 'add' ? { lifetimePoints: current.lifetimePoints + amount } : {}),
          updatedAt: serverTimestamp(),
        });
        const logId = generateId('pts');
        tx.set(doc(db, 'fraudLogs', logId), {
          logId,
          userId: pointsTarget.uid,
          eventType: 'manual_flag',
          severity: 'medium',
          details: `Ajuste manual do administrador: ${pointsOperation === 'add' ? '+' : '-'}${amount} pontos. Motivo: ${reason}`.slice(0, 400),
          resolved: false,
          createdAt: serverTimestamp(),
        });
      });
      setActionMsg(`${pointsOperation === 'add' ? 'Adicionados' : 'Retirados'} ${formatPoints(amount)} pontos de ${pointsTarget.displayName}.`);
      setPointsTarget(null);
    } catch (err) {
      setPointsError(extractReadableError(err, 'Não foi possível ajustar os pontos.'));
    } finally {
      setPointsSubmitting(false);
    }
  };

  const reactivateUser = async (u: UserAccount) => {
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        status: 'active',
        riskScore: 0,
        banReason: '',
        banExplanation: '',
        bannedBy: '',
        suspensionUntil: null,
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'leaderboard', u.uid), {
        uid: u.uid,
        displayName: u.displayName,
        photoURL: u.photoURL,
        brlBalanceCents: u.brlBalanceCents,
        pointsBalance: u.pointsBalance,
        lifetimePoints: u.lifetimePoints,
        gamesPlayed: u.gamesPlayed,
        status: 'active',
        identityVerified: Boolean(u.identityVerified),
        updatedAt: serverTimestamp(),
      });
      setActionMsg(`Usuário ${u.displayName} reativado com sucesso.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao reativar usuário.'));
    }
  };

  const promoteAdmin = async (u: UserAccount) => {
    const email = privateMap[u.uid]?.email || 'admin@earneasy.app';
    try {
      await setDoc(doc(db, 'admins', u.uid), {
        uid: u.uid,
        email,
        grantedBy: firebaseUser?.uid || 'admin',
        createdAt: serverTimestamp(),
      });
      setActionMsg(`${u.displayName} promovido a administrador.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao promover usuário.'));
    }
  };

  const revokeAdmin = async (u: UserAccount) => {
    if (!firebaseUser || u.uid === firebaseUser.uid) return;
    const confirmed = window.confirm(`Retirar o cargo de administrador de ${u.displayName}?`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'admins', u.uid));
      setActionMsg(`Permissão de administrador removida de ${u.displayName}.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao remover administrador.'));
    }
  };

  const resolveFraudLog = async (logId: string) => {
    try {
      await updateDoc(doc(db, 'fraudLogs', logId), { resolved: true });
      setActionMsg(`Alerta ${logId} marcado como resolvido.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao resolver alerta.'));
    }
  };

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const integrationId = generateId('int');
    const rawKey = `ee_live_${crypto.randomUUID().replace(/-/g, '')}`;
    const apiKeyHash = await sha256Hex(rawKey);
    const apiKeyPrefix = rawKey.slice(0, 14);

    try {
      await setDoc(doc(db, 'integrations', integrationId), {
        integrationId,
        name: apiName.trim().slice(0, 80),
        providerType,
        endpointUrl: endpointUrl.trim().slice(0, 300),
        apiKeyPrefix,
        apiKeyHash,
        active: true,
        lastTriggeredAt: '',
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await fetch('/api/v1/keys/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          name: apiName.trim(),
          keyHash: apiKeyHash,
          active: true,
        }),
      });

      setGeneratedRawKey(rawKey);
      setApiName('');
      setEndpointUrl('');
      setActionMsg('Integração API criada e sincronizada com o gateway.');
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao criar integração.'));
    }
  };

  const handleTestWebhook = async (intg: EnterpriseIntegration) => {
    setWebhookTestResult(null);
    if (!intg.endpointUrl) {
      setWebhookTestResult('Esta integração não possui URL de webhook configurada.');
      return;
    }
    try {
      const res = await fetch('/api/v1/webhooks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointUrl: intg.endpointUrl,
          event: 'financial.ledger.test',
        }),
      });
      const data = await res.json();
      setWebhookTestResult(
        data.delivered
          ? `Webhook "${intg.name}" respondeu HTTP ${data.statusCode} em ${data.latencyMs}ms (Assinatura ${data.signaturePrefix}...).`
          : `Falha ao entregar para "${intg.name}": HTTP ${data.statusCode || 0} (${data.error || 'erro remoto'}).`
      );
      await updateDoc(doc(db, 'integrations', intg.integrationId), {
        lastTriggeredAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setWebhookTestResult(err instanceof Error ? err.message : 'Erro ao testar webhook.');
    }
  };

  const handleCreatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setPromoError(null);

    const normalizedCode = promoCodeInput.trim().toUpperCase();
    const cleanTitle = promoTitle.trim().slice(0, 120);
    const pointsNum = Math.round(Number(promoPoints));
    const maxRedeemNum = Math.round(Number(promoMaxRedemptions));
    const delayNum = Math.round(Number(promoDelayMinutes || 0));

    if (!/^[A-Z0-9_-]{3,40}$/.test(normalizedCode)) {
      setPromoError('O código deve ter de 3 a 40 caracteres (A-Z, 0-9, "-" ou "_"), sem espaços.');
      return;
    }
    if (cleanTitle.length < 3) {
      setPromoError('Informe o nome/título do evento (mínimo 3 caracteres).');
      return;
    }
    if (!Number.isFinite(pointsNum) || pointsNum < 10 || pointsNum > MAX_PROMO_CODE_POINTS) {
      setPromoError(`Valor em moedas deve ficar entre 10 e ${formatPoints(MAX_PROMO_CODE_POINTS)}.`);
      return;
    }
    if (!Number.isFinite(maxRedeemNum) || maxRedeemNum < 1 || maxRedeemNum > 100000) {
      setPromoError('Limite de resgates deve ficar entre 1 e 100.000.');
      return;
    }
    if (!Number.isFinite(delayNum) || delayNum < 0 || delayNum > 1440) {
      setPromoError('O tempo de publicação deve ficar entre 0 (imediato) e 1.440 minutos (24 horas).');
      return;
    }
    if (promoCodes.some((c) => c.code === normalizedCode)) {
      setPromoError(`O código ${normalizedCode} já existe. Gere outro código.`);
      return;
    }

    setPromoSubmitting(true);
    try {
      const publishMs = Date.now() + delayNum * 60_000;
      const publishAtValue =
        delayNum === 0 ? serverTimestamp() : Timestamp.fromMillis(publishMs);

      const batch = writeBatch(db);
      batch.set(doc(db, 'promoCodes', normalizedCode), {
        code: normalizedCode,
        title: cleanTitle,
        pointsValue: pointsNum,
        maxRedemptions: maxRedeemNum,
        redemptionCount: 0,
        active: true,
        publicEvent: promoPublicEvent,
        publishDelayMinutes: delayNum,
        publishAt: publishAtValue,
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (sendMailboxMsg) {
        const messageId = generateId('mbx');
        const scheduleLabel =
          delayNum === 0
            ? 'Já disponível para resgate imediato no site!'
            : `Será publicado no site em ${formatScheduleRemaining(publishMs, Date.now())} (às ${formatScheduleTime(publishMs)}).`;

        const mailTitle =
          delayNum === 0
            ? `Código Premiado Liberado: +${formatPoints(pointsNum)} moedas`
            : `Evento Programado (${delayNum} min): +${formatPoints(pointsNum)} moedas`;

        const mailBody = `${cleanTitle} — Vale +${formatPoints(pointsNum)} moedas para os primeiros ${formatPoints(maxRedeemNum)} jogadores que resgatarem. ${scheduleLabel}`;

        batch.set(doc(db, 'mailboxMessages', messageId), {
          messageId,
          title: mailTitle.slice(0, 140),
          body: mailBody.slice(0, 600),
          category: 'promo_event',
          promoCode: normalizedCode,
          pointsValue: pointsNum,
          publishAt: publishAtValue,
          active: true,
          createdBy: firebaseUser.uid,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();

      const delayFeedback =
        delayNum === 0
          ? 'publicado imediatamente'
          : `agendado para publicar em ${delayNum} min (às ${formatScheduleTime(publishMs)})`;
      const mailFeedback = sendMailboxMsg
        ? ' e enviado para a Caixa de Correio dos jogadores'
        : '';

      setActionMsg(
        `Evento "${cleanTitle}" (${normalizedCode} = +${formatPoints(pointsNum)} moedas) ${delayFeedback}${mailFeedback}.`
      );
      setPromoCodeInput(buildRandomPromoCode());
      setPromoTitle('');
      setPromoDelayMinutes('0');
    } catch (err) {
      setPromoError(extractReadableError(err, 'Erro ao criar evento de código.'));
    } finally {
      setPromoSubmitting(false);
    }
  };

  const handleSendBroadcastNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const t = noticeTitle.trim().slice(0, 140);
    const b = noticeBody.trim().slice(0, 600);
    if (t.length < 3 || b.length < 3) {
      setActionErr('Informe um título e mensagem com pelo menos 3 caracteres.');
      return;
    }
    setNoticeSending(true);
    setActionErr(null);
    try {
      const messageId = generateId('mbx');
      await setDoc(doc(db, 'mailboxMessages', messageId), {
        messageId,
        title: t,
        body: b,
        category: 'system_notice',
        promoCode: '',
        pointsValue: 0,
        publishAt: serverTimestamp(),
        active: true,
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
      });
      setNoticeTitle('');
      setNoticeBody('');
      setActionMsg('Aviso enviado para a Caixa de Correio de todos os jogadores!');
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao enviar aviso para a Caixa de Correio.'));
    } finally {
      setNoticeSending(false);
    }
  };

  const togglePromoActive = async (p: PromoCode) => {
    try {
      await updateDoc(doc(db, 'promoCodes', p.code), {
        active: !p.active,
        updatedAt: serverTimestamp(),
      });
      setActionMsg(`Código ${p.code} ${!p.active ? 'ativado' : 'pausado'}.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao alterar status do código.'));
    }
  };

  const togglePromoPublic = async (p: PromoCode) => {
    try {
      await updateDoc(doc(db, 'promoCodes', p.code), {
        publicEvent: !p.publicEvent,
        updatedAt: serverTimestamp(),
      });
      setActionMsg(
        `Evento ${p.code} agora está ${!p.publicEvent ? 'visível publicamente no app' : 'em modo privado (somente quem digitar o código)'}.`
      );
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao alterar visibilidade do evento.'));
    }
  };

  const filteredWithdrawals = useMemo(
    () =>
      withdrawals.filter((w) =>
        payoutFilter === 'all' ? true : w.status === payoutFilter
      ),
    [withdrawals, payoutFilter]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const email = (privateMap[u.uid]?.email || '').toLowerCase();
      return (
        u.displayName.toLowerCase().includes(q) ||
        email.includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, privateMap]);

  // Only withdrawals explicitly confirmed as paid count as real money already sent.
  const totalPaidWithdrawalsCents = useMemo(
    () =>
      withdrawals
        .filter((w) => w.status === 'paid')
        .reduce((acc, w) => acc + (Number.isFinite(w.amountCents) ? w.amountCents : 0), 0),
    [withdrawals]
  );

  const paidWithdrawalsCount = useMemo(
    () => withdrawals.filter((w) => w.status === 'paid').length,
    [withdrawals]
  );

  const pendingTotalCents = useMemo(
    () =>
      withdrawals
        .filter((w) => w.status === 'pending' || w.status === 'approved')
        .reduce((acc, w) => acc + w.amountCents, 0),
    [withdrawals]
  );

  const waitingSupportCount = useMemo(
    () => supportTickets.filter((t) => t.status === 'waiting_human').length,
    [supportTickets]
  );

  const filteredSupportTickets = useMemo(
    () =>
      supportTickets.filter((t) =>
        supportFilter === 'all' ? true : t.status === supportFilter
      ),
    [supportTickets, supportFilter]
  );

  const selectedSupportTicket = useMemo(
    () => supportTickets.find((t) => t.ticketId === selectedTicketId) || null,
    [supportTickets, selectedTicketId]
  );

  const selectedTicketUser = useMemo(
    () =>
      selectedSupportTicket
        ? users.find((u) => u.uid === selectedSupportTicket.userId) || null
        : null,
    [selectedSupportTicket, users]
  );

  const acceptSupportTicket = async (ticket: SupportTicket) => {
    if (!firebaseUser || supportBusy) return;
    setSupportBusy(true);
    const adminName = (userAccount?.displayName || firebaseUser.displayName || 'Administrador').slice(0, 80);
    const messageId = generateId('smsg');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'supportTickets', ticket.ticketId), {
        status: 'active_human',
        assignedAdminUid: firebaseUser.uid,
        assignedAdminName: adminName,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'supportTickets', ticket.ticketId, 'messages', messageId), {
        messageId,
        ticketId: ticket.ticketId,
        senderUid: firebaseUser.uid,
        senderName: adminName,
        senderRole: 'admin',
        text: `Olá, ${ticket.userDisplayName}! Sou ${adminName}, administrador do Earn Easy. Aceitei seu atendimento e já estou vendo sua mensagem.`,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setSelectedTicketId(ticket.ticketId);
      setActionMsg(`Atendimento de ${ticket.userDisplayName} aceito. Chat ao vivo liberado.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Não foi possível aceitar o chamado.'));
    } finally {
      setSupportBusy(false);
    }
  };

  const sendAdminSupportReply = async () => {
    if (!firebaseUser || !selectedSupportTicket || supportBusy) return;
    const text = supportReplyDraft.trim().slice(0, 800);
    if (!text) return;
    setSupportBusy(true);
    const adminName = (userAccount?.displayName || firebaseUser.displayName || 'Administrador').slice(0, 80);
    const messageId = generateId('smsg');
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'supportTickets', selectedSupportTicket.ticketId, 'messages', messageId), {
        messageId,
        ticketId: selectedSupportTicket.ticketId,
        senderUid: firebaseUser.uid,
        senderName: adminName,
        senderRole: 'admin',
        text,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'supportTickets', selectedSupportTicket.ticketId), {
        status: 'active_human',
        assignedAdminUid: selectedSupportTicket.assignedAdminUid || firebaseUser.uid,
        assignedAdminName: selectedSupportTicket.assignedAdminName || adminName,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setSupportReplyDraft('');
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao enviar resposta ao usuário.'));
    } finally {
      setSupportBusy(false);
    }
  };

  const closeSupportTicket = async (ticket: SupportTicket) => {
    if (supportBusy) return;
    setSupportBusy(true);
    try {
      await updateDoc(doc(db, 'supportTickets', ticket.ticketId), {
        status: 'closed',
        updatedAt: serverTimestamp(),
      });
      setActionMsg(`Chamado ${ticket.ticketId} encerrado.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao encerrar chamado.'));
    } finally {
      setSupportBusy(false);
    }
  };

  const deleteGlobalChatMessage = async (message: { id: string; senderName?: string; text?: string }) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(`Excluir a mensagem de ${message.senderName || 'jogador'}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'globalMessages', message.id));
      setActionMsg('Mensagem excluída do chat global.');
    } catch (err) {
      setActionErr(extractReadableError(err, 'Não foi possível excluir a mensagem.'));
    }
  };

  // Indicadores adicionais do painel: calculados a partir dos dados já existentes no Firestore.
  const pointsCirculatingTotal = users.reduce((total, user) => total + (Number(user.pointsBalance) || 0), 0);
  const pointsDistributedTotal = users.reduce((total, user) => total + (Number(user.lifetimePoints) || 0), 0);
  const gamesPlayedTotal = users.reduce((total, user) => total + (Number(user.gamesPlayed) || 0), 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const newUsersToday = users.filter((user) => timestampToMillis(user.createdAt) >= startOfToday.getTime()).length;

  const handleApproveFace = async (req: FaceVerificationRequest) => {
    if (faceBusyUid) return;
    setActionErr(null);
    setActionMsg(null);
    setFaceBusyUid(req.uid);
    try {
      await approveFaceVerification(req.uid);
      setActionMsg(
        `Verificação facial de ${req.displayName} aprovada! Selo ativado e +${formatPoints(FACE_VERIFICATION_BONUS_POINTS)} pontos creditados na hora.`
      );
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao aprovar verificação facial.'));
    } finally {
      setFaceBusyUid(null);
    }
  };

  const handleRejectFace = async (req: FaceVerificationRequest) => {
    if (faceBusyUid) return;
    const reason = (faceRejectReasons[req.uid] || '').trim();
    if (reason.length < 3) {
      setActionErr('Informe o motivo da recusa antes de recusar a verificação facial.');
      return;
    }
    setActionErr(null);
    setActionMsg(null);
    setFaceBusyUid(req.uid);
    try {
      await rejectFaceVerification(req.uid, reason);
      setFaceRejectReasons((prev) => ({ ...prev, [req.uid]: '' }));
      setActionMsg(`Verificação facial de ${req.displayName} recusada.`);
    } catch (err) {
      setActionErr(extractReadableError(err, 'Erro ao recusar verificação facial.'));
    } finally {
      setFaceBusyUid(null);
    }
  };

  const pendingFaceCount = useMemo(
    () => faceVerifications.filter((f) => f.status === 'pending').length,
    [faceVerifications]
  );

  const filteredFaceVerifications = useMemo(
    () =>
      faceVerifications.filter((f) => (faceFilter === 'all' ? true : f.status === faceFilter)),
    [faceVerifications, faceFilter]
  );

  const ADMIN_TABS: Array<{
    id: AdminTab;
    label: string;
    Icon: React.FC<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Visão Geral & Manutenção', Icon: LayoutDashboard },
    {
      id: 'verification',
      label: 'Verificação Facial',
      Icon: Camera,
      badge: pendingFaceCount || undefined,
    },
    {
      id: 'payouts',
      label: 'Saques Pix & Logs',
      Icon: Landmark,
      badge: withdrawals.filter((w) => w.status === 'pending').length || undefined,
    },
    { id: 'users', label: 'Usuários', Icon: Users },
    { id: 'codes', label: 'Códigos & Correio', Icon: Ticket },
    {
      id: 'support',
      label: 'Suporte ao Vivo',
      Icon: Headset,
      badge: waitingSupportCount || undefined,
    },
    { id: 'chat', label: 'Chat Global', Icon: MessageCircle, badge: globalChatMessages.length || undefined },
    {
      id: 'antifraud',
      label: 'Antifraude',
      Icon: ShieldCheck,
      badge: fraudLogs.filter((f) => !f.resolved).length || undefined,
    },
    { id: 'api', label: 'API & SMTP', Icon: Webhook },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Clean Horizontal Navigation Bar */}
      <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 dark:text-white tracking-tight">
              Painel Administrativo
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              Central organizada para manutenção, saques Pix, suporte ao vivo, códigos e antifraude.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 ${
                maintenanceSettings.enabled
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-50 dark:bg-lime-500/15 border-emerald-200 dark:border-lime-500/30 text-emerald-700 dark:text-lime-400'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              {maintenanceSettings.enabled ? 'Manutenção Ativa' : 'Site Online'}
            </span>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-zinc-800">
          {ADMIN_TABS.map(({ id, label, Icon, badge }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 border-transparent shadow-sm'
                    : 'bg-slate-50 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-lime-400/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
                {typeof badge === 'number' && badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold tabular-nums ${
                      active
                        ? 'bg-white/20 dark:bg-slate-950 dark:text-lime-400'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {actionMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium px-4 py-3 rounded-2xl flex items-center justify-between gap-3">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="underline cursor-pointer shrink-0">
            Fechar
          </button>
        </div>
      )}

      {actionErr && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium px-4 py-3 rounded-2xl flex items-center justify-between gap-3">
          <span>{actionErr}</span>
          <button type="button" onClick={() => setActionErr(null)} className="underline cursor-pointer shrink-0">
            Fechar
          </button>
        </div>
      )}

      {/* TAB 1: VISÃO GERAL & MODO MANUTENÇÃO */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-4">
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Total de Jogadores</div>
              <div className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">
                {users.length}
              </div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Total Efetivamente Sacado</div>
              <div className="text-2xl font-mono font-extrabold text-emerald-700 dark:text-lime-400 tabular-nums mt-1">
                {formatBRL(totalPaidWithdrawalsCents)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-500 mt-1">
                {paidWithdrawalsCount.toLocaleString('pt-BR')} saques pagos confirmados
              </div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Fila Pix Pendente</div>
              <div className="text-2xl font-mono font-extrabold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
                {formatBRL(pendingTotalCents)}
              </div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Chamados Aguardando</div>
              <div className="text-2xl font-mono font-extrabold text-emerald-700 dark:text-lime-400 tabular-nums mt-1">
                {waitingSupportCount}
              </div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Alertas Antifraude</div>
              <div className="text-2xl font-mono font-extrabold text-red-600 dark:text-red-400 tabular-nums mt-1">
                {fraudLogs.filter((f) => !f.resolved).length}
              </div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Novos Usuários Hoje</div>
              <div className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">{newUsersToday}</div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Partidas Realizadas</div>
              <div className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">{gamesPlayedTotal.toLocaleString('pt-BR')}</div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Pontos em Circulação</div>
              <div className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white tabular-nums mt-1">{formatPoints(pointsCirculatingTotal)}</div>
            </div>
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Pontos Distribuídos</div>
              <div className="text-2xl font-mono font-extrabold text-emerald-700 dark:text-lime-400 tabular-nums mt-1">{formatPoints(pointsDistributedTotal)}</div>
            </div>
          </div>

          <form
            onSubmit={handleSaveMaintenance}
            className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-lime-400 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Modo Manutenção do Aplicativo
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    Quando ativado, jogadores comuns visualizam uma tela de manutenção organizada com saldo protegido, enquanto administradores continuam com acesso total ao painel.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMaintEnabled((v) => !v)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold border transition-colors shrink-0 cursor-pointer ${
                  maintEnabled
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-zinc-700'
                }`}
              >
                {maintEnabled ? 'ATIVADO (Bloquear Público)' : 'DESATIVADO (Site Normal)'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Título exibido na tela de manutenção
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={maintTitle}
                  onChange={(e) => setMaintTitle(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Previsão de retorno (ex: Em alguns minutos)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={maintReturn}
                  onChange={(e) => setMaintReturn(e.target.value)}
                  placeholder="Em alguns minutos"
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Mensagem explicativa para os jogadores
              </label>
              <textarea
                required
                minLength={5}
                maxLength={600}
                rows={3}
                value={maintMessage}
                onChange={(e) => setMaintMessage(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400 resize-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                {maintenanceSettings.updatedBy
                  ? `Última alteração por ${maintenanceSettings.updatedBy}`
                  : 'Alteração aplicada em tempo real para todos os dispositivos conectados.'}
              </span>
              <button
                type="submit"
                disabled={savingMaint}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs sm:text-sm font-extrabold transition-colors cursor-pointer"
              >
                {savingMaint ? 'Salvando...' : 'Salvar Estado da Manutenção'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: SAQUES PIX & LOGS */}
      {tab === 'payouts' && (() => {
        const searchTerm = attemptSearch.trim().toLowerCase();
        const filteredAttempts = withdrawalAttempts.filter((a) => {
          const meta = ATTEMPT_STATUS_META[a.status];
          if (attemptFilter !== 'all' && meta.category !== attemptFilter) return false;
          if (!searchTerm) return true;
          return (
            a.userId.toLowerCase().includes(searchTerm) ||
            a.userDisplayName.toLowerCase().includes(searchTerm) ||
            a.pixKey.toLowerCase().includes(searchTerm) ||
            a.withdrawalId.toLowerCase().includes(searchTerm) ||
            a.attemptId.toLowerCase().includes(searchTerm) ||
            a.details.toLowerCase().includes(searchTerm)
          );
        });
        const blockedCount = withdrawalAttempts.filter(
          (a) => ATTEMPT_STATUS_META[a.status].category === 'blocked' || a.status === 'rejected'
        ).length;

        const handleCopyUid = (uid: string, key: string) => {
          navigator.clipboard?.writeText(uid).catch(() => {});
          setCopiedId(key);
          window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1500);
        };

        return (
          <div className="space-y-6">
            {/* Configurable Pix Withdrawal Minimums */}
            <form
              onSubmit={handleSaveWithdrawalSettings}
              className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Configurar Valores e Mínimo de Saque Pix
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Ajuste livremente o mínimo do 1º saque e dos próximos saques entre R$ 0,01 e R$ 20,00.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="min-h-[42px] px-4 py-2 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {savingSettings ? 'Salvando...' : 'Salvar Valores'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Mínimo do 1º Saque (R$ 0,01 a R$ 20,00)
                  </label>
                  <input
                    type="text"
                    required
                    value={firstMinReais}
                    onChange={(e) => setFirstMinReais(e.target.value)}
                    placeholder="0.10"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 10, 50, 100, 500, 1000, 2000].map((c) => (
                      <button
                        key={`first-${c}`}
                        type="button"
                        onClick={() => setFirstMinReais((c / 100).toFixed(2))}
                        className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-colors cursor-pointer ${
                          Math.round(Number(firstMinReais.replace(',', '.')) * 100) === c
                            ? 'bg-lime-400 text-slate-950 border-lime-300 font-bold'
                            : 'bg-slate-50 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-lime-400'
                        }`}
                      >
                        {formatBRL(c)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Mínimo dos Demais Saques (R$ 0,01 a R$ 20,00)
                  </label>
                  <input
                    type="text"
                    required
                    value={standardMinReais}
                    onChange={(e) => setStandardMinReais(e.target.value)}
                    placeholder="5.00"
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 10, 50, 100, 200, 500, 1000, 2000].map((c) => (
                      <button
                        key={`std-${c}`}
                        type="button"
                        onClick={() => setStandardMinReais((c / 100).toFixed(2))}
                        className={`px-2.5 py-1 text-[11px] font-mono rounded-lg border transition-colors cursor-pointer ${
                          Math.round(Number(standardMinReais.replace(',', '.')) * 100) === c
                            ? 'bg-lime-400 text-slate-950 border-lime-300 font-bold'
                            : 'bg-slate-50 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-lime-400'
                        }`}
                      >
                        {formatBRL(c)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Botões de Valores Rápidos na Carteira (R$ 0,01 a R$ 20,00)
                </div>
                <div className="flex flex-wrap gap-2">
                  {ADMIN_QUICK_AMOUNT_CHOICES.map((cents) => {
                    const active = quickAmountsSelected.includes(cents);
                    return (
                      <button
                        key={`quick-${cents}`}
                        type="button"
                        onClick={() => toggleQuickAmountChoice(cents)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-300 border-emerald-300 dark:border-lime-500/40'
                            : 'bg-white dark:bg-[#090d12] text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
                        }`}
                      >
                        {formatBRL(cents)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {settingsError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                  {settingsError}
                </div>
              )}
            </form>

            {/* Solicitações de Saque Pix */}
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Solicitações de Saque Pix ({filteredWithdrawals.length})
                </h3>
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 rounded-xl">
                  {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPayoutFilter(st)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                        payoutFilter === st
                          ? 'bg-white dark:bg-lime-400 text-slate-900 dark:text-slate-950 shadow-sm'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      {st === 'all'
                        ? 'Todos'
                        : st === 'pending'
                          ? 'Pendentes'
                          : st === 'approved'
                            ? 'Aprovados'
                            : st === 'paid'
                              ? 'Pagos'
                              : 'Recusados'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredWithdrawals.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                  Nenhum saque Pix nesta fila.
                </p>
              ) : (
                <>
                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {filteredWithdrawals.map((w) => (
                      <div
                        key={w.withdrawalId}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12] space-y-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{w.userDisplayName}</div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">{w.requestedDate}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                              {formatBRL(w.amountCents)}
                            </div>
                            <div className="text-[11px] font-bold">
                              {w.status === 'paid' && <span className="text-emerald-600 dark:text-lime-400">Pago</span>}
                              {w.status === 'pending' && <span className="text-amber-600 dark:text-amber-400">Pendente</span>}
                              {w.status === 'approved' && <span className="text-sky-600 dark:text-sky-400">Aprovado</span>}
                              {w.status === 'rejected' && <span className="text-red-600 dark:text-red-400">Recusado</span>}
                            </div>
                          </div>
                        </div>

                        <div className="font-mono text-[11px] text-slate-600 dark:text-zinc-300 break-all bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-xl p-2.5">
                          <span className="text-slate-400 mr-1">{w.pixKeyType.toUpperCase()}:</span>
                          {w.pixKey}
                        </div>

                        {(w.status === 'pending' || w.status === 'approved') && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={txIds[w.withdrawalId] || ''}
                              onChange={(e) =>
                                setTxIds((prev) => ({ ...prev, [w.withdrawalId]: e.target.value }))
                              }
                              placeholder="E2E Pix ID (opcional)"
                              className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#0e1319] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                            />
                            <div className="flex flex-wrap gap-2">
                              {w.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleWithdrawalDecision(w, 'approved')}
                                  className="flex-1 min-h-[40px] px-3 py-1.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl font-bold cursor-pointer"
                                >
                                  Aprovar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleWithdrawalDecision(w, 'paid')}
                                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-lime-400 text-slate-950 rounded-xl font-extrabold cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Marcar Pago
                              </button>
                              <button
                                type="button"
                                onClick={() => handleWithdrawalDecision(w, 'rejected')}
                                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl font-bold cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Estornar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                          <th className="py-2.5 font-medium">Usuário</th>
                          <th className="py-2.5 font-medium">Chave Pix</th>
                          <th className="py-2.5 font-medium text-right">Valor</th>
                          <th className="py-2.5 font-medium">ID Comprovante</th>
                          <th className="py-2.5 font-medium">Status</th>
                          <th className="py-2.5 font-medium text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                        {filteredWithdrawals.map((w) => (
                          <tr key={w.withdrawalId} className="min-h-[48px]">
                            <td className="py-3 pr-3">
                              <div className="font-semibold text-slate-900 dark:text-zinc-100">{w.userDisplayName}</div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">{w.requestedDate}</div>
                            </td>
                            <td className="py-3 pr-3 font-mono text-slate-700 dark:text-zinc-300 break-all">
                              <span className="text-slate-400 dark:text-zinc-500 mr-1">{w.pixKeyType.toUpperCase()}:</span>
                              {w.pixKey}
                            </td>
                            <td className="py-3 pr-3 font-mono tabular-nums text-right font-bold text-slate-900 dark:text-zinc-100 whitespace-nowrap">
                              {formatBRL(w.amountCents)}
                            </td>
                            <td className="py-3 pr-3">
                              {w.status === 'pending' || w.status === 'approved' ? (
                                <input
                                  type="text"
                                  value={txIds[w.withdrawalId] || ''}
                                  onChange={(e) =>
                                    setTxIds((prev) => ({ ...prev, [w.withdrawalId]: e.target.value }))
                                  }
                                  placeholder="E2E Pix ID"
                                  className="px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg w-36"
                                />
                              ) : (
                                <span className="font-mono text-slate-600 dark:text-zinc-400 break-all">
                                  {w.pixTransactionId || '-'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3 font-semibold whitespace-nowrap">
                              {w.status === 'paid' && <span className="text-emerald-700 dark:text-lime-400">Pago</span>}
                              {w.status === 'pending' && <span className="text-amber-700 dark:text-amber-400">Pendente</span>}
                              {w.status === 'approved' && <span className="text-sky-700 dark:text-sky-400">Aprovado</span>}
                              {w.status === 'rejected' && <span className="text-red-700 dark:text-red-400">Recusado</span>}
                            </td>
                            <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                              {(w.status === 'pending' || w.status === 'approved') && (
                                <>
                                  {w.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() => handleWithdrawalDecision(w, 'approved')}
                                      className="px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg font-semibold cursor-pointer"
                                    >
                                      Aprovar
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleWithdrawalDecision(w, 'paid')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-lime-400 text-slate-950 rounded-lg font-bold cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Marcar Pago
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleWithdrawalDecision(w, 'rejected')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg font-semibold cursor-pointer"
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Estornar
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Log Detalhado de Tentativas de Saque Pix */}
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 flex items-center justify-center shrink-0">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Log Detalhado de Tentativas de Saque Pix
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Registro cronológico com status, timestamp, chave Pix e ID completo do usuário.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 font-mono tabular-nums">
                    Total: <strong>{withdrawalAttempts.length}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 font-mono tabular-nums text-rose-700 dark:text-rose-300">
                    Bloqueios / Recusas: <strong>{blockedCount}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={attemptSearch}
                    onChange={(e) => setAttemptSearch(e.target.value)}
                    placeholder="Buscar por UID, nome, chave Pix ou saque..."
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'blocked', label: 'Bloqueados' },
                      { id: 'submitted_pending', label: 'Pendentes' },
                      { id: 'approved', label: 'Aprovados' },
                      { id: 'paid', label: 'Pagos' },
                      { id: 'rejected', label: 'Recusados' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAttemptFilter(f.id)}
                      className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                        attemptFilter === f.id
                          ? 'bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 border-transparent'
                          : 'bg-slate-50 dark:bg-[#090d12] text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredAttempts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400 py-8 text-center">
                  Nenhuma tentativa de saque Pix encontrada.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {filteredAttempts.slice(0, 60).map((attempt) => {
                    const meta = ATTEMPT_STATUS_META[attempt.status];
                    return (
                      <div
                        key={attempt.attemptId}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12] grid grid-cols-1 md:grid-cols-12 gap-3 text-xs"
                      >
                        <div className="md:col-span-3 space-y-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-lg border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                            {formatAttemptTimestamp(attempt.createdAt)}
                          </div>
                        </div>

                        <div className="md:col-span-4 space-y-1 min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white break-words">
                            {attempt.userDisplayName}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <code className="text-[11px] font-mono text-slate-600 dark:text-zinc-300 bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 px-1.5 py-0.5 rounded break-all">
                              UID: {attempt.userId}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyUid(attempt.userId, attempt.attemptId)}
                              className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0 cursor-pointer"
                              title="Copiar ID do usuário"
                            >
                              {copiedId === attempt.attemptId ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-lime-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="md:col-span-2 space-y-0.5">
                          <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                            {formatBRL(attempt.amountCents)}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 break-all">
                            {attempt.pixKeyType !== 'none'
                              ? `${attempt.pixKeyType.toUpperCase()}: ${attempt.pixKey || '—'}`
                              : 'Sem chave Pix'}
                          </div>
                        </div>

                        <div className="md:col-span-3 text-slate-700 dark:text-zinc-300 leading-relaxed break-words">
                          {attempt.details}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 3: USUÁRIOS & MODERAÇÃO */}
      {tab === 'users' && (
        <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Controle de Usuários ({filteredUsers.length})
            </h3>
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail ou UID..."
                className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const userBanHistory = fraudLogs.filter(
                (f) =>
                  f.userId === u.uid &&
                  (f.eventType === 'admin_ban' || f.eventType === 'profanity_username_ban')
              );
              return (
                <div
                  key={u.uid}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12] flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white break-words">
                        {u.displayName}
                      </span>
                      {u.identityVerified && <VerifiedBadge showLabel size="xs" />}
                      {adminUids.includes(u.uid) && (
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-lime-100 dark:bg-lime-500/15 text-lime-800 dark:text-lime-300">
                          Administrador
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                          u.status === 'active'
                            ? 'bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-400'
                            : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {u.status === 'active' ? 'Ativo' : u.suspensionUntil && timestampToMillis(u.suspensionUntil) > Date.now() ? 'Bloqueado temporariamente' : 'Banido'}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 break-all">
                      {privateMap[u.uid]?.email ? `${privateMap[u.uid].email} · ` : ''}UID: {u.uid}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] pt-1">
                      <span className="text-slate-700 dark:text-zinc-300">
                        Pontos: <strong>{formatPoints(u.pointsBalance)}</strong>
                      </span>
                      <span className="text-emerald-700 dark:text-lime-400">
                        Saldo: <strong>{formatBRL(u.brlBalanceCents)}</strong>
                      </span>
                      <span className="text-slate-700 dark:text-zinc-300">
                        Sacado: <strong>{formatBRL(u.totalWithdrawnCents)}</strong>
                      </span>
                      <span className="text-slate-700 dark:text-zinc-300">
                        Risco: <strong>{u.riskScore}/100</strong>
                      </span>
                    </div>

                    {u.status === 'suspended' && (u.banReason || u.banExplanation) && (
                      <div className="mt-1.5 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 rounded-xl p-2.5 space-y-0.5">
                        {u.banReason && (
                          <div>
                            <strong>Motivo:</strong> {u.banReason}
                          </div>
                        )}
                        {u.banExplanation && (
                          <div>
                            <strong>Por quê:</strong> {u.banExplanation}
                          </div>
                        )}
                        {Boolean(u.suspensionUntil) && timestampToMillis(u.suspensionUntil) > Date.now() && (
                          <div>
                            <strong>Bloqueado até:</strong> {formatAttemptTimestamp(u.suspensionUntil)}
                          </div>
                        )}
                      </div>
                    )}

                    {u.status === 'active' && userBanHistory.length > 0 && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300">
                        Histórico anterior ({userBanHistory.length}): {userBanHistory[0].details}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openPointsModal(u)}
                      className="min-h-[40px] px-3 py-1.5 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl font-bold cursor-pointer"
                    >
                      Ajustar pontos
                    </button>
                    {u.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => openBanModal(u)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl font-bold cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Banir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reactivateUser(u)}
                        className="min-h-[40px] px-3 py-1.5 bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-400 border border-emerald-200 dark:border-lime-500/40 rounded-xl font-bold cursor-pointer"
                      >
                        Reativar
                      </button>
                    )}
                    {adminUids.includes(u.uid) ? (
                      u.uid === firebaseUser?.uid ? (
                        <span className="min-h-[40px] inline-flex items-center px-3 py-1.5 text-slate-500 dark:text-zinc-400 text-[11px] font-semibold">
                          Seu administrador
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => revokeAdmin(u)}
                          className="min-h-[40px] px-3 py-1.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl font-bold cursor-pointer"
                        >
                          Retirar Admin
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => promoteAdmin(u)}
                        className="min-h-[40px] px-3 py-1.5 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-xl font-semibold hover:border-lime-400 cursor-pointer"
                      >
                        Tornar Admin
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: CÓDIGOS & CAIXA DE CORREIO */}
      {tab === 'codes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-6">
            {/* Criar Evento de Código */}
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <Ticket className="w-5 h-5 text-emerald-600 dark:text-lime-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Gerar Evento de Código Promocional
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Crie códigos valendo pontos e envie direto para o app e Correio.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreatePromoCode} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Código do Evento
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={40}
                      value={promoCodeInput}
                      onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                      placeholder="EE-BONUS500"
                      className="flex-1 min-h-[42px] px-3 py-2 text-sm font-mono uppercase bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setPromoCodeInput(buildRandomPromoCode())}
                      className="inline-flex items-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-xl cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Aleatório
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Título do Evento
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={120}
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    placeholder="Ex: Evento Relâmpago de Fim de Semana"
                    className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Moedas (10–100.000)
                    </label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={MAX_PROMO_CODE_POINTS}
                      value={promoPoints}
                      onChange={(e) => setPromoPoints(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                      Limite de Resgates
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={100000}
                      value={promoMaxRedemptions}
                      onChange={(e) => setPromoMaxRedemptions(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-lime-400" />
                      Publicar em (min)
                    </label>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      {Number(promoDelayMinutes || 0) === 0 ? 'Imediato' : `Em ${promoDelayMinutes} min`}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'Agora', mins: '0' },
                      { label: '5m', mins: '5' },
                      { label: '15m', mins: '15' },
                      { label: '30m', mins: '30' },
                      { label: '1h', mins: '60' },
                      { label: '2h', mins: '120' },
                    ].map((preset) => (
                      <button
                        key={preset.mins}
                        type="button"
                        onClick={() => setPromoDelayMinutes(preset.mins)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer ${
                          promoDelayMinutes === preset.mins
                            ? 'bg-lime-400 text-slate-950 border-lime-300'
                            : 'bg-slate-50 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={promoPublicEvent}
                      onChange={(e) => setPromoPublicEvent(e.target.checked)}
                      className="mt-0.5 rounded text-lime-500"
                    />
                    <span>Exibir publicamente nos Destaques e Convites & Códigos</span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={sendMailboxMsg}
                      onChange={(e) => setSendMailboxMsg(e.target.checked)}
                      className="mt-0.5 rounded text-lime-500"
                    />
                    <span>Enviar notificação na Caixa de Correio de todos os usuários</span>
                  </label>
                </div>

                {promoError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                    {promoError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={promoSubmitting}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {promoSubmitting ? 'Enviando evento...' : 'Gerar e Enviar Evento de Código'}
                </button>
              </form>
            </div>

            {/* Enviar Aviso Direto para Caixa de Correio */}
            <form
              onSubmit={handleSendBroadcastNotice}
              className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-3.5"
            >
              <div className="flex items-center gap-2.5">
                <Inbox className="w-5 h-5 text-emerald-600 dark:text-lime-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Enviar Mensagem no Correio Geral
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Dispare avisos ou novidades direto para o Correio dos jogadores.
                  </p>
                </div>
              </div>

              <input
                type="text"
                required
                minLength={3}
                maxLength={140}
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder="Título do comunicado"
                className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
              />
              <textarea
                required
                minLength={3}
                maxLength={600}
                rows={3}
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
                placeholder="Escreva a mensagem completa que aparecerá na Caixa de Correio..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl resize-none"
              />
              <button
                type="submit"
                disabled={noticeSending}
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-zinc-800 hover:bg-slate-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {noticeSending ? 'Enviando...' : 'Enviar para Caixa de Correio'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Eventos de Código Gerados ({promoCodes.length})
                </h3>
                <span className="text-xs text-slate-500 dark:text-zinc-400">
                  {promoCodes.filter((c) => c.active).length} ativos
                </span>
              </div>

              {promoCodes.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
                  Nenhum código promocional gerado ainda.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {promoCodes.map((p) => {
                    const publishMs = timestampToMillis(p.publishAt);
                    const nowMs = Date.now();
                    const isScheduledPending = publishMs > nowMs;
                    return (
                      <div key={p.code} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <code className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 rounded border border-slate-200 dark:border-zinc-700">
                              {p.code}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(p.code).catch(() => {});
                                setActionMsg(`Código ${p.code} copiado!`);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                              title="Copiar código"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-mono font-bold text-emerald-700 dark:text-lime-400 tabular-nums">
                              +{formatPoints(p.pointsValue)} moedas
                            </span>
                          </div>
                          <div className="text-xs font-medium text-slate-800 dark:text-zinc-200 break-words">
                            {p.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                            Resgates: {p.redemptionCount} / {p.maxRedemptions} ·{' '}
                            {p.publicEvent ? 'Público' : 'Privado'} ·{' '}
                            {p.active ? 'Ativo' : 'Pausado'} ·{' '}
                            {isScheduledPending
                              ? `Agendado p/ ${formatScheduleTime(publishMs)} (falta ${formatScheduleRemaining(publishMs, nowMs)})`
                              : 'Publicado'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => togglePromoPublic(p)}
                            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 cursor-pointer"
                          >
                            {p.publicEvent ? 'Tornar Privado' : 'Publicar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePromoActive(p)}
                            className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer ${
                              p.active
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-400 border-emerald-200 dark:border-lime-500/40'
                            }`}
                          >
                            {p.active ? 'Pausar' : 'Reativar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Auditoria de Convites (+500 pts & 12%)
              </h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-slate-500 dark:text-zinc-400">Indicações</div>
                  <div className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                    {referrals.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-slate-500 dark:text-zinc-400">Bônus +500</div>
                  <div className="text-lg font-mono font-bold text-emerald-700 dark:text-lime-400 tabular-nums">
                    {formatPoints(referrals.reduce((s, r) => s + r.signupBonusPoints, 0))}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-slate-500 dark:text-zinc-400">Comissões 12%</div>
                  <div className="text-lg font-mono font-bold text-emerald-700 dark:text-lime-400 tabular-nums">
                    {formatPoints(referrals.reduce((s, r) => s + r.totalCommissionPointsEarned, 0))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SUPORTE AO VIVO */}
      {tab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-stretch">
          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Fila de Suporte ({filteredSupportTickets.length})
              </h3>
              {waitingSupportCount > 0 && (
                <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                  {waitingSupportCount} aguardando
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'waiting_human', label: 'Aguardando' },
                  { id: 'active_human', label: 'Em Chat' },
                  { id: 'closed', label: 'Encerrados' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSupportFilter(f.id)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                    supportFilter === f.id
                      ? 'bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 border-transparent'
                      : 'bg-slate-50 dark:bg-[#090d12] text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredSupportTickets.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
                Nenhum chamado nesta fila.
              </p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {filteredSupportTickets.map((t) => {
                  const selected = selectedTicketId === t.ticketId;
                  return (
                    <button
                      key={t.ticketId}
                      type="button"
                      onClick={() => setSelectedTicketId(t.ticketId)}
                      className={`w-full rounded-2xl border p-3 text-left transition-colors space-y-1.5 cursor-pointer ${
                        selected
                          ? 'bg-emerald-50 dark:bg-lime-500/10 border-emerald-300 dark:border-lime-500/50'
                          : 'bg-slate-50/70 dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white break-words">
                          {t.userDisplayName}
                        </span>
                        <span
                          className={`text-[10px] font-bold shrink-0 ${
                            t.status === 'waiting_human'
                              ? 'text-amber-600 dark:text-amber-400'
                              : t.status === 'active_human'
                                ? 'text-emerald-600 dark:text-lime-400'
                                : 'text-slate-400 dark:text-zinc-500'
                          }`}
                        >
                          {t.status === 'waiting_human'
                            ? 'Aguardando'
                            : t.status === 'active_human'
                              ? 'Ativo'
                              : 'Encerrado'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-zinc-300 leading-snug break-words">
                        {t.subject}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                        {formatAttemptTimestamp(t.updatedAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 flex min-h-[520px] max-h-[660px] flex-col">
            {selectedSupportTicket ? (
              <>
                <div className="pb-4 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {selectedSupportTicket.userDisplayName}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-slate-500 dark:text-zinc-400 break-all">
                        {privateMap[selectedSupportTicket.userId]?.email || selectedSupportTicket.userId}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 dark:text-zinc-200 break-words">
                      {selectedSupportTicket.subject}
                    </div>
                    {selectedTicketUser && (
                      <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                        Saldo Pix: {formatBRL(selectedTicketUser.brlBalanceCents)} · Moedas:{' '}
                        {formatPoints(selectedTicketUser.pointsBalance)} · Status:{' '}
                        {selectedTicketUser.status}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedSupportTicket.status === 'waiting_human' && (
                      <button
                        type="button"
                        disabled={supportBusy}
                        onClick={() => acceptSupportTicket(selectedSupportTicket)}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl whitespace-nowrap cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Aceitar Suporte
                      </button>
                    )}
                    {selectedSupportTicket.status !== 'closed' && (
                      <button
                        type="button"
                        disabled={supportBusy}
                        onClick={() => closeSupportTicket(selectedSupportTicket)}
                        className="min-h-[40px] px-3 py-2 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
                      >
                        Encerrar
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300 break-words">
                  <strong className="text-slate-800 dark:text-zinc-100">Resumo do Biel:</strong>{' '}
                  {selectedSupportTicket.bielSummary}
                </div>

                <div className="flex-1 overflow-y-auto py-4 space-y-2.5 pr-1">
                  {supportMessages.map((msg) => {
                    const isAdminSender = msg.senderRole === 'admin';
                    const isBiel = msg.senderRole === 'biel';
                    return (
                      <div
                        key={msg.messageId}
                        className={`flex flex-col ${isAdminSender ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                            isAdminSender
                              ? 'bg-emerald-600 dark:bg-lime-400 text-white dark:text-slate-950 font-medium'
                              : isBiel
                                ? 'bg-slate-100 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800'
                                : 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100'
                          }`}
                        >
                          {msg.text}
                        </div>
                        <span className="mt-1 text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                          {msg.senderName} · {formatAttemptTimestamp(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {selectedSupportTicket.status === 'closed' ? (
                  <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400">
                    Chamado encerrado.
                  </div>
                ) : (
                  <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
                    <input
                      type="text"
                      value={supportReplyDraft}
                      maxLength={800}
                      onChange={(e) => setSupportReplyDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendAdminSupportReply()}
                      placeholder={
                        selectedSupportTicket.status === 'waiting_human'
                          ? 'Responda aqui para aceitar e iniciar o chat...'
                          : 'Escreva sua resposta para o jogador...'
                      }
                      className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#090d12] px-3.5 py-2 text-sm text-slate-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      disabled={supportBusy || !supportReplyDraft.trim()}
                      onClick={sendAdminSupportReply}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-extrabold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Responder
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 dark:text-zinc-400 gap-2 px-4">
                <Headset className="w-8 h-8 opacity-40" />
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                  Selecione um chamado ao lado
                </p>
                <p className="text-xs max-w-sm leading-relaxed">
                  Conversas enviadas pelo suporte do Biel aparecem aqui para você aceitar e responder ao vivo.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: CHAT GLOBAL */}
      {tab === 'chat' && (
        <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Moderação do Chat Global</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Exclua mensagens inadequadas da conversa pública. A exclusão é permanente.</p>
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">{globalChatMessages.length} mensagens carregadas</span>
          </div>
          {globalChatMessages.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-zinc-400 py-8 text-center">Nenhuma mensagem encontrada no chat global.</p>
          ) : (
            <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
              {globalChatMessages.map((message) => (
                <div key={message.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12] p-3.5">
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">{message.senderName || 'Jogador'}</div>
                    <p className="text-sm text-slate-700 dark:text-zinc-300 break-words">{message.text || ''}</p>
                    <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono break-all">ID: {message.id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteGlobalChatMessage(message)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-950/50 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir mensagem
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ANTIFRAUDE */}
      {tab === 'antifraud' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Eventos Antifraude ({fraudLogs.length})
            </h3>
            {fraudLogs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
                Nenhum incidente antifraude registrado.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {fraudLogs.slice(0, 30).map((f) => {
                  const targetUser = users.find((u) => u.uid === f.userId);
                  const eventLabel =
                    f.eventType === 'admin_ban'
                      ? 'Banimento Administrativo'
                      : f.eventType === 'profanity_username_ban'
                        ? 'Banimento por Palavrão'
                        : f.eventType;
                  return (
                    <div key={f.logId} className="py-3 flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="text-xs font-mono text-slate-500 dark:text-zinc-400 break-words">
                          {eventLabel} · severidade {f.severity} · {targetUser?.displayName || f.userId}
                        </div>
                        <div className="text-xs font-medium text-slate-900 dark:text-zinc-100 break-words">
                          {f.details}
                        </div>
                      </div>
                      {!f.resolved ? (
                        <button
                          type="button"
                          onClick={() => resolveFraudLog(f.logId)}
                          className="px-2.5 py-1.5 text-xs bg-lime-400 text-slate-950 font-bold rounded-lg shrink-0 cursor-pointer"
                        >
                          Resolver
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-700 dark:text-lime-400 font-semibold shrink-0">
                          Resolvido
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Partidas Sinalizadas ({flaggedSessions.length})
            </h3>
            {flaggedSessions.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
                Todas as partidas passaram na verificação de integridade.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {flaggedSessions.slice(0, 20).map((s) => (
                  <div key={s.sessionId} className="py-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">
                        {GAME_LABELS[s.gameCategory] || s.gameCategory}
                      </span>
                      <span className="font-mono text-amber-700 dark:text-amber-400">{s.verificationStatus}</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-zinc-400">{s.fraudReason}</div>
                    <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 break-all">
                      Usuário: {s.userId} · {(s.durationMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: API EMPRESARIAL & SMTP */}
      {tab === 'api' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-700 dark:text-lime-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Nova Integração ERP / Financeira</h3>
            </div>

            <form onSubmit={handleCreateIntegration} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Nome da Ferramenta / ERP
                </label>
                <input
                  type="text"
                  required
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="Ex: Conta Azul / Omie / Power BI"
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Tipo de Integração
                </label>
                <select
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value as EnterpriseIntegration['providerType'])}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-xl bg-white dark:bg-[#090d12] text-slate-900 dark:text-zinc-100"
                >
                  <option value="erp_webhook">Webhook ERP Financeiro</option>
                  <option value="accounting_api">API Contábil (REST)</option>
                  <option value="pix_gateway">Gateway Liquidação Pix</option>
                  <option value="bi_export">Business Intelligence (BI)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  URL do Webhook (opcional)
                </label>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://sua-empresa.com/webhooks/earneasy"
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                Gerar Chave de API e Salvar
              </button>
            </form>

            {generatedRawKey && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-1.5">
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  Chave gerada (copie agora):
                </div>
                <div className="flex items-center justify-between gap-2 bg-white dark:bg-[#090d12] border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1.5">
                  <code className="text-xs font-mono text-slate-900 dark:text-zinc-100 break-all">{generatedRawKey}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(generatedRawKey)}
                    className="p-1 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer"
                    title="Copiar chave"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Automação de E-mail SMTP (Nodemailer)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      Notificações automáticas de saques Pix e convites.
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border ${
                    smtpStatus?.configured
                      ? 'bg-emerald-50 dark:bg-lime-500/15 text-emerald-700 dark:text-lime-400 border-emerald-200 dark:border-lime-500/40'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {smtpStatus?.configured ? 'SMTP Configurado' : 'Aguardando SMTP'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">SMTP_HOST</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-zinc-100 break-all mt-0.5">
                    {smtpStatus?.host || 'Não definido'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">SMTP_PORT</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-zinc-100 mt-0.5">
                    {smtpStatus?.port || 587}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">SMTP_USER</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-zinc-100 break-all mt-0.5">
                    {smtpStatus?.userMasked || 'Não definido'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">SMTP_FROM</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-zinc-100 break-all mt-0.5">
                    {smtpStatus?.from || 'Padrão'}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSendSmtpTest} className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="email"
                  required
                  value={smtpTestEmail}
                  onChange={(e) => setSmtpTestEmail(e.target.value)}
                  placeholder="E-mail para teste SMTP"
                  className="flex-1 min-h-[42px] px-3 py-2 text-xs bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                />
                <button
                  type="button"
                  disabled={smtpChecking}
                  onClick={handleVerifySmtp}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${smtpChecking ? 'animate-spin' : ''}`} />
                  Verificar
                </button>
                <button
                  type="submit"
                  disabled={smtpTestSending || !smtpTestEmail.trim()}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 rounded-xl cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {smtpTestSending ? 'Enviando...' : 'Testar Envio'}
                </button>
              </form>

              {smtpTestMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    smtpTestMsg.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}
                >
                  {smtpTestMsg.text}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Integrações Registradas</h3>
              {webhookTestResult && (
                <div className="p-3 bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 rounded-xl text-xs font-mono">
                  {webhookTestResult}
                </div>
              )}

              {integrations.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400">Nenhuma integração cadastrada ainda.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {integrations.map((intg) => (
                    <div key={intg.integrationId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{intg.name}</div>
                        <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                          Prefixo: {intg.apiKeyPrefix}... · {intg.providerType}
                        </div>
                        {intg.endpointUrl && (
                          <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 break-all">
                            {intg.endpointUrl}
                          </div>
                        )}
                      </div>
                      {intg.endpointUrl && (
                        <button
                          type="button"
                          onClick={() => handleTestWebhook(intg)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-zinc-800 text-white rounded-lg cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Testar Webhook
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: VERIFICAÇÃO FACIAL (+30.000 pts) */}
      {tab === 'verification' && (
        <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-sky-500" />
                Análise de Verificação Facial ({filteredFaceVerifications.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Confira a selfie e os dados (+18). Ao aprovar, o perfil ganha o selo Verificado e +{formatPoints(FACE_VERIFICATION_BONUS_POINTS)} pontos imediatos (único por conta).
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'pending', label: `Pendentes (${pendingFaceCount})` },
                  { id: 'approved', label: 'Aprovados' },
                  { id: 'rejected', label: 'Recusados' },
                  { id: 'all', label: 'Todos' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFaceFilter(f.id)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-xl border transition-colors cursor-pointer ${
                    faceFilter === f.id
                      ? 'bg-slate-900 dark:bg-lime-400 text-white dark:text-slate-950 border-transparent'
                      : 'bg-slate-50 dark:bg-[#090d12] text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredFaceVerifications.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-zinc-400 py-10 text-center">
              Nenhuma solicitação de verificação facial neste filtro.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredFaceVerifications.map((req) => {
                const age = calculateAgeFromBirthDate(req.birthDate);
                const email = privateMap[req.uid]?.email || '';
                const busy = faceBusyUid === req.uid;
                return (
                  <div
                    key={req.uid}
                    className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12] p-4 flex flex-col sm:flex-row gap-4"
                  >
                    <button
                      type="button"
                      onClick={() => setZoomSelfie(req)}
                      className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border border-slate-300 dark:border-zinc-700 bg-black shrink-0 group cursor-pointer self-start"
                      title="Clique para ampliar a foto"
                    >
                      <img
                        src={req.selfieDataUrl}
                        alt={`Selfie de ${req.displayName}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-bold gap-1">
                        <Eye className="w-3.5 h-3.5" /> Ampliar
                      </span>
                    </button>

                    <div className="flex-1 min-w-0 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                            {req.displayName}
                          </span>
                          {req.status === 'approved' && <VerifiedBadge size="xs" />}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                            req.status === 'approved'
                              ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                              : req.status === 'rejected'
                                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {req.status === 'approved'
                            ? 'Aprovado'
                            : req.status === 'rejected'
                              ? 'Recusado'
                              : 'Pendente'}
                        </span>
                      </div>

                      <div className="space-y-0.5 text-[11px] text-slate-600 dark:text-zinc-400 font-mono break-all">
                        {email && <div>{email}</div>}
                        <div>UID: {req.uid}</div>
                        <div>
                          Nascimento: <strong className="text-slate-900 dark:text-zinc-200">{formatBirthDateBr(req.birthDate)}</strong>
                          {age !== null ? ` (${age} anos)` : ''}
                        </div>
                        <div>Enviado em: {formatAttemptTimestamp(req.submittedAt)}</div>
                      </div>

                      {req.status === 'rejected' && req.rejectionReason && (
                        <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300">
                          <strong>Motivo da recusa:</strong> {req.rejectionReason}
                        </div>
                      )}

                      {req.status === 'pending' && (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy || req.bonusAwarded}
                              onClick={() => handleApproveFace(req)}
                              className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-xs font-black cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              {busy ? 'Processando...' : `Aprovar (+${formatPoints(FACE_VERIFICATION_BONUS_POINTS)} pts)`}
                            </button>
                          </div>

                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              maxLength={200}
                              value={faceRejectReasons[req.uid] || ''}
                              onChange={(e) =>
                                setFaceRejectReasons((prev) => ({ ...prev, [req.uid]: e.target.value }))
                              }
                              placeholder="Motivo da recusa (ex: foto escura / rosto cortado)"
                              className="flex-1 min-h-[38px] px-3 py-1.5 text-xs bg-white dark:bg-[#0e1319] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                            />
                            <button
                              type="button"
                              disabled={busy || (faceRejectReasons[req.uid] || '').trim().length < 3}
                              onClick={() => handleRejectFace(req)}
                              className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold disabled:opacity-40 cursor-pointer shrink-0"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Recusar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: AMPLIAR SELFIE FACIAL */}
      {zoomSelfie && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomSelfie(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                Selfie de {zoomSelfie.displayName}
              </div>
              <button
                type="button"
                onClick={() => setZoomSelfie(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-black flex justify-center">
              <img
                src={zoomSelfie.selfieDataUrl}
                alt={`Selfie ampliada de ${zoomSelfie.displayName}`}
                className="max-h-[70vh] w-auto rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BANIR USUÁRIO */}
      {banTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ban-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="ban-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                    Banir Usuário
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Escolha a duração e informe o motivo do bloqueio.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeBanModal}
                disabled={banSubmitting}
                aria-label="Fechar modal de banimento"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={confirmBanUser} className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 text-xs space-y-1">
                <div className="font-semibold text-slate-900 dark:text-zinc-100">{banTarget.displayName}</div>
                <div className="font-mono text-slate-500 dark:text-zinc-400 break-all">
                  {privateMap[banTarget.uid]?.email || banTarget.uid}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Duração do bloqueio
                </label>
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                >
                  <option value="15m">15 minutos</option>
                  <option value="1h">1 hora</option>
                  <option value="6h">6 horas</option>
                  <option value="12h">12 horas</option>
                  <option value="24h">24 horas</option>
                  <option value="3d">3 dias</option>
                  <option value="7d">7 dias</option>
                  <option value="30d">30 dias</option>
                  <option value="permanent">Permanente</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Motivo do bloqueio <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BAN_REASON_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setBanReason(suggestion)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border cursor-pointer ${
                        banReason === suggestion
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-50 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Ex: Uso de bot / automação nos jogos"
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Por quê? <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={400}
                  rows={3}
                  value={banExplanation}
                  onChange={(e) => setBanExplanation(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl resize-none"
                />
              </div>

              {banError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                  {banError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={closeBanModal}
                  disabled={banSubmitting}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={banSubmitting || banReason.trim().length < 3 || banExplanation.trim().length < 5}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  {banSubmitting ? 'Aplicando...' : 'Confirmar Bloqueio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTE MANUAL DE PONTOS */}
      {pointsTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="points-modal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <h3 id="points-modal-title" className="text-base font-bold text-slate-900 dark:text-white">Ajustar pontos do usuário</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{pointsTarget.displayName} · Saldo atual: {formatPoints(pointsTarget.pointsBalance)}</p>
              </div>
              <button type="button" onClick={closePointsModal} disabled={pointsSubmitting} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={confirmPointsAdjustment} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Operação</label>
                <select value={pointsOperation} onChange={(e) => setPointsOperation(e.target.value as 'add' | 'remove')} className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl">
                  <option value="add">Adicionar pontos</option>
                  <option value="remove">Retirar pontos</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Quantidade</label>
                <input type="number" min="1" max="1000000" step="1" required value={pointsAmount} onChange={(e) => setPointsAmount(e.target.value)} className="w-full min-h-[42px] px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Motivo do ajuste</label>
                <textarea required minLength={4} maxLength={180} rows={3} value={pointsReason} onChange={(e) => setPointsReason(e.target.value)} placeholder="Ex.: correção de saldo, prêmio ou estorno..." className="w-full px-3 py-2 text-sm bg-white dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl resize-none" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Toda alteração será registrada no histórico administrativo. A retirada nunca poderá deixar o saldo negativo.</p>
              {pointsError && <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">{pointsError}</div>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button type="button" onClick={closePointsModal} disabled={pointsSubmitting} className="min-h-[40px] px-4 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl">Cancelar</button>
                <button type="submit" disabled={pointsSubmitting || !pointsAmount || pointsReason.trim().length < 4} className="min-h-[40px] px-4 py-2 text-xs font-bold bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 rounded-xl">
                  {pointsSubmitting ? 'Salvando...' : pointsOperation === 'add' ? 'Adicionar pontos' : 'Retirar pontos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
});

AdminPanel.displayName = 'AdminPanel';
