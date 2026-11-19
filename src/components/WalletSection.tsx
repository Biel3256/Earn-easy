import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Landmark,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  MIN_PIX_WITHDRAWAL_CENTS,
  PixKeyType,
  POINTS_PER_TEN_CENTS,
} from '../types/earneasy';
import { createHumanChallenge } from '../utils/antifraud';
import { formatBRL, formatPoints, getTodayUtcDate, validatePixKey } from '../utils/pix';

const PIX_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  email: 'E-mail',
  phone: 'Telefone (DDD)',
  random: 'Chave Aleatória (EVP)',
};

const WITHDRAWAL_STATUS_UI: Record<
  string,
  { label: string; colorClass: string; Icon: React.FC<{ className?: string }> }
> = {
  pending: { label: 'Em análise', colorClass: 'text-amber-700', Icon: Clock },
  approved: { label: 'Aprovado', colorClass: 'text-sky-700', Icon: CheckCircle2 },
  paid: { label: 'Pago via Pix', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  rejected: { label: 'Recusado / Estornado', colorClass: 'text-red-700', Icon: XCircle },
};

export const WalletSection: React.FC = () => {
  const {
    firebaseUser,
    userAccount,
    privateInfo,
    myConversions,
    myWithdrawals,
    signInWithGoogle,
    convertDailyPoints,
    requestPixWithdrawal,
    logFraudAttempt,
  } = useAuth();

  const [challenge, setChallenge] = useState(() => createHumanChallenge());
  const [challengeInput, setChallengeInput] = useState('');
  const [convertFeedback, setConvertFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [converting, setConverting] = useState(false);

  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf');
  const [pixKey, setPixKey] = useState('');
  const [withdrawAmountReais, setWithdrawAmountReais] = useState('5.00');
  const [saveDefaultPix, setSaveDefaultPix] = useState(true);
  const [pixChallenge, setPixChallenge] = useState(() => createHumanChallenge());
  const [pixChallengeInput, setPixChallengeInput] = useState('');
  const [withdrawFeedback, setWithdrawFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (privateInfo && privateInfo.defaultPixKeyType !== 'none' && privateInfo.defaultPixKey && !pixKey) {
      setPixKeyType(privateInfo.defaultPixKeyType);
      setPixKey(privateInfo.defaultPixKey);
    }
  }, [privateInfo]);

  if (!firebaseUser || !userAccount) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Carteira & Saques Pix</h2>
        <p className="text-sm text-slate-600">
          Faça login com sua conta Google para converter seus pontos diários em reais e solicitar saques via Pix a partir de R$ 5,00.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
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
    const amountCents = Math.round(parsedReais * 100);
    if (Number.isNaN(amountCents) || amountCents < MIN_PIX_WITHDRAWAL_CENTS) {
      setWithdrawFeedback({ type: 'err', msg: 'O valor mínimo para saque via Pix é R$ 5,00.' });
      return;
    }
    if (amountCents > userAccount.brlBalanceCents) {
      setWithdrawFeedback({ type: 'err', msg: 'Saldo em reais insuficiente para o valor informado.' });
      return;
    }

    const pixCheck = validatePixKey(pixKeyType, pixKey);
    if (!pixCheck.valid) {
      setWithdrawFeedback({ type: 'err', msg: pixCheck.message || 'Chave Pix inválida.' });
      return;
    }

    if (Number(pixChallengeInput.trim()) !== pixChallenge.answer) {
      await logFraudAttempt('bot_challenge_failed', 'medium', 'Falha na verificação humana ao solicitar saque Pix.');
      setPixChallenge(createHumanChallenge());
      setPixChallengeInput('');
      setWithdrawFeedback({ type: 'err', msg: 'Verificação antifraude incorreta. Resolva o novo cálculo.' });
      return;
    }

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Daily Conversion */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Conversão Diária de Pontos</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Taxa fixa: 1.000 pontos = R$ 0,10 · Limite de 1 conversão por dia
              </p>
            </div>
            <ArrowRightLeft className="w-5 h-5 text-slate-400 shrink-0" />
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div>
              <div className="text-xs text-slate-500">Seus Pontos</div>
              <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                {formatPoints(userAccount.pointsBalance)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Convertível Agora</div>
              <div className="text-2xl font-mono font-bold text-emerald-600 tabular-nums mt-0.5">
                {formatBRL(convertibleCents)}
              </div>
              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                ({formatPoints(convertiblePoints)} pts)
              </div>
            </div>
          </div>

          <form onSubmit={handleConvert} className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Verificação Humana Antifraude: {challenge.question}
              </label>
              <input
                type="number"
                required
                value={challengeInput}
                onChange={(e) => setChallengeInput(e.target.value)}
                placeholder="Digite o resultado"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {convertFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  convertFeedback.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
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
              className="w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Solicitar Saque via Pix</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Mínimo R$ 5,00 · Transferência processada via painel administrativo
              </p>
            </div>
            <Landmark className="w-5 h-5 text-emerald-600 shrink-0" />
          </div>

          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div>
              <div className="text-xs text-emerald-800">Saldo disponível para saque</div>
              <div className="text-2xl font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
                {formatBRL(userAccount.brlBalanceCents)}
              </div>
            </div>
            <div className="text-right text-xs text-emerald-800 font-mono tabular-nums">
              Total já sacado
              <div className="font-bold">{formatBRL(userAccount.totalWithdrawnCents)}</div>
            </div>
          </div>

          <form onSubmit={handleWithdraw} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Chave Pix</label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {(Object.keys(PIX_TYPE_LABELS) as PixKeyType[]).map((k) => (
                    <option key={k} value={k}>
                      {PIX_TYPE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Valor do Saque (R$)</label>
                <input
                  type="text"
                  required
                  value={withdrawAmountReais}
                  onChange={(e) => setWithdrawAmountReais(e.target.value)}
                  placeholder="5.00"
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Chave Pix</label>
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
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={saveDefaultPix}
                onChange={(e) => setSaveDefaultPix(e.target.checked)}
                className="rounded border-slate-300"
              />
              Salvar esta chave Pix no meu perfil seguro
            </label>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Confirmação Antifraude: {pixChallenge.question}
              </label>
              <input
                type="number"
                required
                value={pixChallengeInput}
                onChange={(e) => setPixChallengeInput(e.target.value)}
                placeholder="Digite o resultado"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {withdrawFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  withdrawFeedback.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
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
              disabled={withdrawing || userAccount.brlBalanceCents < MIN_PIX_WITHDRAWAL_CENTS || userAccount.status !== 'active'}
              className="w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {withdrawing
                ? 'Registrando saque Pix...'
                : userAccount.brlBalanceCents < MIN_PIX_WITHDRAWAL_CENTS
                  ? 'Saldo mínimo de R$ 5,00 não atingido'
                  : 'Solicitar Saque via Pix'}
            </button>
          </form>
        </section>
      </div>

      {/* History Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Histórico de Conversões</h3>
          {myConversions.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Nenhuma conversão diária realizada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 font-medium">Data</th>
                    <th className="py-2 font-medium text-right">Pontos</th>
                    <th className="py-2 font-medium text-right">Crédito</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myConversions.slice(0, 10).map((c) => (
                    <tr key={c.conversionId} className="h-10">
                      <td className="py-2 font-mono tabular-nums text-slate-700">{c.conversionDate}</td>
                      <td className="py-2 font-mono tabular-nums text-right text-slate-900">
                        {formatPoints(c.pointsConverted)} pts
                      </td>
                      <td className="py-2 font-mono tabular-nums text-right font-semibold text-emerald-700">
                        +{formatBRL(c.brlCentsCredited)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4">Solicitações de Saque Pix</h3>
          {myWithdrawals.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Nenhum saque Pix solicitado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 font-medium">Data</th>
                    <th className="py-2 font-medium">Chave Pix</th>
                    <th className="py-2 font-medium text-right">Valor</th>
                    <th className="py-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myWithdrawals.slice(0, 10).map((w) => {
                    const st = WITHDRAWAL_STATUS_UI[w.status] || WITHDRAWAL_STATUS_UI.pending;
                    const StatusIcon = st.Icon;
                    return (
                      <tr key={w.withdrawalId} className="h-10">
                        <td className="py-2 font-mono tabular-nums text-slate-700">{w.requestedDate}</td>
                        <td className="py-2 font-mono text-slate-700 truncate max-w-[140px]">{w.pixKey}</td>
                        <td className="py-2 font-mono tabular-nums text-right font-semibold text-slate-900">
                          {formatBRL(w.amountCents)}
                        </td>
                        <td className="py-2 text-right">
                          <span className={`inline-flex items-center gap-1 font-medium ${st.colorClass}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
