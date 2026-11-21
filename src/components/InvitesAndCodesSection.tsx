import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  Link2,
  Mail,
  Send,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { REFERRAL_SIGNUP_BONUS_POINTS } from '../types/earneasy';
import {
  extractReadableError,
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  timestampToMillis,
} from '../utils/pix';

export const InvitesAndCodesSection: React.FC = () => {
  const { showToast } = useToast();
  const {
    userAccount,
    myReferral,
    myInvitedReferrals,
    publicPromoEvents,
    myPromoRedemptions,
    redeemPromoCode,
    sendInviteEmail,
  } = useAuth();

  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRefCode, setCopiedRefCode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!userAccount) return null;

  const publishedEvents = publicPromoEvents.filter(
    (ev) => timestampToMillis(ev.publishAt) <= nowMs
  );
  const upcomingEvents = publicPromoEvents
    .filter((ev) => timestampToMillis(ev.publishAt) > nowMs)
    .sort((a, b) => timestampToMillis(a.publishAt) - timestampToMillis(b.publishAt));

  const inviteOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://earn-easy-z6eg.onrender.com';
  const inviteLink = `${inviteOrigin}/?ref=${userAccount.uid}`;

  const totalSignupBonusPts = myInvitedReferrals.reduce(
    (sum, r) => sum + (r.signupBonusPoints || REFERRAL_SIGNUP_BONUS_POINTS),
    0
  );
  const totalCommissionPts = myInvitedReferrals.reduce(
    (sum, r) => sum + (r.totalCommissionPointsEarned || 0),
    0
  );
  const redeemedCodesSet = new Set(myPromoRedemptions.map((r) => r.code));

  const handleCopy = async (value: string, kind: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedRefCode(true);
        setTimeout(() => setCopiedRefCode(false), 2000);
      }
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleRedeem = async (rawCode: string) => {
    setRedeemFeedback(null);
    setRedeeming(true);
    try {
      const res = await redeemPromoCode(rawCode);
      const msg = `Código ${res.code} resgatado! "${res.title}" creditou +${formatPoints(res.pointsAwarded)} pontos no seu saldo.`;
      setRedeemFeedback({ type: 'success', text: msg });
      showToast({ type: 'success', title: 'Código resgatado!', message: msg });
      setCodeInput('');
    } catch (err) {
      const msg = extractReadableError(err, 'Não foi possível resgatar este código.');
      setRedeemFeedback({ type: 'error', text: msg });
      showToast({ type: 'error', title: 'Erro no código', message: msg });
    } finally {
      setRedeeming(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) return;
    await handleRedeem(codeInput);
  };

  const handleSendInviteEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteFeedback(null);
    setSendingInvite(true);
    try {
      const result = await sendInviteEmail(inviteEmail, inviteMessage);
      const deliveryDesc =
        result.deliveryStatus === 'sent_smtp'
          ? `Convite enviado por e-mail via SMTP para ${inviteEmail.trim().toLowerCase()}!`
          : result.deliveryStatus === 'failed'
            ? `Não foi possível entregar via SMTP para ${inviteEmail.trim().toLowerCase()} (registrado no histórico).`
            : `Convite registrado no histórico para ${inviteEmail.trim().toLowerCase()} (configure SMTP_HOST/USER/PASS no servidor para disparo externo).`;
      setInviteFeedback({
        type: result.deliveryStatus === 'failed' ? 'error' : 'success',
        text: deliveryDesc,
      });
      showToast({
        type: result.deliveryStatus === 'failed' ? 'error' : 'success',
        title: result.deliveryStatus === 'failed' ? 'Falha no envio SMTP' : 'Convite registrado!',
        message: deliveryDesc,
      });
      if (result.deliveryStatus !== 'failed') {
        setInviteEmail('');
        setInviteMessage('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível enviar o convite.';
      setInviteFeedback({ type: 'error', text: msg });
      showToast({ type: 'error', title: 'Erro ao enviar convite', message: msg });
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">
            Convites & Códigos Promocionais
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Ganhe 500 pontos imediatos + 12% por amigo convidado ou digite códigos de eventos enviados pelo administrador.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 tabular-nums">
          <Gift className="w-4 h-4 shrink-0" />
          Saldo atual: {formatPoints(userAccount.pointsBalance)} pts
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: REFERRAL PROGRAM (500 PTS + 12%) */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Users className="w-4 h-4" />
                Indique e Ganhe
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
                +500 pts no cadastro + 12% para sempre
              </h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                Cada amigo que criar conta pelo seu link rende{' '}
                <strong className="text-slate-900 dark:text-zinc-100">500 pontos na hora</strong> e{' '}
                <strong className="text-slate-900 dark:text-zinc-100">12% extras</strong> sobre toda pontuação que ele conquistar nos jogos e check-ins diários (sem descontar nada dele).
              </p>
            </div>
          </div>

          <div className="space-y-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1.5">
                Seu Link de Convite
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg min-w-0">
                  <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    onClick={(e) => e.currentTarget.select()}
                    className="w-full text-xs font-mono text-slate-800 dark:text-zinc-200 bg-transparent focus:outline-none truncate"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(inviteLink, 'link')}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? 'Link Copiado' : 'Copiar Link'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="text-slate-600 dark:text-zinc-400">
                Código direto de convite:{' '}
                <code className="font-mono font-semibold text-slate-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-800">
                  {userAccount.uid}
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(userAccount.uid, 'code')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {copiedRefCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedRefCode ? 'Código Copiado' : 'Copiar Código'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Amigos Convidados</div>
              <div className="text-xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {myInvitedReferrals.length}
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Bônus Cadastro</div>
              <div className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                +{formatPoints(totalSignupBonusPts)}
              </div>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Comissão 12%</div>
              <div className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                +{formatPoints(totalCommissionPts)}
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSendInviteEmail}
            className="space-y-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-zinc-100">
                <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Enviar Convite Automático por E-mail
              </div>
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                +500 pts quando cadastrar
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email-do-amigo@gmail.com"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <input
                type="text"
                maxLength={180}
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Mensagem opcional para seu amigo"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                Envia seu link direto e código por e-mail via SMTP.
              </span>
              <button
                type="submit"
                disabled={sendingInvite || !inviteEmail.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingInvite ? 'Enviando...' : 'Enviar Convite'}
              </button>
            </div>

            {inviteFeedback && (
              <div
                className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                  inviteFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                }`}
              >
                {inviteFeedback.text}
              </div>
            )}
          </form>

          {myReferral && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400">
              Você foi convidado para a plataforma e gera <span className="font-semibold text-emerald-700 dark:text-emerald-400">+12% extras</span> para quem te indicou sem nenhum desconto nos seus ganhos.
            </div>
          )}

          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wide">
              Amigos Indicados ({myInvitedReferrals.length})
            </h4>
            {myInvitedReferrals.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-zinc-400 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                Você ainda não convidou ninguém. Compartilhe seu link acima para começar a ganhar 500 pts + 12%!
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                {myInvitedReferrals.map((ref) => (
                  <div
                    key={ref.referralId}
                    className="px-4 py-3 flex items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-900"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-zinc-100">
                        {ref.invitedDisplayName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Bônus imediato: +{formatPoints(ref.signupBonusPoints)} pts · Comissão {ref.commissionRatePct}%
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="font-bold text-emerald-700 dark:text-emerald-400">
                        +{formatPoints(ref.totalCommissionPointsEarned)} pts
                      </div>
                      <div className="text-[10px] text-slate-400">em comissões</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: DIGITAR CÓDIGO & EVENTOS DO ADMIN */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <Ticket className="w-4 h-4" />
                Resgate de Código
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
                Digitar Código de Pontos
              </h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Digite um código promocional gerado pelo administrador para creditar pontos instantaneamente na sua conta.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Código do Evento
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={40}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="EX: EARN-BONUS500"
                  className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={redeeming || codeInput.trim().length < 3}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Ticket className="w-4 h-4" />
                {redeeming ? 'Resgatando código...' : 'Resgatar Código'}
              </button>
            </form>

            {redeemFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  redeemFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                }`}
              >
                {redeemFeedback.text}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                  Eventos de Código
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {publishedEvents.length} liberado(s)
              </span>
            </div>

            {publishedEvents.length === 0 && upcomingEvents.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 py-4 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                Nenhum evento público ativo no momento. Se você recebeu um código na Caixa de Correio ou do admin, digite-o acima.
              </p>
            ) : (
              <div className="space-y-3">
                {publishedEvents.map((ev) => {
                  const alreadyRedeemed = redeemedCodesSet.has(ev.code);
                  const soldOut = ev.redemptionCount >= ev.maxRedemptions;
                  const remaining = Math.max(0, ev.maxRedemptions - ev.redemptionCount);
                  return (
                    <div
                      key={ev.code}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                            {ev.title}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                            Código: <span className="font-semibold text-slate-800 dark:text-zinc-200">{ev.code}</span> · {remaining} vagas
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                          +{formatPoints(ev.pointsValue)} moedas
                        </span>
                      </div>

                      {alreadyRedeemed ? (
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Código já resgatado por você
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={redeeming || soldOut}
                          onClick={() => handleRedeem(ev.code)}
                          className="w-full py-1.5 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
                        >
                          {soldOut ? 'Limite Esgotado' : `Resgatar ${ev.code}`}
                        </button>
                      )}
                    </div>
                  );
                })}

                {upcomingEvents.map((ev) => {
                  const publishMs = timestampToMillis(ev.publishAt);
                  return (
                    <div
                      key={ev.code}
                      className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-snug break-words">
                            Programado: {ev.title}
                          </div>
                          <div className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
                            Liberação às {formatScheduleTime(publishMs)} (falta{' '}
                            {formatScheduleRemaining(publishMs, nowMs)})
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0 tabular-nums">
                        +{formatPoints(ev.pointsValue)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {myPromoRedemptions.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Códigos Resgatados ({myPromoRedemptions.length})
                </div>
                <div className="space-y-1.5">
                  {myPromoRedemptions.map((r) => (
                    <div
                      key={r.redemptionId}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800"
                    >
                      <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                        {r.code}
                      </span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        +{formatPoints(r.pointsAwarded)} moedas
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
