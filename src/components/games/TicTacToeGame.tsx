import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';
import {
  FloatingFeedbackEvent,
  FloatingFeedbackLayer,
  ParticleBurstEvent,
  ParticleBurstLayer,
} from './GameEffects';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

type Cell = 'X' | 'O' | null;
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkWinner(board: Cell[]): { winner: Cell | 'DRAW'; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'DRAW', line: null };
  }
  return { winner: null, line: null };
}

function minimax(board: Cell[], depth: number, isMaximizing: boolean): number {
  const { winner } = checkWinner(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (winner === 'DRAW') return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, depth + 1, false));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, depth + 1, true));
        board[i] = null;
      }
    }
    return best;
  }
}

function pickBotMove(board: Cell[], difficulty: 'balanced' | 'master'): number {
  const emptyIndices = board.map((v, idx) => (v === null ? idx : -1)).filter((idx) => idx !== -1);
  if (emptyIndices.length === 0) return -1;

  if (difficulty === 'balanced' && Math.random() < 0.35) {
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  let bestScore = -Infinity;
  let bestMove = emptyIndices[0];
  for (const idx of emptyIndices) {
    board[idx] = 'O';
    const score = minimax(board, 0, false);
    board[idx] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }
  return bestMove;
}

function cellCenterPct(index: number): { xPct: number; yPct: number } {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return {
    xPct: ((col + 0.5) / 3) * 100,
    yPct: ((row + 0.5) / 3) * 100,
  };
}

function cellSvgCoord(index: number): { x: number; y: number } {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return {
    x: col * 100 + 50,
    y: row * 100 + 50,
  };
}

export const TicTacToeGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [difficulty, setDifficulty] = useState<'balanced' | 'master'>('balanced');
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [resultLabel, setResultLabel] = useState<'X' | 'O' | 'DRAW' | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [movesCount, setMovesCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);
  const [bursts, setBursts] = useState<ParticleBurstEvent[]>([]);
  const [popups, setPopups] = useState<FloatingFeedbackEvent[]>([]);

  const startedAtRef = useRef<number>(Date.now());
  const botTimerRef = useRef<number | null>(null);
  const effectIdRef = useRef(1);
  const cleanupTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const spawnBurst = (
    xPct: number,
    yPct: number,
    colors: string[],
    count = 14,
    spreadPx = 68
  ) => {
    const id = effectIdRef.current++;
    setBursts((prev) => [...prev, { id, xPct, yPct, colors, count, spreadPx }]);
    const t = window.setTimeout(() => {
      setBursts((prev) => prev.filter((item) => item.id !== id));
    }, 900);
    cleanupTimersRef.current.push(t);
  };

  const spawnPopup = (text: string, xPct = 50, yPct = 42, accentColor = '#34d399') => {
    const id = effectIdRef.current++;
    setPopups((prev) => [...prev, { id, text, xPct, yPct, accentColor }]);
    const t = window.setTimeout(() => {
      setPopups((prev) => prev.filter((item) => item.id !== id));
    }, 1250);
    cleanupTimersRef.current.push(t);
  };

  const startGame = () => {
    if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
    setBoard(Array(9).fill(null));
    setIsPlayerTurn(true);
    setWinLine(null);
    setResultLabel(null);
    setRewardInfo(null);
    setBursts([]);
    setPopups([]);
    setMovesCount(0);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(520, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (
    winner: 'X' | 'O' | 'DRAW',
    totalMoves: number,
    line: number[] | null
  ) => {
    setResultLabel(winner);
    const rawDuration = Date.now() - startedAtRef.current;
    const baseScore =
      winner === 'X'
        ? difficulty === 'master'
          ? 240
          : 180
        : winner === 'DRAW'
          ? 85
          : 30;

    if (winner === 'X') {
      playTone(740, 0.18, 'triangle', soundOn);
      if (line) {
        line.forEach((cellIdx, i) => {
          const { xPct, yPct } = cellCenterPct(cellIdx);
          const t = window.setTimeout(() => {
            spawnBurst(
              xPct,
              yPct,
              ['#10b981', '#34d399', '#fbbf24', '#ffffff'],
              14,
              76
            );
          }, i * 95);
          cleanupTimersRef.current.push(t);
        });
      } else {
        spawnBurst(50, 50, ['#10b981', '#34d399', '#fbbf24'], 20, 90);
      }
      spawnPopup(`Sequência completa! +${baseScore} moedas`, 50, 32, '#34d399');
    } else if (winner === 'DRAW') {
      playTone(440, 0.14, 'sine', soundOn);
      spawnBurst(50, 50, ['#38bdf8', '#fbbf24', '#94a3b8'], 14, 70);
      spawnPopup(`Empate estratégico · +${baseScore} moedas`, 50, 38, '#38bdf8');
    } else {
      playTone(240, 0.18, 'sawtooth', soundOn);
      spawnBurst(50, 50, ['#94a3b8', '#38bdf8'], 10, 50);
      spawnPopup(`+${baseScore} moedas de participação`, 50, 40, '#cbd5e1');
    }

    setGameState('ROUND_SUMMARY');
    setSubmitting(true);
    try {
      const res = await onComplete(baseScore, Math.max(rawDuration, 3500), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCellClick = (index: number) => {
    if (gameState !== 'PLAYING' || !isPlayerTurn || board[index] !== null) return;

    const nextBoard = [...board];
    nextBoard[index] = 'X';
    const nextMoves = movesCount + 1;
    setBoard(nextBoard);
    setMovesCount(nextMoves);
    playTone(580, 0.06, 'sine', soundOn);

    const { xPct, yPct } = cellCenterPct(index);
    spawnBurst(xPct, yPct, ['#10b981', '#a7f3d0'], 6, 36);

    const check = checkWinner(nextBoard);
    if (check.winner) {
      setWinLine(check.line);
      finishMatch(check.winner, nextMoves, check.line);
      return;
    }

    setIsPlayerTurn(false);
    botTimerRef.current = window.setTimeout(() => {
      const botIndex = pickBotMove([...nextBoard], difficulty);
      if (botIndex === -1) return;
      const afterBot = [...nextBoard];
      afterBot[botIndex] = 'O';
      setBoard(afterBot);
      playTone(410, 0.06, 'sine', soundOn);

      const botCheck = checkWinner(afterBot);
      if (botCheck.winner) {
        setWinLine(botCheck.line);
        finishMatch(botCheck.winner, nextMoves, botCheck.line);
      } else {
        setIsPlayerTurn(true);
      }
    }, 450);
  };

  const lineStart = winLine ? cellSvgCoord(winLine[0]) : null;
  const lineEnd = winLine ? cellSvgCoord(winLine[2]) : null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Jogo da Velha</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Vitória: até 240 moedas · Empate: 85 moedas · Participação: 30 moedas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            aria-label={soundOn ? 'Desativar som' : 'Ativar som'}
            className="p-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>

      {gameState === 'TITLE_MENU' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="text-center py-6 space-y-6"
        >
          <div className="max-w-md mx-auto space-y-2">
            <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Enfrente a IA estratégica do Earn Easy. Complete linhas horizontais, verticais ou diagonais com <strong>X</strong> antes do oponente <strong>O</strong>.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setDifficulty('balanced')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                difficulty === 'balanced'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                  : 'bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}
            >
              Modo Padrão (180 moedas)
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('master')}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                difficulty === 'master'
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                  : 'bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800'
              }`}
            >
              Modo Mestre Minimax (240 moedas)
            </button>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={startGame}
            className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Iniciar Partida
          </motion.button>
        </motion.div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800 px-4 py-2.5 rounded-xl">
            <AnimatePresence mode="wait">
              <motion.span
                key={`${gameState}-${isPlayerTurn}-${resultLabel}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="inline-flex items-center gap-1.5 font-semibold"
              >
                {resultLabel === 'X' && (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                {gameState === 'PLAYING'
                  ? isPlayerTurn
                    ? 'Sua vez (X)'
                    : 'IA analisando jogada (O)...'
                  : resultLabel === 'X'
                    ? 'Você venceu a rodada!'
                    : resultLabel === 'DRAW'
                      ? 'Empate estratégico!'
                      : 'A IA venceu esta rodada'}
              </motion.span>
            </AnimatePresence>
            <span className="font-mono tabular-nums">Jogadas: {movesCount}</span>
          </div>

          <div className="relative max-w-xs mx-auto">
            <ParticleBurstLayer events={bursts} />
            <FloatingFeedbackLayer items={popups} />

            {/* Winning strike line */}
            {lineStart && lineEnd && (
              <svg
                viewBox="0 0 300 300"
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                aria-hidden="true"
              >
                <motion.line
                  x1={lineStart.x}
                  y1={lineStart.y}
                  x2={lineEnd.x}
                  y2={lineEnd.y}
                  stroke={resultLabel === 'X' ? '#10b981' : '#0ea5e9'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.4 }}
                  animate={{ pathLength: 1, opacity: 0.92 }}
                  transition={{ duration: 0.42, ease: 'easeOut' }}
                />
              </svg>
            )}

            <div className="grid grid-cols-3 gap-3">
              {board.map((cell, idx) => {
                const isWinCell = Boolean(winLine?.includes(idx));
                const canPlayCell = gameState === 'PLAYING' && isPlayerTurn && cell === null;
                return (
                  <motion.button
                    key={idx}
                    type="button"
                    disabled={!canPlayCell}
                    onClick={() => handleCellClick(idx)}
                    whileHover={canPlayCell ? { scale: 1.03 } : undefined}
                    whileTap={canPlayCell ? { scale: 0.93 } : undefined}
                    animate={
                      isWinCell
                        ? {
                            scale: [1, 1.08, 1.02],
                            transition: { duration: 0.45, ease: 'easeOut' },
                          }
                        : { scale: 1 }
                    }
                    className={`h-24 rounded-2xl border text-3xl font-extrabold flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default ${
                      isWinCell
                        ? resultLabel === 'X'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm'
                          : 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-700 dark:text-sky-400 shadow-sm'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <AnimatePresence>
                      {cell === 'X' && (
                        <motion.span
                          key="X"
                          initial={{ scale: 0.35, rotate: -18, opacity: 0 }}
                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                          className="text-slate-900 dark:text-zinc-100"
                        >
                          X
                        </motion.span>
                      )}
                      {cell === 'O' && (
                        <motion.span
                          key="O"
                          initial={{ scale: 0.35, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                          className="text-sky-600 dark:text-sky-400"
                        >
                          O
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <AnimatePresence>
            {gameState === 'ROUND_SUMMARY' && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.25 }}
                className="border-t border-slate-100 dark:border-zinc-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0.7, rotate: -12 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                    className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0"
                  >
                    <Trophy className="w-5 h-5" />
                  </motion.div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                      {submitting
                        ? 'Validando partida no sistema antifraude...'
                        : rewardInfo
                          ? `+${rewardInfo.credited} moedas creditadas`
                          : 'Partida concluída'}
                    </p>
                    {rewardInfo && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        {rewardInfo.verificationStatus === 'verified'
                          ? 'Sessão verificada com assinatura de integridade'
                          : rewardInfo.fraudReason}
                      </p>
                    )}
                  </div>
                </div>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={startGame}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Jogar Novamente
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
