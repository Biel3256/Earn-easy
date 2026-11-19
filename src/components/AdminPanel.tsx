import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  Landmark,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Users,
  Webhook,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EnterpriseIntegration,
  FraudEvent,
  GAME_LABELS,
  GameSession,
  MAX_PROMO_CODE_POINTS,
  PixWithdrawal,
  PromoCode,
  Referral,
  UserAccount,
  UserPrivateInfo,
} from '../types/earneasy';
import { generateId, sha256Hex } from '../utils/antifraud';
import {
  formatBRL,
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  timestampToMillis,
} from '../utils/pix';

type AdminTab = 'payouts' | 'users' | 'codes' | 'antifraud' | 'api';

function buildRandomPromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `EE-${suffix}`;
}

export const AdminPanel: React.FC = () => {
  const { firebaseUser, isAdmin } = useAuth();
  const [tab, setTab] = useState<AdminTab>('payouts');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, UserPrivateInfo>>({});
  const [withdrawals, setWithdrawals] = useState<PixWithdrawal[]>([]);
  const [fraudLogs, setFraudLogs] = useState<FraudEvent[]>([]);
  const [flaggedSessions, setFlaggedSessions] = useState<GameSession[]>([]);
  const [integrations, setIntegrations] = useState<EnterpriseIntegration[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const [payoutFilter, setPayoutFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'rejected'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [txIds, setTxIds] = useState<Record<string, string>>({});

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

  // Ban modal state
  const [banTarget, setBanTarget] = useState<UserAccount | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banExplanation, setBanExplanation] = useState('');
  const [banError, setBanError] = useState<string | null>(null);
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Enterprise API form state
  const [apiName, setApiName] = useState('');
  const [providerType, setProviderType] = useState<EnterpriseIntegration['providerType']>('erp_webhook');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [generatedRawKey, setGeneratedRawKey] = useState<string | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser || !isAdmin) return;

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

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
    };
  }, [firebaseUser, isAdmin]);

  // Keep Enterprise API ledger snapshot synced with Express backend
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

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-lg mx-auto">
        <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
          Apenas contas administrativas autorizadas podem gerenciar usuários, pagamentos Pix e integrações empresariais.
        </p>
      </div>
    );
  }

  const sendAdminEmailReceipt = async (
    w: PixWithdrawal,
    eventType: 'withdrawal_paid' | 'withdrawal_rejected',
    subject: string,
    summary: string
  ) => {
    const email = privateMap[w.userId]?.email || 'usuario@earneasy.app';
    let deliveryStatus: 'sent_smtp' | 'logged_in_app' = 'logged_in_app';
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
      if (res.ok && contentType.includes('application/json')) {
        const d = await res.json();
        if (d.deliveryStatus === 'sent_smtp') deliveryStatus = 'sent_smtp';
      }
    } catch {
      // Fallback logged_in_app
    }

    const notificationId = generateId('mail');
    await setDoc(doc(db, 'emailNotifications', notificationId), {
      notificationId,
      userId: w.userId,
      recipientEmail: email,
      eventType,
      subject,
      summary,
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
          tx.update(uRef, {
            brlBalanceCents: uData.brlBalanceCents + w.amountCents,
            updatedAt: serverTimestamp(),
          });
          if (uData.status === 'active') {
            tx.set(doc(db, 'leaderboard', w.userId), {
              uid: uData.uid,
              displayName: uData.displayName,
              photoURL: uData.photoURL,
              brlBalanceCents: uData.brlBalanceCents + w.amountCents,
              pointsBalance: uData.pointsBalance,
              gamesPlayed: uData.gamesPlayed,
              status: uData.status,
              updatedAt: serverTimestamp(),
            });
          }
        }
      });

      if (nextStatus === 'paid') {
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
      handleFirestoreError(err, OperationType.UPDATE, `withdrawals/${w.withdrawalId}`);
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
    setBanError(null);
  };

  const closeBanModal = () => {
    if (banSubmitting) return;
    setBanTarget(null);
    setBanReason('');
    setBanExplanation('');
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
        updatedAt: serverTimestamp(),
      });

      await deleteDoc(doc(db, 'leaderboard', banTarget.uid)).catch(() => {});

      const logId = generateId('ban');
      await setDoc(doc(db, 'fraudLogs', logId), {
        logId,
        userId: banTarget.uid,
        eventType: 'admin_ban',
        severity: 'critical',
        details: `Banimento (${trimmedReason}): ${trimmedExplanation}`.slice(0, 400),
        resolved: false,
        createdAt: serverTimestamp(),
      });

      setActionMsg(
        `Usuário ${banTarget.displayName} banido. Motivo: "${trimmedReason}".`
      );
      setBanTarget(null);
      setBanReason('');
      setBanExplanation('');
    } catch (err) {
      setBanError(err instanceof Error ? err.message : 'Erro ao aplicar banimento.');
      handleFirestoreError(err, OperationType.UPDATE, `users/${banTarget.uid}`);
    } finally {
      setBanSubmitting(false);
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
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'leaderboard', u.uid), {
        uid: u.uid,
        displayName: u.displayName,
        photoURL: u.photoURL,
        brlBalanceCents: u.brlBalanceCents,
        pointsBalance: u.pointsBalance,
        gamesPlayed: u.gamesPlayed,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
      setActionMsg(`Usuário ${u.displayName} reativado com sucesso.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.uid}`);
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
      handleFirestoreError(err, OperationType.CREATE, `admins/${u.uid}`);
    }
  };

  const resolveFraudLog = async (logId: string) => {
    try {
      await updateDoc(doc(db, 'fraudLogs', logId), { resolved: true });
      setActionMsg(`Alerta ${logId} marcado como resolvido.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `fraudLogs/${logId}`);
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
      handleFirestoreError(err, OperationType.CREATE, `integrations/${integrationId}`);
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
      const publishAtTimestamp =
        delayNum === 0 ? Timestamp.now() : Timestamp.fromMillis(publishMs);

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
        publishAt: publishAtTimestamp,
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
          publishAt: publishAtTimestamp,
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
      setPromoError(err instanceof Error ? err.message : 'Erro ao criar evento de código.');
      handleFirestoreError(err, OperationType.CREATE, `promoCodes/${normalizedCode}`);
    } finally {
      setPromoSubmitting(false);
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
      handleFirestoreError(err, OperationType.UPDATE, `promoCodes/${p.code}`);
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
      handleFirestoreError(err, OperationType.UPDATE, `promoCodes/${p.code}`);
    }
  };

  const filteredWithdrawals = withdrawals.filter((w) =>
    payoutFilter === 'all' ? true : w.status === payoutFilter
  );

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    const email = (privateMap[u.uid]?.email || '').toLowerCase();
    return u.displayName.toLowerCase().includes(q) || email.includes(q) || u.uid.toLowerCase().includes(q);
  });

  const pendingTotalCents = withdrawals
    .filter((w) => w.status === 'pending' || w.status === 'approved')
    .reduce((acc, w) => acc + w.amountCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Painel Administrativo</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Gestão de usuários, liquidação de saques Pix, auditoria antifraude e API empresarial
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-900 border border-transparent dark:border-zinc-800 rounded-lg">
          {(
            [
              { id: 'payouts', label: 'Pagamentos Pix', Icon: Landmark },
              { id: 'users', label: 'Usuários', Icon: Users },
              { id: 'codes', label: 'Códigos & Eventos', Icon: Ticket },
              { id: 'antifraud', label: 'Antifraude', Icon: ShieldCheck },
              { id: 'api', label: 'API Empresarial', Icon: Webhook },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === id
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="underline cursor-pointer">
            Fechar
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Total de Usuários</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-1">{users.length}</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Fila Pix Pendente</div>
          <div className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
            {formatBRL(pendingTotalCents)}
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Alertas Antifraude Abertos</div>
          <div className="text-2xl font-mono font-bold text-red-600 dark:text-red-400 tabular-nums mt-1">
            {fraudLogs.filter((f) => !f.resolved).length}
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Integrações Ativas</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-1">
            {integrations.filter((i) => i.active).length}
          </div>
        </div>
      </div>

      {/* TAB 1: PAYOUTS */}
      {tab === 'payouts' && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Solicitações de Saque Pix</h3>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-lg">
              {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setPayoutFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    payoutFilter === st
                      ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                  <th className="py-2 font-medium">Usuário</th>
                  <th className="py-2 font-medium">Chave Pix</th>
                  <th className="py-2 font-medium text-right">Valor</th>
                  <th className="py-2 font-medium">ID Comprovante</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredWithdrawals.map((w) => (
                  <tr key={w.withdrawalId} className="min-h-[44px]">
                    <td className="py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-zinc-100">{w.userDisplayName}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">{w.requestedDate}</div>
                    </td>
                    <td className="py-2.5 font-mono text-slate-700 dark:text-zinc-300">
                      <span className="text-slate-400 dark:text-zinc-500 mr-1">{w.pixKeyType.toUpperCase()}:</span>
                      {w.pixKey}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right font-bold text-slate-900 dark:text-zinc-100">
                      {formatBRL(w.amountCents)}
                    </td>
                    <td className="py-2.5">
                      {w.status === 'pending' || w.status === 'approved' ? (
                        <input
                          type="text"
                          value={txIds[w.withdrawalId] || ''}
                          onChange={(e) =>
                            setTxIds((prev) => ({ ...prev, [w.withdrawalId]: e.target.value }))
                          }
                          placeholder="E2E Pix ID (opcional)"
                          className="px-2 py-1 text-xs font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded w-36"
                        />
                      ) : (
                        <span className="font-mono text-slate-600 dark:text-zinc-400">{w.pixTransactionId || '-'}</span>
                      )}
                    </td>
                    <td className="py-2.5 font-medium">
                      {w.status === 'paid' && <span className="text-emerald-700 dark:text-emerald-400">Pago</span>}
                      {w.status === 'pending' && <span className="text-amber-700 dark:text-amber-400">Pendente</span>}
                      {w.status === 'approved' && <span className="text-sky-700 dark:text-sky-400">Aprovado</span>}
                      {w.status === 'rejected' && <span className="text-red-700 dark:text-red-400">Recusado</span>}
                    </td>
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      {(w.status === 'pending' || w.status === 'approved') && (
                        <>
                          {w.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleWithdrawalDecision(w, 'approved')}
                              className="px-2.5 py-1 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded font-medium hover:bg-sky-100 dark:hover:bg-sky-900/60 cursor-pointer"
                            >
                              Aprovar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleWithdrawalDecision(w, 'paid')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded font-medium hover:bg-emerald-700 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Marcar Pago
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWithdrawalDecision(w, 'rejected')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded font-medium hover:bg-red-100 dark:hover:bg-red-900/60 cursor-pointer"
                          >
                            <XCircle className="w-3 h-3" />
                            Estornar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredWithdrawals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 dark:text-zinc-400">
                      Nenhum saque Pix nesta fila.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {tab === 'users' && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Controle de Usuários</h3>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail ou UID..."
              className="px-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                  <th className="py-2 font-medium">Usuário</th>
                  <th className="py-2 font-medium text-right">Pontos</th>
                  <th className="py-2 font-medium text-right">Saldo R$</th>
                  <th className="py-2 font-medium text-right">Sacado</th>
                  <th className="py-2 font-medium text-right">Risco</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredUsers.map((u) => {
                  const userBanHistory = fraudLogs.filter(
                    (f) =>
                      f.userId === u.uid &&
                      (f.eventType === 'admin_ban' || f.eventType === 'profanity_username_ban')
                  );
                  return (
                  <tr key={u.uid} className="min-h-[48px]">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-slate-900 dark:text-zinc-100">{u.displayName}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {privateMap[u.uid]?.email || u.uid}
                      </div>
                      {u.status === 'suspended' && (u.banReason || u.banExplanation) && (
                        <div className="mt-1 text-[11px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/70 rounded px-2 py-1 max-w-md space-y-0.5">
                          {u.banReason && (
                            <div>
                              <span className="font-semibold">Motivo:</span> {u.banReason}
                            </div>
                          )}
                          {u.banExplanation && (
                            <div className="text-red-700/90 dark:text-red-300/90">
                              <span className="font-semibold">Por quê:</span> {u.banExplanation}
                            </div>
                          )}
                          {u.bannedBy && (
                            <div className="text-[10px] font-mono text-red-600/80 dark:text-red-400/80">
                              Banido por: {u.bannedBy}
                            </div>
                          )}
                        </div>
                      )}
                      {u.status === 'active' && userBanHistory.length > 0 && (
                        <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded px-2 py-0.5 max-w-md">
                          Histórico anterior ({userBanHistory.length}): {userBanHistory[0].details}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-slate-700 dark:text-zinc-300">{formatPoints(u.pointsBalance)}</td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-emerald-700 dark:text-emerald-400 font-semibold">
                      {formatBRL(u.brlBalanceCents)}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-slate-700 dark:text-zinc-300">{formatBRL(u.totalWithdrawnCents)}</td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-slate-700 dark:text-zinc-300">{u.riskScore}/100</td>
                    <td className="py-2.5 font-medium">
                      <span className={u.status === 'active' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                        {u.status === 'active' ? 'Ativo' : 'Banido'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      {u.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => openBanModal(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded font-medium hover:bg-red-100 dark:hover:bg-red-900/60 cursor-pointer"
                        >
                          <Ban className="w-3 h-3" />
                          Banir
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reactivateUser(u)}
                          className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-pointer"
                        >
                          Reativar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => promoteAdmin(u)}
                        className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded font-medium hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        Tornar Admin
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CÓDIGOS DE EVENTO & CONVITES */}
      {tab === 'codes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                  Gerar e Enviar Evento de Código
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Crie códigos valendo pontos e envie para os jogadores resgatarem no app.
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
                    className="flex-1 px-3 py-2 text-sm font-mono uppercase bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setPromoCodeInput(buildRandomPromoCode())}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Gerar Aleatório
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Título / Descrição do Evento
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={promoTitle}
                  onChange={(e) => setPromoTitle(e.target.value)}
                  placeholder="Ex: Evento Relâmpago de Fim de Semana"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Moedas por Resgate (máx. 100.000)
                  </label>
                  <input
                    type="number"
                    required
                    min={10}
                    max={MAX_PROMO_CODE_POINTS}
                    value={promoPoints}
                    onChange={(e) => setPromoPoints(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
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
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Publicar no site em (minutos)
                  </label>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    {Number(promoDelayMinutes || 0) === 0
                      ? 'Imediato'
                      : `Em ${promoDelayMinutes} min`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Imediato', mins: '0' },
                    { label: '5 min', mins: '5' },
                    { label: '15 min', mins: '15' },
                    { label: '30 min', mins: '30' },
                    { label: '1 hora', mins: '60' },
                    { label: '2 horas', mins: '120' },
                    { label: '4 horas', mins: '240' },
                  ].map((preset) => (
                    <button
                      key={preset.mins}
                      type="button"
                      onClick={() => setPromoDelayMinutes(preset.mins)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer ${
                        promoDelayMinutes === preset.mins
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-emerald-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={promoDelayMinutes}
                    onChange={(e) => setPromoDelayMinutes(e.target.value)}
                    className="w-28 px-3 py-1.5 text-xs font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
                  />
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    minutos (0 = imediato, até 1.440 min = 24 horas)
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoPublicEvent}
                    onChange={(e) => setPromoPublicEvent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900 dark:text-zinc-100">
                      Exibir nos Destaques e Eventos Públicos do site
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Aparece automaticamente na área de Destaques e em Convites & Códigos quando o horário de publicação chegar.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendMailboxMsg}
                    onChange={(e) => setSendMailboxMsg(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <div className="text-xs">
                    <div className="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-zinc-100">
                      <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Enviar mensagem na Caixa de Correio dos usuários
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Todos os jogadores recebem um aviso imediato na Caixa de Correio informando o código ou o horário programado de liberação.
                    </div>
                  </div>
                </label>
              </div>

              {promoError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                  {promoError}
                </div>
              )}

              <button
                type="submit"
                disabled={promoSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {promoSubmitting ? 'Enviando evento...' : 'Gerar e Enviar Evento de Código'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                  Eventos de Código Gerados ({promoCodes.length})
                </h3>
                <span className="text-xs text-slate-500 dark:text-zinc-400">
                  {promoCodes.filter((c) => c.active).length} ativos
                </span>
              </div>

              {promoCodes.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400 py-6 text-center">
                  Nenhum código promocional gerado ainda. Crie o primeiro evento ao lado!
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
                              navigator.clipboard.writeText(p.code);
                              setActionMsg(`Código ${p.code} copiado!`);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
                            title="Copiar código"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            +{formatPoints(p.pointsValue)} moedas
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-800 dark:text-zinc-200">
                          {p.title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                          Resgates: {p.redemptionCount} / {p.maxRedemptions} ·{' '}
                          {p.publicEvent ? 'Evento Público' : 'Código Privado'} ·{' '}
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
                          className="px-2.5 py-1 text-[11px] font-semibold rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700 cursor-pointer"
                        >
                          {p.publicEvent ? 'Tornar Privado' : 'Publicar no App'}
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePromoActive(p)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded border cursor-pointer ${
                            p.active
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
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

            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                Auditoria de Convites (+500 pts & 12%)
              </h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <div className="text-slate-500 dark:text-zinc-400">Indicações</div>
                  <div className="text-lg font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                    {referrals.length}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <div className="text-slate-500 dark:text-zinc-400">Bônus +500</div>
                  <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formatPoints(referrals.reduce((s, r) => s + r.signupBonusPoints, 0))}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <div className="text-slate-500 dark:text-zinc-400">Comissões 12%</div>
                  <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formatPoints(referrals.reduce((s, r) => s + r.totalCommissionPointsEarned, 0))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ANTIFRAUD */}
      {tab === 'antifraud' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Eventos Antifraude</h3>
            {fraudLogs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-zinc-400 py-6 text-center">Nenhum incidente antifraude registrado.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {fraudLogs.slice(0, 20).map((f) => {
                  const targetUser = users.find((u) => u.uid === f.userId);
                  const eventLabel =
                    f.eventType === 'admin_ban'
                      ? 'Banimento Administrativo'
                      : f.eventType === 'profanity_username_ban'
                        ? 'Banimento por Palavrão'
                        : f.eventType;
                  return (
                  <div key={f.logId} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                        {eventLabel} · severidade {f.severity} · {targetUser?.displayName || f.userId.slice(0, 10)}
                      </div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{f.details}</div>
                    </div>
                    {!f.resolved ? (
                      <button
                        type="button"
                        onClick={() => resolveFraudLog(f.logId)}
                        className="px-2.5 py-1 text-xs bg-slate-900 dark:bg-zinc-800 text-white rounded hover:bg-slate-800 dark:hover:bg-zinc-700 shrink-0 cursor-pointer"
                      >
                        Resolver
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium shrink-0">Resolvido</span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Partidas Sinalizadas</h3>
            {flaggedSessions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-zinc-400 py-6 text-center">Todas as partidas passaram na verificação de integridade.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {flaggedSessions.slice(0, 15).map((s) => (
                  <div key={s.sessionId} className="py-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">{GAME_LABELS[s.gameCategory]}</span>
                      <span className="font-mono text-amber-700 dark:text-amber-400">{s.verificationStatus}</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-zinc-400">{s.fraudReason}</div>
                    <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                      Usuário: {s.userId} · {(s.durationMs / 1000).toFixed(1)}s
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ENTERPRISE API & WEBHOOKS */}
      {tab === 'api' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Nova Integração ERP / Financeira</h3>
            </div>

            <form onSubmit={handleCreateIntegration} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Nome da Ferramenta / ERP</label>
                <input
                  type="text"
                  required
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="Ex: Conta Azul / Omie / Power BI"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Tipo de Integração</label>
                <select
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value as EnterpriseIntegration['providerType'])}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100"
                >
                  <option value="erp_webhook">Webhook ERP Financeiro</option>
                  <option value="accounting_api">API Contábil (REST)</option>
                  <option value="pix_gateway">Gateway Liquidação Pix</option>
                  <option value="bi_export">Business Intelligence (BI)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">URL do Webhook (opcional)</label>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://sua-empresa.com/webhooks/earneasy"
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                Gerar Chave de API e Salvar
              </button>
            </form>

            {generatedRawKey && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                  Chave gerada (copie agora — armazenada apenas em hash SHA-256):
                </div>
                <div className="flex items-center justify-between gap-2 bg-white dark:bg-zinc-950 border border-emerald-200 dark:border-emerald-800 rounded px-2.5 py-1.5">
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
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Integrações Registradas</h3>
              {webhookTestResult && (
                <div className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg text-xs text-slate-800 dark:text-zinc-200 font-mono">
                  {webhookTestResult}
                </div>
              )}

              {integrations.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-zinc-400">Nenhuma integração cadastrada ainda.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {integrations.map((intg) => (
                    <div key={intg.integrationId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{intg.name}</div>
                        <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                          Prefixo: {intg.apiKeyPrefix}... · {intg.providerType}
                        </div>
                        {intg.endpointUrl && (
                          <div className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 truncate max-w-sm">
                            {intg.endpointUrl}
                          </div>
                        )}
                      </div>
                      {intg.endpointUrl && (
                        <button
                          type="button"
                          onClick={() => handleTestWebhook(intg)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-zinc-800 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-zinc-700 cursor-pointer"
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

            <div className="bg-slate-900 dark:bg-zinc-900 dark:border dark:border-zinc-800 text-slate-100 rounded-xl p-6 space-y-3">
              <h3 className="text-sm font-bold">Endpoints REST para Ferramentas Financeiras</h3>
              <p className="text-xs text-slate-300">
                Autentique via cabeçalho <code className="text-emerald-400">x-api-key</code> para consumir o razão financeiro e lotes de saque Pix no seu ERP ou BI:
              </p>
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono overflow-x-auto text-emerald-300">
{`GET /api/v1/ledger
Header: x-api-key: ee_live_sua_chave_aqui

GET /api/v1/payouts?status=pending
Header: x-api-key: ee_live_sua_chave_aqui`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BANIR USUÁRIO COM MOTIVO E PORQUÊ */}
      {banTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ban-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="ban-modal-title" className="text-base font-bold text-slate-900 dark:text-zinc-50">
                    Banir Usuário
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Informe o motivo e o porquê antes de confirmar o banimento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeBanModal}
                disabled={banSubmitting}
                aria-label="Fechar modal de banimento"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={confirmBanUser} className="p-6 space-y-4">
              <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 text-xs space-y-1">
                <div className="font-semibold text-slate-900 dark:text-zinc-100">
                  {banTarget.displayName}
                </div>
                <div className="font-mono text-slate-500 dark:text-zinc-400">
                  {privateMap[banTarget.uid]?.email || banTarget.uid}
                </div>
                <div className="text-slate-600 dark:text-zinc-400 pt-1">
                  Saldo: <span className="font-mono font-semibold">{formatBRL(banTarget.brlBalanceCents)}</span> · Pontos:{' '}
                  <span className="font-mono font-semibold">{formatPoints(banTarget.pointsBalance)}</span> · Risco:{' '}
                  <span className="font-mono font-semibold">{banTarget.riskScore}/100</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Motivo do banimento <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BAN_REASON_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setBanReason(suggestion)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                        banReason === suggestion
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-red-300 dark:hover:border-red-700'
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
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Por quê? (Descrição detalhada obrigatória) <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={400}
                  rows={3}
                  value={banExplanation}
                  onChange={(e) => setBanExplanation(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo e o porquê do banimento para referência futura..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                  <span>Salvo no Firestore (perfil e auditoria antifraude) para referência futura.</span>
                  <span className="font-mono tabular-nums">{banExplanation.length}/400</span>
                </div>
              </div>

              {banError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                  {banError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={closeBanModal}
                  disabled={banSubmitting}
                  className="px-4 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={banSubmitting || banReason.trim().length < 3 || banExplanation.trim().length < 5}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  {banSubmitting ? 'Banindo...' : 'Confirmar Banimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
