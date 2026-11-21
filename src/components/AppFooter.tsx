import React from 'react';
import { Award, Lock, ShieldCheck } from 'lucide-react';

export const AppFooter: React.FC = React.memo(() => {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 pt-6 border-t border-slate-200/80 dark:border-zinc-800/80">
      <div className="rounded-3xl border border-slate-200/90 dark:border-zinc-800/90 bg-white/85 dark:bg-[#0e1319]/90 backdrop-blur-md px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
            <span>Earn Easy</span>
            <span aria-hidden="true" className="text-slate-400 dark:text-zinc-600">·</span>
            <span className="text-emerald-700 dark:text-lime-400 font-semibold">
              Plataforma de Recompensas & Jogos
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            © {year} Earn Easy · Desenvolvido por{' '}
            <strong className="text-slate-700 dark:text-zinc-200">by Earn Easy</strong> · Todos os direitos reservados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-emerald-200 dark:border-lime-500/30 bg-emerald-50/80 dark:bg-lime-500/10 text-emerald-800 dark:text-lime-300">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-lime-400" />
            <div className="leading-tight">
              <div className="text-[11px] font-extrabold whitespace-nowrap">
                Conexão Segura (SSL)
              </div>
              <div className="text-[10px] text-emerald-700/80 dark:text-lime-300/80 whitespace-nowrap flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 shrink-0" />
                Dados & Pix criptografados
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 text-[11px] font-bold whitespace-nowrap">
            <Award className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Selo Verificado</span>
          </div>
        </div>
      </div>
    </footer>
  );
});

AppFooter.displayName = 'AppFooter';
