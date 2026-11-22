import React, { useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  FileCheck2,
  Landmark,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  VERIFICATION_DOCUMENT_LABELS,
  formatBirthDateBr,
  formatCpfMask,
  isValidBirthDateStr,
  isValidCPF,
  maskCpfForAdminDisplay,
} from '../utils/cpf';
import { VerificationDocumentType } from '../types/earneasy';
import { extractReadableError, formatBRL, formatPoints } from '../utils/pix';
import { VerifiedBadge, resolveVerifiedBadgeTier } from './VerifiedBadge';

export type AppTheme = 'light' | 'dark';

interface SettingsSectionProps {
  theme: AppTheme;
  onChangeTheme: (next: AppTheme) => void;
  onNavigateProfile: () => void;
  onNavigateWallet: () => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  theme,
  onChangeTheme,
  onNavigateProfile,
  onNavigateWallet,
}) => {
  const {
    firebaseUser,
    userAccount,
    privateInfo,
    myVerificationRequest,
    signInWithGoogle,
    browserNotifPermission,
    browserNotifEnabled,
    requestBrowserNotifications,
    setBrowserNotifEnabled,
    sendTestBrowserNotification,
    submitVerificationRequest,
  } = useAuth();

  const [notifRequesting, setNotifRequesting] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  // Blue Verified Request Form State
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [documentType, setDocumentType] = useState<VerificationDocumentType>('rg');
  const [documentNumber, setDocumentNumber] = useState('');
  const [submittingBlue, setSubmittingBlue] = useState(false);
  const [blueFeedback, setBlueFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleRequestNotifications = async () => {
    setNotifFeedback(null);
    setNotifRequesting(true);
    try {
      const result = await requestBrowserNotifications();
      if (result === 'granted') {
        setNotifFeedback({
          type: 'success',
          text: 'Permissão concedida! Você receberá alertas nativos de Pix e novos códigos.',
        });
      } else if (result === 'denied') {
        setNotifFeedback({
          type: 'error',
          text: 'Permissão bloqueada pelo navegador. Libere as notificações nas configurações do site.',
        });
      } else {
        setNotifFeedback({
          type: 'info',
          text: 'Solicitação fechada sem alteração de permissão.',
        });
      }
    } finally {
      setNotifRequesting(false);
    }
  };

  const handleToggleEnabled = () => {
    const next = !browserNotifEnabled;
    setBrowserNotifEnabled(next);
    setNotifFeedback({
      type: next ? 'success' : 'info',
      text: next
        ? 'Alertas nativos reativados neste dispositivo.'
        : 'Alertas nativos pausados. Você pode reativar quando quiser.',
    });
  };

  const handleTestNotification = () => {
    const sent = sendTestBrowserNotification();
    setNotifFeedback(
      sent
        ? {
            type: 'success',
            text: 'Notificação de teste enviada para o sistema.',
          }
        : {
            type: 'error',
            text: 'Não foi possível exibir a notificação de teste. Verifique se as notificações estão permitidas e ativas.',
          }
    );
  };

  const getNotifStatusLabel = () => {
    if (browserNotifPermission === 'unsupported') return 'Indisponível neste navegador';
    if (browserNotifPermission === 'denied') return 'Bloqueadas no navegador';
    if (browserNotifPermission === 'default') return 'Aguardando ativação';
    return browserNotifEnabled ? 'Ativas neste navegador' : 'Pausadas pelo usuário';
  };

  const handleSubmitBlueVerified = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlueFeedback(null);

    if (fullName.trim().length < 5) {
      setBlueFeedback({ type: 'error', text: 'Informe seu nome completo (mínimo 5 caracteres).' });
      return;
    }
    if (!isValidCPF(cpf)) {
      setBlueFeedback({ type: 'error', text: 'O CPF informado é inválido. Confira os dígitos e tente novamente.' });
      return;
    }
    if (!isValidBirthDateStr(birthDate)) {
      setBlueFeedback({ type: 'error', text: 'Informe uma data de nascimento válida.' });
      return;
    }
    if (documentNumber.trim().length < 4) {
      setBlueFeedback({ type: 'error', text: 'Informe o número do documento selecionado.' });
      return;
    }

    setSubmittingBlue(true);
    try {
      await submitVerificationRequest({
        fullName,
        cpf,
        birthDate,
        documentType,
        documentNumber,
      });
      setBlueFeedback({
        type: 'success',
        text: 'Solicitação de Verificado Azul enviada para análise! Assim que for aprovada, o selo azul aparecerá no seu perfil.',
      });
    } catch (err) {
      setBlueFeedback({
        type: 'error',
        text: extractReadableError(err, 'Não foi possível enviar sua solicitação para análise agora.'),
      });
    } finally {
      setSubmittingBlue(false);
    }
  };

  const resolvedBadgeTier = resolveVerifiedBadgeTier(
    userAccount?.verifiedBadge,
    userAccount?.identityVerified
  );
  const verifStatus =
    resolvedBadgeTier !== 'none'
      ? 'approved'
      : myVerificationRequest?.status || userAccount?.verificationStatus || 'none';
  const rejectionReason =
    myVerificationRequest?.rejectionReason || userAccount?.verificationNote || '';

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-zinc-50">
          Configurações
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Escolha o tema visual do aplicativo, solicite o selo Verificado Azul, alertas e preferências da conta.
        </p>
      </div>

      {/* Blue Verified Request Section */}
      <section
        id="verified-blue-section"
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
              {resolvedBadgeTier === 'owner' ? (
                <Crown className="w-5 h-5 text-amber-500" />
              ) : (
                <BadgeCheck className="w-5 h-5 text-sky-500" />
              )}
              {resolvedBadgeTier === 'owner'
                ? 'Selo Exclusivo de Dono Oficial'
                : 'Solicitar Verificado Azul'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {resolvedBadgeTier === 'owner'
                ? 'Sua conta possui o selo dourado exclusivo de Dono Oficial ativo em todo o aplicativo.'
                : 'Envie seus dados cadastrais para análise e exiba o selo oficial Verificado Azul no seu perfil (sem bônus de pontos).'}
            </p>
          </div>
          {resolvedBadgeTier !== 'none' && (
            <VerifiedBadge
              tier={userAccount?.verifiedBadge}
              legacyVerified={userAccount?.identityVerified}
              showLabel
              size="md"
            />
          )}
        </div>

        {!firebaseUser || !userAccount ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              Conecte sua conta Google para enviar um pedido de Verificado Azul.
            </p>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Entrar com Google
            </button>
          </div>
        ) : resolvedBadgeTier === 'owner' ? (
          <div className="rounded-xl border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
            <Crown className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <div className="font-extrabold">Selo Dono Oficial Verificado Real Ativo</div>
              <p className="opacity-85 mt-0.5">
                Sua conta administrativa principal exibe a coroa dourada exclusiva de Dono no Ranking, Amigos, Salas Online e Perfil.
              </p>
            </div>
          </div>
        ) : resolvedBadgeTier === 'blue' ? (
          <div className="rounded-xl border border-sky-400/50 bg-sky-50/70 dark:bg-sky-950/25 p-4 flex items-center gap-3 text-xs text-sky-900 dark:text-sky-200">
            <BadgeCheck className="w-5 h-5 text-sky-500 shrink-0" />
            <div>
              <div className="font-extrabold">Verificado Azul Ativo!</div>
              <p className="opacity-85 mt-0.5">
                Seu perfil exibe o selo oficial Verificado Azul em todo o Earn Easy. Seus dados enviados ficam protegidos em sigilo.
              </p>
            </div>
          </div>
        ) : verifStatus === 'pending' ? (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-2 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2 font-extrabold">
              <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              Solicitação em análise
            </div>
            <p className="leading-relaxed">
              Seu pedido de Verificado Azul foi enviado para análise. Assim que nossa equipe confirmar os dados, o selo azul será ativado no seu perfil.
            </p>
            {myVerificationRequest && (
              <div className="pt-2 border-t border-amber-200/70 dark:border-amber-800/60 grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px]">
                <div>Nome: {myVerificationRequest.fullName}</div>
                <div>CPF: {maskCpfForAdminDisplay(myVerificationRequest.cpf)}</div>
                <div>Nascimento: {formatBirthDateBr(myVerificationRequest.birthDate)}</div>
                <div>
                  Documento: {VERIFICATION_DOCUMENT_LABELS[myVerificationRequest.documentType]}
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmitBlueVerified} className="space-y-4">
            {verifStatus === 'rejected' && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 space-y-1">
                <div className="font-bold">Sua solicitação anterior foi recusada na análise.</div>
                {rejectionReason && (
                  <div>
                    <strong>Motivo:</strong> {rejectionReason}
                  </div>
                )}
                <div className="opacity-85">Corrija seus dados abaixo e envie novamente para análise.</div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: Maria Clara Oliveira Santos"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={14}
                  value={cpf}
                  onChange={(e) => setCpf(formatCpfMask(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {cpf.length >= 14 && (
                  <p
                    className={`mt-1 text-[11px] font-semibold ${
                      isValidCPF(cpf)
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {isValidCPF(cpf) ? 'CPF válido' : 'CPF inválido — confira os dígitos'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Data de Nascimento <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  min="1905-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Tipo de Documento <span className="text-red-500">*</span>
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as VerificationDocumentType)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="rg">RG (Identidade)</option>
                  <option value="cnh">CNH (Habilitação)</option>
                  <option value="passaporte">Passaporte</option>
                  <option value="outro">Outro Documento Oficial</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Número do Documento <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={40}
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="Ex: 12.345.678-9"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            {blueFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  blueFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                }`}
              >
                {blueFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{blueFeedback.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Seus documentos ficam privados no servidor apenas para validação do selo azul.
              </p>
              <button
                type="submit"
                disabled={submittingBlue}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-colors cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4" />
                {submittingBlue ? 'Enviando para análise...' : 'Enviar para Análise'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Appearance & Black Theme Selector */}
      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">
            Aparência & Tema
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            A preferência de tema é salva automaticamente no seu navegador.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onChangeTheme('light')}
            className={`text-left p-5 rounded-xl border transition-colors cursor-pointer space-y-3 ${
              theme === 'light'
                ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30'
                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 flex items-center justify-center">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    Tema Claro
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">
                    Fundo claro de alta legibilidade
                  </div>
                </div>
              </div>
              {theme === 'light' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="w-4 h-4" />
                  Ativo
                </span>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="w-24 h-2 rounded bg-slate-900" />
                <div className="w-16 h-1.5 rounded bg-slate-400" />
              </div>
              <div className="w-10 h-5 rounded bg-emerald-600" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangeTheme('dark')}
            className={`text-left p-5 rounded-xl border transition-colors cursor-pointer space-y-3 ${
              theme === 'dark'
                ? 'border-emerald-500 bg-emerald-950/25'
                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-slate-300 dark:hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-black border border-zinc-700 text-zinc-100 flex items-center justify-center">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    Tema Preto
                  </div>
                  <div className="text-xs text-slate-500 dark:text-zinc-400">
                    Preto absoluto AMOLED e baixo brilho
                  </div>
                </div>
              </div>
              {theme === 'dark' && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="w-4 h-4" />
                  Ativo
                </span>
              )}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-black p-3 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="w-24 h-2 rounded bg-zinc-100" />
                <div className="w-16 h-1.5 rounded bg-zinc-500" />
              </div>
              <div className="w-10 h-5 rounded bg-emerald-500" />
            </div>
          </button>
        </div>
      </section>

      {/* Browser Native Notifications */}
      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">
              Notificações Nativas do Navegador
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Receba alertas na tela mesmo quando estiver em outra aba.
            </p>
          </div>
          {browserNotifPermission === 'granted' && browserNotifEnabled ? (
            <BellRing className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : browserNotifPermission === 'denied' || browserNotifPermission === 'unsupported' ? (
            <BellOff className="w-5 h-5 text-slate-400 dark:text-zinc-500 shrink-0" />
          ) : (
            <Bell className="w-5 h-5 text-slate-600 dark:text-zinc-300 shrink-0" />
          )}
        </div>

        <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs text-slate-500 dark:text-zinc-400">Status atual</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                {getNotifStatusLabel()}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {browserNotifPermission === 'default' && (
                <button
                  type="button"
                  disabled={notifRequesting}
                  onClick={handleRequestNotifications}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  {notifRequesting ? 'Solicitando...' : 'Ativar Notificações'}
                </button>
              )}

              {browserNotifPermission === 'granted' && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleEnabled}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                      browserNotifEnabled
                        ? 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent'
                    }`}
                  >
                    {browserNotifEnabled ? (
                      <>
                        <BellOff className="w-3.5 h-3.5" />
                        Pausar Alertas
                      </>
                    ) : (
                      <>
                        <BellRing className="w-3.5 h-3.5" />
                        Reativar Alertas
                      </>
                    )}
                  </button>

                  {browserNotifEnabled && (
                    <button
                      type="button"
                      onClick={handleTestNotification}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-zinc-800 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-zinc-700 border border-transparent dark:border-zinc-700 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Testar Notificação
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-zinc-800 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-zinc-400">
            <div className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Alerta imediato quando um saque via Pix for aprovado, pago ou recusado.</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <span>Aviso automático quando um novo código de convite/moedas for liberado.</span>
            </div>
          </div>

          {browserNotifPermission === 'denied' && (
            <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/70 rounded-lg p-3">
              As notificações estão bloqueadas nas configurações do navegador. Para ativar, clique no ícone de cadeado ou configurações ao lado do endereço do site, altere &ldquo;Notificações&rdquo; para &ldquo;Permitir&rdquo; e recarregue ou retorne a esta aba.
            </div>
          )}

          {browserNotifPermission === 'unsupported' && (
            <div className="text-xs text-slate-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg p-3">
              Este navegador ou janela incorporada não oferece suporte à API nativa de Notificações Web. Você ainda acompanhará todos os avisos na Caixa de Correio.
            </div>
          )}

          {notifFeedback && (
            <div
              className={`text-xs rounded-lg p-3 border ${
                notifFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : notifFeedback.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
              }`}
            >
              {notifFeedback.text}
            </div>
          )}
        </div>
      </section>

      {/* Account & Shortcuts */}
      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">
              Conta & Segurança
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Dados protegidos e sincronizados com segurança no servidor
            </p>
          </div>
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        </div>

        {!firebaseUser || !userAccount ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              Conecte sua conta Google para gerenciar avatar, nível de jogador, check-in diário e chave Pix padrão.
            </p>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Entrar com Google
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 text-xs">
              <div>
                <div className="text-slate-500 dark:text-zinc-400">Conta Conectada</div>
                <div className="font-mono font-semibold text-slate-900 dark:text-zinc-100 mt-1 truncate">
                  {privateInfo?.email || firebaseUser.email}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-zinc-400">Saldo Atual</div>
                <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                  {formatBRL(userAccount.brlBalanceCents)} · {formatPoints(userAccount.pointsBalance)} pts
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-zinc-400">Status Antifraude</div>
                <div className="font-semibold text-slate-900 dark:text-zinc-100 mt-1">
                  {userAccount.status === 'active' ? 'Conta verificada e ativa' : userAccount.status}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onNavigateProfile}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-zinc-800 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-zinc-700 border border-transparent dark:border-zinc-700 transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Editar Perfil & Avatar
              </button>
              <button
                type="button"
                onClick={onNavigateWallet}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white dark:bg-zinc-950 text-slate-800 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <Landmark className="w-3.5 h-3.5" />
                Configurar Chave Pix
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
