import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Award, Play, RotateCcw, ShieldCheck, Timer, Zap } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface QuickReflexGameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
  soundEnabled?: boolean;
}

const TOTAL_ROUNDS = 12;

export const QuickReflexGame: React.FC<QuickReflexGameProps> = ({
  onComplete,
  onExit,
  soundEnabled = true,
}) => {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [round, setRound] = useState(0);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [avgReactionMs, setAvgReactionMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const matchStartRef = useRef<number>(Date.now());
  const targetShownAtRef = useRef<number>(Date.now());
  const reactionsRef = useRef<number[]>([]);
  const timerRef = useRef<number | null>(null);
  const roundRef = useRef<number>(0);

  const clearPendingTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPendingTimer();
  }, []);

  const finishGame = useCallback(
    async (finalHits: number, finalScore: number, totalMoves: number) => {
      clearPendingTimer();
      setActiveCell(null);
      setPhase('finished');
      const avg =
        reactionsRef.current.length > 0
          ? Math.round(
              reactionsRef.current.reduce((a, b) => a + b, 0) / reactionsRef.current.length
            )
          : 0;
      setAvgReactionMs(avg);

      const safeDuration = Math.max(5200, Date.now() - matchStartRef.current);
      const boundedScore = Math.max(40, Math.min(400, finalScore));

      playTone(finalHits >= 8 ? 820 : 520, 0.14, 'triangle', soundEnabled);
      setSubmitting(true);
      try {
        const res = await onComplete(boundedScore, safeDuration, Math.max(1, totalMoves));
        setServerResult(res);
      } finally {
        setSubmitting(false);
      }
    },
    [onComplete, soundEnabled]
  );

  const spawnNextTarget = useCallback(
    (nextRound: number, currentHits: number, currentMisses: number, currentScore: number) => {
      clearPendingTimer();
      if (nextRound > TOTAL_ROUNDS) {
        void finishGame(currentHits, currentScore, currentHits + currentMisses);
        return;
      }

      roundRef.current = nextRound;
      setRound(nextRound);
      setActiveCell(null);

      const pauseMs = 320 + Math.floor(Math.random() * 340);
      timerRef.current = window.setTimeout(() => {
        const idx = Math.floor(Math.random() * 9);
        setActiveCell(idx);
        targetShownAtRef.current = Date.now();
        playTone(620, 0.04, 'sine', soundEnabled);

        timerRef.current = window.setTimeout(() => {
          setActiveCell(null);
          const nextMisses = currentMisses + 1;
          setMisses(nextMisses);
          spawnNextTarget(nextRound + 1, currentHits, nextMisses, currentScore);
        }, 1250);
      }, pauseMs);
    },
    [finishGame, soundEnabled]
  );

  const startGame = () => {
    clearPendingTimer();
    reactionsRef.current = [];
    matchStartRef.current = Date.now();
    setScore(0);
    setHits(0);
    setMisses(0);
    setAvgReactionMs(0);
    setServerResult(null);
    setPhase('playing');
    spawnNextTarget(1, 0, 0, 0);
  };

  const handleCellClick = (index: number) => {
    if (phase !== 'playing' || activeCell === null) return;
    if (index === activeCell) {
      clearPendingTimer();
      const reaction = Math.max(80, Date.now() - targetShownAtRef.current);
      reactionsRef.current.push(reaction);
      const speedBonus = reaction < 420 ? 34 : reaction < 680 ? 28 : 22;
      const nextHits = hits + 1;
      const nextScore = Math.min(400, score + speedBonus);
      setHits(nextHits);
      setScore(nextScore);
      setActiveCell(null);
      playTone(880, 0.06, 'sine', soundEnabled);
      spawnNextTarget(roundRef.current + 1, nextHits, misses, nextScore);
    } else {
      playTone(220, 0.07, 'sawtooth', soundEnabled);
      setMisses((m) => m + 1);
    }
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
              <Zap className="w-5 h-5 text-lime-500 dark:text-lime-400" />
              Reflexo Rápido
            </h3>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
              Toque nos alvos iluminados o mais rápido possível em 12 rodadas para ganhar até 400 pontos!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
          <div className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-3 py-1.5 rounded-xl">
            <span className="text-slate-500 dark:text-zinc-400">Rodada: </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {Math.min(round, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}
            </span>
          </div>
          <div className="bg-lime-500/10 border border-lime-500/30 px-3 py-1.5 rounded-xl">
            <span className="text-lime-700 dark:text-lime-300 font-bold">{score} pts</span>
          </div>
        </div>
      </div>

      {phase === 'ready' ? (
        <div className="py-10 px-4 bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800 rounded-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-lime-400/15 border border-lime-400/40 flex items-center justify-center mx-auto text-lime-600 dark:text-lime-400">
            <Zap className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Prepare seus reflexos
            </h4>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              Quando um quadrado acender em verde-limão, toque imediatamente antes que ele desapareça. Cada acerto rende pontos extras conforme sua velocidade!
            </p>
          </div>
          <button
            type="button"
            onClick={startGame}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-6 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 text-sm font-extrabold transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            Iniciar Desafio
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            {Array.from({ length: 9 }).map((_, idx) => {
              const isTarget = phase === 'playing' && activeCell === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={phase !== 'playing'}
                  onClick={() => handleCellClick(idx)}
                  aria-label={isTarget ? 'Alvo ativo! Clique agora' : `Célula ${idx + 1}`}
                  className={`aspect-square rounded-2xl border-2 flex items-center justify-center transition-all duration-150 cursor-pointer ${
                    isTarget
                      ? 'bg-lime-400 border-lime-200 text-zinc-950 shadow-lg shadow-lime-400/40 scale-[1.03]'
                      : 'bg-slate-100 dark:bg-zinc-900/90 border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-600 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {isTarget ? (
                    <Zap className="w-8 h-8 fill-current" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-zinc-800" />
                  )}
                </button>
              );
            })}
          </div>

          {phase === 'finished' && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-lime-300">
                  <Award className="w-4 h-4 shrink-0" />
                  Partida concluída:{' '}
                  {serverResult
                    ? `+${serverResult.credited} pontos creditados!`
                    : `+${Math.max(40, Math.min(400, score))} pontos!`}
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-300 flex flex-wrap items-center gap-3">
                  <span>Acertos: {hits}/{TOTAL_ROUNDS}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5" />
                    Reação média: {avgReactionMs > 0 ? `${avgReactionMs} ms` : '—'}
                  </span>
                </div>
                {serverResult && (
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5" />
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
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-100 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar aos jogos
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={startGame}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-zinc-950 text-xs sm:text-sm font-extrabold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  {submitting ? 'Salvando pontos...' : 'Jogar Novamente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
