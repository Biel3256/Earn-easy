import React, { useEffect, useState } from 'react';
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
  updateDoc,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Landmark,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  Webhook,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  EnterpriseIntegration,
  FraudEvent,
  GAME_LABELS,
  GameSession,
  PixWithdrawal,
  UserAccount,
  UserPrivateInfo,
} from '../types/earneasy';
import { generateId, sha256Hex } from '../utils/antifraud';
import { formatBRL, formatPoints } from '../utils/pix';

type AdminTab = 'payouts' | 'users' | 'antifraud' | 'api';

export const AdminPanel: React.FC = () => {
  const { firebaseUser, isAdmin } = useAuth();
  const [tab, setTab] = useState<AdminTab>('payouts');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, UserPrivateInfo>>({});
  const [withdrawals, setWithdrawals] = useState<PixWithdrawal[]>([]);
  const [fraudLogs, setFraudLogs] = useState<FraudEvent[]>([]);
  const [flaggedSessions, setFlaggedSessions] = useState<GameSession[]>([]);
  const [integrations, setIntegrations] = useState<EnterpriseIntegration[]>([]);

  const [payoutFilter, setPayoutFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'rejected'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [txIds, setTxIds] = useState<Record<string, string>>({});

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

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
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
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-lg mx-auto">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-slate-600 mt-1">
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
      if (res.ok) {
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

  const toggleUserStatus = async (u: UserAccount, nextStatus: 'active' | 'suspended') => {
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        status: nextStatus,
        riskScore: nextStatus === 'active' ? 0 : Math.max(u.riskScore, 80),
        updatedAt: serverTimestamp(),
      });
      setActionMsg(`Usuário ${u.displayName} atualizado para "${nextStatus}".`);
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
          <h2 className="text-xl font-bold text-slate-900">Painel Administrativo</h2>
          <p className="text-sm text-slate-500">
            Gestão de usuários, liquidação de saques Pix, auditoria antifraude e API empresarial
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'payouts', label: 'Pagamentos Pix', Icon: Landmark },
              { id: 'users', label: 'Usuários', Icon: Users },
              { id: 'antifraud', label: 'Antifraude', Icon: ShieldCheck },
              { id: 'api', label: 'API Empresarial', Icon: Webhook },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="underline cursor-pointer">
            Fechar
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total de Usuários</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">{users.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Fila Pix Pendente</div>
          <div className="text-2xl font-mono font-bold text-amber-600 tabular-nums mt-1">
            {formatBRL(pendingTotalCents)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Alertas Antifraude Abertos</div>
          <div className="text-2xl font-mono font-bold text-red-600 tabular-nums mt-1">
            {fraudLogs.filter((f) => !f.resolved).length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Integrações Ativas</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {integrations.filter((i) => i.active).length}
          </div>
        </div>
      </div>

      {/* TAB 1: PAYOUTS */}
      {tab === 'payouts' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900">Solicitações de Saque Pix</h3>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'pending', 'approved', 'paid', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setPayoutFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    payoutFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
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
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Usuário</th>
                  <th className="py-2 font-medium">Chave Pix</th>
                  <th className="py-2 font-medium text-right">Valor</th>
                  <th className="py-2 font-medium">ID Comprovante</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWithdrawals.map((w) => (
                  <tr key={w.withdrawalId} className="min-h-[44px]">
                    <td className="py-2.5">
                      <div className="font-semibold text-slate-900">{w.userDisplayName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{w.requestedDate}</div>
                    </td>
                    <td className="py-2.5 font-mono text-slate-700">
                      <span className="text-slate-400 mr-1">{w.pixKeyType.toUpperCase()}:</span>
                      {w.pixKey}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right font-bold text-slate-900">
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
                          className="px-2 py-1 text-xs font-mono border border-slate-300 rounded w-36"
                        />
                      ) : (
                        <span className="font-mono text-slate-600">{w.pixTransactionId || '-'}</span>
                      )}
                    </td>
                    <td className="py-2.5 font-medium">
                      {w.status === 'paid' && <span className="text-emerald-700">Pago</span>}
                      {w.status === 'pending' && <span className="text-amber-700">Pendente</span>}
                      {w.status === 'approved' && <span className="text-sky-700">Aprovado</span>}
                      {w.status === 'rejected' && <span className="text-red-700">Recusado</span>}
                    </td>
                    <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                      {(w.status === 'pending' || w.status === 'approved') && (
                        <>
                          {w.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleWithdrawalDecision(w, 'approved')}
                              className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded font-medium hover:bg-sky-100 cursor-pointer"
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded font-medium hover:bg-red-100 cursor-pointer"
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
                    <td colSpan={6} className="py-6 text-center text-slate-500">
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
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900">Controle de Usuários</h3>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail ou UID..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Usuário</th>
                  <th className="py-2 font-medium text-right">Pontos</th>
                  <th className="py-2 font-medium text-right">Saldo R$</th>
                  <th className="py-2 font-medium text-right">Sacado</th>
                  <th className="py-2 font-medium text-right">Risco</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium text-right">Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.uid} className="h-12">
                    <td className="py-2">
                      <div className="font-semibold text-slate-900">{u.displayName}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {privateMap[u.uid]?.email || u.uid}
                      </div>
                    </td>
                    <td className="py-2 font-mono tabular-nums text-right">{formatPoints(u.pointsBalance)}</td>
                    <td className="py-2 font-mono tabular-nums text-right text-emerald-700 font-semibold">
                      {formatBRL(u.brlBalanceCents)}
                    </td>
                    <td className="py-2 font-mono tabular-nums text-right">{formatBRL(u.totalWithdrawnCents)}</td>
                    <td className="py-2 font-mono tabular-nums text-right">{u.riskScore}/100</td>
                    <td className="py-2 font-medium">
                      <span className={u.status === 'active' ? 'text-emerald-700' : 'text-red-700'}>
                        {u.status === 'active' ? 'Ativo' : 'Suspenso'}
                      </span>
                    </td>
                    <td className="py-2 text-right space-x-1.5 whitespace-nowrap">
                      {u.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(u, 'suspended')}
                          className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded font-medium hover:bg-red-100 cursor-pointer"
                        >
                          Suspender
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleUserStatus(u, 'active')}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium hover:bg-emerald-100 cursor-pointer"
                        >
                          Reativar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => promoteAdmin(u)}
                        className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded font-medium hover:bg-slate-200 cursor-pointer"
                      >
                        Tornar Admin
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ANTIFRAUD */}
      {tab === 'antifraud' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Eventos Antifraude</h3>
            {fraudLogs.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Nenhum incidente antifraude registrado.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {fraudLogs.slice(0, 20).map((f) => (
                  <div key={f.logId} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-500">
                        {f.eventType} · severidade {f.severity} · {f.userId.slice(0, 10)}
                      </div>
                      <div className="text-xs font-medium text-slate-900">{f.details}</div>
                    </div>
                    {!f.resolved ? (
                      <button
                        type="button"
                        onClick={() => resolveFraudLog(f.logId)}
                        className="px-2.5 py-1 text-xs bg-slate-900 text-white rounded hover:bg-slate-800 shrink-0 cursor-pointer"
                      >
                        Resolver
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-700 font-medium shrink-0">Resolvido</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Partidas Sinalizadas</h3>
            {flaggedSessions.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Todas as partidas passaram na verificação de integridade.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {flaggedSessions.slice(0, 15).map((s) => (
                  <div key={s.sessionId} className="py-3 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">{GAME_LABELS[s.gameCategory]}</span>
                      <span className="font-mono text-amber-700">{s.verificationStatus}</span>
                    </div>
                    <div className="text-xs text-slate-600">{s.fraudReason}</div>
                    <div className="text-[11px] font-mono text-slate-400">
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
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-700" />
              <h3 className="text-base font-bold text-slate-900">Nova Integração ERP / Financeira</h3>
            </div>

            <form onSubmit={handleCreateIntegration} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Ferramenta / ERP</label>
                <input
                  type="text"
                  required
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="Ex: Conta Azul / Omie / Power BI"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Integração</label>
                <select
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value as EnterpriseIntegration['providerType'])}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="erp_webhook">Webhook ERP Financeiro</option>
                  <option value="accounting_api">API Contábil (REST)</option>
                  <option value="pix_gateway">Gateway Liquidação Pix</option>
                  <option value="bi_export">Business Intelligence (BI)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">URL do Webhook (opcional)</label>
                <input
                  type="url"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://sua-empresa.com/webhooks/earneasy"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Gerar Chave de API e Salvar
              </button>
            </form>

            {generatedRawKey && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1.5">
                <div className="text-xs font-semibold text-emerald-900">
                  Chave gerada (copie agora — armazenada apenas em hash SHA-256):
                </div>
                <div className="flex items-center justify-between gap-2 bg-white border border-emerald-200 rounded px-2.5 py-1.5">
                  <code className="text-xs font-mono text-slate-900 break-all">{generatedRawKey}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(generatedRawKey)}
                    className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                    title="Copiar chave"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Integrações Registradas</h3>
              {webhookTestResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-mono">
                  {webhookTestResult}
                </div>
              )}

              {integrations.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma integração cadastrada ainda.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {integrations.map((intg) => (
                    <div key={intg.integrationId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{intg.name}</div>
                        <div className="text-xs font-mono text-slate-500">
                          Prefixo: {intg.apiKeyPrefix}... · {intg.providerType}
                        </div>
                        {intg.endpointUrl && (
                          <div className="text-[11px] font-mono text-slate-400 truncate max-w-sm">
                            {intg.endpointUrl}
                          </div>
                        )}
                      </div>
                      {intg.endpointUrl && (
                        <button
                          type="button"
                          onClick={() => handleTestWebhook(intg)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
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

            <div className="bg-slate-900 text-slate-100 rounded-xl p-6 space-y-3">
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
    </div>
  );
};
