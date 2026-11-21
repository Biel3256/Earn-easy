import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RotateCcw, ShieldCheck, Trophy, Undo2, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

const ROWS = 6;
const COLS = 7;
type Disc = 0 | 1 | 2; // 0 empty, 1 player, 2 cpu
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';
type Connect4Difficulty = 'normal' | 'estrategista';

function createEmptyGrid(): Disc[][] {
  return Array.from({ length: ROWS }, () => Array<Disc>(COLS).fill(0));
}

function getDropRow(grid: Disc[][], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r][col] === 0) return r;
  }
  return -1;
}

function checkConnect4Win(grid: Disc[][]): { winner: Disc | 'DRAW' | null; cells: Array<[number, number]> } {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = grid[r][c];
      if (p === 0) continue;
      for (const [dr, dc] of dirs) {
        const line: Array<[number, number]> = [[r, c]];
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || grid[nr][nc] !== p) break;
          line.push([nr, nc]);
        }
        if (line.length === 4) {
          return { winner: p, cells: line };
        }
      }
    }
  }
  if (grid[0].every((cell) => cell !== 0)) {
    return { winner: 'DRAW', cells: [] };
  }
  return { winner: null, cells: [] };
}

function scoreWindow(window: Disc[], aiPiece: Disc): number {
  const oppPiece: Disc = aiPiece === 2 ? 1 : 2;
  let aiCount = 0;
  let oppCount = 0;
  let emptyCount = 0;
  window.forEach((v) => {
    if (v === aiPiece) aiCount++;
    else if (v === oppPiece) oppCount++;
    else emptyCount++;
  });
  if (aiCount === 4) return 1000;
  if (oppCount === 4) return -1000;
  if (aiCount === 3 && emptyCount === 1) return 12;
  if (aiCount === 2 && emptyCount === 2) return 3;
  if (oppCount === 3 && emptyCount === 1) return -16;
  return 0;
}

function evaluateBoardHeuristic(grid: Disc[][]): number {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    if (grid[r][3] === 2) score += 4;
    if (grid[r][3] === 1) score -= 4;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += scoreWindow([grid[r][c], grid[r][c + 1], grid[r][c + 2], grid[r][c + 3]], 2);
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      score += scoreWindow([grid[r][c], grid[r + 1][c], grid[r + 2][c], grid[r + 3][c]], 2);
    }
  }
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += scoreWindow([grid[r][c], grid[r + 1][c + 1], grid[r + 2][c + 2], grid[r + 3][c + 3]], 2);
      score += scoreWindow([grid[r + 3][c], grid[r + 2][c + 1], grid[r + 1][c + 2], grid[r][c + 3]], 2);
    }
  }
  return score;
}

function minimax(grid: Disc[][], depth: number, alpha: number, beta: number, maximizing: boolean): [number, number] {
  const validCols = [3, 2, 4, 1, 5, 0, 6].filter((c) => getDropRow(grid, c) !== -1);
  const check = checkConnect4Win(grid);
  if (depth === 0 || check.winner !== null) {
    if (check.winner === 2) return [-1, 100000 + depth];
    if (check.winner === 1) return [-1, -100000 - depth];
    if (check.winner === 'DRAW') return [-1, 0];
    return [-1, evaluateBoardHeuristic(grid)];
  }

  if (maximizing) {
    let value = -Infinity;
    let bestCol = validCols[0];
    for (const col of validCols) {
      const r = getDropRow(grid, col);
      grid[r][col] = 2;
      const newScore = minimax(grid, depth - 1, alpha, beta, false)[1];
      grid[r][col] = 0;
      if (newScore > value) {
        value = newScore;
        bestCol = col;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return [bestCol, value];
  }

  let value = Infinity;
  let bestCol = validCols[0];
  for (const col of validCols) {
    const r = getDropRow(grid, col);
    grid[r][col] = 1;
    const newScore = minimax(grid, depth - 1, alpha, beta, true)[1];
    grid[r][col] = 0;
    if (newScore < value) {
      value = newScore;
      bestCol = col;
    }
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return [bestCol, value];
}

function pickCpuColumn(grid: Disc[][], difficulty: Connect4Difficulty): number {
  const validCols = Array.from({ length: COLS }, (_, c) => c).filter(
    (c) => getDropRow(grid, c) !== -1
  );
  if (validCols.length === 0) return -1;

  if (difficulty === 'estrategista') {
    const [col] = minimax(grid, 3, -Infinity, Infinity, true);
    if (col !== -1) return col;
  }

  for (const col of validCols) {
    const r = getDropRow(grid, col);
    grid[r][col] = 2;
    const win = checkConnect4Win(grid).winner === 2;
    grid[r][col] = 0;
    if (win) return col;
  }

  for (const col of validCols) {
    const r = getDropRow(grid, col);
    grid[r][col] = 1;
    const threat = checkConnect4Win(grid).winner === 1;
    grid[r][col] = 0;
    if (threat) return col;
  }

  let bestScore = -Infinity;
  let bestCol = validCols[0];
  for (const col of validCols) {
    const r = getDropRow(grid, col);
    let score = 4 - Math.abs(3 - col);
    grid[r][col] = 2;
    if (r > 0) {
      grid[r - 1][col] = 1;
      if (checkConnect4Win(grid).winner === 1) score -= 50;
      grid[r - 1][col] = 0;
    }
    grid[r][col] = 0;
    score += Math.random() * 1.5;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol;
}

export const Connect4SoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [difficulty, setDifficulty] = useState<Connect4Difficulty>('normal');
  const [grid, setGrid] = useState<Disc[][]>(() => createEmptyGrid());
  const [prevGridSnapshot, setPrevGridSnapshot] = useState<Disc[][] | null>(null);
  const [usedUndo, setUsedUndo] = useState(false);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [lastDrop, setLastDrop] = useState<[number, number] | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winCells, setWinCells] = useState<Array<[number, number]>>([]);
  const [winner, setWinner] = useState<Disc | 'DRAW' | null>(null);
  const [movesCount, setMovesCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const cpuTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (cpuTimerRef.current) window.clearTimeout(cpuTimerRef.current);
    };
  }, []);

  const cpuThreatWarning = useMemo(() => {
    if (gameState !== 'PLAYING') return false;
    for (let c = 0; c < COLS; c++) {
      const r = getDropRow(grid, c);
      if (r === -1) continue;
      grid[r][c] = 2;
      const danger = checkConnect4Win(grid).winner === 2;
      grid[r][c] = 0;
      if (danger) return true;
    }
    return false;
  }, [gameState, grid]);

  const startGame = () => {
    if (cpuTimerRef.current) window.clearTimeout(cpuTimerRef.current);
    setGrid(createEmptyGrid());
    setPrevGridSnapshot(null);
    setUsedUndo(false);
    setHoverCol(null);
    setLastDrop(null);
    setIsPlayerTurn(true);
    setWinCells([]);
    setWinner(null);
    setMovesCount(0);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (
    outcome: Disc | 'DRAW',
    totalMoves: number,
    cells: Array<[number, number]>
  ) => {
    setWinner(outcome);
    setWinCells(cells);
    setGameState('ROUND_SUMMARY');

    const rawDuration = Date.now() - startedAtRef.current;
    const diffBonus = difficulty === 'estrategista' ? 25 : 0;
    const score =
      outcome === 1
        ? Math.min(320, 240 + diffBonus + Math.max(0, 55 - totalMoves * 3))
        : outcome === 'DRAW'
          ? 145 + diffBonus
          : 55;

    playTone(outcome === 1 ? 760 : outcome === 'DRAW' ? 460 : 240, 0.18, 'triangle', soundOn);

    setSubmitting(true);
    try {
      const res = await onComplete(score, Math.max(rawDuration, 5000), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = () => {
    if (gameState !== 'PLAYING' || !isPlayerTurn || usedUndo || !prevGridSnapshot) return;
    setGrid(prevGridSnapshot.map((r) => [...r]));
    setPrevGridSnapshot(null);
    setUsedUndo(true);
    setLastDrop(null);
    playTone(460, 0.08, 'sine', soundOn);
  };

  const handleDrop = (col: number) => {
    if (gameState !== 'PLAYING' || !isPlayerTurn) return;
    const row = getDropRow(grid, col);
    if (row === -1) return;

    setPrevGridSnapshot(grid.map((r) => [...r]));

    const nextGrid = grid.map((r) => [...r]);
    nextGrid[row][col] = 1;
    const nextMoves = movesCount + 1;
    setGrid(nextGrid);
    setLastDrop([row, col]);
    setMovesCount(nextMoves);
    playTone(580, 0.06, 'sine', soundOn);

    const check = checkConnect4Win(nextGrid);
    if (check.winner) {
      finishMatch(check.winner, nextMoves, check.cells);
      return;
    }

    setIsPlayerTurn(false);
    cpuTimerRef.current = window.setTimeout(() => {
      const copy = nextGrid.map((r) => [...r]);
      const cpuCol = pickCpuColumn(copy, difficulty);
      if (cpuCol === -1) return;
      const cpuRow = getDropRow(copy, cpuCol);
      copy[cpuRow][cpuCol] = 2;
      setGrid(copy);
      setLastDrop([cpuRow, cpuCol]);
      playTone(400, 0.06, 'sine', soundOn);

      const cpuCheck = checkConnect4Win(copy);
      if (cpuCheck.winner) {
        finishMatch(cpuCheck.winner, nextMoves, cpuCheck.cells);
      } else {
        setIsPlayerTurn(true);
      }
    }, 450);
  };

  const ghostRow = hoverCol !== null && isPlayerTurn && gameState === 'PLAYING' ? getDropRow(grid, hoverCol) : -1;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Ligue 4 Solo</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            IA Estrategista Minimax, prévia de disco e desfazer 1x · Até 320 moedas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            aria-label={soundOn ? 'Desativar som' : 'Ativar som'}
            className="min-w-[40px] min-h-[40px] p-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer flex items-center justify-center"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>

      {gameState === 'TITLE_MENU' && (
        <div className="py-4 space-y-5">
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-md mx-auto text-center leading-relaxed">
            Solte seus discos neon verde-limão nas colunas do tabuleiro 7×6 e conecte 4 em linha. Escolha o nível da IA:
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setDifficulty('normal')}
              className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                difficulty === 'normal'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">Modo Normal</div>
              <div className="text-[11px] opacity-80">Duelo clássico</div>
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('estrategista')}
              className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                difficulty === 'estrategista'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">Estrategista (+25 pts)</div>
              <div className="text-[11px] opacity-80">IA calcula 3 jogadas à frente</div>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={startGame}
              className="min-h-[46px] px-7 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm cursor-pointer"
            >
              Iniciar Partida
            </button>
          </div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-2.5 rounded-xl">
            <span className="font-semibold text-slate-800 dark:text-zinc-200">
              {gameState === 'PLAYING'
                ? isPlayerTurn
                  ? 'Sua vez! Escolha uma coluna para soltar o disco'
                  : 'IA calculando jogada...'
                : winner === 1
                  ? 'Você conectou 4 discos!'
                  : winner === 'DRAW'
                    ? 'Empate estratégico!'
                    : 'A IA conectou 4 discos'}
            </span>
            <div className="flex items-center gap-2.5">
              {gameState === 'PLAYING' && prevGridSnapshot && !usedUndo && isPlayerTurn && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-zinc-700 text-[11px] font-bold hover:border-lime-400 cursor-pointer"
                >
                  <Undo2 className="w-3 h-3" />
                  Desfazer (1x)
                </button>
              )}
              <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                Jogadas: {movesCount}
              </span>
            </div>
          </div>

          {cpuThreatWarning && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Atenção: a IA tem 3 peças alinhadas prontas para vencer!
            </div>
          )}

          <div className="max-w-sm mx-auto rounded-3xl bg-[#0b1320] border border-lime-400/35 p-3 shadow-inner space-y-2">
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: COLS }).map((_, cIdx) => {
                const canDrop =
                  gameState === 'PLAYING' && isPlayerTurn && getDropRow(grid, cIdx) !== -1;
                return (
                  <button
                    key={cIdx}
                    type="button"
                    disabled={!canDrop}
                    onMouseEnter={() => setHoverCol(cIdx)}
                    onMouseLeave={() => setHoverCol(null)}
                    onClick={() => handleDrop(cIdx)}
                    className="h-7 rounded-lg bg-slate-800/80 hover:bg-lime-400 hover:text-slate-950 text-slate-300 text-xs font-black disabled:opacity-30 cursor-pointer transition-colors"
                  >
                    ↓
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((row, rIdx) =>
                row.map((cell, cIdx) => {
                  const isWin = winCells.some(([wr, wc]) => wr === rIdx && wc === cIdx);
                  const isLast = lastDrop && lastDrop[0] === rIdx && lastDrop[1] === cIdx;
                  const isGhost = ghostRow === rIdx && hoverCol === cIdx && cell === 0;
                  const canDrop =
                    gameState === 'PLAYING' && isPlayerTurn && getDropRow(grid, cIdx) !== -1;
                  return (
                    <button
                      key={`${rIdx}-${cIdx}`}
                      type="button"
                      disabled={!canDrop}
                      onMouseEnter={() => setHoverCol(cIdx)}
                      onMouseLeave={() => setHoverCol(null)}
                      onClick={() => handleDrop(cIdx)}
                      aria-label={`Coluna ${cIdx + 1}`}
                      className={`aspect-square rounded-full border transition-all duration-150 cursor-pointer disabled:cursor-default ${
                        cell === 1
                          ? `bg-lime-400 border-lime-200 ${isWin ? 'ring-2 ring-white scale-105' : isLast ? 'ring-2 ring-lime-200/70' : ''}`
                          : cell === 2
                            ? `bg-rose-500 border-rose-300 ${isWin ? 'ring-2 ring-white scale-105' : isLast ? 'ring-2 ring-rose-200/70' : ''}`
                            : isGhost
                              ? 'bg-lime-400/25 border-lime-400/70'
                              : 'bg-slate-900 border-slate-700 hover:border-lime-400/70'
                      }`}
                    />
                  );
                })
              )}
            </div>
          </div>

          {gameState === 'ROUND_SUMMARY' && (
            <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                    {submitting
                      ? 'Validando partida...'
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

              <button
                type="button"
                onClick={startGame}
                disabled={submitting}
                className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Jogar Novamente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
