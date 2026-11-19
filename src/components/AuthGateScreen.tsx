import React, { useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Gamepad2,
  Landmark,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import lobbyHeroImg from '../assets/images/earn_easy_lobby_hero_1795064087528.jpg';
import avatarStrategistImg from '../assets/images/avatar_emerald_strategist_1795072486097.jpg';
import avatarTacticianImg from '../assets/images/avatar_cobalt_tactician_1795072485492.jpg';
import avatarChampionImg from '../assets/images/avatar_amber_champion_1795072485744.jpg';
import avatarArchitectImg from '../assets/images/avatar_slate_architect_1795072486073.jpg';
import { useAuth } from '../context/AuthContext';
import { AppTheme } from './SettingsSection';

const ONBOARDING_AVATARS = [
  {
    id: 'strategist',
    label: 'Estrategista',
    previewSrc: avatarStrategistImg,
    persistedPath: './src/assets/images/avatar_emerald_strategist_1795072486097.jpg',
  },
  {
    id: 'tactician',
    label: 'Tático',
    previewSrc: avatarTacticianImg,
    persistedPath: './src/assets/images/avatar_cobalt_tactician_1795072485492.jpg',
  },
  {
    id: 'champion',
    label: 'Campeão',
    previewSrc: avatarChampionImg,
    persistedPath: './src/assets/images/avatar_amber_champion_1795072485744.jpg',
  },
  {
    id: 'architect',
    label: 'Arquiteto',
    previewSrc: avatarArchitectImg,
    persistedPath: './src/assets/images/avatar_slate_architect_1795072486073.jpg',
  },
];

interface AuthGateScreenProps {
  theme: AppTheme;
  onChangeTheme: (next: AppTheme) => void;
  onAccountCreated: () => void;
}

const GoogleMark: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const AuthGateScreen: React.FC<AuthGateScreenProps> = ({
  theme,
  onChangeTheme,
  onAccountCreated,
}) => {
  const {
    firebaseUser,
    authReady,
    userAccount,
    needsOnboarding,
    myFraudLogs,
    authError,
    signInWithGoogle,
    logout,
    createUserAccount,
  } = useAuth();

  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = (params.get('ref') || params.get('convite') || '').trim();
      if (fromUrl) {
        window.localStorage.setItem('earneasy_ref_uid', fromUrl);
        return fromUrl;
      }
      return window.localStorage.getItem('earneasy_ref_uid') || '';
    } catch {
      return '';
    }
  });
  const [selectedPhoto, setSelectedPhoto] = useState(ONBOARDING_AVATARS[0].persistedPath);
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [heroImgError, setHeroImgError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isBlack = theme === 'dark';

  const handleGoogleSignIn = async () => {
    setFormError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await createUserAccount({
        displayName: username,
        photoURL: selectedPhoto,
        referralCode: referralCode.trim() || undefined,
      });
      if (result.status === 'suspended') {
        setFormError(
          result.message ||
            'Nome de usuário bloqueado por conter palavrão. Conta banida imediatamente.'
        );
        return;
      }
      onAccountCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasProfanityBan = myFraudLogs.some((f) => f.eventType === 'profanity_username_ban');

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors ${
        isBlack ? 'dark bg-black text-zinc-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Clean Top Strip */}
      <header
        className={`border-b transition-colors ${
          isBlack ? 'bg-black border-zinc-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <span className="text-lg font-display font-extrabold tracking-tight text-slate-900 dark:text-zinc-50 whitespace-nowrap">
            Earn Easy
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChangeTheme(isBlack ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isBlack ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {isBlack ? 'Tema Claro' : 'Tema Preto'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        {!authReady ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-10 text-center max-w-md w-full space-y-3">
            <div className="text-base font-display font-bold text-slate-900 dark:text-zinc-50">
              Verificando sessão...
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Conectando com sua conta Earn Easy no Firestore.
            </p>
          </div>
        ) : userAccount?.status === 'suspended' ? (
          /* STATE 3: BANNED / SUSPENDED SCREEN */
          <div className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/80 rounded-2xl p-8 sm:p-10 max-w-lg w-full text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
              <Ban className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-display font-extrabold text-slate-900 dark:text-zinc-50 text-balance">
                Conta Banida Permanentemente
              </h1>
              <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                {userAccount.banReason || userAccount.banExplanation
                  ? 'Sua conta foi banida pela administração da plataforma e não possui mais acesso aos jogos, conversões ou saques Pix.'
                  : hasProfanityBan
                    ? 'Nossa moderação automática detectou o uso de palavrão ou termo ofensivo no nome de usuário. Conforme as regras da plataforma, o banimento é imediato.'
                    : 'Esta conta foi suspensa pela proteção antifraude e não possui mais acesso aos jogos, conversões ou saques Pix.'}
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-900 rounded-xl p-4 text-xs text-red-900 dark:text-red-200 text-left space-y-2">
              <div className="font-semibold">Status da conta: Banida / Suspensa (Risco {userAccount.riskScore}/100)</div>
              {userAccount.banReason && (
                <div>
                  <span className="font-semibold">Motivo do banimento:</span> {userAccount.banReason}
                </div>
              )}
              {userAccount.banExplanation && (
                <div>
                  <span className="font-semibold">Por quê:</span> {userAccount.banExplanation}
                </div>
              )}
              <div className="text-red-800/90 dark:text-red-300/90">
                E-mail vinculado: {firebaseUser?.email}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-slate-900 dark:bg-zinc-800 hover:bg-slate-800 dark:hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sair desta conta
            </button>
          </div>
        ) : firebaseUser && needsOnboarding ? (
          /* STATE 2: ACCOUNT CREATION & USERNAME MODERATION */
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 max-w-xl w-full space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-5">
              <div className="space-y-1">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Etapa final · Criação de Conta
                </div>
                <h1 className="text-2xl font-display font-extrabold text-slate-900 dark:text-zinc-50 text-balance">
                  Escolha seu nome de usuário
                </h1>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Conectado como <span className="font-mono text-slate-700 dark:text-zinc-200">{firebaseUser.email}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 underline shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Trocar conta
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Nome de Usuário Público (exibido no Ranking Global)
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={32}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: GabrielSilva_BR"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Aviso de tolerância zero: é proibido usar palavrões, ofensas ou termos impróprios no nome de usuário. Qualquer violação resulta em banimento imediato.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Código de Convite (opcional)
                </label>
                <input
                  type="text"
                  maxLength={128}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="Cole o código de quem te convidou (preenchido automático pelo link)"
                  className="w-full px-3.5 py-2 text-xs font-mono bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {referralCode.trim() && (
                  <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                    Convite vinculado: quem te indicou receberá +500 pts imediatos e 12% bônus sobre seus ganhos.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                  Escolha seu Avatar Inicial
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ONBOARDING_AVATARS.map((preset) => {
                    const active = selectedPhoto === preset.persistedPath;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPhoto(preset.persistedPath)}
                        className={`p-3 rounded-xl border text-center space-y-2 transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/35'
                            : 'border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950 hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <img
                          src={preset.previewSrc}
                          alt={`Avatar ${preset.label}`}
                          className="w-12 h-12 rounded-full object-cover mx-auto border border-slate-200 dark:border-zinc-700"
                        />
                        <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                          {preset.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {firebaseUser.photoURL && (
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(firebaseUser.photoURL || '')}
                    className={`mt-2.5 text-xs font-medium underline cursor-pointer ${
                      selectedPhoto === firebaseUser.photoURL
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    {selectedPhoto === firebaseUser.photoURL
                      ? 'Usando sua foto original do Google'
                      : 'Prefere usar sua foto do Google? Clique aqui'}
                  </button>
                )}
              </div>

              {formError && (
                <div className="p-3 rounded-xl border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {submitting ? 'Criando sua conta...' : 'Criar Minha Conta e Acessar o App'}
              </button>
            </form>
          </div>
        ) : (
          /* STATE 1: BEAUTIFUL GOOGLE LOGIN GATE */
          <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Editorial Showcase */}
            <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col justify-between transition-colors">
              <div className="p-7 sm:p-9 space-y-5">
                <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Plataforma de Jogos de Lógica · Pagamentos via Pix
                </div>

                <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight text-balance">
                  Jogue desafios inteligentes, cumpra sua sequência diária e saque via Pix.
                </h1>

                <p className="text-sm sm:text-base text-slate-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                  Para proteger sua carteira e o Ranking Global, o acesso aos jogos e recompensas é liberado somente após criar sua conta verificada com o Google.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <Gamepad2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">5 Jogos Verificados</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Ganhe até 450 pts por partida concluída
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">Check-in & 30 Dias</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      1.200 pts/semana e R$ 10,00 aos 30 dias seguidos
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-1">
                    <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">1º Saque R$ 0,10</div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      1.000 pts = R$ 0,10 direto no Pix
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-44 sm:h-52 border-t border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950">
                {!heroImgError ? (
                  <img
                    src={lobbyHeroImg}
                    alt="Tabuleiro e fichas geométricas esmeralda do Earn Easy"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-200 text-sm font-display font-semibold">
                    Earn Easy · Lógica & Recompensas
                  </div>
                )}
              </div>
            </div>

            {/* Right Google Sign-In Card */}
            <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-7 sm:p-9 flex flex-col justify-between space-y-8 transition-colors">
              <div className="space-y-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-zinc-50">
                    Entrar ou Criar Conta
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                    Conecte sua conta Google em segundos. No primeiro acesso, você escolherá seu nome de usuário público e verá o tutorial passo a passo.
                  </p>
                </div>

                {(authError || formError) && (
                  <div className="p-3 rounded-xl border bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError || formError}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={signingIn}
                    className="w-full inline-flex items-center justify-center gap-3 px-5 py-3.5 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-900 dark:text-zinc-50 border border-slate-300 dark:border-zinc-700 rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <GoogleMark />
                    {signingIn ? 'Abrindo login Google...' : 'Continuar com Google'}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-zinc-800 pt-5 space-y-2.5 text-xs text-slate-500 dark:text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Taxa de conversão</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200 tabular-nums">
                    1.000 pts = R$ 0,10
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>1º saque mínimo Pix</span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    R$ 0,10
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Moderação de usuário</span>
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">
                    Sem palavrões (ban imediato)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
