import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Award, RotateCcw, ShieldCheck, Spade } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface HighLowCardsGameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
  soundEnabled?: boolean;
}

interface PlayingCard {
  rank: number;
  label: string;
  suit: '♠' | '♥' | '♦' | '♣';
  isRed: boolean;
}

const RANK_LABELS: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

const SUITS: Array<{ suit: PlayingCard['suit']; isRed: boolean }> = [
  { suit: '♠', isRed: false },
  { suit: '♥', isRed: true },
  { suit: '♦', isRed: true },
  { suit: '♣', isRed: false },
];

function drawRandomCard(excludeRank?: number): PlayingCard {
  let rank = Math.floor(Math.random() * 13) + 2;
  if (excludeRank && rank === excludeRank) {
    rank = rank === 14 ? 2 : rank + 1;
  }
  const s = SUITS[Math.floor(Math.random() * SUITS.length)];
  return {
    rank,
    label: RANK_LABELS[rank],
    suit: s.suit,
    isRed: s.isRed,
  };
}

const TOTAL_TURNS = 8;

export const HighLowCardsGame: React.FC<HighLowCardsGameProps> = ({
  onComplete,
  onExit,
  soundEnabled = true,
}) => {
  const [currentCard, setCurrentCard] = useState<PlayingCard>(() => drawRandomCard());
  const [nextCard, setNextCard] = useState<PlayingCard | null>(null);
  const [turn, setTurn] = useState(1);
  const [score, setScore] = useState(60);
  const [streak, setStreak] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<'idle' | 'correct' | 'miss'>('idle');
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);
  const startRef = useRef<number>(Date.now());

  const handleGuess = async (guess: 'higher' | 'lower') => {
    if (finished || submitting || nextCard !== null) return;

    const drawn = drawRandomCard(currentCard.rank);
    const isCorrect =
      guess === 'higher' ? drawn.rank > currentCard.rank : drawn.rank < currentCard.rank;

    setNextCard(drawn);
    const nextStreak = isCorrect ? streak + 1 : 0;
    const ptsGained = isCorrect ? 32 + Math.min(20, streak * 5) : 5;
    const updatedScore = Math.min(380, score + ptsGained);
    setScore(updatedScore);
    setStreak(nextStreak);
    setLastOutcome(isCorrect ? 'correct' : 'miss');
    playTone(isCorrect ? 740 : 320, 0.08, isCorrect ? 'triangle' : 'sine', soundEnabled);

    window.setTimeout(async () => {
      if (turn >= TOTAL_TURNS) {
        setFinished(true);
        const duration = Math.max(5200, Date.now() - startRef.current);
        setSubmitting(true);
        try {
          const res = await onComplete(Math.min(380, updatedScore), duration, TOTAL_TURNS);
          setServerResult(res);
        } finally {
          setSubmitting(false);
        }
      } else {
        setCurrentCard(drawn);
        setNextCard(null);
        setTurn((t) => t + 1);
      }
    }, 650);
  };

  const resetGame = () => {
    startRef.current = Date.now();
    setCurrentCard(drawRandomCard());
    setNextCard(null);
    setTurn(1);
    setScore(60);
    setStreak(0);
    setLastOutcome('idle');
    setServerResult(null);
    setFinished(false);
  };

  return (
    <div className="bg-white dark:bg-[#10141a] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-lime-400/50 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <div>
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Spade className="w-5 h-5 text-lime-500 dark:text-lime-400" />
              Maior ou Menor
            </h3>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
              Preveja se a próxima carta é maior ou menor que a atual. Jogo 100% gratuito: você nunca perde pontos do seu saldo!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
          <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 rounded-xl">
            Rodada {turn}/{TOTAL_TURNS}
          </div>
          <div className="bg-lime-500/10 border border-lime-500/30 px-3 py-1.5 rounded-xl font-bold text-lime-700 dark:text-lime-300">
            {score} pts {streak > 1 ? `· ${streak}x` : ''}
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="bg-gradient-to-br from-emerald-950/90 via-zinc-950 to-slate-950 border border-emerald-800/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-6">
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          {/* Current Card */}
          <div className="text-center space-y-2">
            <div className="text-[11px] font-semibold text-emerald-300">Carta Atual</div>
            <div className="w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-white border-2 border-slate-200 shadow-2xl flex flex-col justify-between p-3 select-none">
              <div
                className={`text-left text-lg font-extrabold leading-none ${
                  currentCard.isRed ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {currentCard.label}
                <div className="text-sm">{currentCard.suit}</div>
              </div>
              <div
                className={`text-4xl text-center font-bold ${
                  currentCard.isRed ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {currentCard.suit}
              </div>
              <div
                className={`text-right text-lg font-extrabold leading-none rotate-180 ${
                  currentCard.isRed ? 'text-red-600' : 'text-slate-900'
                }`}
              >
                {currentCard.label}
                <div className="text-sm">{currentCard.suit}</div>
              </div>
            </div>
          </div>

          {/* Next Card Slot */}
          <div className="text-center space-y-2">
            <div className="text-[11px] font-semibold text-zinc-400">Próxima Carta</div>
            {nextCard ? (
              <div
                className={`w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-white border-2 shadow-2xl flex flex-col justify-between p-3 select-none ${
                  lastOutcome === 'correct' ? 'border-lime-400 ring-2 ring-lime-400/50' : 'border-amber-400'
                }`}
              >
                <div
                  className={`text-left text-lg font-extrabold leading-none ${
                    nextCard.isRed ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {nextCard.label}
                  <div className="text-sm">{nextCard.suit}</div>
                </div>
                <div
                  className={`text-4xl text-center font-bold ${
                    nextCard.isRed ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {nextCard.suit}
                </div>
                <div
                  className={`text-right text-lg font-extrabold leading-none rotate-180 ${
                    nextCard.isRed ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {nextCard.label}
                  <div className="text-sm">{nextCard.suit}</div>
                </div>
              </div>
            ) : (
              <div className="w-28 h-40 sm:w-32 sm:h-44 rounded-2xl bg-gradient-to-br from-violet-900 via-purple-950 to-zinc-950 border-2 border-purple-500/40 shadow-xl flex items-center justify-center text-white text-3xl font-display font-extrabold">
                ?
              </div>
            )}
          </div>
        </div>

        {!finished ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-sm">
            <button
              type="button"
              disabled={nextCard !== null || submitting}
              onClick={() => handleGuess('higher')}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-zinc-950 text-sm font-extrabold transition-colors cursor-pointer"
            >
              <ArrowUp className="w-4 h-4" />
              Maior
            </button>
            <button
              type="button"
              disabled={nextCard !== null || submitting}
              onClick={() => handleGuess('lower')}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 border border-white/20 text-white text-sm font-extrabold transition-colors cursor-pointer"
            >
              <ArrowDown className="w-4 h-4" />
              Menor
            </button>
          </div>
        ) : (
          <div className="w-full max-w-lg bg-white/10 border border-lime-400/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-white">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 text-sm font-bold text-lime-300">
                <Award className="w-5 h-5 shrink-0" />
                Rodada completa:{' '}
                {serverResult
                  ? `+${serverResult.credited} pontos creditados!`
                  : `+${Math.min(380, score)} pontos!`}
              </div>
              {serverResult && (
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  {serverResult.verificationStatus === 'verified'
                    ? 'Pontuação verificada com sucesso.'
                    : serverResult.fraudReason || 'Partida registrada.'}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onExit}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar aos jogos
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={resetGame}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-zinc-950 text-xs sm:text-sm font-extrabold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                {submitting ? 'Salvando...' : 'Jogar Novamente'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
