import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Grid3X3,
  Layers,
  Link2,
  Mail,
  Search,
  Share2,
  Ticket,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GAME_LABELS, GameCategory } from '../types/earneasy';
import { calculatePlayerLevel } from '../utils/levels';
import {
  formatBRL,
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  getTodayUtcDate,
  timestampToMillis,
} from '../utils/pix';
import { DailyCheckinCard } from './DailyCheckinCard';
import { HomeRankingCard } from './HomeRankingCard';
import { ProfileAvatar } from './PlayerProfile';
import { TicTacToeGame } from './games/TicTacToeGame';
import { DotLinkGame } from './games/DotLinkGame';
import { WordSearchGame } from './games/WordSearchGame';
import { MathSprintGame } from './games/MathSprintGame';
import { MemoryMatchGame } from './games/MemoryMatchGame';

interface GameCatalogItem {
  id: GameCategory;
  title: string;
  subtitle: string;
  rewardRange: string;
  avgTime: string;
  Icon: React.FC<{ className?: string }>;
}

const GAME_CATALOG: GameCatalogItem[] = [
  {
    id: 'tic_tac_toe',
    title: GAME_LABELS.tic_tac_toe,
    subtitle: 'Desafie a IA Minimax em partidas rápidas de estratégia.',
    rewardRange: 'Até 240 moedas',
    avgTime: '1 min',
    Icon: Grid3X3,
  },
  {
    id: 'dot_link',
    title: GAME_LABELS.dot_link,
    subtitle: 'Ligue todos os pontos coloridos sem cruzar os fluxos.',
    rewardRange: 'Até 400 moedas',
    avgTime: '2 min',
    Icon: Share2,
  },
  {
    id: 'word_search',
    title: GAME_LABELS.word_search,
    subtitle: 'Encontre todas as palavras ocultas na grade 10×10.',
    rewardRange: 'Até 450 moedas',
    avgTime: '2 min',
    Icon: Search,
  },
  {
    id: 'math_sprint',
    title: GAME_LABELS.math_sprint,
    subtitle: 'Resolva contas em 40s com combo multiplicador de até 3x.',
    rewardRange: 'Até 450 moedas',
    avgTime: '40 seg',
    Icon: Calculator,
  },
  {
    id: 'memory_match',
    title: GAME_LABELS.memory_match,
    subtitle: 'Combine os 8 pares com o mínimo de tentativas possível.',
    rewardRange: 'Até 380 moedas',
    avgTime: '1 min',
    Icon: Layers,
  },
];

interface GamesHubProps {
  onNavigateWallet: () => void;
  onNavigateProfile?: () => void;
  onNavigateInvites?: () => void;
  onNavigateMailbox?: () => void;
  onNavigateRanking?: () => void;
}

export const GamesHub: React.FC<GamesHubProps> = ({
  onNavigateWallet,
  onNavigateProfile,
  onNavigateInvites,
  onNavigateMailbox,
  onNavigateRanking,
}) => {
  const {
    firebaseUser,
    userAccount,
    myInvitedReferrals,
    publicPromoEvents,
    myPromoRedemptions,
    unreadMailboxCount,
    signInWithGoogle,
    recordGameReward,
    redeemPromoCode,
  } = useAuth();

  const [activeGame, setActiveGame] = useState<GameCategory | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [redeemingCode, setRedeemingCode] = useState<string | null>(null);
  const [highlightFeedback, setHighlightFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const levelInfo = userAccount
    ? calculatePlayerLevel(userAccount.lifetimePoints, userAccount.gamesPlayed)
    : null;

  const today = getTodayUtcDate();
  const canConvertToday = userAccount ? userAccount.lastConversionDate !== today : false;

  const inviteOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://earn-easy-z6eg.onrender.com';
  const inviteLink = userAccount ? `${inviteOrigin}/?ref=${userAccount.uid}` : '';

  const redeemedCodesSet = new Set(myPromoRedemptions.map((r) => r.code));
  const publishedEvents = publicPromoEvents.filter(
    (ev) => timestampToMillis(ev.publishAt) <= nowMs
  );
  const upcomingEvents = publicPromoEvents
    .filter((ev) => timestampToMillis(ev.publishAt) > nowMs)
    .sort((a, b) => timestampToMillis(a.publishAt) - timestampToMillis(b.publishAt));

  const totalInviteCommissionPts = myInvitedReferrals.reduce(
    (sum, r) => sum + (r.totalCommissionPointsEarned || 0),
    0
  );

  const handleCopyInvite = async (value: string, kind: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(value);
      if (kind === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleQuickRedeem = async (code: string) => {
    setHighlightFeedback(null);
    setRedeemingCode(code);
    try {
      const res = await redeemPromoCode(code);
      setHighlightFeedback({
        type: 'success',
        text: `Código ${res.code} resgatado! +${formatPoints(res.pointsAwarded)} moedas adicionadas ao seu saldo.`,
      });
    } catch (err) {
      setHighlightFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível resgatar o código.',
      });
    } finally {
      setRedeemingCode(null);
    }
  };

  const handlePlayClick = (gameId: GameCategory) => {
    if (!firebaseUser) {
      signInWithGoogle();
      return;
    }
    setActiveGame(gameId);
  };

  const handleGameComplete = async (
    category: GameCategory,
    score: number,
    durationMs: number,
    movesCount: number
  ) => {
    return recordGameReward({
      gameCategory: category,
      scoreEarned: score,
      durationMs,
      movesCount,
    });
  };

  if (activeGame) {
    return (
      <div className="space-y-6">
        {activeGame === 'tic_tac_toe' && (
          <TicTacToeGame
            onComplete={(s, d, m) => handleGameComplete('tic_tac_toe', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'dot_link' && (
          <DotLinkGame
            onComplete={(s, d, m) => handleGameComplete('dot_link', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'word_search' && (
          <WordSearchGame
            onComplete={(s, d, m) => handleGameComplete('word_search', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'math_sprint' && (
          <MathSprintGame
            onComplete={(s, d, m) => handleGameComplete('math_sprint', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'memory_match' && (
          <MemoryMatchGame
            onComplete={(s, d, m) => handleGameComplete('memory_match', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. TOPO ORGANIZADO: RESUMO DO JOGADOR + RANKING TOP 5 LOGO NO INÍCIO */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Esquerda: Resumo Limpo + Ações Principais */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between gap-6">
          {firebaseUser && userAccount && levelInfo ? (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <ProfileAvatar
                      name={userAccount.displayName}
                      photoURL={userAccount.photoURL}
                      sizeClass="w-12 h-12"
                    />
                    <div className="min-w-0">
                      <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight truncate">
                        Olá, {userAccount.displayName}
                      </h1>
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Nível {levelInfo.level} · {levelInfo.title} · {formatPoints(levelInfo.xp)} XP
                      </p>
                    </div>
                  </div>

                  {onNavigateProfile && (
                    <button
                      type="button"
                      onClick={onNavigateProfile}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      Perfil
                    </button>
                  )}
                </div>

                <div className="w-full h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300 rounded-full"
                    style={{ width: `${levelInfo.progressPct}%` }}
                  />
                </div>
              </div>

              {/* 3 Métricas Limpas com Divisória (sem caixinhas poluídas) */}
              <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-zinc-800 py-3 border-y border-slate-100 dark:border-zinc-800">
                <div className="pr-3">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">Moedas</div>
                  <div className="text-lg sm:text-xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                    {formatPoints(userAccount.pointsBalance)}
                  </div>
                </div>
                <div className="px-4">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">Saldo Pix</div>
                  <div className="text-lg sm:text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                    {formatBRL(userAccount.brlBalanceCents)}
                  </div>
                </div>
                <div className="pl-4">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">Conversão Hoje</div>
                  <div className="text-sm sm:text-base font-semibold text-slate-900 dark:text-zinc-100 mt-1">
                    {canConvertToday ? 'Liberada' : 'Já feita'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveGame('dot_link')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Jogar Agora
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onNavigateWallet}
                  className="px-4 py-2.5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 text-xs sm:text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Carteira Pix
                </button>
                {onNavigateMailbox && (
                  <button
                    type="button"
                    onClick={onNavigateMailbox}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 text-xs font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Correio{unreadMailboxCount > 0 ? ` (${unreadMailboxCount})` : ''}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-4 py-4">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                1.000 moedas = R$ 0,10 · Saque Pix mínimo R$ 5,00
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight">
                Jogue desafios de lógica e saque via Pix.
              </h1>
              <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-lg">
                Acumule moedas jogando, convide amigos e resgate códigos promocionais enviados na sua Caixa de Correio.
              </p>
              <button
                type="button"
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Entrar com Google
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Direita: Ranking Top 5 no Início */}
        <div className="lg:col-span-5">
          <HomeRankingCard onViewFullRanking={onNavigateRanking || onNavigateWallet} />
        </div>
      </section>

      {/* 2. CATÁLOGO DE JOGOS EM DESTAQUE CENTRAL */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-zinc-50">
              Jogos Disponíveis
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
              Escolha um desafio para ganhar moedas na hora.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAME_CATALOG.map((game) => {
            const { Icon } = game;
            return (
              <div
                key={game.id}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                      {game.rewardRange} · {game.avgTime}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                      {game.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed mt-1">
                      {game.subtitle}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handlePlayClick(game.id)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
                >
                  {firebaseUser ? 'Jogar' : 'Entrar e Jogar'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. LINHA ORGANIZADA: DESTAQUES (CONVITES + EVENTOS) + CHECK-IN DIÁRIO */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Esquerda: Destaques Compactos (Link/Código de Convite + Códigos Ativos) */}
        <div className="lg:col-span-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Users className="w-4 h-4" />
                Destaques · Convites & Códigos
              </div>
              {onNavigateInvites && (
                <button
                  type="button"
                  onClick={onNavigateInvites}
                  className="text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:text-emerald-700 dark:hover:text-emerald-400 underline underline-offset-4 cursor-pointer"
                >
                  Digitar código
                </button>
              )}
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
                Convide e ganhe +500 moedas + 12% sempre
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {myInvitedReferrals.length} amigo(s) · +{formatPoints(totalInviteCommissionPts)} moedas em comissões
              </p>
            </div>

            {userAccount && (
              <div className="space-y-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 text-xs font-mono text-slate-800 dark:text-zinc-200 bg-transparent focus:outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyInvite(inviteLink, 'link')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shrink-0 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedLink ? 'Copiado' : 'Link'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-zinc-800 text-[11px]">
                  <span className="text-slate-500 dark:text-zinc-400 truncate">
                    Código:{' '}
                    <code className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                      {userAccount.uid}
                    </code>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyInvite(userAccount.uid, 'code')}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer shrink-0"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Eventos de Código Publicados ou Próximo Programado */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <span className="inline-flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  Eventos de Código
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {publishedEvents.length} ativo(s)
                </span>
              </div>

              {highlightFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs ${
                    highlightFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}
                >
                  {highlightFeedback.text}
                </div>
              )}

              {publishedEvents.length === 0 && upcomingEvents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400 py-2">
                  Sem códigos públicos no momento. Novos códigos aparecem aqui e na Caixa de Correio.
                </p>
              ) : (
                <div className="space-y-2">
                  {publishedEvents.slice(0, 2).map((ev) => {
                    const redeemed = redeemedCodesSet.has(ev.code);
                    const soldOut = ev.redemptionCount >= ev.maxRedemptions;
                    return (
                      <div
                        key={ev.code}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">
                            {ev.title}
                          </div>
                          <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                            {ev.code} · +{formatPoints(ev.pointsValue)} moedas
                          </div>
                        </div>
                        {redeemed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resgatado
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={soldOut || redeemingCode === ev.code}
                            onClick={() => handleQuickRedeem(ev.code)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                          >
                            {soldOut
                              ? 'Esgotado'
                              : redeemingCode === ev.code
                                ? '...'
                                : 'Resgatar'}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {upcomingEvents.slice(0, 1).map((ev) => {
                    const publishMs = timestampToMillis(ev.publishAt);
                    return (
                      <div
                        key={ev.code}
                        className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300"
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          Em breve: <strong>+{formatPoints(ev.pointsValue)} moedas</strong> às{' '}
                          {formatScheduleTime(publishMs)} ({formatScheduleRemaining(publishMs, nowMs)})
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Direita: Check-in Diário Compacto */}
        <div className="lg:col-span-6">
          <DailyCheckinCard />
        </div>
      </section>
    </div>
  );
};
