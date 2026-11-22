import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarCheck2,
  Check,
  Copy,
  Fingerprint,
  Gamepad2,
  Gift,
  Headset,
  HelpCircle,
  Home,
  Inbox,
  LogOut,
  Moon,
  MoreHorizontal,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Swords,
  Ticket,
  Trophy,
  User,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AppFooter } from './components/AppFooter';
import { AuthGateScreen } from './components/AuthGateScreen';
import { BrandLogo } from './components/BrandLogo';
import { FloatingSupportWidget } from './components/FloatingSupportWidget';
import { GamesHub } from './components/GamesHub';
import { GlobalRanking } from './components/GlobalRanking';
import { InvitesAndCodesSection } from './components/InvitesAndCodesSection';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import { ParticleBackdrop } from './components/ParticleBackdrop';
import { PlayerInspectorModal } from './components/PlayerInspectorModal';
import { PlayerProfile, ProfileAvatar } from './components/PlayerProfile';
import { PlayWithFriendsSection } from './components/multiplayer/PlayWithFriendsSection';
import { VerifiedBadge } from './components/VerifiedBadge';
import { WalletSection } from './components/WalletSection';
import { DashboardSection } from './components/DashboardSection';
import { NotificationsSection } from './components/NotificationsSection';
import { SocialPresence, SocialSection } from './components/SocialSection';
import { SupportChatSection } from './components/SupportChatSection';
import { AppTheme, SettingsSection } from './components/SettingsSection';
import { WelcomeTutorialModal } from './components/WelcomeTutorialModal';
import { LeaderboardEntry } from './types/earneasy';
import { calculatePlayerLevel } from './utils/levels';
import { formatBRL } from './utils/pix';

const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((mod) => ({ default: mod.AdminPanel }))
);

type NavTab =
  | 'games'
  | 'play_friends'
  | 'ranking'
  | 'friends'
  | 'invites'
  | 'wallet'
  | 'support'
  | 'dashboard'
  | 'notifications'
  | 'profile'
  | 'settings';

const THEME_STORAGE_KEY = 'earneasy_theme';
const TUTORIAL_STORAGE_PREFIX = 'earneasy_tutorial_seen_';

function getInitialTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function isPrivateBackofficeUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/backoffice' ||
    window.location.hash === '#/backoffice'
  );
}

const TAB_TITLES: Record<NavTab, string> = {
  games: 'Início & Jogos',
  play_friends: 'Jogar com Amigos',
  ranking: 'Ranking Global',
  friends: 'Amigos & Comunidade',
  invites: 'Convites & Códigos',
  wallet: 'Carteira & Saque Pix',
  profile: 'Meu Perfil & ID',
  notifications: 'Caixa de Correio',
  dashboard: 'Resumo Financeiro',
  settings: 'Configurações',
  support: 'Suporte (Biel & ADM)',
};

function MainShell() {
  const {
    firebaseUser,
    authReady,
    userAccount,
    isAdmin,
    unreadMailboxCount,
    maintenanceSettings,
    needsOnboarding,
    authError,
    signInWithGoogle,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('games');
  const [theme, setTheme] = useState<AppTheme>(() => getInitialTheme());
  const [isBackofficeRoute, setIsBackofficeRoute] = useState<boolean>(() => isPrivateBackofficeUrl());
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [supportOpenSignal, setSupportOpenSignal] = useState(0);
  const [copiedSidebarId, setCopiedSidebarId] = useState(false);
  const [inspectedPlayer, setInspectedPlayer] = useState<{
    player: LeaderboardEntry;
    rank: number | null;
  } | null>(null);
  const [friendChatTargetUid, setFriendChatTargetUid] = useState<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refUid = (params.get('ref') || params.get('convite') || '').trim();
      if (refUid && /^[a-zA-Z0-9_-]{1,128}$/.test(refUid)) {
        window.localStorage.setItem('earneasy_ref_uid', refUid);
      }
    } catch {
      // Ignore URL/storage errors
    }
    const syncRoute = () => setIsBackofficeRoute(isPrivateBackofficeUrl());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures
    }
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !userAccount ||
      userAccount.status === 'suspended' ||
      maintenanceSettings.enabled ||
      isBackofficeRoute
    ) {
      return;
    }
    try {
      const seen = window.localStorage.getItem(`${TUTORIAL_STORAGE_PREFIX}${firebaseUser.uid}`);
      if (!seen) {
        setTutorialOpen(true);
      }
    } catch {
      // Ignore storage errors
    }
  }, [authReady, firebaseUser, userAccount, maintenanceSettings.enabled, isBackofficeRoute]);

  const enterBackoffice = () => {
    window.history.pushState({}, '', '/backoffice');
    setIsBackofficeRoute(true);
    setMoreSheetOpen(false);
  };

  const exitBackoffice = () => {
    window.history.pushState({}, '', '/');
    setIsBackofficeRoute(false);
    setActiveTab('games');
  };

  const handleCloseTutorial = () => {
    setTutorialOpen(false);
    if (firebaseUser) {
      try {
        window.localStorage.setItem(`${TUTORIAL_STORAGE_PREFIX}${firebaseUser.uid}`, '1');
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleSelectTab = (tab: NavTab) => {
    if (isBackofficeRoute) {
      window.history.pushState({}, '', '/');
      setIsBackofficeRoute(false);
    }
    setActiveTab(tab);
    setMoreSheetOpen(false);
  };

  const handleGoToMissions = () => {
    handleSelectTab('games');
    window.setTimeout(() => {
      document.getElementById('checkin-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const handleGoToCatalog = () => {
    handleSelectTab('games');
    window.setTimeout(() => {
      document.getElementById('games-catalog')?.scrollIntoView({ behavior: 'smooth' });
    }, 80);
  };

  const handleCopyOwnId = async () => {
    const uid = userAccount?.uid || firebaseUser?.uid;
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedSidebarId(true);
      setTimeout(() => setCopiedSidebarId(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const isBlackTheme = theme === 'dark';

  // Gate 1: Maintenance Screen (allows Admin to enter /backoffice anytime)
  if (!isBackofficeRoute && maintenanceSettings.enabled) {
    return (
      <MaintenanceScreen
        settings={maintenanceSettings}
        theme={theme}
        isAdmin={isAdmin}
        isSignedIn={Boolean(firebaseUser)}
        onGoBackoffice={enterBackoffice}
        onRefresh={() => window.location.reload()}
        onLogout={firebaseUser ? logout : undefined}
        onSignInAdmin={!firebaseUser ? signInWithGoogle : undefined}
      />
    );
  }

  // Gate 2: Login / Onboarding / Banned screen
  if (
    !isBackofficeRoute &&
    (!authReady || !firebaseUser || needsOnboarding || userAccount?.status === 'suspended')
  ) {
    return (
      <AuthGateScreen
        theme={theme}
        onChangeTheme={setTheme}
        onAccountCreated={() => setTutorialOpen(true)}
      />
    );
  }

  const sidebarItems: Array<{
    id: NavTab;
    label: string;
    Icon: React.FC<{ className?: string }>;
    badge?: number;
    onClickOverride?: () => void;
  }> = [
    { id: 'games', label: 'Início', Icon: Home },
    { id: 'games', label: 'Jogos', Icon: Gamepad2, onClickOverride: handleGoToCatalog },
    { id: 'play_friends', label: 'Jogar com Amigos', Icon: Swords },
    { id: 'ranking', label: 'Ranking', Icon: Trophy },
    { id: 'invites', label: 'Missões & Check-in', Icon: CalendarCheck2, onClickOverride: handleGoToMissions },
    { id: 'wallet', label: 'Carteira & Pix', Icon: Wallet },
    { id: 'friends', label: 'Amigos & Chat', Icon: Users },
    { id: 'invites', label: 'Convidar & Códigos', Icon: Ticket },
    { id: 'notifications', label: 'Correio', Icon: Inbox, badge: unreadMailboxCount },
    { id: 'support', label: 'Suporte (Biel)', Icon: Headset },
    { id: 'dashboard', label: 'Resumo Financeiro', Icon: BarChart3 },
    { id: 'profile', label: 'Meu Perfil & ID', Icon: Fingerprint },
    { id: 'settings', label: 'Configurações', Icon: Settings },
  ];

  const isSecondaryMobileTabActive = [
    'play_friends',
    'invites',
    'notifications',
    'dashboard',
    'settings',
    'support',
    'profile',
  ].includes(activeTab);

  const levelInfo = userAccount
    ? calculatePlayerLevel(userAccount.lifetimePoints, userAccount.gamesPlayed)
    : null;

  return (
    <div
      className={`relative min-h-screen flex transition-colors ${
        isBlackTheme ? 'dark bg-[#070a0d] text-zinc-100' : 'bg-[#f3f6f4] text-slate-900'
      }`}
    >
      <ParticleBackdrop theme={theme} />

      {/* Desktop Left App Rail (md+) */}
      <aside
        aria-label="Navegação do Aplicativo"
        className={`hidden md:flex md:w-64 lg:w-[260px] shrink-0 flex-col justify-between sticky top-0 h-screen z-30 border-r backdrop-blur-xl transition-colors ${
          isBlackTheme
            ? 'bg-[#090d12]/95 border-zinc-800/80'
            : 'bg-white/90 border-slate-200/90'
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* App Brand Header */}
          <div className="h-16 px-5 flex items-center justify-center border-b border-slate-200/80 dark:border-zinc-800/80 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectTab('games')}
              className="cursor-pointer"
            >
              <BrandLogo />
            </button>
          </div>

          {/* Vertical Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
            {sidebarItems.map((item, idx) => {
              const Icon = item.Icon;
              const isDuplicateShortcut = Boolean(item.onClickOverride);
              const active = !isBackofficeRoute && !isDuplicateShortcut && activeTab === item.id;
              return (
                <button
                  key={`${item.id}_${idx}`}
                  type="button"
                  onClick={() => (item.onClickOverride ? item.onClickOverride() : handleSelectTab(item.id))}
                  className={`w-full min-h-[40px] flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-lime-500/25 via-emerald-500/15 to-transparent border border-lime-400/40 text-emerald-800 dark:text-lime-300 shadow-sm'
                      : isBlackTheme
                        ? 'text-zinc-300 hover:bg-zinc-900 hover:text-white border border-transparent'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-emerald-700 dark:text-lime-400' : 'text-slate-400 dark:text-zinc-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold tabular-nums bg-lime-400 text-slate-950">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {isAdmin && (
              <button
                type="button"
                onClick={enterBackoffice}
                className={`w-full min-h-[42px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer mt-2 ${
                  isBackofficeRoute
                    ? 'bg-lime-400 text-slate-950 shadow-sm'
                    : 'text-emerald-700 dark:text-lime-400 border border-emerald-200 dark:border-lime-500/30 bg-emerald-50/70 dark:bg-lime-500/10 hover:bg-emerald-100 dark:hover:bg-lime-500/20'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Painel Admin</span>
              </button>
            )}
          </nav>

          {/* Bottom-Left Gift Invite Promo Card matching Screenshot */}
          <div className="px-3 pb-3 pt-1 shrink-0 space-y-2">
            <div className="rounded-2xl border border-emerald-200 dark:border-lime-500/30 bg-gradient-to-b from-emerald-50 via-white to-emerald-50/70 dark:from-[#122014] dark:via-[#0d1410] dark:to-[#090d12] p-3.5 text-center space-y-2.5 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/15 dark:bg-lime-400/20 border border-emerald-500/30 dark:border-lime-400/40 text-emerald-700 dark:text-lime-300 flex items-center justify-center mx-auto">
                <Gift className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-snug">
                Convide amigos e ganhe pontos extras!
              </p>
              <button
                type="button"
                onClick={() => handleSelectTab('invites')}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                Convidar
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setTheme(isBlackTheme ? 'light' : 'dark')}
                title={isBlackTheme ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'}
                className="min-h-[36px] flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 cursor-pointer"
              >
                {isBlackTheme ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{isBlackTheme ? 'Claro' : 'Escuro'}</span>
              </button>
              <button
                type="button"
                onClick={() => setTutorialOpen(true)}
                className="min-h-[36px] flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Guia</span>
              </button>
              {firebaseUser && (
                <button
                  type="button"
                  onClick={logout}
                  className="min-h-[36px] flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl border border-red-200/80 dark:border-red-900/50 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Top Bar with Live Search, Bell, Gift & Level Progress Profile Chip */}
        <header
          className={`sticky top-0 z-30 h-14 md:h-16 px-3.5 sm:px-6 border-b backdrop-blur-xl flex items-center justify-between gap-3 transition-colors ${
            isBlackTheme
              ? 'bg-[#070a0d]/85 border-zinc-800/80'
              : 'bg-white/85 border-slate-200/80'
          }`}
        >
          {/* Mobile Brand / Desktop Live Game Search */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => handleSelectTab('games')}
              className="md:hidden cursor-pointer shrink-0"
            >
              <BrandLogo size="sm" />
            </button>

            <div className="hidden md:flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={gameSearchQuery}
                  onChange={(e) => {
                    setGameSearchQuery(e.target.value);
                    if (!isBackofficeRoute && activeTab !== 'games') {
                      setActiveTab('games');
                    }
                  }}
                  placeholder="Buscar jogos..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#0e1319] text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400"
                />
              </div>
            </div>
          </div>

          {/* Right Quick Actions matching Reference Screenshot */}
          <div className="flex items-center gap-2 shrink-0">
            {firebaseUser ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectTab('notifications')}
                  aria-label="Abrir Caixa de Correio"
                  className={`relative min-w-[40px] min-h-[40px] p-2 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                    !isBackofficeRoute && activeTab === 'notifications'
                      ? 'bg-emerald-50 dark:bg-lime-500/15 border-emerald-400 dark:border-lime-400 text-emerald-700 dark:text-lime-300'
                      : isBlackTheme
                        ? 'border-zinc-800 bg-[#0e1319] text-zinc-200 hover:border-lime-400/50'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Inbox className="w-4 h-4" />
                  {unreadMailboxCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                      {unreadMailboxCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('invites')}
                  aria-label="Abrir Convites e Códigos"
                  className={`min-w-[40px] min-h-[40px] p-2 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                    !isBackofficeRoute && activeTab === 'invites'
                      ? 'bg-emerald-50 dark:bg-lime-500/15 border-emerald-400 dark:border-lime-400 text-emerald-700 dark:text-lime-300'
                      : isBlackTheme
                        ? 'border-zinc-800 bg-[#0e1319] text-zinc-200 hover:border-lime-400/50'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Gift className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('wallet')}
                  className="md:hidden min-h-[40px] px-2.5 py-1.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-mono font-extrabold tabular-nums transition-colors whitespace-nowrap cursor-pointer"
                >
                  {formatBRL(userAccount?.brlBalanceCents || 0)}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('profile')}
                  aria-label="Abrir Perfil e ID"
                  className="hidden sm:inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0e1319] hover:border-lime-400/60 transition-colors cursor-pointer"
                >
                  <ProfileAvatar
                    name={userAccount?.displayName || firebaseUser.displayName || 'Jogador'}
                    photoURL={userAccount?.photoURL || firebaseUser.photoURL || ''}
                    sizeClass="w-8 h-8"
                    textSizeClass="text-[11px]"
                  />
                  <div className="text-left min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight max-w-[140px] flex items-center gap-1">
                      <span className="truncate">{userAccount?.displayName || 'Perfil'}</span>
                      <VerifiedBadge
                        tier={userAccount?.verifiedBadge}
                        legacyVerified={userAccount?.identityVerified}
                        size="xs"
                      />
                    </div>
                    {levelInfo && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                          Nível {levelInfo.level}
                        </span>
                        <span className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                          <span
                            className="block h-full bg-lime-400 rounded-full"
                            style={{ width: `${levelInfo.progressPct}%` }}
                          />
                        </span>
                      </div>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMoreSheetOpen(true)}
                  aria-label="Mais opções do app"
                  className={`md:hidden min-w-[40px] min-h-[40px] p-2 rounded-xl border flex items-center justify-center cursor-pointer ${
                    isBlackTheme
                      ? 'border-zinc-800 bg-[#0e1319] text-zinc-200'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="min-h-[40px] px-4 py-2 text-xs font-extrabold bg-lime-400 hover:bg-lime-300 text-slate-950 rounded-xl transition-colors cursor-pointer"
              >
                Entrar com Google
              </button>
            )}
          </div>
        </header>

        <SocialPresence />

        {/* Admin Notice Strip if viewing Backoffice while Maintenance is active */}
        {isBackofficeRoute && maintenanceSettings.enabled && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-center gap-2 text-center">
            <Wrench className="w-4 h-4 shrink-0" />
            <span>
              Modo Manutenção está ATIVO para jogadores. Você está acessando o Painel Administrativo normalmente.
            </span>
          </div>
        )}

        {/* Main Scroll View */}
        <main className="flex-1 max-w-[1360px] w-full mx-auto px-3.5 sm:px-6 pt-5 pb-24 md:py-7">
          {authError && (
            <div className="mb-5 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl text-xs text-red-800 dark:text-red-300">
              {authError}
            </div>
          )}

          {isBackofficeRoute ? (
            !authReady ? (
              <div className="bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-10 text-center text-sm text-slate-500 dark:text-zinc-400">
                Verificando credenciais...
              </div>
            ) : !firebaseUser ? (
              <div className="bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 sm:p-10 text-center max-w-md mx-auto space-y-4">
                <ShieldAlert className="w-8 h-8 text-slate-700 dark:text-zinc-300 mx-auto" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
                  Portal Restrito de Operações
                </h2>
                <p className="text-xs text-slate-600 dark:text-zinc-400">
                  Autentique-se com a conta administradora autorizada para acessar esta área.
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    className="min-h-[44px] px-4 py-2 text-xs font-bold bg-lime-400 text-slate-950 rounded-xl hover:bg-lime-300 cursor-pointer"
                  >
                    Entrar com Google
                  </button>
                  <button
                    type="button"
                    onClick={exitBackoffice}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    Voltar ao App
                  </button>
                </div>
              </div>
            ) : !isAdmin ? (
              <div className="bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 sm:p-10 text-center max-w-md mx-auto space-y-4">
                <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">Acesso Negado</h2>
                <p className="text-xs text-slate-600 dark:text-zinc-400">
                  Esta conta não possui permissão administrativa.
                </p>
                <button
                  type="button"
                  onClick={exitBackoffice}
                  className="min-h-[44px] px-4 py-2 text-xs font-bold bg-lime-400 text-slate-950 rounded-xl hover:bg-lime-300 cursor-pointer"
                >
                  Voltar para Jogos
                </button>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-10 text-center text-sm text-slate-500 dark:text-zinc-400">
                    Carregando painel administrativo...
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={exitBackoffice}
                      className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl bg-white/95 dark:bg-[#0e1319]/95 border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-lime-400 cursor-pointer"
                    >
                      ← Voltar para o Aplicativo
                    </button>
                    <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                      {TAB_TITLES[activeTab] ? 'Backoffice Seguro' : ''}
                    </span>
                  </div>
                  <AdminPanel />
                </div>
              </Suspense>
            )
          ) : (
            <>
              {activeTab === 'games' && (
                <GamesHub
                  searchQuery={gameSearchQuery}
                  onSearchQueryChange={setGameSearchQuery}
                  onNavigateWallet={() => handleSelectTab('wallet')}
                  onNavigateProfile={() => handleSelectTab('profile')}
                  onNavigateInvites={() => handleSelectTab('invites')}
                  onNavigateMailbox={() => handleSelectTab('notifications')}
                  onNavigateRanking={() => handleSelectTab('ranking')}
                  onNavigateFriends={() => handleSelectTab('friends')}
                  onNavigatePlayFriends={() => handleSelectTab('play_friends')}
                  onInspectPlayer={(player, rank) => setInspectedPlayer({ player, rank })}
                />
              )}
              {activeTab === 'play_friends' && <PlayWithFriendsSection />}
              {activeTab === 'ranking' && (
                <GlobalRanking
                  onGoToGames={() => handleSelectTab('games')}
                  onGoToWallet={() => handleSelectTab('wallet')}
                  onInspectPlayer={(player, rank) => setInspectedPlayer({ player, rank })}
                />
              )}
              {activeTab === 'friends' && (
                <SocialSection
                  initialSelectedUid={friendChatTargetUid}
                  onInspectPlayer={(player, rank) => setInspectedPlayer({ player, rank })}
                />
              )}
              {activeTab === 'invites' && <InvitesAndCodesSection />}
              {activeTab === 'profile' && <PlayerProfile />}
              {activeTab === 'wallet' && <WalletSection />}
              {activeTab === 'support' && <SupportChatSection />}
              {activeTab === 'dashboard' && <DashboardSection />}
              {activeTab === 'notifications' && <NotificationsSection />}
              {activeTab === 'settings' && (
                <SettingsSection
                  theme={theme}
                  onChangeTheme={setTheme}
                  onNavigateProfile={() => handleSelectTab('profile')}
                  onNavigateWallet={() => handleSelectTab('wallet')}
                />
              )}
            </>
          )}
          <AppFooter />
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Dock (Thumb Zone) */}
      {!isBackofficeRoute && (
        <nav
          aria-label="Menu inferior do aplicativo"
          className={`md:hidden fixed bottom-0 inset-x-0 z-30 h-16 border-t backdrop-blur-xl grid grid-cols-5 px-1 transition-colors ${
            isBlackTheme
              ? 'bg-[#090d12]/95 border-zinc-800/90'
              : 'bg-white/95 border-slate-200/90'
          }`}
        >
          {[
            { id: 'games' as NavTab, label: 'Início', Icon: Home },
            { id: 'ranking' as NavTab, label: 'Ranking', Icon: Trophy },
            { id: 'friends' as NavTab, label: 'Amigos', Icon: Users },
            { id: 'wallet' as NavTab, label: 'Carteira', Icon: Wallet },
          ].map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors cursor-pointer ${
                  active
                    ? 'text-emerald-700 dark:text-lime-400 font-bold'
                    : 'text-slate-500 dark:text-zinc-400 font-medium'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-tight">{label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreSheetOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors cursor-pointer relative ${
              isSecondaryMobileTabActive
                ? 'text-emerald-700 dark:text-lime-400 font-bold'
                : 'text-slate-500 dark:text-zinc-400 font-medium'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] leading-tight">Menu</span>
            {unreadMailboxCount > 0 && (
              <span className="absolute top-1.5 right-3.5 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>
        </nav>
      )}

      {/* Mobile "Menu" Action Sheet */}
      {moreSheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreSheetOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Mais seções do aplicativo"
        >
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-[#0e1319] border-t border-slate-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {userAccount && (
                  <>
                    <ProfileAvatar
                      name={userAccount.displayName}
                      photoURL={userAccount.photoURL}
                      sizeClass="w-10 h-10"
                      textSizeClass="text-xs"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug flex items-center gap-1.5">
                        <span className="truncate">{userAccount.displayName}</span>
                        <VerifiedBadge
                          tier={userAccount.verifiedBadge}
                          legacyVerified={userAccount.identityVerified}
                          size="sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyOwnId}
                        className="text-[11px] font-mono text-emerald-600 dark:text-lime-400 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedSidebarId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedSidebarId ? 'ID Copiado!' : `Copiar ID: ${userAccount.uid}`}
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                aria-label="Fechar menu"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-300 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectTab('play_friends')}
                className="col-span-2 min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-lime-400/15 border border-lime-400/40 flex items-center justify-center gap-2.5 text-xs font-extrabold text-emerald-800 dark:text-lime-300 cursor-pointer"
              >
                <Swords className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Jogar com Amigos (11 Jogos Online)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('invites')}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <Ticket className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Convites & Códigos</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('notifications')}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <Inbox className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Correio{unreadMailboxCount > 0 ? ` (${unreadMailboxCount})` : ''}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('profile')}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <User className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Perfil & Foto</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('support')}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <Headset className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Suporte (Biel)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('dashboard')}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Resumo Financeiro</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectTab('settings')}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Configurações</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  setTheme(isBlackTheme ? 'light' : 'dark');
                }}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                {isBlackTheme ? <Sun className="w-4 h-4 text-amber-400 shrink-0" /> : <Moon className="w-4 h-4 text-slate-600 shrink-0" />}
                <span>{isBlackTheme ? 'Tema Claro' : 'Tema Escuro'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  setTutorialOpen(true);
                }}
                className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-zinc-100 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-emerald-600 dark:text-lime-400 shrink-0" />
                <span>Tutorial</span>
              </button>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={enterBackoffice}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                Abrir Painel Administrativo
              </button>
            )}

            {firebaseUser && (
              <button
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  logout();
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sair da Conta
              </button>
            )}
          </div>
        </div>
      )}

      {/* Player Inspector Modal */}
      <PlayerInspectorModal
        player={inspectedPlayer?.player || null}
        rank={inspectedPlayer?.rank ?? null}
        onClose={() => setInspectedPlayer(null)}
        onGoToFriendsChat={(targetUid) => {
          setFriendChatTargetUid(targetUid);
          handleSelectTab('friends');
        }}
        onEditMyProfile={() => handleSelectTab('profile')}
      />

      {!isBackofficeRoute && <FloatingSupportWidget externalOpenSignal={supportOpenSignal} />}

      <WelcomeTutorialModal
        open={tutorialOpen}
        onClose={handleCloseTutorial}
        onGoToGames={() => handleSelectTab('games')}
        onGoToWallet={() => handleSelectTab('wallet')}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <MainShell />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
