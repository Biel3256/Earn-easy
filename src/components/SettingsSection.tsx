import React from 'react';
import { Check, Moon, ShieldCheck, Sun, UserCheck, Landmark } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
  const { firebaseUser, userAccount, privateInfo, signInWithGoogle } = useAuth();

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-zinc-50">
          Configurações
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          Escolha o tema visual do aplicativo e gerencie suas preferências de conta.
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
    </div>
  );
};
