import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Landmark,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  PixKeyType,
  POINTS_PER_TEN_CENTS,
} from '../types/earneasy';
import { createHumanChallenge } from '../utils/antifraud';
import { formatBRL, formatPoints, getTodayUtcDate, validatePixKey } from '../utils/pix';
import { DailyCheckinCard } from './DailyCheckinCard';
import { WithdrawalHistory } from './WithdrawalHistory';

const PIX_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  email: 'E-mail',
  phone: 'Telefone (DDD)',
  random: 'Chave Aleatória (EVP)',
};

export const WalletSection: React.FC = () => {
  const {
    firebaseUser,
    userAccount,
    privateInfo,
    myConversions,
    withdrawalSettings,
    isFirstWithdrawalEligible,
    activeMinWithdrawalCents,
    signInWithGoogle,
    convertDailyPoints,
    requestPixWithdrawal,
    logFraudAttempt,
    logWithdrawalAttempt,
  } = useAuth();

  const [challenge, setChallenge] = useState(() => createHumanChallenge());
  const [challengeInput, setChallengeInput] = useState('');
  const [convertFeedback, setConvertFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [converting, setConverting] = useState(false);

  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf');
  const [pixKey, setPixKey] = useState('');
  const [withdrawAmountReais, setWithdrawAmountReais] = useState(() =>
    (activeMinWithdrawalCents / 100).toFixed(2)
  );
  const [amountEditedManually, setAmountEditedManually] = useState(false);
  const [saveDefaultPix, setSaveDefaultPix] = useState(true);
  const [pixChallenge, setPixChallenge] = useState(() => createHumanChallenge());
  const [pixChallengeInput, setPixChallengeInput] = useState('');
  const [withdrawFeedback, setWithdrawFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (!amountEditedManually) {
      setWithdrawAmountReais((activeMinWithdrawalCents / 100).toFixed(2));
    }
  }, [activeMinWithdrawalCents, amountEditedManually]);

  useEffect(() => {
    if (privateInfo && privateInfo.defaultPixKeyType !== 'none' && privateInfo.defaultPixKey && !pixKey) {
      setPixKeyType(privateInfo.defaultPixKeyType);
      setPixKey(privateInfo.defaultPixKey);
    }
  }, [privateInfo]);

  if (!firebaseUser || !userAccount) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Carteira & Saques Pix</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Faça login com sua conta Google para converter seus pontos diários em reais e solicitar seu primeiro saque Pix a partir de {formatBRL(withdrawalSettings.firstWithdrawalMinCents)}.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  const today = getTodayUtcDate();
  const alreadyConvertedToday = userAccount.lastConversionDate === today;
  const convertiblePoints = Math.floor(userAccount.pointsBalance / POINTS_PER_TEN_CENTS) * POINTS_PER_TEN_CENTS;
  const convertibleCents = (convertiblePoints / POINTS_PER_TEN_CENTS) * 10;

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setConvertFeedback(null);

    if (Number(challengeInput.trim()) !== challenge.answer) {
      await logFraudAttempt('bot_challenge_failed', 'low', 'Resposta incorreta no desafio humano de conversão diária.');
      setChallenge(createHumanChallenge());
      setChallengeInput('');
      setConvertFeedback({ type: 'err', msg: 'Verificação humana incorreta. Tente o novo cálculo.' });
      return;
    }

    setConverting(true);
    try {
      const res = await convertDailyPoints(convertiblePoints);
      setConvertFeedback({
        type: 'ok',
        msg: `Conversão concluída: +${formatBRL(res.brlCentsCredited)} creditados! E-mail de confirmação registrado (${res.emailStatus === 'sent_smtp' ? 'enviado via SMTP' : 'recibo salvo em Notificações'}).`,
      });
      setChallenge(createHumanChallenge());
      setChallengeInput('');
    } catch (err) {
      setConvertFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Erro ao converter pontos.',
      });
    } finally {
      setConverting(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawFeedback(null);

    const parsedReais = Number(withdrawAmountReais.replace(',', '.'));
    const rawAmountCents = Number.isNaN(parsedReais) ? 0 : Math.max(0, Math.round(parsedReais * 100));
    if (Number.isNaN(parsedReais) || rawAmountCents < activeMinWithdrawalCents) {
      void logWithdrawalAttempt({
        status: 'blocked_min_amount',
        amountCents: rawAmountCents,
        pixKeyType,
        pixKey,
        details: `Tentativa bloqueada: valor informado (${withdrawAmountReais || '0'}) abaixo do mínimo de ${formatBRL(activeMinWithdrawalCents)}.`,
      });
      setWithdrawFeedback({
        type: 'err',
        msg: `O valor mínimo para ${isFirstWithdrawalEligible ? 'o 1º saque' : 'saque'} via Pix é ${formatBRL(activeMinWithdrawalCents)}.`,
      });
      return;
    }
    if (rawAmountCents > userAccount.brlBalanceCents) {
      void logWithdrawalAttempt({
        status: 'blocked_insufficient_balance',
        amountCents: rawAmountCents,
        pixKeyType,
        pixKey,
        details: `Tentativa bloqueada por saldo insuficiente (${formatBRL(userAccount.brlBalanceCents)} disponível vs ${formatBRL(rawAmountCents)} solicitado).`,
      });
      setWithdrawFeedback({ type: 'err', msg: 'Saldo em reais insuficiente para o valor informado.' });
      return;
    }

    const pixCheck = validatePixKey(pixKeyType, pixKey);
    if (!pixCheck.valid) {
      void logWithdrawalAttempt({
        status: 'blocked_invalid_pix',
        amountCents: rawAmountCents,
        pixKeyType,
        pixKey,
        details: `Tentativa bloqueada: chave Pix inválida (${pixKeyType}). ${pixCheck.message || ''}`.trim(),
      });
      setWithdrawFeedback({ type: 'err', msg: pixCheck.message || 'Chave Pix inválida.' });
      return;
    }

    if (Number(pixChallengeInput.trim()) !== pixChallenge.answer) {
      await logFraudAttempt('bot_challenge_failed', 'medium', 'Falha na verificação humana ao solicitar saque Pix.');
      void logWithdrawalAttempt({
        status: 'blocked_captcha',
        amountCents: rawAmountCents,
        pixKeyType,
        pixKey: pixCheck.normalized,
        details: `Falha no desafio humano antifraude ao tentar sacar ${formatBRL(rawAmountCents)}.`,
      });
      setPixChallenge(createHumanChallenge());
      setPixChallengeInput('');
      setWithdrawFeedback({ type: 'err', msg: 'Verificação antifraude incorreta. Resolva o novo cálculo.' });
      return;
    }

    const amountCents = rawAmountCents;

    setWithdrawing(true);
    try {
      const res = await requestPixWithdrawal({
        amountCents,
        pixKeyType,
        pixKey: pixCheck.normalized,
        saveAsDefault: saveDefaultPix,
      });
      setWithdrawFeedback({
        type: 'ok',
        msg: `Saque Pix ${res.withdrawalId} solicitado com sucesso! Confirmação enviada para ${privateInfo?.email || firebaseUser.email}.`,
      });
      setPixChallenge(createHumanChallenge());
      setPixChallengeInput('');
    } catch (err) {
      setWithdrawFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Erro ao solicitar saque Pix.',
      });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-8">
      <DailyCheckinCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Daily Conversion */}
        <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">Conversão Diária de Pontos</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Taxa fixa: 1.000 pontos = R$ 0,10 · Limite de 1 conversão por dia
              </p>
            </div>
            <ArrowRightLeft className="w-5 h-5 text-slate-400 dark:text-zinc-500 shrink-0" />
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Seus Pontos</div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatPoints(userAccount.pointsBalance)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Convertível Agora</div>
              <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {formatBRL(convertibleCents)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono tabular-nums">
                ({formatPoints(convertiblePoints)} pts)
              </div>
            </div>
          </div>

          <form onSubmit={handleConvert} className="space-y-4">
            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 space-y-2">
              <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Verificação Humana Antifraude: {challenge.question}
              </label>
              <input
                type="number"
                required
                value={challengeInput}
                onChange={(e) => setChallengeInput(e.target.value)}
                placeholder="Digite o resultado"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            {convertFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  convertFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}
              >
                {convertFeedback.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{convertFeedback.msg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={converting || alreadyConvertedToday || convertiblePoints < 1000 || userAccount.status !== 'active'}
              className="w-full py-2.5 px-4 bg-slate-900 dark:bg-zinc-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-zinc-700 border border-transparent dark:border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {converting
                ? 'Processando conversão...'
                : alreadyConvertedToday
                  ? 'Conversão diária já realizada hoje'
                  : convertiblePoints < 1000
                    ? 'Acumule pelo menos 1.000 pontos'
                    : `Converter ${formatPoints(convertiblePoints)} pts em ${formatBRL(convertibleCents)}`}
            </button>
          </form>
        </section>

        {/* Card 2: Pix Withdrawal */}
        <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">Solicitar Saque via Pix</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {isFirstWithdrawalEligible
                  ? `1º saque promocional liberado a partir de ${formatBRL(activeMinWithdrawalCents)} (próximos saques: ${formatBRL(withdrawalSettings.standardWithdrawalMinCents)})`
                  : `Mínimo atual: ${formatBRL(activeMinWithdrawalCents)} · Transferência processada via painel administrativo`}
              </p>
            </div>
            <Landmark className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/80 rounded-lg p-4">
            <div>
              <div className="text-xs text-emerald-800 dark:text-emerald-300">Saldo disponível para saque</div>
              <div className="text-2xl font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                {formatBRL(userAccount.brlBalanceCents)}
              </div>
            </div>
            <div className="text-right text-xs text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">
              Total já sacado
              <div className="font-bold">{formatBRL(userAccount.totalWithdrawnCents)}</div>
            </div>
          </div>

          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Valores rápidos disponíveis
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(
                  new Set([
                    activeMinWithdrawalCents,
                    ...withdrawalSettings.quickAmountsCents.filter((v) => v >= activeMinWithdrawalCents),
                  ])
                )
                  .sort((a, b) => a - b)
                  .map((cents) => {
                    const selected =
                      Math.round(Number(withdrawAmountReais.replace(',', '.')) * 100) === cents;
                    const disabled = userAccount.brlBalanceCents < cents;
                    return (
                      <button
                        key={cents}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setAmountEditedManually(true);
                          setWithdrawAmountReais((cents / 100).toFixed(2));
                        }}
                        className={`px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                          selected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200 border-slate-200 dark:border-zinc-800 hover:border-emerald-400'
                        }`}
                      >
                        {formatBRL(cents)}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Tipo de Chave Pix</label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
                >
                  {(Object.keys(PIX_TYPE_LABELS) as PixKeyType[]).map((k) => (
                    <option key={k} value={k}>
                      {PIX_TYPE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Valor do Saque (R$)</label>
                <input
                  type="text"
                  required
                  value={withdrawAmountReais}
                  onChange={(e) => {
                    setAmountEditedManually(true);
                    setWithdrawAmountReais(e.target.value);
                  }}
                  placeholder={(activeMinWithdrawalCents / 100).toFixed(2)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">Chave Pix</label>
              <input
                type="text"
                required
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder={
                  pixKeyType === 'cpf'
                    ? '000.000.000-00'
                    : pixKeyType === 'email'
                      ? 'seuemail@dominio.com'
                      : pixKeyType === 'phone'
                        ? '(11) 99999-9999'
                        : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
                }
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={saveDefaultPix}
                onChange={(e) => setSaveDefaultPix(e.target.checked)}
                className="rounded border-slate-300 dark:border-zinc-700"
              />
              Salvar esta chave Pix no meu perfil seguro
            </label>

            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-3 space-y-1.5">
              <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Confirmação Antifraude: {pixChallenge.question}
              </label>
              <input
                type="number"
                required
                value={pixChallengeInput}
                onChange={(e) => setPixChallengeInput(e.target.value)}
                placeholder="Digite o resultado"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500"
              />
            </div>

            {withdrawFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  withdrawFeedback.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}
              >
                {withdrawFeedback.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{withdrawFeedback.msg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={withdrawing || userAccount.brlBalanceCents < activeMinWithdrawalCents || userAccount.status !== 'active'}
              className="w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {withdrawing
                ? 'Registrando saque Pix...'
                : userAccount.brlBalanceCents < activeMinWithdrawalCents
                  ? `Saldo mínimo de ${formatBRL(activeMinWithdrawalCents)} não atingido`
                  : 'Solicitar Saque via Pix'}
            </button>
          </form>
        </section>
      </div>

      {/* History Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50 mb-4">Histórico de Conversões</h3>
          {myConversions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-zinc-400 py-6 text-center">Nenhuma conversão diária realizada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                    <th className="py-2 font-medium">Data</th>
                    <th className="py-2 font-medium text-right">Pontos</th>
                    <th className="py-2 font-medium text-right">Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {myConversions.slice(0, 10).map((c) => (
                    <tr key={c.conversionId} className="h-10">
                      <td className="py-2 font-mono tabular-nums text-slate-700 dark:text-zinc-300">{c.conversionDate}</td>
                      <td className="py-2 font-mono tabular-nums text-right text-slate-900 dark:text-zinc-100">
                        {formatPoints(c.pointsConverted)} pts
                      </td>
                      <td className="py-2 font-mono tabular-nums text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        +{formatBRL(c.brlCentsCredited)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <WithdrawalHistory />
      </div>
    </div>
  );
};
