import React, { useState } from 'react';
import {
  ArrowRight,
  Calculator,
  Grid3X3,
  Layers,
  Search,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GAME_LABELS, GameCategory } from '../types/earneasy';
import { formatBRL, formatPoints, getTodayUtcDate } from '../utils/pix';
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
    subtitle: 'Desafie a inteligência artificial Minimax em rodadas rápidas de estratégia.',
    rewardRange: '30 – 240 pts',
    avgTime: '1 min',
    Icon: Grid3X3,
  },
  {
    id: 'dot_link',
    title: GAME_LABELS.dot_link,
    subtitle: 'Conecte todos os pontos coloridos sem cruzar os fluxos no tabuleiro.',
    rewardRange: '240 – 400 pts',
    avgTime: '2 min',
    Icon: Share2,
  },
  {
    id: 'word_search',
    title: GAME_LABELS.word_search,
    subtitle: 'Encontre termos de finanças, tecnologia e estratégia na grade 10×10.',
    rewardRange: 'Até 450 pts',
    avgTime: '2 min',
    Icon: Search,
  },
  {
    id: 'math_sprint',
    title: GAME_LABELS.math_sprint,
    subtitle: 'Responda operações em 40 segundos com multiplicadores de até 3x.',
    rewardRange: 'Até 450 pts',
    avgTime: '40 seg',
    Icon: Calculator,
  },
  {
    id: 'memory_match',
    title: GAME_LABELS.memory_match,
    subtitle: 'Combine os 8 pares com o menor número de tentativas para maximizar pontos.',
    rewardRange: '150 – 380 pts',
    avgTime: '1 min',
    Icon: Layers,
  },
];

interface GamesHubProps {
  onNavigateWallet: () => void;
}

export const GamesHub: React.FC<GamesHubProps> = ({ onNavigateWallet }) => {
  const { firebaseUser, userAccount, signInWithGoogle, recordGameReward } = useAuth();
  const [activeGame, setActiveGame] = useState<GameCategory | null>(null);
  const [heroImageError, setHeroImageError] = useState(false);

  const today = getTodayUtcDate();
  const canConvertToday = userAccount ? userAccount.lastConversionDate !== today : false;

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
      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-8 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="text-xs font-medium text-emerald-700">
              1.000 pontos = R$ 0,10 · 1 conversão por dia · Saque Pix a partir de R$ 5,00
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-balance">
              Jogue desafios de lógica, acumule pontos e saque via Pix.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Participe de partidas verificadas de Jogo da Velha, Dot Link, Caça-Palavras, Matemática e Memória com proteção antifraude em tempo real e notificação de cada transação no seu e-mail.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-6">
            {firebaseUser ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveGame('dot_link')}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  Jogar Dot Link agora
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onNavigateWallet}
                  className="px-5 py-3 bg-white border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Converter pontos e Pix
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Entrar com Google para começar
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden min-h-[240px]">
          {!heroImageError ? (
            <img
              src="/src/assets/images/earn_easy_lobby_hero_1795064087528.jpg"
              alt="Peças geométricas de lógica, tabuleiro de jogo da velha e fichas esmeralda do Earn Easy"
              referrerPolicy="no-referrer"
              onError={() => setHeroImageError(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <ShieldCheck className="w-10 h-10 text-emerald-400 mb-3" />
              <p className="font-display font-bold text-lg">Earn Easy Arcade</p>
              <p className="text-xs text-slate-300 mt-1">Pontuação verificada e conversão diária garantida</p>
            </div>
          )}
        </div>
      </section>

      {/* 4-column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Pontos Disponíveis</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {formatPoints(userAccount?.pointsBalance || 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            Equivale a {formatBRL(Math.floor((userAccount?.pointsBalance || 0) / 1000) * 10)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Saldo em Reais</div>
          <div className="text-2xl font-mono font-bold text-emerald-600 tabular-nums mt-1">
            {formatBRL(userAccount?.brlBalanceCents || 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Disponível para Pix</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Conversão Diária</div>
          <div className="text-lg font-display font-bold text-slate-900 mt-1">
            {firebaseUser
              ? canConvertToday
                ? 'Liberada hoje'
                : 'Utilizada hoje'
              : '1x por dia'}
          </div>
          <div className="text-xs text-slate-500 mt-1">1.000 pts = R$ 0,10</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Saque Mínimo Pix</div>
          <div className="text-2xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            R$ 5,00
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {userAccount ? `${userAccount.gamesPlayed} partidas jogadas` : 'Chave CPF, E-mail ou Aleatória'}
          </div>
        </div>
      </section>

      {/* Games Catalog Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Jogos Disponíveis</h2>
            <p className="text-sm text-slate-500">
              Todas as partidas são auditadas contra automação e creditam pontos imediatamente na sua conta.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {GAME_CATALOG.map((game) => {
            const { Icon } = game;
            return (
              <div
                key={game.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      {game.rewardRange} · {game.avgTime}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{game.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{game.subtitle}</p>
                </div>

                <div className="pt-5 mt-5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handlePlayClick(game.id)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {firebaseUser ? 'Jogar Partida' : 'Entrar e Jogar'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
