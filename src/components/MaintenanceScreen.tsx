import React from 'react';
import { Clock, LogOut, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { MaintenanceSettings } from '../types/earneasy';
import { BrandLogo } from './BrandLogo';
import { ParticleBackdrop } from './ParticleBackdrop';
import { AppTheme } from './SettingsSection';

interface MaintenanceScreenProps {
  settings: MaintenanceSettings;
  theme: AppTheme;
  isAdmin: boolean;
  isSignedIn: boolean;
  onGoBackoffice: () => void;
  onRefresh: () => void;
  onLogout?: () => void;
  onSignInAdmin?: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  settings,
  theme,
  isAdmin,
  isSignedIn,
  onGoBackoffice,
  onRefresh,
  onLogout,
  onSignInAdmin,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      className={`relative min-h-screen flex flex-col justify-between transition-colors ${
        isDark ? 'dark bg-[#070a0d] text-zinc-100' : 'bg-[#f4f7f5] text-slate-900'
      }`}
    >
      <ParticleBackdrop theme={theme} />

      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 flex items-center justify-between gap-4">
        <BrandLogo />
        {isAdmin ? (
          <button
            type="button"
            onClick={onGoBackoffice}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 text-xs sm:text-sm font-extrabold shadow-lg shadow-lime-500/20 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            Entrar no Painel ADM
          </button>
        ) : (
          onSignInAdmin &&
          !isSignedIn && (
            <button
              type="button"
              onClick={onSignInAdmin}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Acesso Admin
            </button>
          )
        )}
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-xl bg-white/95 dark:bg-[#10141a]/95 backdrop-blur-xl border border-slate-200 dark:border-zinc-800/90 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-500 dark:text-lime-400">
            <Wrench className="w-8 h-8" />
          </div>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-bold">
              Manutenção Programada
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 dark:text-white leading-tight text-balance">
              {settings.title || 'Plataforma em Manutenção Programada'}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-zinc-300 leading-relaxed">
              {settings.message}
            </p>
          </div>

          {settings.estimatedReturn && (
            <div className="bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-center gap-3 text-left">
              <Clock className="w-5 h-5 text-emerald-600 dark:text-lime-400 shrink-0" />
              <div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                  Previsão de Retorno
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                  {settings.estimatedReturn}
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4 text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Seu saldo de moedas, saldo convertido em reais, histórico de saques Pix e sequência de check-in continuam 100% preservados durante a atualização.
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 text-sm font-extrabold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Verificar Novamente
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={onGoBackoffice}
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm font-bold transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Desativar Manutenção (ADM)
              </button>
            )}

            {isSignedIn && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-sm font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-5 px-4 text-center text-xs text-slate-500 dark:text-zinc-500">
        Earn Easy · Atualização segura em andamento
      </footer>
    </div>
  );
};
