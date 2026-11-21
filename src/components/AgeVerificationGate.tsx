import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  LogOut,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MIN_VERIFIED_AGE } from '../types/earneasy';
import { validateBirthDateInput } from '../utils/age';
import { BrandLogo } from './BrandLogo';
import { ParticleBackdrop } from './ParticleBackdrop';
import { AppTheme } from './SettingsSection';

interface AgeVerificationGateProps {
  theme: AppTheme;
  onChangeTheme: (next: AppTheme) => void;
}

export const AgeVerificationGate: React.FC<AgeVerificationGateProps> = ({
  theme,
  onChangeTheme,
}) => {
  const { firebaseUser, userAccount, verifyUserAge, logout } = useAuth();
  const { showToast } = useToast();

  const [birthDate, setBirthDate] = useState(userAccount?.birthDate || '');
  const [confirmedTruth, setConfirmedTruth] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isBlack = theme === 'dark';

  const maxAllowedDate = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const liveCheck = useMemo(() => {
    if (!birthDate) return null;
    return validateBirthDateInput(birthDate);
  }, [birthDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const check = validateBirthDateInput(birthDate);
    if (!check.valid || !check.isAdult) {
      const msg =
        check.error ||
        `Acesso permitido apenas para maiores de ${MIN_VERIFIED_AGE} anos.`;
      setErrorMsg(msg);
      showToast({ type: 'error', title: 'Verificação de Idade', message: msg });
      return;
    }

    if (!confirmedTruth) {
      const msg = 'Confirme a declaração de veracidade antes de continuar.';
      setErrorMsg(msg);
      return;
    }

    setSubmitting(true);
    try {
      await verifyUserAge(check.clean);
      showToast({
        type: 'success',
        title: 'Idade +18 verificada!',
        message: 'Acesso completo ao Earn Easy liberado. Aproveite os jogos!',
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível validar sua data de nascimento agora.';
      setErrorMsg(msg);
      showToast({ type: 'error', title: 'Erro na verificação', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`relative min-h-screen flex flex-col transition-colors ${
        isBlack ? 'dark bg-[#070a0d] text-zinc-100' : 'bg-[#f3f6f4] text-slate-900'
      }`}
    >
      <ParticleBackdrop theme={theme} />

      <header
        className={`relative z-20 border-b transition-colors ${
          isBlack
            ? 'bg-black/80 border-zinc-800/80 backdrop-blur-xl'
            : 'bg-white/80 border-slate-200/80 backdrop-blur-xl'
        }`}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <BrandLogo />
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onChangeTheme(isBlack ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {isBlack ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {isBlack ? 'Claro' : 'Escuro'}
            </button>
            {firebaseUser && (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-lg bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4 border-b border-slate-100 dark:border-zinc-800 pb-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-lime-400 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-bold text-emerald-700 dark:text-lime-400">
                Segurança & Conformidade (+{MIN_VERIFIED_AGE})
              </span>
              <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 dark:text-white leading-tight">
                Verificação Obrigatória de Idade
              </h1>
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                Olá, <strong className="text-slate-900 dark:text-zinc-100">{userAccount?.displayName || 'Jogador'}</strong>. Antes de jogar, resgatar pontos ou sacar via Pix, precisamos confirmar que você tem 18 anos ou mais.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="age-gate-birthdate"
                className="block text-xs font-bold text-slate-800 dark:text-zinc-200"
              >
                Sua Data de Nascimento
              </label>
              <input
                id="age-gate-birthdate"
                type="date"
                required
                min="1905-01-01"
                max={maxAllowedDate}
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full min-h-[48px] px-4 py-2.5 text-sm font-mono bg-slate-50 dark:bg-[#090d12] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-400"
              />

              {liveCheck && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2 ${
                    liveCheck.valid && liveCheck.isAdult
                      ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/35 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
                  }`}
                >
                  {liveCheck.valid && liveCheck.isAdult ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Idade calculada: <strong>{liveCheck.age} anos</strong> — Elegível (+18 confirmado).
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>
                        {liveCheck.error || `Permitido apenas para maiores de ${MIN_VERIFIED_AGE} anos.`}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedTruth}
                onChange={(e) => setConfirmedTruth(e.target.checked)}
                className="mt-0.5 rounded text-lime-500 shrink-0"
              />
              <span className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                Declaro que tenho {MIN_VERIFIED_AGE} anos ou mais e que minha data de nascimento é verdadeira. Esta informação será conferida caso eu envie a Verificação Facial.
              </span>
            </label>

            {errorMsg && (
              <div className="p-3 rounded-xl border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !birthDate || !confirmedTruth || Boolean(liveCheck && !liveCheck.isAdult)}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-sm font-black transition-colors cursor-pointer shadow-lg shadow-lime-500/20"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? 'Confirmando idade...' : 'Confirmar Idade (+18) e Entrar no App'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
