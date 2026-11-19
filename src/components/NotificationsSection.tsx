import React, { useEffect, useState } from 'react';
import {
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  Inbox,
  Lock,
  Mail,
  MailCheck,
  Ticket,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EmailNotification, MailboxMessage } from '../types/earneasy';
import {
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  timestampToMillis,
} from '../utils/pix';

type InboxSubTab = 'mailbox' | 'receipts';

const EMAIL_EVENT_LABELS: Record<EmailNotification['eventType'], string> = {
  conversion_confirmed: 'Conversão de Pontos',
  withdrawal_requested: 'Saque Pix Solicitado',
  withdrawal_approved: 'Saque Pix Aprovado',
  withdrawal_paid: 'Saque Pix Pago',
  withdrawal_rejected: 'Saque Pix Recusado',
  streak_bonus_credited: 'Bônus de Sequência',
  invite_sent: 'Convite Enviado',
  referral_welcome: 'Boas-vindas por Convite',
  referral_bonus_credited: 'Bônus de Indicação (+500 pts)',
};

export const NotificationsSection: React.FC = () => {
  const {
    firebaseUser,
    mailboxMessages,
    readMailboxIds,
    unreadMailboxCount,
    myNotifications,
    myPromoRedemptions,
    markMailboxRead,
    markAllMailboxRead,
    redeemPromoCode,
    signInWithGoogle,
    browserNotifPermission,
    browserNotifEnabled,
    requestBrowserNotifications,
    setBrowserNotifEnabled,
  } = useAuth();

  const [subTab, setSubTab] = useState<InboxSubTab>('mailbox');
  const [selectedMail, setSelectedMail] = useState<MailboxMessage | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<EmailNotification | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [redeemingCode, setRedeemingCode] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [requestingNotif, setRequestingNotif] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeMail = selectedMail || mailboxMessages[0] || null;

  useEffect(() => {
    if (subTab === 'mailbox' && activeMail) {
      markMailboxRead(activeMail.messageId);
    }
  }, [subTab, activeMail?.messageId]);

  if (!firebaseUser) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Caixa de Correio</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Faça login para receber mensagens de códigos premiados enviados pelo administrador e acompanhar seus comprovantes Pix.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  const activeReceipt = selectedReceipt || myNotifications[0] || null;
  const redeemedCodesSet = new Set(myPromoRedemptions.map((r) => r.code));

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleRedeemFromMail = async (code: string) => {
    setRedeemFeedback(null);
    setRedeemingCode(code);
    try {
      const res = await redeemPromoCode(code);
      setRedeemFeedback({
        type: 'success',
        text: `Código ${res.code} resgatado! +${formatPoints(res.pointsAwarded)} moedas adicionadas ao seu saldo.`,
      });
    } catch (err) {
      setRedeemFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível resgatar este código.',
      });
    } finally {
      setRedeemingCode(null);
    }
  };

  const renderMailDetail = (mail: MailboxMessage) => {
    const publishMs = timestampToMillis(mail.publishAt);
    const createdMs = timestampToMillis(mail.createdAt);
    const isScheduledPending = publishMs > nowMs;
    const isRedeemed = Boolean(mail.promoCode && redeemedCodesSet.has(mail.promoCode));

    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">{mail.title}</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Administração Earn Easy
                {createdMs > 0
                  ? ` · enviado às ${new Date(createdMs).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : ''}
              </p>
            </div>
          </div>

          {mail.pointsValue > 0 && (
            <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
              +{formatPoints(mail.pointsValue)} moedas
            </span>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 space-y-4 text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
          <p>{mail.body}</p>

          {mail.promoCode && (
            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              {isScheduledPending ? (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 flex items-center gap-3 text-xs text-amber-800 dark:text-amber-300">
                  <Clock className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold">
                      Código programado — libera às {formatScheduleTime(publishMs)}
                    </div>
                    <div className="text-[11px] opacity-90">
                      Falta {formatScheduleRemaining(publishMs, nowMs)} para o código aparecer e liberar o resgate automático.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Código Promocional Liberado
                      </div>
                      <div className="text-sm font-mono font-bold text-slate-900 dark:text-zinc-50 mt-0.5">
                        {mail.promoCode}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(mail.promoCode)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer"
                      >
                        {copiedCode === mail.promoCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedCode === mail.promoCode ? 'Copiado' : 'Copiar'}
                      </button>

                      {isRedeemed ? (
                        <span className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          Já resgatado
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={redeemingCode === mail.promoCode}
                          onClick={() => handleRedeemFromMail(mail.promoCode)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                        >
                          <Ticket className="w-3.5 h-3.5" />
                          {redeemingCode === mail.promoCode ? 'Resgatando...' : 'Resgatar Agora'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {redeemFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                redeemFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              {redeemFeedback.text}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">
            Caixa de Correio & Recibos
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Receba avisos de códigos premiados enviados pelo administrador e consulte seus comprovantes Pix.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setSubTab('mailbox')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subTab === 'mailbox'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              Caixa de Correio{unreadMailboxCount > 0 ? ` (${unreadMailboxCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('receipts')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subTab === 'receipts'
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              <MailCheck className="w-3.5 h-3.5" />
              E-mails & Recibos ({myNotifications.length})
            </button>
          </div>

          {subTab === 'mailbox' && unreadMailboxCount > 0 && (
            <button
              type="button"
              onClick={markAllMailboxRead}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Marcar lidas
            </button>
          )}
        </div>
      </div>

      {!bannerDismissed &&
        (browserNotifPermission === 'default' ||
          (browserNotifPermission === 'granted' && !browserNotifEnabled)) && (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-900 dark:text-zinc-100">
                  {browserNotifPermission === 'default'
                    ? 'Ative os alertas nativos do navegador'
                    : 'Seus alertas nativos estão pausados'}
                </div>
                <div className="text-slate-500 dark:text-zinc-400 mt-0.5">
                  Receba um aviso instantâneo quando seu saque Pix for processado ou um novo código for liberado.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                disabled={requestingNotif}
                onClick={async () => {
                  if (browserNotifPermission === 'default') {
                    setRequestingNotif(true);
                    try {
                      await requestBrowserNotifications();
                    } finally {
                      setRequestingNotif(false);
                    }
                  } else {
                    setBrowserNotifEnabled(true);
                  }
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl transition-colors cursor-pointer"
              >
                {requestingNotif
                  ? 'Aguardando...'
                  : browserNotifPermission === 'default'
                  ? 'Ativar Alertas'
                  : 'Reativar Alertas'}
              </button>
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() => setBannerDismissed(true)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      {subTab === 'mailbox' ? (
        mailboxMessages.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              Sua Caixa de Correio está vazia por enquanto.
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Sempre que o administrador gerar um novo código de moedas ou evento especial, a mensagem chegará aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl divide-y divide-slate-100 dark:divide-zinc-800 overflow-hidden">
              {mailboxMessages.map((msg) => {
                const isSelected = activeMail?.messageId === msg.messageId;
                const isUnread = !readMailboxIds.includes(msg.messageId);
                const publishMs = timestampToMillis(msg.publishAt);
                const isScheduledPending = publishMs > nowMs;

                return (
                  <button
                    key={msg.messageId}
                    type="button"
                    onClick={() => {
                      setSelectedMail(msg);
                      setRedeemFeedback(null);
                      markMailboxRead(msg.messageId);
                    }}
                    className={`w-full text-left p-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-50 dark:bg-zinc-800/80'
                        : 'hover:bg-slate-50/60 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400 mb-1">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 shrink-0" />
                        )}
                        {isScheduledPending
                          ? `Libera em ${formatScheduleRemaining(publishMs, nowMs)}`
                          : 'Liberado no site'}
                      </span>
                      {msg.pointsValue > 0 && (
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                          +{formatPoints(msg.pointsValue)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100 line-clamp-1">
                      {msg.title}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                      {msg.body}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6">
              {activeMail && renderMailDetail(activeMail)}
            </div>
          </div>
        )
      ) : myNotifications.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-10 text-center space-y-2">
          <Mail className="w-8 h-8 text-slate-300 dark:text-zinc-600 mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
            Nenhum recibo transacional emitido ainda.
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Ao realizar sua primeira conversão diária ou solicitação de saque Pix, o comprovante aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl divide-y divide-slate-100 dark:divide-zinc-800 overflow-hidden">
            {myNotifications.map((item) => {
              const isSelected = activeReceipt?.notificationId === item.notificationId;
              return (
                <button
                  key={item.notificationId}
                  type="button"
                  onClick={() => setSelectedReceipt(item)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-zinc-800/80'
                      : 'hover:bg-slate-50/60 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400 mb-1">
                    <span className="font-mono truncate">{item.recipientEmail}</span>
                    <span className="shrink-0">
                      {item.deliveryStatus === 'sent_smtp'
                        ? 'SMTP Enviado'
                        : item.deliveryStatus === 'failed'
                          ? 'Falha SMTP'
                          : 'Comprovante Digital'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100 line-clamp-1">
                    {item.subject}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                    {item.summary}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6">
            {activeReceipt && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <MailCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                        {activeReceipt.subject}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                        Para: {activeReceipt.recipientEmail}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                      activeReceipt.deliveryStatus === 'failed'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {activeReceipt.deliveryStatus === 'sent_smtp'
                      ? 'Entregue via SMTP'
                      : activeReceipt.deliveryStatus === 'failed'
                        ? 'Falha SMTP'
                        : 'Registrado'}
                  </span>
                </div>

                <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 space-y-3 text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                  <p>{activeReceipt.summary}</p>
                  <div className="border-t border-slate-200 dark:border-zinc-800 pt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400">Tipo de Evento</span>
                      <div className="font-semibold text-slate-900 dark:text-zinc-100 mt-0.5">
                        {EMAIL_EVENT_LABELS[activeReceipt.eventType] || activeReceipt.eventType}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400">Código de Referência</span>
                      <div className="font-mono font-semibold text-slate-900 dark:text-zinc-100 mt-0.5">
                        {activeReceipt.referenceId}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
