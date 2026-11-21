import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Flag, Grid3X3, RotateCcw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react';
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

type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

interface PieceDef {
  id: string;
  matrix: number[][];
  colorIndex: number;
}

const GRID_SIZE = 8;

const COLOR_STYLES = [
  { bg: 'bg-lime-400', border: 'border-lime-200', glow: 'shadow-lime-400/30', hex: '#a3e635' },
  { bg: 'bg-emerald-400', border: 'border-emerald-200', glow: 'shadow-emerald-400/30', hex: '#34d399' },
  { bg: 'bg-sky-400', border: 'border-sky-200', glow: 'shadow-sky-400/30', hex: '#38bdf8' },
  { bg: 'bg-amber-400', border: 'border-amber-200', glow: 'shadow-amber-400/30', hex: '#fbbf24' },
  { bg: 'bg-violet-400', border: 'border-violet-200', glow: 'shadow-violet-400/30', hex: '#a78bfa' },
  { bg: 'bg-rose-400', border: 'border-rose-200', glow: 'shadow-rose-400/30', hex: '#fb7185' },
];

const SHAPE_TEMPLATES: number[][][] = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [[1, 1, 1, 1]],
  [[1], [1], [1], [1]],
  [[1, 1, 1, 1, 1]],
  [[1], [1], [1], [1], [1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
  [
    [1, 1],
    [1, 0],
  ],
  [
    [1, 1],
    [0, 1],
  ],
  [
    [1, 0],
    [1, 1],
  ],
  [
    [0, 1],
    [1, 1],
  ],
  [
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
  ],
  [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  [
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 1],
    [1, 1, 1],
  ],
  [
    [1, 1],
    [1, 1],
    [1, 1],
  ],
];

function createEmptyBoard(): (number | null)[][] {
  return Array.from({ length: GRID_SIZE }, () => Array<number | null>(GRID_SIZE).fill(null));
}

function canPlacePiece(
  board: (number | null)[][],
  matrix: number[][],
  startRow: number,
  startCol: number
): boolean {
  const rows = matrix.length;
  const cols = matrix[0].length;
  if (startRow < 0 || startCol < 0 || startRow + rows > GRID_SIZE || startCol + cols > GRID_SIZE) {
    return false;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (matrix[r][c] === 1 && board[startRow + r][startCol + c] !== null) {
        return false;
      }
    }
  }
  return true;
}

function canFitAnywhere(board: (number | null)[][], matrix: number[][]): boolean {
  for (let r = 0; r <= GRID_SIZE - matrix.length; r++) {
    for (let c = 0; c <= GRID_SIZE - matrix[0].length; c++) {
      if (canPlacePiece(board, matrix, r, c)) return true;
    }
  }
  return false;
}

function generateTray(board: (number | null)[][]): (PieceDef | null)[] {
  const pieces: PieceDef[] = [];
  const fittable = SHAPE_TEMPLATES.filter((tpl) => canFitAnywhere(board, tpl));
  for (let i = 0; i < 3; i++) {
    const pool = i === 0 && fittable.length > 0 ? fittable : SHAPE_TEMPLATES;
    const matrix = pool[Math.floor(Math.random() * pool.length)];
    const colorIndex = Math.floor(Math.random() * COLOR_STYLES.length);
    pieces.push({
      id: `piece_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      matrix,
      colorIndex,
    });
  }
  return pieces;
}

function calculateCoinsFromScore(inGameScore: number): number {
  return Math.min(300, Math.floor((Math.max(0, inGameScore) * 30) / 1000));
}

export const BlockBritzGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [board, setBoard] = useState<(number | null)[][]>(() => createEmptyBoard());
  const [tray, setTray] = useState<(PieceDef | null)[]>([]);
  const [selectedTrayIdx, setSelectedTrayIdx] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [dragState, setDragState] = useState<{
    trayIdx: number;
    x: number;
    y: number;
    isTouch: boolean;
  } | null>(null);

  const [inGameScore, setInGameScore] = useState(0);
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      return Number(window.localStorage.getItem('earneasy_block_britz_best') || '0') || 0;
    } catch {
      return 0;
    }
  });
  const [combo, setCombo] = useState(0);
  const [linesClearedTotal, setLinesClearedTotal] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [clearingCells, setClearingCells] = useState<Set<string>>(new Set());
  const [soundOn, setSoundOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);
  const [bursts, setBursts] = useState<ParticleBurstEvent[]>([]);
  const [popups, setPopups] = useState<FloatingFeedbackEvent[]>([]);

  const startedAtRef = useRef<number>(Date.now());
  const finishedRef = useRef(false);
  const effectIdRef = useRef(1);
  const cleanupTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      cleanupTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const spawnBurst = useCallback(
    (xPct: number, yPct: number, colors: string[], count = 14, spreadPx = 68) => {
      const id = effectIdRef.current++;
      setBursts((prev) => [...prev, { id, xPct, yPct, colors, count, spreadPx }]);
      const t = window.setTimeout(() => {
        setBursts((prev) => prev.filter((item) => item.id !== id));
      }, 900);
      cleanupTimersRef.current.push(t);
    },
    []
  );

  const spawnPopup = useCallback(
    (text: string, xPct = 50, yPct = 42, accentColor = '#a3e635') => {
      const id = effectIdRef.current++;
      setPopups((prev) => [...prev, { id, text, xPct, yPct, accentColor }]);
      const t = window.setTimeout(() => {
        setPopups((prev) => prev.filter((item) => item.id !== id));
      }, 1250);
      cleanupTimersRef.current.push(t);
    },
    []
  );

  const startGame = () => {
    const initialBoard = createEmptyBoard();
    setBoard(initialBoard);
    setTray(generateTray(initialBoard));
    setSelectedTrayIdx(0);
    setHoverCell(null);
    setDragState(null);
    setInGameScore(0);
    setCombo(0);
    setLinesClearedTotal(0);
    setMovesCount(0);
    setClearingCells(new Set());
    setRewardInfo(null);
    setBursts([]);
    setPopups([]);
    finishedRef.current = false;
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.09, 'triangle', soundOn);
  };

  const finalizeMatch = useCallback(
    async (finalGameScore: number, totalMoves: number, reason: 'gameover' | 'cashout') => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setDragState(null);
      setHoverCell(null);
      setGameState('ROUND_SUMMARY');

      if (finalGameScore > bestScore) {
        setBestScore(finalGameScore);
        try {
          window.localStorage.setItem('earneasy_block_britz_best', String(finalGameScore));
        } catch {
          // Ignore storage failure
        }
      }

      const coinsEarned = calculateCoinsFromScore(finalGameScore);
      const rawDuration = Date.now() - startedAtRef.current;

      if (reason === 'gameover') {
        playTone(coinsEarned > 0 ? 620 : 280, 0.2, 'triangle', soundOn);
        spawnPopup(
          coinsEarned > 0 ? `Fim de jogo! +${coinsEarned} moedas` : 'Sem movimentos disponíveis!',
          50,
          38,
          coinsEarned > 0 ? '#a3e635' : '#fbbf24'
        );
      } else {
        playTone(720, 0.16, 'triangle', soundOn);
      }

      setSubmitting(true);
      try {
        const res = await onComplete(
          coinsEarned,
          Math.max(rawDuration, 5500),
          Math.max(totalMoves, 1)
        );
        setRewardInfo(res);
      } finally {
        setSubmitting(false);
      }
    },
    [bestScore, onComplete, soundOn, spawnPopup]
  );

  const activePieceIndex = dragState ? dragState.trayIdx : selectedTrayIdx;
  const activePiece = activePieceIndex !== null ? tray[activePieceIndex] : null;

  const placementPreview = useMemo(() => {
    if (!activePiece || !hoverCell) return null;
    const anchorRow = hoverCell.row - Math.floor(activePiece.matrix.length / 2);
    const anchorCol = hoverCell.col - Math.floor(activePiece.matrix[0].length / 2);
    const valid = canPlacePiece(board, activePiece.matrix, anchorRow, anchorCol);

    const cells = new Set<string>();
    const simulated = board.map((r) => [...r]);
    for (let r = 0; r < activePiece.matrix.length; r++) {
      for (let c = 0; c < activePiece.matrix[0].length; c++) {
        if (activePiece.matrix[r][c] === 1) {
          const br = anchorRow + r;
          const bc = anchorCol + c;
          if (br >= 0 && br < GRID_SIZE && bc >= 0 && bc < GRID_SIZE) {
            cells.add(`${br}_${bc}`);
            if (valid) simulated[br][bc] = activePiece.colorIndex;
          }
        }
      }
    }

    const willClearRows = new Set<number>();
    const willClearCols = new Set<number>();
    if (valid) {
      for (let r = 0; r < GRID_SIZE; r++) {
        if (simulated[r].every((v) => v !== null)) willClearRows.add(r);
      }
      for (let c = 0; c < GRID_SIZE; c++) {
        if (simulated.every((row) => row[c] !== null)) willClearCols.add(c);
      }
    }

    return {
      anchorRow,
      anchorCol,
      valid,
      cells,
      willClearRows,
      willClearCols,
    };
  }, [activePiece, board, hoverCell]);

  const placeActivePieceAt = useCallback(
    (trayIdx: number, centerRow: number, centerCol: number) => {
      if (gameState !== 'PLAYING' || finishedRef.current) return false;
      const piece = tray[trayIdx];
      if (!piece) return false;

      const anchorRow = centerRow - Math.floor(piece.matrix.length / 2);
      const anchorCol = centerCol - Math.floor(piece.matrix[0].length / 2);

      if (!canPlacePiece(board, piece.matrix, anchorRow, anchorCol)) {
        playTone(190, 0.08, 'sawtooth', soundOn);
        return false;
      }

      const nextBoard = board.map((r) => [...r]);
      let cellsPlaced = 0;
      for (let r = 0; r < piece.matrix.length; r++) {
        for (let c = 0; c < piece.matrix[0].length; c++) {
          if (piece.matrix[r][c] === 1) {
            nextBoard[anchorRow + r][anchorCol + c] = piece.colorIndex;
            cellsPlaced += 1;
          }
        }
      }

      const fullRows: number[] = [];
      const fullCols: number[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        if (nextBoard[r].every((v) => v !== null)) fullRows.push(r);
      }
      for (let c = 0; c < GRID_SIZE; c++) {
        if (nextBoard.every((row) => row[c] !== null)) fullCols.push(c);
      }

      const clearedSet = new Set<string>();
      fullRows.forEach((r) => {
        for (let c = 0; c < GRID_SIZE; c++) clearedSet.add(`${r}_${c}`);
      });
      fullCols.forEach((c) => {
        for (let r = 0; r < GRID_SIZE; r++) clearedSet.add(`${r}_${c}`);
      });

      const linesCount = fullRows.length + fullCols.length;
      const nextCombo = linesCount > 0 ? combo + 1 : 0;
      const lineBonus =
        linesCount > 0
          ? Math.round(linesCount * 120 * (linesCount >= 2 ? 1.5 : 1) + (nextCombo - 1) * 50)
          : 0;
      const addedScore = cellsPlaced * 12 + lineBonus;
      const nextScore = inGameScore + addedScore;
      const nextMoves = movesCount + 1;

      if (clearedSet.size > 0) {
        setClearingCells(clearedSet);
        const tClear = window.setTimeout(() => setClearingCells(new Set()), 280);
        cleanupTimersRef.current.push(tClear);
      }

      fullRows.forEach((r) => {
        for (let c = 0; c < GRID_SIZE; c++) nextBoard[r][c] = null;
      });
      fullCols.forEach((c) => {
        for (let r = 0; r < GRID_SIZE; r++) nextBoard[r][c] = null;
      });

      const nextTray = tray.map((p, idx) => (idx === trayIdx ? null : p));
      const allTrayUsed = nextTray.every((p) => p === null);
      const finalTray = allTrayUsed ? generateTray(nextBoard) : nextTray;

      setBoard(nextBoard);
      setTray(finalTray);
      setInGameScore(nextScore);
      setCombo(nextCombo);
      setLinesClearedTotal((prev) => prev + linesCount);
      setMovesCount(nextMoves);
      setHoverCell(null);

      const firstRemaining = finalTray.findIndex((p) => p !== null);
      setSelectedTrayIdx(firstRemaining >= 0 ? firstRemaining : null);

      const xPct = ((centerCol + 0.5) / GRID_SIZE) * 100;
      const yPct = ((centerRow + 0.5) / GRID_SIZE) * 100;

      if (linesCount > 0) {
        playTone(700 + linesCount * 80, 0.14, 'triangle', soundOn);
        spawnBurst(xPct, yPct, ['#a3e635', '#34d399', '#fbbf24', '#ffffff'], 16, 78);
        spawnPopup(
          nextCombo > 1
            ? `Combo x${nextCombo}! +${addedScore}`
            : linesCount > 1
              ? `${linesCount} linhas! +${addedScore}`
              : `+${addedScore} pts!`,
          xPct,
          Math.max(18, yPct - 8),
          '#a3e635'
        );
      } else {
        playTone(480, 0.05, 'sine', soundOn);
        spawnBurst(xPct, yPct, [COLOR_STYLES[piece.colorIndex].hex], 5, 30);
      }

      const anyRemainingFits = finalTray.some((p) => p !== null && canFitAnywhere(nextBoard, p.matrix));
      if (!anyRemainingFits) {
        const endTimer = window.setTimeout(() => {
          void finalizeMatch(nextScore, nextMoves, 'gameover');
        }, 480);
        cleanupTimersRef.current.push(endTimer);
      }
      return true;
    },
    [
      board,
      combo,
      finalizeMatch,
      gameState,
      inGameScore,
      movesCount,
      soundOn,
      spawnBurst,
      spawnPopup,
      tray,
    ]
  );

  // Global pointer tracking for smooth drag-and-drop on mouse & touch
  useEffect(() => {
    if (!dragState) return;

    const resolveBoardCell = (clientX: number, clientY: number, isTouch: boolean) => {
      const targetY = isTouch ? clientY - 44 : clientY;
      const el = document.elementFromPoint(clientX, targetY) as HTMLElement | null;
      const cellEl = el?.closest?.('[data-bb-row]') as HTMLElement | null;
      if (!cellEl) {
        setHoverCell(null);
        return null;
      }
      const row = Number(cellEl.dataset.bbRow);
      const col = Number(cellEl.dataset.bbCol);
      if (Number.isNaN(row) || Number.isNaN(col)) {
        setHoverCell(null);
        return null;
      }
      setHoverCell({ row, col });
      return { row, col };
    };

    const handleMove = (e: PointerEvent) => {
      setDragState((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
      resolveBoardCell(e.clientX, e.clientY, dragState.isTouch);
    };

    const handleUp = (e: PointerEvent) => {
      const cell = resolveBoardCell(e.clientX, e.clientY, dragState.isTouch);
      if (cell) {
        placeActivePieceAt(dragState.trayIdx, cell.row, cell.col);
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragState, placeActivePieceAt]);

  const earnedCoinsPreview = calculateCoinsFromScore(inGameScore);
  const nextCoinThreshold = (Math.floor(inGameScore / 1000) + 1) * 1000;
  const toNextRewardPct = Math.min(100, Math.round(((inGameScore % 1000) / 1000) * 100));

  return (
    <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 max-w-2xl mx-auto shadow-lg">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-lime-400/15 border border-lime-400/35 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
            <Grid3X3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-display font-extrabold text-slate-900 dark:text-white leading-tight">
              Block Britz
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">
              A cada 1.000 pts no jogo = +30 moedas Earn Easy (máx. 300 moedas/partida)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            aria-label={soundOn ? 'Desativar som' : 'Ativar som'}
            className="p-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>

      {gameState === 'TITLE_MENU' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-6 space-y-6"
        >
          <div className="max-w-md mx-auto space-y-2">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Encaixe blocos, complete linhas & colunas!
            </h4>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Arraste os blocos para o tabuleiro 8×8 ou toque em uma peça e depois na posição desejada.
              Linhas e colunas completas explodem e geram combos!
            </p>
          </div>

          <div className="max-w-sm mx-auto rounded-2xl border border-lime-400/30 bg-emerald-50/70 dark:bg-[#101c13] p-4 text-xs text-slate-700 dark:text-zinc-300 space-y-1">
            <div className="font-bold text-emerald-700 dark:text-lime-400">
              Conversão equilibrada de pontos
            </div>
            <p>1.000 pts no Block Britz = 30 moedas · Recorde pessoal: {bestScore.toLocaleString('pt-BR')} pts</p>
          </div>

          <button
            type="button"
            onClick={startGame}
            className="px-7 py-3.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-2xl shadow-lg shadow-lime-500/20 transition-colors cursor-pointer"
          >
            Começar Block Britz
          </button>
        </motion.div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-4">
          {/* HUD Bar */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] px-3 py-2.5">
              <div className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                Pontos no Jogo
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-slate-900 dark:text-white tabular-nums">
                {inGameScore.toLocaleString('pt-BR')}
              </div>
            </div>
            <div className="rounded-2xl border border-lime-400/30 bg-emerald-50/70 dark:bg-[#101c13] px-3 py-2.5">
              <div className="text-[10px] font-medium text-emerald-700 dark:text-lime-300">
                Moedas Earn Easy
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-emerald-700 dark:text-lime-400 tabular-nums">
                +{earnedCoinsPreview}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] px-3 py-2.5">
              <div className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                Linhas · Combo
              </div>
              <div className="text-base sm:text-lg font-mono font-extrabold text-slate-900 dark:text-white tabular-nums">
                {linesClearedTotal} · {combo > 0 ? `x${combo}` : '—'}
              </div>
            </div>
          </div>

          {/* Progress towards next 1,000 game points */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
              <span>Progresso para o próximo bloco de +30 moedas ({nextCoinThreshold.toLocaleString('pt-BR')} pts)</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-lime-400">
                {toNextRewardPct}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 rounded-full transition-all duration-200"
                style={{ width: `${toNextRewardPct}%` }}
              />
            </div>
          </div>

          {/* 8x8 Board */}
          <div className="relative max-w-[360px] sm:max-w-[390px] mx-auto select-none">
            <ParticleBurstLayer events={bursts} />
            <FloatingFeedbackLayer items={popups} />

            <div
              onMouseLeave={() => {
                if (!dragState) setHoverCell(null);
              }}
              className="grid grid-cols-8 gap-1 sm:gap-1.5 p-2.5 sm:p-3 rounded-2xl bg-[#0b1017] border border-zinc-800 shadow-inner"
            >
              {board.map((rowArr, r) =>
                rowArr.map((cellColorIdx, c) => {
                  const key = `${r}_${c}`;
                  const isPreview = Boolean(placementPreview?.cells.has(key));
                  const isClearing = clearingCells.has(key);
                  const willLineClear =
                    Boolean(placementPreview?.valid) &&
                    (placementPreview!.willClearRows.has(r) || placementPreview!.willClearCols.has(c));

                  let cellClass = 'bg-[#141b24] border-[#1f2937]';
                  if (cellColorIdx !== null) {
                    const style = COLOR_STYLES[cellColorIdx % COLOR_STYLES.length];
                    cellClass = `${style.bg} ${style.border} shadow-sm ${style.glow}`;
                  } else if (isPreview) {
                    cellClass = placementPreview!.valid
                      ? 'bg-lime-400/55 border-lime-300'
                      : 'bg-red-500/45 border-red-400';
                  }

                  return (
                    <button
                      key={key}
                      type="button"
                      data-bb-row={r}
                      data-bb-col={c}
                      disabled={gameState !== 'PLAYING'}
                      onMouseEnter={() => {
                        if (!dragState && gameState === 'PLAYING') {
                          setHoverCell({ row: r, col: c });
                        }
                      }}
                      onClick={() => {
                        if (gameState !== 'PLAYING' || selectedTrayIdx === null) return;
                        placeActivePieceAt(selectedTrayIdx, r, c);
                      }}
                      className={`aspect-square rounded-lg border transition-transform duration-100 cursor-pointer relative ${cellClass} ${
                        willLineClear && cellColorIdx !== null ? 'ring-2 ring-white/80 scale-[1.03]' : ''
                      } ${isClearing ? 'scale-110 opacity-40' : ''}`}
                      aria-label={`Linha ${r + 1}, Coluna ${c + 1}`}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* 3-Piece Tray */}
          {gameState === 'PLAYING' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto">
                {tray.map((piece, idx) => {
                  if (!piece) {
                    return (
                      <div
                        key={`empty_${idx}`}
                        className="h-24 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-[#090d12]/50 flex items-center justify-center text-[11px] text-slate-400 dark:text-zinc-600"
                      >
                        Usado
                      </div>
                    );
                  }

                  const selected = selectedTrayIdx === idx;
                  const fittable = canFitAnywhere(board, piece.matrix);
                  const style = COLOR_STYLES[piece.colorIndex % COLOR_STYLES.length];
                  const isBeingDragged = dragState?.trayIdx === idx;

                  return (
                    <div
                      key={piece.id}
                      onPointerDown={(e) => {
                        if (gameState !== 'PLAYING') return;
                        setSelectedTrayIdx(idx);
                        setDragState({
                          trayIdx: idx,
                          x: e.clientX,
                          y: e.clientY,
                          isTouch: e.pointerType === 'touch',
                        });
                      }}
                      onClick={() => setSelectedTrayIdx(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedTrayIdx(idx);
                      }}
                      className={`h-24 rounded-2xl border p-2 flex flex-col items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing transition-all ${
                        selected
                          ? 'bg-emerald-50/80 dark:bg-[#101c13] border-emerald-500 dark:border-lime-400 ring-2 ring-lime-400/25'
                          : 'bg-slate-50 dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 hover:border-lime-400/60'
                      } ${!fittable ? 'opacity-40' : ''} ${isBeingDragged ? 'opacity-30 scale-95' : ''}`}
                    >
                      <div
                        className="grid gap-1"
                        style={{
                          gridTemplateColumns: `repeat(${piece.matrix[0].length}, minmax(0, 1fr))`,
                        }}
                      >
                        {piece.matrix.map((rowArr, pr) =>
                          rowArr.map((val, pc) => (
                            <div
                              key={`${pr}_${pc}`}
                              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[4px] ${
                                val === 1 ? `${style.bg} border ${style.border}` : 'bg-transparent'
                              }`}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
                <span>
                  Dica: arraste uma peça para o tabuleiro ou selecione e toque onde encaixar.
                </span>
                {movesCount >= 3 && (
                  <button
                    type="button"
                    onClick={() => void finalizeMatch(inGameScore, movesCount, 'cashout')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-lime-500/40 text-emerald-700 dark:text-lime-400 font-bold hover:bg-emerald-50 dark:hover:bg-lime-500/10 cursor-pointer"
                  >
                    <Flag className="w-3 h-3" />
                    Encerrar e Creditar (+{earnedCoinsPreview})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Drag Ghost Overlay */}
          {dragState && tray[dragState.trayIdx] && (
            <div
              className="fixed pointer-events-none z-[80]"
              style={{
                left: dragState.x,
                top: dragState.isTouch ? dragState.y - 44 : dragState.y,
                transform: 'translate(-50%, -50%) scale(1.15)',
              }}
            >
              {(() => {
                const piece = tray[dragState.trayIdx]!;
                const style = COLOR_STYLES[piece.colorIndex % COLOR_STYLES.length];
                return (
                  <div
                    className="grid gap-1 opacity-90 drop-shadow-xl"
                    style={{
                      gridTemplateColumns: `repeat(${piece.matrix[0].length}, minmax(0, 1fr))`,
                    }}
                  >
                    {piece.matrix.map((rowArr, pr) =>
                      rowArr.map((val, pc) => (
                        <div
                          key={`${pr}_${pc}`}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md ${
                            val === 1 ? `${style.bg} border ${style.border}` : 'bg-transparent'
                          }`}
                        />
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Round Summary */}
          <AnimatePresence>
            {gameState === 'ROUND_SUMMARY' && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.22 }}
                className="border-t border-slate-100 dark:border-zinc-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-lime-400/15 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {submitting
                        ? 'Validando partida no sistema antifraude...'
                        : rewardInfo
                          ? `+${rewardInfo.credited} moedas creditadas (${inGameScore.toLocaleString('pt-BR')} pts no jogo)`
                          : `Pontuação final: ${inGameScore.toLocaleString('pt-BR')} pts`}
                    </p>
                    {rewardInfo && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-lime-400" />
                        {rewardInfo.verificationStatus === 'verified'
                          ? 'Conversão 1.000 pts = 30 moedas verificada'
                          : rewardInfo.fraudReason}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startGame}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Jogar Novamente
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
