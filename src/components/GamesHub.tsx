import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Dices,
  Gamepad2,
  Inbox,
  Layers,
  Link2,
  Play,
  Search,
  Sparkles,
  Star,
  Target,
  Ticket,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { GAME_LABELS, GameCategory, LeaderboardEntry } from '../types/earneasy';
import { GAME_THUMBNAILS, heroGamingBannerImg } from '../utils/gameArt';
import { calculatePlayerLevel } from '../utils/levels';
import {
  extractReadableError,
  formatBRL,
  formatPoints,
  formatScheduleRemaining,
  formatScheduleTime,
  timestampToMillis,
} from '../utils/pix';
import { DailyCheckinCard } from './DailyCheckinCard';
import { HomeRankingCard } from './HomeRankingCard';
import { BattleshipSoloGame } from './games/BattleshipSoloGame';
import { BlockBritzGame } from './games/BlockBritzGame';
import { Connect4SoloGame } from './games/Connect4SoloGame';
import { DominoSoloGame } from './games/DominoSoloGame';
import { DotLinkGame } from './games/DotLinkGame';
import { DrawGuessSoloGame } from './games/DrawGuessSoloGame';
import { GuessNumberSoloGame } from './games/GuessNumberSoloGame';
import { HighLowCardsGame } from './games/HighLowCardsGame';
import { MathSprintGame } from './games/MathSprintGame';
import { MemoryMatchGame } from './games/MemoryMatchGame';
import { QuickReflexGame } from './games/QuickReflexGame';
import { QuizSoloGame } from './games/QuizSoloGame';
import { RpsSoloGame } from './games/RpsSoloGame';
import { StopSoloGame } from './games/StopSoloGame';
import { TicTacToeGame } from './games/TicTacToeGame';
import { WordSearchGame } from './games/WordSearchGame';

type FilterGroupId =
  | 'all'
  | 'raciocinio'
  | 'reflexo'
  | 'cartas'
  | 'palavras'
  | 'estrategia';

interface GameCatalogItem {
  id: GameCategory;
  title: string;
  subtitle: string;
  rewardRange: string;
  avgTime: string;
  groups: FilterGroupId[];
}

const FILTER_TABS: Array<{
  id: FilterGroupId;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'all', label: 'Todos', Icon: Sparkles },
  { id: 'raciocinio', label: 'Raciocínio', Icon: Brain },
  { id: 'reflexo', label: 'Reflexo', Icon: Zap },
  { id: 'cartas', label: 'Cartas', Icon: Layers },
  { id: 'palavras', label: 'Palavras', Icon: Search },
  { id: 'estrategia', label: 'Estratégia', Icon: Target },
];

const GAME_CATALOG: GameCatalogItem[] = [
  {
    id: 'tic_tac_toe',
    title: GAME_LABELS.tic_tac_toe,
    subtitle: 'Enfrente a IA Minimax em duelos rápidos e avance pelas fases.',
    rewardRange: 'Até 240 pts',
    avgTime: '1 min',
    groups: ['estrategia', 'raciocinio'],
  },
  {
    id: 'word_search',
    title: GAME_LABELS.word_search,
    subtitle: 'Encontre todas as palavras escondidas no tabuleiro 10×10.',
    rewardRange: 'Até 450 pts',
    avgTime: '2 min',
    groups: ['palavras', 'raciocinio'],
  },
  {
    id: 'dot_link',
    title: GAME_LABELS.dot_link,
    subtitle: 'Conecte os pontos da mesma cor sem cruzar caminhos.',
    rewardRange: 'Até 400 pts',
    avgTime: '2 min',
    groups: ['raciocinio', 'estrategia'],
  },
  {
    id: 'memory_match',
    title: GAME_LABELS.memory_match,
    subtitle: 'Encontre os 8 pares com poucos erros e treine sua memória!',
    rewardRange: 'Até 380 pts',
    avgTime: '1 min',
    groups: ['cartas', 'raciocinio'],
  },
  {
    id: 'high_low_cards',
    title: GAME_LABELS.high_low_cards,
    subtitle: 'Adivinhe se a próxima carta será maior ou menor em 8 rodadas.',
    rewardRange: 'Até 380 pts',
    avgTime: '1 min',
    groups: ['cartas', 'estrategia'],
  },
  {
    id: 'math_sprint',
    title: GAME_LABELS.math_sprint,
    subtitle: 'Resolva contas contra o tempo com combo multiplicador de até 3x.',
    rewardRange: 'Até 450 pts',
    avgTime: '40 seg',
    groups: ['raciocinio', 'reflexo'],
  },
  {
    id: 'quick_reflex',
    title: GAME_LABELS.quick_reflex,
    subtitle: 'Toque no alvo luminoso o mais rápido possível em 12 rodadas.',
    rewardRange: 'Até 400 pts',
    avgTime: '30 seg',
    groups: ['reflexo'],
  },
  {
    id: 'block_britz',
    title: GAME_LABELS.block_britz,
    subtitle: 'Encaixe blocos no tabuleiro 8×8 e ganhe +30 moedas a cada 1.000 pts no jogo.',
    rewardRange: '30 pts / 1.000',
    avgTime: '2 min',
    groups: ['estrategia', 'raciocinio'],
  },
  {
    id: 'domino_solo',
    title: GAME_LABELS.domino_solo,
    subtitle: 'Dominó Duplo-6 com carroças verticais, modo Mestre, soma de pontos e dica tática.',
    rewardRange: 'Até 350 pts',
    avgTime: '2 min',
    groups: ['estrategia', 'raciocinio'],
  },
  {
    id: 'stop_solo',
    title: GAME_LABELS.stop_solo,
    subtitle: 'Modos Clássico ou Turbo, troca de letra 1x, validação ao vivo e duelo contra a IA.',
    rewardRange: 'Até 360 pts',
    avgTime: '1 min',
    groups: ['palavras', 'reflexo'],
  },
  {
    id: 'draw_guess_solo',
    title: GAME_LABELS.draw_guess_solo,
    subtitle: '16 desenhos inéditos em tempo real com cronômetro e opção de 4 alternativas.',
    rewardRange: 'Até 360 pts',
    avgTime: '1 min',
    groups: ['palavras', 'raciocinio'],
  },
  {
    id: 'battleship_solo',
    title: GAME_LABELS.battleship_solo,
    subtitle: 'Posicione navios manualmente, dispare o Sonar 3×3 e afunde a frota inimiga.',
    rewardRange: 'Até 380 pts',
    avgTime: '2 min',
    groups: ['estrategia'],
  },
  {
    id: 'connect4_solo',
    title: GAME_LABELS.connect4_solo,
    subtitle: 'Modo Normal ou Estrategista (Minimax), prévia de disco, alerta e desfazer 1x.',
    rewardRange: 'Até 320 pts',
    avgTime: '1 min',
    groups: ['estrategia', 'raciocinio'],
  },
  {
    id: 'quiz_solo',
    title: GAME_LABELS.quiz_solo,
    subtitle: '54 perguntas por tema sem repetição, ajudas 50/50 e +10s com combo multiplicador.',
    rewardRange: 'Até 360 pts',
    avgTime: '1 min',
    groups: ['raciocinio', 'palavras'],
  },
  {
    id: 'rps_solo',
    title: GAME_LABELS.rps_solo,
    subtitle: 'Melhor de 5 ou 7 rodadas contra IA Analista, Carta 2x e histórico ao vivo.',
    rewardRange: 'Até 280 pts',
    avgTime: '30 seg',
    groups: ['reflexo', 'estrategia'],
  },
  {
    id: 'guess_number_solo',
    title: GAME_LABELS.guess_number_solo,
    subtitle: '3 cofres (1–100 até 1–500), medidor visual, atalhos rápidos e Scanner Par/Ímpar.',
    rewardRange: 'Até 300 pts',
    avgTime: '45 seg',
    groups: ['raciocinio'],
  },
];

interface GamesHubProps {
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  onNavigateWallet: () => void;
  onNavigateProfile?: () => void;
  onNavigateInvites?: () => void;
  onNavigateMailbox?: () => void;
  onNavigateRanking?: () => void;
  onNavigateFriends?: () => void;
  onNavigatePlayFriends?: () => void;
  onInspectPlayer?: (player: LeaderboardEntry, rank: number) => void;
}

export const GamesHub: React.FC<GamesHubProps> = React.memo(({
  searchQuery = '',
  onSearchQueryChange,
  onNavigateWallet,
  onNavigateInvites,
  onNavigateMailbox,
  onNavigateRanking,
  onNavigateFriends,
  onNavigatePlayFriends,
  onInspectPlayer,
}) => {
  const { showToast } = useToast();
  const {
    firebaseUser,
    userAccount,
    mySessions,
    myInvitedReferrals,
    publicPromoEvents,
    myPromoRedemptions,
    unreadMailboxCount,
    withdrawalSettings,
    activeMinWithdrawalCents,
    isFirstWithdrawalEligible,
    signInWithGoogle,
    recordGameReward,
    redeemPromoCode,
  } = useAuth();

  const [activeGame, setActiveGame] = useState<GameCategory | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<FilterGroupId>('all');
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

  const phaseByCategory = useMemo(() => {
    const map: Record<GameCategory, number> = {
      tic_tac_toe: 1,
      word_search: 1,
      dot_link: 1,
      math_sprint: 1,
      memory_match: 1,
      quick_reflex: 1,
      high_low_cards: 1,
      block_britz: 1,
      domino_solo: 1,
      stop_solo: 1,
      draw_guess_solo: 1,
      battleship_solo: 1,
      connect4_solo: 1,
      quiz_solo: 1,
      rps_solo: 1,
      guess_number_solo: 1,
    };
    mySessions.forEach((s) => {
      if (s.verificationStatus === 'verified' && map[s.gameCategory] !== undefined) {
        map[s.gameCategory] += 1;
      }
    });
    return map;
  }, [mySessions]);

  const filteredGames = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return GAME_CATALOG.filter((game) => {
      const matchesGroup = selectedGroup === 'all' || game.groups.includes(selectedGroup);
      if (!matchesGroup) return false;
      if (!term) return true;
      return (
        game.title.toLowerCase().includes(term) ||
        game.subtitle.toLowerCase().includes(term)
      );
    });
  }, [selectedGroup, searchQuery]);

  const levelInfo = userAccount
    ? calculatePlayerLevel(userAccount.lifetimePoints, userAccount.gamesPlayed)
    : null;

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

  const brlCents = userAccount?.brlBalanceCents ?? 0;
  const ptsBalance = userAccount?.pointsBalance ?? 0;
  const minTargetCents = Math.max(1, activeMinWithdrawalCents);
  const remainingForPixCents = Math.max(0, minTargetCents - brlCents);
  const pixProgressPct = Math.min(100, Math.round((brlCents / minTargetCents) * 100));

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
      const msg = `Código ${res.code} resgatado! +${formatPoints(res.pointsAwarded)} moedas adicionadas ao seu saldo.`;
      setHighlightFeedback({
        type: 'success',
        text: msg,
      });
      showToast({ type: 'success', title: 'Código resgatado!', message: msg });
    } catch (err) {
      const msg = extractReadableError(err, 'Não foi possível resgatar o código.');
      setHighlightFeedback({
        type: 'error',
        text: msg,
      });
      showToast({ type: 'error', title: 'Falha no resgate', message: msg });
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
        {activeGame === 'quick_reflex' && (
          <QuickReflexGame
            onComplete={(s, d, m) => handleGameComplete('quick_reflex', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'high_low_cards' && (
          <HighLowCardsGame
            onComplete={(s, d, m) => handleGameComplete('high_low_cards', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'block_britz' && (
          <BlockBritzGame
            onComplete={(s, d, m) => handleGameComplete('block_britz', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'domino_solo' && (
          <DominoSoloGame
            onComplete={(s, d, m) => handleGameComplete('domino_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'stop_solo' && (
          <StopSoloGame
            onComplete={(s, d, m) => handleGameComplete('stop_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'draw_guess_solo' && (
          <DrawGuessSoloGame
            onComplete={(s, d, m) => handleGameComplete('draw_guess_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'battleship_solo' && (
          <BattleshipSoloGame
            onComplete={(s, d, m) => handleGameComplete('battleship_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'connect4_solo' && (
          <Connect4SoloGame
            onComplete={(s, d, m) => handleGameComplete('connect4_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'quiz_solo' && (
          <QuizSoloGame
            onComplete={(s, d, m) => handleGameComplete('quiz_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'rps_solo' && (
          <RpsSoloGame
            onComplete={(s, d, m) => handleGameComplete('rps_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
        {activeGame === 'guess_number_solo' && (
          <GuessNumberSoloGame
            onComplete={(s, d, m) => handleGameComplete('guess_number_solo', s, d, m)}
            onExit={() => setActiveGame(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 1. HERO GAMING BANNER + MINHA CARTEIRA SPLIT */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Obsidian Hero Gaming Banner */}
        <div className="lg:col-span-7 xl:col-span-8 relative overflow-hidden rounded-3xl border border-lime-500/35 dark:border-lime-400/35 bg-[#080d0b] min-h-[210px] sm:min-h-[230px] flex flex-col justify-between p-5 sm:p-7 shadow-xl shadow-black/25">
          <img
            src={heroGamingBannerImg}
            alt="Controle gamer 3D e moedas Earn Easy"
            className="absolute inset-0 w-full h-full object-cover object-right opacity-85"
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#070b0a]/95 via-[#070b0a]/82 to-[#070b0a]/25"
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-lg space-y-3">
            {levelInfo && (
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-lime-300">
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>
                  Olá, {userAccount?.displayName} · Nível {levelInfo.level} ({levelInfo.title})
                </span>
              </div>
            )}

            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight leading-tight">
              Jogue, complete <span className="italic text-lime-300">fases</span> e ganhe{' '}
              <span className="text-lime-400">pontos!</span>
            </h1>

            <p className="text-xs sm:text-sm text-zinc-200/90 leading-relaxed max-w-md">
              16 jogos solo gratuitos, fases infinitas, arenas multiplayer com amigos e saque direto via Pix!
            </p>
          </div>

          <div className="relative z-10 pt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handlePlayClick('dot_link')}
              className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs sm:text-sm font-extrabold shadow-lg shadow-lime-500/20 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              {firebaseUser ? 'Jogar Agora' : 'Entrar e Jogar'}
            </button>
            {onNavigatePlayFriends && (
              <button
                type="button"
                onClick={onNavigatePlayFriends}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-lime-400/40 text-lime-300 text-xs sm:text-sm font-bold transition-colors cursor-pointer backdrop-blur-sm"
              >
                <Users className="w-4 h-4" />
                Jogar com Amigos
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateInvites}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer backdrop-blur-sm"
            >
              <Ticket className="w-4 h-4 text-lime-300" />
              Resgatar Código
            </button>
          </div>
        </div>

        {/* Right: Minha Carteira Card */}
        <div className="lg:col-span-5 xl:col-span-4 rounded-3xl border border-slate-200 dark:border-lime-500/25 bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-xl p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-lg shadow-slate-900/5 dark:shadow-black/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-lime-400/15 border border-emerald-200 dark:border-lime-400/30 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <h2 className="text-base font-display font-bold text-slate-900 dark:text-white">
                Minha Carteira
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              {isFirstWithdrawalEligible ? '1º Saque Promo' : 'Saque Padrão'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131922] p-3.5 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                Seus Pontos
              </div>
              <div className="flex items-center gap-1.5 text-base sm:text-lg font-mono font-extrabold text-slate-900 dark:text-white tabular-nums">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                <span>{formatPoints(ptsBalance)}</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">pts</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131922] p-3.5 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                Saldo Convertido
              </div>
              <div className="flex items-center gap-1.5 text-base sm:text-lg font-mono font-extrabold text-emerald-700 dark:text-lime-300 tabular-nums">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{formatBRL(brlCents)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-zinc-300 font-medium leading-snug">
                  {remainingForPixCents === 0
                    ? 'Saque Pix liberado!'
                    : `Faltam ${formatBRL(remainingForPixCents)} para liberar o saque`}
                </span>
                <span className="font-mono font-bold text-emerald-700 dark:text-lime-400 tabular-nums shrink-0">
                  {pixProgressPct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 rounded-full transition-all duration-300"
                  style={{ width: `${pixProgressPct}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onNavigateWallet}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold flex items-center justify-center gap-2 shadow-md shadow-lime-500/15 transition-colors cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              Sacar via Pix
            </button>
          </div>
        </div>
      </section>

      {/* Mobile Live Game Search Bar */}
      {onSearchQueryChange && (
        <div className="md:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Buscar jogos pelo nome..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0e1319] text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400"
            />
          </div>
        </div>
      )}

      {/* 2. CATÁLOGO DE JOGOS & FASES */}
      <section id="games-catalog" className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="w-6 h-6 text-emerald-600 dark:text-lime-400 shrink-0" />
            <div>
              <h2 className="text-lg sm:text-xl font-display font-extrabold text-slate-900 dark:text-white tracking-tight">
                Escolha um Jogo e Avance nas Fases
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Cada partida verificada avança 1 fase no jogo e soma pontos na sua conta.
              </p>
            </div>
          </div>

          {/* 6 Filter Tabs + Jogo Aleatório */}
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTER_TABS.map(({ id, label, Icon }) => {
              const active = selectedGroup === id;
              const count =
                id === 'all'
                  ? GAME_CATALOG.length
                  : GAME_CATALOG.filter((g) => g.groups.includes(id)).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedGroup(id)}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-lime-400 border-lime-300 text-slate-950 shadow-sm shadow-lime-500/20'
                      : 'bg-white dark:bg-[#0e1319] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-lime-400/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                  <span className="font-mono text-[10px] opacity-70">{count}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                const pool = filteredGames.length > 0 ? filteredGames : GAME_CATALOG;
                const randomGame = pool[Math.floor(Math.random() * pool.length)];
                handlePlayClick(randomGame.id);
              }}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-lime-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5 shrink-0" />
              <span>Aleatório</span>
            </button>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
              Nenhum jogo encontrado para essa busca ou categoria.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedGroup('all');
                onSearchQueryChange?.('');
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold cursor-pointer"
            >
              Mostrar Todos os {GAME_CATALOG.length} Jogos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredGames.map((game) => {
              const phase = phaseByCategory[game.id] || 1;
              return (
                <article
                  key={game.id}
                  className="group rounded-3xl border border-slate-200 dark:border-lime-500/20 bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md overflow-hidden flex flex-col justify-between hover:border-emerald-400 dark:hover:border-lime-400/70 transition-all duration-150 hover:-translate-y-0.5 shadow-sm shadow-slate-900/5 dark:shadow-black/50"
                >
                  <div>
                    {/* Game Visual Header with Clear Unclipped Phase Label */}
                    <div className="relative h-36 sm:h-40 w-full bg-[#090d12] overflow-hidden">
                      <img
                        src={GAME_THUMBNAILS[game.id]}
                        alt={game.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div
                        className="absolute inset-0 bg-gradient-to-t from-[#0e1319] via-[#0e1319]/20 to-transparent opacity-90"
                        aria-hidden="true"
                      />
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/75 border border-lime-400/50 text-lime-300 text-xs font-mono font-bold whitespace-nowrap shadow-sm">
                        Fase {phase}
                      </span>
                    </div>

                    {/* Card Details — Never Truncated */}
                    <div className="px-4 pt-3 pb-2 space-y-1.5">
                      <h3 className="text-base font-display font-extrabold text-slate-900 dark:text-white leading-snug">
                        {game.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                        {game.subtitle}
                      </p>
                      <div className="pt-1 text-[11px] font-mono text-emerald-700 dark:text-lime-400 font-semibold tabular-nums">
                        {game.rewardRange} · {game.avgTime}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-2">
                    <button
                      type="button"
                      onClick={() => handlePlayClick(game.id)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs sm:text-sm font-extrabold rounded-xl transition-colors shadow-sm shadow-lime-500/15 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {firebaseUser ? 'Jogar' : 'Entrar e Jogar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. ATALHOS RÁPIDOS DO APLICATIVO (SEM TEXTO CORTADO) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={onNavigateRanking || onNavigateWallet}
          className="text-left min-h-[68px] bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 hover:border-lime-400 rounded-2xl p-4 flex items-center justify-between gap-3 transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer shadow-sm"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              Ranking Global
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
              Veja os líderes e inspecione perfis
            </div>
          </div>
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={onNavigateFriends}
          className="text-left min-h-[68px] bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 hover:border-lime-400 rounded-2xl p-4 flex items-center justify-between gap-3 transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer shadow-sm"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              Amigos & Chat
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
              Adicione jogadores e converse
            </div>
          </div>
          <Users className="w-5 h-5 text-sky-500 dark:text-sky-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={onNavigateInvites}
          className="text-left min-h-[68px] bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 hover:border-lime-400 rounded-2xl p-4 flex items-center justify-between gap-3 transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer shadow-sm"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              Resgatar Códigos
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
              +500 pts · {publishedEvents.length} código(s) ativo(s)
            </div>
          </div>
          <Ticket className="w-5 h-5 text-emerald-600 dark:text-lime-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={onNavigateMailbox}
          className="text-left min-h-[68px] bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 hover:border-lime-400 rounded-2xl p-4 flex items-center justify-between gap-3 transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer shadow-sm"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
              Caixa de Correio{unreadMailboxCount > 0 ? ` (${unreadMailboxCount})` : ''}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
              Avisos e mensagens do ADM
            </div>
          </div>
          <Inbox className="w-5 h-5 text-emerald-600 dark:text-lime-400 shrink-0" />
        </button>
      </section>

      {/* 4. MISSÕES DIÁRIAS (CHECK-IN), CONVITES & RANKING TOP 5 */}
      <section id="checkin-section" className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-6">
          <DailyCheckinCard />
        </div>

        <div className="lg:col-span-6 bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-5 shadow-sm">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-lime-400">
                <Users className="w-4 h-4" />
                Destaques · Convites & Códigos
              </div>
              {onNavigateInvites && (
                <button
                  type="button"
                  onClick={onNavigateInvites}
                  className="text-xs font-bold text-slate-700 dark:text-lime-300 hover:underline underline-offset-4 cursor-pointer"
                >
                  Digitar código
                </button>
              )}
            </div>

            <div>
              <h3 className="text-base font-display font-bold text-slate-900 dark:text-white">
                Convide amigos e ganhe +500 moedas + 12% sempre
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                {myInvitedReferrals.length} amigo(s) · +{formatPoints(totalInviteCommissionPts)} moedas em comissões
              </p>
            </div>

            {userAccount && (
              <div className="space-y-2.5 bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5">
                <div className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 text-xs font-mono text-slate-800 dark:text-zinc-200 bg-transparent focus:outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopyInvite(inviteLink, 'link')}
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-[11px] font-bold rounded-lg shrink-0 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedLink ? 'Copiado' : 'Link'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-zinc-800 text-[11px]">
                  <span className="text-slate-500 dark:text-zinc-400 break-all">
                    Código:{' '}
                    <code className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                      {userAccount.uid}
                    </code>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyInvite(userAccount.uid, 'code')}
                    className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-lime-400 hover:underline cursor-pointer shrink-0"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? 'Copiado' : 'Copiar ID'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <span className="inline-flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-amber-500" />
                  Eventos de Código
                </span>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {publishedEvents.length} ativo(s)
                </span>
              </div>

              {highlightFeedback && (
                <div
                  className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
                    highlightFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                  }`}
                >
                  {highlightFeedback.text}
                </div>
              )}

              {publishedEvents.length === 0 && upcomingEvents.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400 py-2 leading-relaxed">
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
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-snug break-words">
                            {ev.title}
                          </div>
                          <div className="text-[11px] font-mono text-emerald-700 dark:text-lime-400">
                            {ev.code} · +{formatPoints(ev.pointsValue)} moedas
                          </div>
                        </div>
                        {redeemed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-lime-400 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resgatado
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={soldOut || redeemingCode === ev.code}
                            onClick={() => handleQuickRedeem(ev.code)}
                            className="min-h-[38px] px-3 py-1.5 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-lg shrink-0 cursor-pointer"
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
                        className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300"
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="leading-snug">
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
      </section>

      {/* 5. RANKING TOP 5 AO VIVO */}
      <section>
        <HomeRankingCard
          onViewFullRanking={onNavigateRanking || onNavigateWallet}
          onInspectPlayer={onInspectPlayer}
        />
      </section>
    </div>
  );
});

GamesHub.displayName = 'GamesHub';
