import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Landmark,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdConsentState, adsenseService } from '../services/adsenseService';
import { formatBRL, formatPoints } from '../utils/pix';

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
    signInWithGoogle,
    browserNotifPermission,
    browserNotifEnabled,
    requestBrowserNotifications,
    setBrowserNotifEnabled,
    sendTestBrowserNotification,
  } = useAuth();

  const [notifRequesting, setNotifRequesting] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [adConsent, setAdConsent] = useState<AdConsentState>(() => adsenseService.getConsentState());

  React.useEffect(() => {
    return adsenseService.subscribeConsent(setAdConsent);
  }, []);

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

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-zinc-50">
          Configurações
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Escolha o tema visual do aplicativo, alertas do navegador e preferências de conta.
        </p>
      </div>

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
              Dados verificados via Firebase Authentication e Firestore
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

      {/* Privacy & Google AdSense Consent */}
      <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">
              Gerenciador de AdSense & Cookies
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Os scripts e tags do Google AdSense só são carregados após o seu consentimento nos cookies.
            </p>
          </div>
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        </div>

        <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-zinc-400">Preferência atual</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
              {adConsent.status === 'granted'
                ? adConsent.personalized
                  ? 'Permitido (Anúncios personalizados)'
                  : 'Permitido (Anúncios não personalizados)'
                : adConsent.status === 'denied'
                  ? 'Recusado (Scripts bloqueados)'
                  : 'Aguardando escolha (Scripts bloqueados)'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => adsenseService.grantConsent(true)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                adConsent.status === 'granted' && adConsent.personalized
                  ? 'bg-emerald-600 text-white border-transparent'
                  : 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              Permitir Personalizados
            </button>
            <button
              type="button"
              onClick={() => adsenseService.grantConsent(false)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                adConsent.status === 'granted' && !adConsent.personalized
                  ? 'bg-emerald-600 text-white border-transparent'
                  : 'bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-200 border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              Não Personalizados
            </button>
            <button
              type="button"
              onClick={() => adsenseService.denyConsent()}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                adConsent.status === 'denied'
                  ? 'bg-slate-900 dark:bg-zinc-800 text-white border-transparent'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-300 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              Recusar Anúncios
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
