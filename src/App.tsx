import React, { Suspense, lazy, useEffect, useState } from 'react';
import { LogOut, Menu, ShieldAlert, X } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GamesHub } from './components/GamesHub';
import { WalletSection } from './components/WalletSection';
import { DashboardSection } from './components/DashboardSection';
import { NotificationsSection } from './components/NotificationsSection';
import { formatBRL } from './utils/pix';

const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((mod) => ({ default: mod.AdminPanel }))
);

type NavTab = 'games' | 'wallet' | 'dashboard' | 'notifications';

function isPrivateBackofficeUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/backoffice' ||
    window.location.hash === '#/backoffice'
  );
}

function MainShell() {
  const { firebaseUser, authReady, userAccount, isAdmin, authError, signInWithGoogle, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('games');
  const [isBackofficeRoute, setIsBackofficeRoute] = useState<boolean>(() => isPrivateBackofficeUrl());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    const syncRoute = () => setIsBackofficeRoute(isPrivateBackofficeUrl());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const exitBackoffice = () => {
    window.history.pushState({}, '', '/');
    setIsBackofficeRoute(false);
    setActiveTab('games');
  };

  const navItems: { id: NavTab; label: string }[] = [
    { id: 'games', label: 'Jogos' },
    { id: 'wallet', label: 'Carteira Pix' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'notifications', label: 'Notificações' },
  ];

  const handleSelectTab = (tab: NavTab) => {
    if (isBackofficeRoute) {
      window.history.pushState({}, '', '/');
      setIsBackofficeRoute(false);
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => handleSelectTab('games')}
            className="text-lg font-display font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Earn Easy
          </button>

          {/* Zone 2: 4 clean single-line text nav links (no public Admin link) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  !isBackofficeRoute && activeTab === item.id
                    ? 'text-slate-900 font-semibold border-b-2 border-emerald-600'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0 relative">
            {!authReady ? (
              <span className="text-xs text-slate-400 whitespace-nowrap">Carregando...</span>
            ) : firebaseUser ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  className="px-4 py-2 text-xs font-mono font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  {formatBRL(userAccount?.brlBalanceCents || 0)}
                </button>
                {accountMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {userAccount?.displayName || firebaseUser.displayName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">
                        {firebaseUser.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('wallet')}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Carteira & Saque Pix
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
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
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Entrar com Google
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Abrir menu"
              className="md:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg whitespace-nowrap ${
                  !isBackofficeRoute && activeTab === item.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {authError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
            {authError}
          </div>
        )}

        {isBackofficeRoute ? (
          !authReady ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Verificando credenciais...
            </div>
          ) : !firebaseUser ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-md mx-auto space-y-4">
              <ShieldAlert className="w-8 h-8 text-slate-700 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900">Portal Restrito de Operações</h2>
              <p className="text-xs text-slate-600">
                Autentique-se com a conta administradora autorizada para acessar esta área.
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Entrar com Google
                </button>
                <button
                  type="button"
                  onClick={exitBackoffice}
                  className="px-4 py-2 text-xs font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Voltar ao App
                </button>
              </div>
            </div>
          ) : !isAdmin ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-md mx-auto space-y-4">
              <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900">Acesso Negado</h2>
              <p className="text-xs text-slate-600">
                Esta conta não possui permissão administrativa.
              </p>
              <button
                type="button"
                onClick={exitBackoffice}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Voltar para Jogos
              </button>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
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
              <GamesHub onNavigateWallet={() => setActiveTab('wallet')} />
            )}
            {activeTab === 'wallet' && <WalletSection />}
            {activeTab === 'dashboard' && <DashboardSection />}
            {activeTab === 'notifications' && <NotificationsSection />}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>Earn Easy · 1.000 pontos = R$ 0,10 · Limite de 1 conversão diária · Saque Pix mínimo R$ 5,00</span>
          <span>Autenticação Firebase & Proteção Antifraude</span>
        </div>
      </footer>
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
