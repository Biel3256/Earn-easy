import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, RotateCcw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react';
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

type ColorKey = 'R' | 'B' | 'G' | 'Y' | 'P';

interface DotPair {
  color: ColorKey;
  label: string;
  bgClass: string;
  strokeHex: string;
  a: [number, number];
  b: [number, number];
}

interface PuzzleSpec {
  id: number;
  title: string;
  size: number;
  reward: number;
  pairs: DotPair[];
}

const COLOR_META: Record<ColorKey, { label: string; bgClass: string; strokeHex: string }> = {
  R: { label: 'Rubi', bgClass: 'bg-rose-600', strokeHex: '#e11d48' },
  B: { label: 'Safira', bgClass: 'bg-sky-600', strokeHex: '#0284c7' },
  G: { label: 'Esmeralda', bgClass: 'bg-emerald-600', strokeHex: '#059669' },
  Y: { label: 'Âmbar', bgClass: 'bg-amber-500', strokeHex: '#f59e0b' },
  P: { label: 'Violeta', bgClass: 'bg-violet-600', strokeHex: '#7c3aed' },
};

const PUZZLES: PuzzleSpec[] = [
  {
    id: 1,
    title: 'Tabuleiro 5×5 · Clássico',
    size: 5,
    reward: 240,
    pairs: [
      { color: 'R', ...COLOR_META.R, a: [0, 0], b: [0, 4] },
      { color: 'B', ...COLOR_META.B, a: [1, 0], b: [2, 1] },
      { color: 'G', ...COLOR_META.G, a: [1, 1], b: [2, 2] },
      { color: 'Y', ...COLOR_META.Y, a: [1, 4], b: [3, 3] },
    ],
  },
  {
    id: 2,
    title: 'Tabuleiro 5×5 · Cinco Fluxos',
    size: 5,
    reward: 290,
    pairs: [
      { color: 'R', ...COLOR_META.R, a: [0, 0], b: [4, 0] },
      { color: 'B', ...COLOR_META.B, a: [0, 1], b: [1, 4] },
      { color: 'G', ...COLOR_META.G, a: [1, 1], b: [3, 1] },
      { color: 'Y', ...COLOR_META.Y, a: [1, 3], b: [4, 4] },
      { color: 'P', ...COLOR_META.P, a: [4, 1], b: [3, 2] },
    ],
  },
  {
    id: 3,
    title: 'Tabuleiro 6×6 · Mestre',
    size: 6,
    reward: 360,
    pairs: [
      { color: 'R', ...COLOR_META.R, a: [0, 0], b: [1, 5] },
      { color: 'B', ...COLOR_META.B, a: [1, 0], b: [5, 3] },
      { color: 'G', ...COLOR_META.G, a: [1, 1], b: [2, 3] },
      { color: 'Y', ...COLOR_META.Y, a: [2, 1], b: [4, 3] },
      { color: 'P', ...COLOR_META.P, a: [2, 5], b: [3, 3] },
    ],
  },
];

function coordKey(r: number, c: number) {
  return `${r},${c}`;
}

function isAdjacent(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

export const DotLinkGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY'>('TITLE_MENU');
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [paths, setPaths] = useState<Partial<Record<ColorKey, [number, number][]>>>({});
  const [activeColor, setActiveColor] = useState<ColorKey | null>(null);
  const [movesCount, setMovesCount] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);
  const [bursts, setBursts] = useState<ParticleBurstEvent[]>([]);
  const [popups, setPopups] = useState<FloatingFeedbackEvent[]>([]);
  const [justCompletedColor, setJustCompletedColor] = useState<ColorKey | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const isPointerDownRef = useRef(false);
  const dragMovedRef = useRef(false);
  const pathsRef = useRef(paths);
  const activeColorRef = useRef(activeColor);
  const movesRef = useRef(movesCount);
  const effectIdRef = useRef(1);
  const cleanupTimersRef = useRef<number[]>([]);

  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);

  useEffect(() => {
    activeColorRef.current = activeColor;
  }, [activeColor]);

  useEffect(() => {
    movesRef.current = movesCount;
  }, [movesCount]);

  useEffect(() => {
    return () => {
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const puzzle = PUZZLES[puzzleIdx];

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;
      if (dragMovedRef.current) {
        setActiveColor(null);
      }
      dragMovedRef.current = false;
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, []);

  const spawnBurst = (
    xPct: number,
    yPct: number,
    colors: string[],
    count = 16,
    spreadPx = 74
  ) => {
    const id = effectIdRef.current++;
    setBursts((prev) => [...prev, { id, xPct, yPct, colors, count, spreadPx }]);
    const t = window.setTimeout(() => {
      setBursts((prev) => prev.filter((item) => item.id !== id));
    }, 900);
    cleanupTimersRef.current.push(t);
  };

  const spawnPopup = (text: string, xPct = 50, yPct = 45, accentColor = '#34d399') => {
    const id = effectIdRef.current++;
    setPopups((prev) => [...prev, { id, text, xPct, yPct, accentColor }]);
    const t = window.setTimeout(() => {
      setPopups((prev) => prev.filter((item) => item.id !== id));
    }, 1250);
    cleanupTimersRef.current.push(t);
  };

  const getEndpointColor = (r: number, c: number): ColorKey | null => {
    for (const pair of puzzle.pairs) {
      if ((pair.a[0] === r && pair.a[1] === c) || (pair.b[0] === r && pair.b[1] === c)) {
        return pair.color;
      }
    }
    return null;
  };

  const getCellPathColor = (r: number, c: number, currentPaths = pathsRef.current): ColorKey | null => {
    for (const pair of puzzle.pairs) {
      const list = currentPaths[pair.color];
      if (list?.some(([pr, pc]) => pr === r && pc === c)) {
        return pair.color;
      }
    }
    return null;
  };

  const isPairConnected = (pair: DotPair, currentPaths = paths) => {
    const p = currentPaths[pair.color];
    if (!p || p.length < 2) return false;
    const first = p[0];
    const last = p[p.length - 1];
    const matchAB =
      first[0] === pair.a[0] && first[1] === pair.a[1] && last[0] === pair.b[0] && last[1] === pair.b[1];
    const matchBA =
      first[0] === pair.b[0] && first[1] === pair.b[1] && last[0] === pair.a[0] && last[1] === pair.a[1];
    return matchAB || matchBA;
  };

  const startPuzzle = (index = puzzleIdx) => {
    setPuzzleIdx(index);
    setPaths({});
    pathsRef.current = {};
    setActiveColor(null);
    activeColorRef.current = null;
    setMovesCount(0);
    movesRef.current = 0;
    setRewardInfo(null);
    setBursts([]);
    setPopups([]);
    setJustCompletedColor(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(500, 0.08, 'sine', soundOn);
  };

  const checkAllSolved = async (
    nextPaths: Partial<Record<ColorKey, [number, number][]>>,
    totalMoves: number
  ) => {
    const allDone = puzzle.pairs.every((p) => isPairConnected(p, nextPaths));
    if (!allDone) return;

    const filledCells = new Set<string>();
    puzzle.pairs.forEach((p) => {
      nextPaths[p.color]?.forEach(([r, c]) => filledCells.add(coordKey(r, c)));
    });
    const fullCoverageBonus = filledCells.size === puzzle.size * puzzle.size ? 40 : 0;
    const totalScore = Math.min(400, puzzle.reward + fullCoverageBonus);
    const duration = Date.now() - startedAtRef.current;

    playTone(760, 0.2, 'triangle', soundOn);

    // Multi-point celebratory burst when finishing the full board
    const palette = puzzle.pairs.map((p) => p.strokeHex);
    [
      { xPct: 28, yPct: 32, delay: 0 },
      { xPct: 72, yPct: 35, delay: 110 },
      { xPct: 50, yPct: 62, delay: 220 },
    ].forEach(({ xPct, yPct, delay }) => {
      const t = window.setTimeout(() => {
        spawnBurst(xPct, yPct, [...palette, '#34d399', '#ffffff'], 18, 92);
      }, delay);
      cleanupTimersRef.current.push(t);
    });

    spawnPopup(
      fullCoverageBonus > 0
        ? `100% do tabuleiro! +${totalScore} moedas`
        : `Tabuleiro completo! +${totalScore} moedas`,
      50,
      28,
      '#34d399'
    );

    isPointerDownRef.current = false;
    setActiveColor(null);
    activeColorRef.current = null;
    setGameState('ROUND_SUMMARY');
    setSubmitting(true);
    try {
      const res = await onComplete(totalScore, Math.max(duration, 5000), Math.max(totalMoves, 4));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const stepPath = (r: number, c: number) => {
    const color = activeColorRef.current;
    if (gameState !== 'PLAYING' || !color) return;

    const currentPaths = pathsRef.current;
    const currentPath = currentPaths[color] || [];
    if (currentPath.length === 0) return;

    const last = currentPath[currentPath.length - 1];
    if (last[0] === r && last[1] === c) return;
    if (!isAdjacent(last, [r, c])) return;

    // Backtrack if stepping back onto previous cell
    if (currentPath.length >= 2) {
      const prev = currentPath[currentPath.length - 2];
      if (prev[0] === r && prev[1] === c) {
        const trimmed = currentPath.slice(0, -1);
        const nextPaths = { ...currentPaths, [color]: trimmed };
        pathsRef.current = nextPaths;
        setPaths(nextPaths);
        playTone(460, 0.03, 'sine', soundOn);
        return;
      }
    }

    const endpointColor = getEndpointColor(r, c);
    if (endpointColor && endpointColor !== color) return;
    if (currentPath.some(([pr, pc]) => pr === r && pc === c)) return;

    const occupiedBy = getCellPathColor(r, c, currentPaths);
    if (occupiedBy && occupiedBy !== color) return;

    const pair = puzzle.pairs.find((p) => p.color === color);
    if (pair && isPairConnected(pair, currentPaths)) return;

    const nextPath: [number, number][] = [...currentPath, [r, c]];
    const nextPaths = { ...currentPaths, [color]: nextPath };
    const nextMoves = movesRef.current + 1;

    pathsRef.current = nextPaths;
    movesRef.current = nextMoves;
    setPaths(nextPaths);
    setMovesCount(nextMoves);
    playTone(620, 0.03, 'sine', soundOn);

    if (pair && isPairConnected(pair, nextPaths)) {
      playTone(720, 0.08, 'triangle', soundOn);
      const xPct = ((c + 0.5) / puzzle.size) * 100;
      const yPct = ((r + 0.5) / puzzle.size) * 100;
      spawnBurst(xPct, yPct, [pair.strokeHex, '#ffffff', '#34d399'], 14, 62);
      spawnPopup(`Fluxo ${pair.label} ligado!`, xPct, Math.max(18, yPct - 8), pair.strokeHex);

      setJustCompletedColor(pair.color);
      const pulseTimer = window.setTimeout(() => {
        setJustCompletedColor((curr) => (curr === pair.color ? null : curr));
      }, 650);
      cleanupTimersRef.current.push(pulseTimer);

      setActiveColor(null);
      activeColorRef.current = null;
      isPointerDownRef.current = false;
      checkAllSolved(nextPaths, nextMoves);
    }
  };

  const handleCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();

    isPointerDownRef.current = true;
    dragMovedRef.current = false;

    const currentColor = activeColorRef.current;
    const currentPaths = pathsRef.current;
    const endpoint = getEndpointColor(r, c);

    if (endpoint && currentColor === endpoint) {
      const currPath = currentPaths[currentColor] || [];
      if (currPath.length >= 1) {
        const last = currPath[currPath.length - 1];
        if (isAdjacent(last, [r, c]) && !(currPath[0][0] === r && currPath[0][1] === c)) {
          stepPath(r, c);
          return;
        }
      }
    }

    if (endpoint) {
      const nextPaths = { ...currentPaths, [endpoint]: [[r, c] as [number, number]] };
      pathsRef.current = nextPaths;
      activeColorRef.current = endpoint;
      movesRef.current = movesRef.current + 1;
      setPaths(nextPaths);
      setActiveColor(endpoint);
      setMovesCount(movesRef.current);
      playTone(540, 0.04, 'sine', soundOn);
      return;
    }

    if (currentColor) {
      const currPath = currentPaths[currentColor] || [];
      const last = currPath[currPath.length - 1];
      const occupiedBy = getCellPathColor(r, c, currentPaths);
      if (last && isAdjacent(last, [r, c]) && (!occupiedBy || occupiedBy === currentColor)) {
        stepPath(r, c);
        return;
      }
    }

    const existingColor = getCellPathColor(r, c, currentPaths);
    if (existingColor) {
      const curr = currentPaths[existingColor] || [];
      const idx = curr.findIndex(([pr, pc]) => pr === r && pc === c);
      if (idx !== -1) {
        const nextPaths = { ...currentPaths, [existingColor]: curr.slice(0, idx + 1) };
        pathsRef.current = nextPaths;
        activeColorRef.current = existingColor;
        movesRef.current = movesRef.current + 1;
        setPaths(nextPaths);
        setActiveColor(existingColor);
        setMovesCount(movesRef.current);
      }
    }
  };

  const handleGridPointerMove = (e: React.PointerEvent) => {
    if (gameState !== 'PLAYING' || !isPointerDownRef.current || !activeColorRef.current) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = target?.closest('[data-cell]') as HTMLElement | null;
    if (!cellEl) return;

    const r = Number(cellEl.dataset.row);
    const c = Number(cellEl.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return;

    const currPath = pathsRef.current[activeColorRef.current] || [];
    const last = currPath[currPath.length - 1];
    if (!last || (last[0] === r && last[1] === c)) return;

    dragMovedRef.current = true;
    stepPath(r, c);
  };

  const connectedCount = puzzle.pairs.filter((p) => isPairConnected(p)).length;
  const progressPct = Math.round((connectedCount / puzzle.pairs.length) * 100);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 max-w-2xl mx-auto select-none">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Dot Link</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Conecte todos os pares da mesma cor sem cruzar caminhos · Até 400 moedas
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
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            Arraste o dedo/mouse ou clique célula por célula para ligar cada ponto colorido ao seu par correspondente. Preencher 100% do tabuleiro concede <strong>+40 moedas bônus</strong>.
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {PUZZLES.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPuzzleIdx(idx)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  puzzleIdx === idx
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                    : 'bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                {p.title} ({p.reward} moedas)
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => startPuzzle(puzzleIdx)}
            className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Iniciar Desafio
          </motion.button>
        </motion.div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-5">
          <div className="space-y-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200/70 dark:border-zinc-800 px-4 py-3 rounded-xl">
            <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-300">
              <span className="inline-flex items-center gap-1.5">
                {connectedCount === puzzle.pairs.length && (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                Fluxos conectados:{' '}
                <strong className="text-slate-900 dark:text-zinc-50 tabular-nums">
                  {connectedCount}/{puzzle.pairs.length}
                </strong>
                {activeColor && (
                  <span className="ml-1 text-slate-500 dark:text-zinc-400">
                    · Ligando <strong className="text-slate-800 dark:text-zinc-200">{COLOR_META[activeColor].label}</strong>
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums">Movimentos: {movesCount}</span>
                {gameState === 'PLAYING' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaths({});
                      pathsRef.current = {};
                      setActiveColor(null);
                      activeColorRef.current = null;
                    }}
                    className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white underline cursor-pointer"
                  >
                    Limpar grade
                  </button>
                )}
              </div>
            </div>

            <div className="w-full h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              />
            </div>
          </div>

          {/* Interactive Board with Continuous SVG Pipe Layer & Particle Bursts */}
          <div className="relative mx-auto w-fit bg-slate-900 dark:bg-black border border-slate-800 p-3 rounded-2xl touch-none">
            <div className="relative" onPointerMove={handleGridPointerMove}>
              <ParticleBurstLayer events={bursts} />
              <FloatingFeedbackLayer items={popups} />

              <div
                className="grid gap-1.5 relative z-10"
                style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: puzzle.size * puzzle.size }).map((_, index) => {
                  const r = Math.floor(index / puzzle.size);
                  const c = index % puzzle.size;
                  const endpoint = getEndpointColor(r, c);
                  const isActiveEndpoint = endpoint !== null && activeColor === endpoint;
                  const endpointPair = endpoint
                    ? puzzle.pairs.find((p) => p.color === endpoint)
                    : undefined;
                  const endpointConnected = endpointPair ? isPairConnected(endpointPair) : false;

                  return (
                    <button
                      key={coordKey(r, c)}
                      type="button"
                      data-cell="true"
                      data-row={r}
                      data-col={c}
                      onPointerDown={(e) => handleCellPointerDown(e, r, c)}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-slate-800/75 dark:bg-zinc-900 border border-slate-700/80 dark:border-zinc-800 flex items-center justify-center relative touch-none cursor-pointer"
                      aria-label={`Célula ${r + 1},${c + 1}`}
                    >
                      {endpoint && (
                        <motion.span
                          animate={
                            justCompletedColor === endpoint
                              ? { scale: [1, 1.32, 1.08] }
                              : isActiveEndpoint
                                ? { scale: 1.15 }
                                : endpointConnected
                                  ? { scale: 1.06 }
                                  : { scale: 1 }
                          }
                          transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                          className={`w-8 h-8 rounded-full shadow-sm relative z-20 flex items-center justify-center ${
                            COLOR_META[endpoint].bgClass
                          } ${
                            isActiveEndpoint
                              ? 'ring-4 ring-white'
                              : endpointConnected
                                ? 'ring-2 ring-white'
                                : 'ring-2 ring-white/80'
                          }`}
                        >
                          {endpointConnected && (
                            <Check className="w-4 h-4 text-white stroke-[3]" />
                          )}
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* SVG continuous pipe lines overlay */}
              <svg
                viewBox={`0 0 ${puzzle.size * 100} ${puzzle.size * 100}`}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              >
                {puzzle.pairs.map((pair) => {
                  const list = paths[pair.color];
                  if (!list || list.length < 2) return null;
                  const points = list
                    .map(([r, c]) => `${c * 100 + 50},${r * 100 + 50}`)
                    .join(' ');
                  const connected = isPairConnected(pair);
                  const justCompleted = justCompletedColor === pair.color;

                  return (
                    <motion.polyline
                      key={pair.color}
                      points={points}
                      fill="none"
                      stroke={pair.strokeHex}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ opacity: 0.7 }}
                      animate={{
                        opacity: connected ? 1 : 0.88,
                        strokeWidth: justCompleted ? [28, 38, 30] : connected ? 30 : 28,
                      }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                  );
                })}
              </svg>
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
                        ? 'Validando solução no sistema antifraude...'
                        : rewardInfo
                          ? `+${rewardInfo.credited} moedas creditadas`
                          : 'Tabuleiro concluído!'}
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
                  onClick={() => startPuzzle((puzzleIdx + 1) % PUZZLES.length)}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Próximo Tabuleiro
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
