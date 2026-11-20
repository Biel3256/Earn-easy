import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  HelpCircle,
  Home,
  Gamepad2,
  Gift,
  Trophy,
  UserRound,
  WalletCards,
  Gem,
  Inbox,
  LogOut,
  Menu,
  MoreVertical,
  Settings,
  ShieldAlert,
  Ticket,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthGateScreen } from './components/AuthGateScreen';
import { GamesHub } from './components/GamesHub';
import { GlobalRanking } from './components/GlobalRanking';
import { InvitesAndCodesSection } from './components/InvitesAndCodesSection';
import { PlayerProfile, ProfileAvatar } from './components/PlayerProfile';
import { WalletSection } from './components/WalletSection';
import { DashboardSection } from './components/DashboardSection';
import { NotificationsSection } from './components/NotificationsSection';
import { AppTheme, SettingsSection } from './components/SettingsSection';
import { WelcomeTutorialModal } from './components/WelcomeTutorialModal';
import { formatBRL } from './utils/pix';

const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((mod) => ({ default: mod.AdminPanel }))
);

type NavTab =
  | 'games'
  | 'invites'
  | 'ranking'
  | 'wallet'
  | 'dashboard'
  | 'notifications'
  | 'profile'
  | 'settings';

const THEME_STORAGE_KEY = 'earneasy_theme';

function getInitialTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
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

const TUTORIAL_STORAGE_PREFIX = 'earneasy_tutorial_seen_';

function MainShell() {
  const {
    firebaseUser,
    authReady,
    userAccount,
    isAdmin,
    unreadMailboxCount,
    needsOnboarding,
    authError,
    signInWithGoogle,
    logout,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('games');
  const [theme, setTheme] = useState<AppTheme>(() => getInitialTheme());
  const [isBackofficeRoute, setIsBackofficeRoute] = useState<boolean>(() => isPrivateBackofficeUrl());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

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

  const exitBackoffice = () => {
    window.history.pushState({}, '', '/');
    setIsBackofficeRoute(false);
    setActiveTab('games');
  };

  const navItems: { id: NavTab; label: string }[] = [
    { id: 'games', label: 'Início' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'invites', label: 'Convites & Códigos' },
    { id: 'wallet', label: 'Carteira Pix' },
    {
      id: 'notifications',
      label: unreadMailboxCount > 0 ? `Caixa de Correio (${unreadMailboxCount})` : 'Caixa de Correio',
    },
  ];

  const sidebarItems: { id: NavTab; label: string; Icon: React.ElementType }[] = [
    { id: 'games', label: 'Início', Icon: Home },
    { id: 'games', label: 'Jogos', Icon: Gamepad2 },
    { id: 'invites', label: 'Ofertas e Códigos', Icon: Gift },
    { id: 'ranking', label: 'Ranking', Icon: Trophy },
    { id: 'profile', label: 'Perfil', Icon: UserRound },
    { id: 'wallet', label: 'Carteira Pix', Icon: WalletCards },
    { id: 'notifications', label: 'Caixa de Correio', Icon: Inbox },
    { id: 'dashboard', label: 'Resumo', Icon: BarChart3 },
    { id: 'settings', label: 'Configurações', Icon: Settings },
  ];

  const isBlackTheme = theme === 'dark';
  const isDarkView = isBlackTheme;

  useEffect(() => {
    if (!authReady || !firebaseUser || !userAccount || userAccount.status === 'suspended' || isBackofficeRoute) {
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
  }, [authReady, firebaseUser, userAccount, isBackofficeRoute]);

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
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  // Access gate: users can only enter the app after Google login + creating an active account
  if (!isBackofficeRoute && (!authReady || !firebaseUser || needsOnboarding || userAccount?.status === 'suspended')) {
    return (
      <AuthGateScreen
        theme={theme}
        onChangeTheme={setTheme}
        onAccountCreated={() => setTutorialOpen(true)}
      />
    );
  }

  return (
    <div
      className={`ee-app-shell min-h-screen flex flex-col transition-colors ${
        isBlackTheme
          ? 'dark bg-black text-zinc-100'
          : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Strict 3-Zone Top Bar Contract */}
      <header
        className={`ee-header sticky top-0 z-30 backdrop-blur border-b transition-colors ${
          isBlackTheme
            ? 'bg-black/95 border-zinc-800'
            : 'bg-white/95 border-slate-200'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => handleSelectTab('games')}
            className={`ee-brand text-lg font-display font-extrabold tracking-tight whitespace-nowrap shrink-0 cursor-pointer ${
              isDarkView ? 'text-zinc-50' : 'text-slate-900'
            }`}
          >
            Earn Easy
          </button>

          {/* Zone 2: 5 clean single-line text nav links (no public Admin link) */}
          <nav
            className={`hidden md:flex items-center gap-6 text-sm font-medium ${
              isDarkView ? 'text-zinc-400' : 'text-slate-600'
            }`}
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  !isBackofficeRoute && activeTab === item.id
                    ? isDarkView
                      ? 'text-zinc-50 font-semibold border-b-2 border-emerald-500'
                      : 'text-slate-900 font-semibold border-b-2 border-emerald-600'
                    : isDarkView
                      ? 'hover:text-zinc-100'
                      : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Balance shortcut + Avatar bubble + 3-dots settings menu */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
            {!authReady ? (
              <span className="text-xs text-slate-400 whitespace-nowrap">Carregando...</span>
            ) : firebaseUser ? (
              <div ref={menuContainerRef} className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectTab('wallet')}
                  title="Ir para Carteira Pix"
                  className={`px-3 sm:px-3.5 py-1.5 text-xs font-mono font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    isDarkView
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {formatBRL(userAccount?.brlBalanceCents || 0)}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('profile')}
                  title="Meu Perfil & Níveis"
                  aria-label="Abrir Meu Perfil"
                  className={`rounded-full p-0.5 transition-all cursor-pointer shrink-0 ${
                    !isBackofficeRoute && activeTab === 'profile'
                      ? 'ring-2 ring-emerald-500'
                      : isDarkView
                        ? 'hover:ring-2 hover:ring-zinc-600'
                        : 'hover:ring-2 hover:ring-slate-300'
                  }`}
                >
                  <ProfileAvatar
                    name={userAccount?.displayName || firebaseUser.displayName || 'Jogador'}
                    photoURL={userAccount?.photoURL || firebaseUser.photoURL || ''}
                    sizeClass="w-8 h-8 sm:w-9 sm:h-9"
                    textSizeClass="text-xs"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  aria-label="Configurações e opções"
                  aria-expanded={accountMenuOpen}
                  title="Configurações e opções"
                  className={`p-2 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                    accountMenuOpen
                      ? isDarkView
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-50'
                        : 'bg-slate-100 border-slate-300 text-slate-900'
                      : isDarkView
                        ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {accountMenuOpen && (
                  <div
                    className={`absolute right-0 top-full mt-2 w-64 rounded-xl shadow-lg py-2 z-50 border ${
                      isBlackTheme
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div
                      className={`px-4 py-2.5 border-b flex items-center gap-3 ${
                        isBlackTheme ? 'border-zinc-800' : 'border-slate-100'
                      }`}
                    >
                      <ProfileAvatar
                        name={userAccount?.displayName || firebaseUser.displayName || 'Jogador'}
                        photoURL={userAccount?.photoURL || firebaseUser.photoURL || ''}
                        sizeClass="w-9 h-9"
                        textSizeClass="text-xs"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {userAccount?.displayName || firebaseUser.displayName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          {firebaseUser.email}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('profile')}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      Meu Perfil & Níveis
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('wallet')}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Carteira & Saque Pix
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('invites')}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Ticket className="w-3.5 h-3.5" />
                      Convites & Códigos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('notifications')}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center justify-between cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Inbox className="w-3.5 h-3.5" />
                        Caixa de Correio
                      </span>
                      {unreadMailboxCount > 0 && (
                        <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {unreadMailboxCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('dashboard')}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      Resumo Financeiro
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('settings')}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center justify-between cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5" />
                        Configurações
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isBlackTheme ? 'Preto' : 'Claro'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setTutorialOpen(true);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-2 cursor-pointer ${
                        isDarkView
                          ? 'text-zinc-200 hover:bg-zinc-800'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      Tutorial de Boas-vindas
                    </button>
                    <div
                      className={`my-1 border-t ${
                        isBlackTheme ? 'border-zinc-800' : 'border-slate-100'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        logout();
                      }}
                      className={`w-full text-left px-4 py-2 text-xs font-medium text-red-500 flex items-center gap-2 cursor-pointer ${
                        isDarkView ? 'hover:bg-red-950/40' : 'hover:bg-red-50'
                      }`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sair da conta
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isDarkView
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                Entrar com Google
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Abrir menu"
              className={`md:hidden p-2 rounded-lg border cursor-pointer ${
                isDarkView
                  ? 'border-zinc-800 text-zinc-200 hover:bg-zinc-900'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            className={`md:hidden border-t px-4 py-3 flex flex-wrap gap-2 ${
              isBlackTheme
                ? 'border-zinc-800 bg-black'
                : 'border-slate-200 bg-white'
            }`}
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${
                  !isBackofficeRoute && activeTab === item.id
                    ? isDarkView
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-white'
                    : isDarkView
                      ? 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleSelectTab('dashboard')}
              className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${
                !isBackofficeRoute && activeTab === 'dashboard'
                  ? isDarkView
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white'
                  : isDarkView
                    ? 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              Resumo
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('settings')}
              className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${
                !isBackofficeRoute && activeTab === 'settings'
                  ? isDarkView
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white'
                  : isDarkView
                    ? 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              Configurações
            </button>
          </div>
        )}
      </header>

      <aside className="ee-sidebar" aria-label="Menu principal">
        <div className="ee-sidebar-brand"><Gem size={32} /><span>Earn <b>Easy</b></span></div>
        <nav className="ee-sidebar-nav">
          {sidebarItems.map(({ id, label, Icon }, index) => (
            <button key={`${id}-${index}`} type="button" onClick={() => handleSelectTab(id)}
              className={`ee-side-link ${!isBackofficeRoute && activeTab === id ? 'active' : ''}`}>
              <Icon size={19} /><span>{label}</span>
              {id === 'notifications' && unreadMailboxCount > 0 && <small>{unreadMailboxCount}</small>}
            </button>
          ))}
        </nav>
        <button type="button" className="ee-side-logout" onClick={logout}><LogOut size={18} /> Sair</button>
      </aside>

      <main className="ee-main flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {authError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-800 dark:text-red-300">
            {authError}
          </div>
        )}

        {isBackofficeRoute ? (
          !authReady ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-zinc-400">
              Verificando credenciais...
            </div>
          ) : !firebaseUser ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-md mx-auto space-y-4">
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
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-emerald-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer"
                >
                  Entrar com Google
                </button>
                <button
                  type="button"
                  onClick={exitBackoffice}
                  className="px-4 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  Voltar ao App
                </button>
              </div>
            </div>
          ) : !isAdmin ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-md mx-auto space-y-4">
              <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">Acesso Negado</h2>
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Esta conta não possui permissão administrativa.
              </p>
              <button
                type="button"
                onClick={exitBackoffice}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-emerald-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer"
              >
                Voltar para Jogos
              </button>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-zinc-400">
                  Carregando painel administrativo...
                </div>
              }
            >
              <AdminPanel />
            </Suspense>
          )
        ) : (
          <>
            {activeTab === 'games' && (
              <GamesHub
                onNavigateWallet={() => setActiveTab('wallet')}
                onNavigateProfile={() => setActiveTab('profile')}
                onNavigateInvites={() => setActiveTab('invites')}
                onNavigateMailbox={() => setActiveTab('notifications')}
                onNavigateRanking={() => setActiveTab('ranking')}
              />
            )}
            {activeTab === 'invites' && <InvitesAndCodesSection />}
            {activeTab === 'ranking' && (
              <GlobalRanking
                onGoToGames={() => setActiveTab('games')}
                onGoToWallet={() => setActiveTab('wallet')}
              />
            )}
            {activeTab === 'profile' && <PlayerProfile />}
            {activeTab === 'wallet' && <WalletSection />}
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
      </main>

      <footer
        className={`border-t transition-colors ${
          isBlackTheme
            ? 'border-zinc-800 bg-black'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div
          className={`max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${
            isDarkView ? 'text-zinc-400' : 'text-slate-500'
          }`}
        >
          <span>Earn Easy · 1.000 pontos = R$ 0,10 · Limite de 1 conversão diária · Saque Pix mínimo R$ 5,00</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className={`inline-flex items-center gap-1.5 font-medium underline underline-offset-4 cursor-pointer ${
                isDarkView ? 'text-zinc-200 hover:text-white' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Tutorial
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('settings')}
              className={`inline-flex items-center gap-1.5 font-medium underline underline-offset-4 cursor-pointer ${
                isDarkView ? 'text-zinc-200 hover:text-white' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Configurações ({isBlackTheme ? 'Tema Preto' : 'Tema Claro'})
            </button>
            <span>Autenticação Firebase & Proteção Antifraude</span>
          </div>
        </div>
      </footer>

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
        <MainShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
