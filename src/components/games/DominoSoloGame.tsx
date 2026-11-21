import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, RotateCcw, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

type Tile = [number, number];
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';
type DominoDifficulty = 'padrao' | 'mestre';

const PIP_LAYOUTS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function PipFace({ value, compact = false }: { value: number; compact?: boolean }) {
  const active = PIP_LAYOUTS[value] || [];
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 ${
        compact ? 'w-5 h-5 p-0.5 gap-0.5' : 'w-8 h-8 p-1 gap-0.5'
      }`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${
            active.includes(i) ? 'bg-slate-900 dark:bg-lime-300' : 'bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function buildShuffledDeck(): Tile[] {
  const deck: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      deck.push([a, b]);
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function tileSum(hand: Tile[]): number {
  return hand.reduce((acc, t) => acc + t[0] + t[1], 0);
}

function canPlayTile(tile: Tile, board: Tile[]): { left: boolean; right: boolean } {
  if (board.length === 0) return { left: true, right: true };
  const leftEnd = board[0][0];
  const rightEnd = board[board.length - 1][1];
  return {
    left: tile[0] === leftEnd || tile[1] === leftEnd,
    right: tile[0] === rightEnd || tile[1] === rightEnd,
  };
}

function placeOnBoard(board: Tile[], tile: Tile, side: 'left' | 'right'): Tile[] {
  if (board.length === 0) return [tile];
  if (side === 'left') {
    const leftEnd = board[0][0];
    const oriented: Tile = tile[1] === leftEnd ? tile : [tile[1], tile[0]];
    return [oriented, ...board];
  }
  const rightEnd = board[board.length - 1][1];
  const oriented: Tile = tile[0] === rightEnd ? tile : [tile[1], tile[0]];
  return [...board, oriented];
}

function evaluateBestHint(hand: Tile[], board: Tile[]): { idx: number; side: 'left' | 'right' } | null {
  let bestIdx = -1;
  let bestSide: 'left' | 'right' = 'left';
  let bestScore = -Infinity;

  const freq: Record<number, number> = {};
  hand.forEach(([a, b]) => {
    freq[a] = (freq[a] || 0) + 1;
    if (b !== a) freq[b] = (freq[b] || 0) + 1;
  });

  hand.forEach((tile, idx) => {
    const fit = canPlayTile(tile, board);
    (['left', 'right'] as const).forEach((side) => {
      if (!fit[side]) return;
      const nextBoard = placeOnBoard(board, tile, side);
      const newEnd = side === 'left' ? nextBoard[0][0] : nextBoard[nextBoard.length - 1][1];
      let score = tile[0] + tile[1] + (tile[0] === tile[1] ? 4 : 0);
      score += (freq[newEnd] || 0) * 2;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
        bestSide = side;
      }
    });
  });

  return bestIdx === -1 ? null : { idx: bestIdx, side: bestSide };
}

export const DominoSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [difficulty, setDifficulty] = useState<DominoDifficulty>('padrao');
  const [board, setBoard] = useState<Tile[]>([]);
  const [playerHand, setPlayerHand] = useState<Tile[]>([]);
  const [cpuHand, setCpuHand] = useState<Tile[]>([]);
  const [boneyard, setBoneyard] = useState<Tile[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [pendingTileIdx, setPendingTileIdx] = useState<number | null>(null);
  const [hintTileIdx, setHintTileIdx] = useState<number | null>(null);
  const [consecutivePasses, setConsecutivePasses] = useState(0);
  const [statusLog, setStatusLog] = useState('Sua vez de abrir o jogo!');
  const [movesCount, setMovesCount] = useState(0);
  const [winnerLabel, setWinnerLabel] = useState<'player' | 'cpu' | 'draw' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const cpuTimerRef = useRef<number | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (cpuTimerRef.current) window.clearTimeout(cpuTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (boardScrollRef.current) {
      boardScrollRef.current.scrollLeft = boardScrollRef.current.scrollWidth;
    }
  }, [board.length]);

  const startGame = () => {
    if (cpuTimerRef.current) window.clearTimeout(cpuTimerRef.current);
    const deck = buildShuffledDeck();
    setPlayerHand(deck.slice(0, 7));
    setCpuHand(deck.slice(7, 14));
    setBoneyard(deck.slice(14));
    setBoard([]);
    setIsPlayerTurn(true);
    setPendingTileIdx(null);
    setHintTileIdx(null);
    setConsecutivePasses(0);
    setMovesCount(0);
    setWinnerLabel(null);
    setRewardInfo(null);
    setStatusLog('Escolha qualquer pedra da sua mão para abrir a mesa!');
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (
    outcome: 'player' | 'cpu' | 'draw',
    finalPlayerHand: Tile[],
    finalCpuHand: Tile[],
    totalMoves: number
  ) => {
    setWinnerLabel(outcome);
    setGameState('ROUND_SUMMARY');
    const rawDuration = Date.now() - startedAtRef.current;

    const cpuPips = tileSum(finalCpuHand);
    const playerPips = tileSum(finalPlayerHand);
    const difficultyBonus = difficulty === 'mestre' ? 25 : 0;
    let score = 55;
    if (outcome === 'player') {
      score = Math.min(350, 245 + difficultyBonus + Math.min(85, cpuPips * 2));
      playTone(760, 0.18, 'triangle', soundOn);
    } else if (outcome === 'draw') {
      score = 145 + difficultyBonus;
      playTone(460, 0.12, 'sine', soundOn);
    } else {
      score = Math.max(45, 75 - Math.min(30, Math.floor(playerPips / 2)));
      playTone(250, 0.16, 'sawtooth', soundOn);
    }

    setSubmitting(true);
    try {
      const res = await onComplete(score, Math.max(rawDuration, 6000), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const runCpuTurn = (
    curBoard: Tile[],
    curPlayerHand: Tile[],
    curCpuHand: Tile[],
    curBoneyard: Tile[],
    passesSoFar: number,
    curMoves: number
  ) => {
    cpuTimerRef.current = window.setTimeout(() => {
      let nextCpuHand = [...curCpuHand];
      const nextBoneyard = [...curBoneyard];

      const findMove = (hand: Tile[]) => {
        if (difficulty === 'mestre') {
          const oppHasCounts: Record<number, number> = {};
          curPlayerHand.forEach(([a, b]) => {
            oppHasCounts[a] = (oppHasCounts[a] || 0) + 1;
            if (b !== a) oppHasCounts[b] = (oppHasCounts[b] || 0) + 1;
          });
          const myCounts: Record<number, number> = {};
          hand.forEach(([a, b]) => {
            myCounts[a] = (myCounts[a] || 0) + 1;
            if (b !== a) myCounts[b] = (myCounts[b] || 0) + 1;
          });

          let bestI = -1;
          let bestS: 'left' | 'right' = 'left';
          let bestW = -Infinity;
          hand.forEach((tile, idx) => {
            const fit = canPlayTile(tile, curBoard);
            (['left', 'right'] as const).forEach((side) => {
              if (!fit[side]) return;
              const nextB = placeOnBoard(curBoard, tile, side);
              const exposed = side === 'left' ? nextB[0][0] : nextB[nextB.length - 1][1];
              const weight =
                tile[0] +
                tile[1] +
                (tile[0] === tile[1] ? 4 : 0) +
                (myCounts[exposed] || 0) * 3 -
                (oppHasCounts[exposed] || 0) * 2;
              if (weight > bestW) {
                bestW = weight;
                bestI = idx;
                bestS = side;
              }
            });
          });
          return { bestI, bestS, bestW };
        }

        let bestI = -1;
        let bestS: 'left' | 'right' = 'left';
        let bestW = -1;
        hand.forEach((tile, idx) => {
          const fit = canPlayTile(tile, curBoard);
          if (fit.left || fit.right) {
            const weight = tile[0] + tile[1] + (tile[0] === tile[1] ? 3 : 0);
            if (weight > bestW) {
              bestW = weight;
              bestI = idx;
              bestS = fit.left ? 'left' : 'right';
            }
          }
        });
        return { bestI, bestS, bestW };
      };

      let found = findMove(nextCpuHand);
      let drewCount = 0;
      while (found.bestI === -1 && nextBoneyard.length > 0) {
        const drawn = nextBoneyard.pop()!;
        nextCpuHand.push(drawn);
        drewCount++;
        found = findMove(nextCpuHand);
      }

      if (found.bestI !== -1) {
        const played = nextCpuHand[found.bestI];
        nextCpuHand = nextCpuHand.filter((_, i) => i !== found.bestI);
        const nextBoard = placeOnBoard(curBoard, played, found.bestS);
        setBoard(nextBoard);
        setCpuHand(nextCpuHand);
        setBoneyard(nextBoneyard);
        setConsecutivePasses(0);
        playTone(400, 0.07, 'sine', soundOn);

        if (nextCpuHand.length === 0) {
          setStatusLog('A IA bateu todas as pedras!');
          finishMatch('cpu', curPlayerHand, nextCpuHand, curMoves);
          return;
        }

        setStatusLog(
          drewCount > 0
            ? `IA comprou ${drewCount} pedra(s) e jogou [${played[0]}|${played[1]}]. Sua vez!`
            : `IA jogou [${played[0]}|${played[1]}]. Sua vez!`
        );
        setIsPlayerTurn(true);
      } else {
        const nextPasses = passesSoFar + 1;
        setCpuHand(nextCpuHand);
        setBoneyard(nextBoneyard);
        setConsecutivePasses(nextPasses);

        if (nextPasses >= 2) {
          const pSum = tileSum(curPlayerHand);
          const cSum = tileSum(nextCpuHand);
          const outcome = pSum < cSum ? 'player' : cSum < pSum ? 'cpu' : 'draw';
          setStatusLog(`Jogo trancado! Você (${pSum} pts) × IA (${cSum} pts).`);
          finishMatch(outcome, curPlayerHand, nextCpuHand, curMoves);
          return;
        }

        setStatusLog('IA não tinha jogada e passou a vez. Sua vez!');
        setIsPlayerTurn(true);
      }
    }, 650);
  };

  const executePlayerPlay = (idx: number, side: 'left' | 'right') => {
    const tile = playerHand[idx];
    const nextBoard = placeOnBoard(board, tile, side);
    const nextPlayerHand = playerHand.filter((_, i) => i !== idx);
    const nextMoves = movesCount + 1;

    setBoard(nextBoard);
    setPlayerHand(nextPlayerHand);
    setPendingTileIdx(null);
    setHintTileIdx(null);
    setConsecutivePasses(0);
    setMovesCount(nextMoves);
    playTone(620, 0.07, 'sine', soundOn);

    if (nextPlayerHand.length === 0) {
      setStatusLog('Você bateu todas as pedras!');
      finishMatch('player', nextPlayerHand, cpuHand, nextMoves);
      return;
    }

    setIsPlayerTurn(false);
    setStatusLog('IA analisando a mesa...');
    runCpuTurn(nextBoard, nextPlayerHand, cpuHand, boneyard, 0, nextMoves);
  };

  const handleTileClick = (idx: number) => {
    if (gameState !== 'PLAYING' || !isPlayerTurn) return;
    const tile = playerHand[idx];
    const fit = canPlayTile(tile, board);
    if (!fit.left && !fit.right) return;

    if (board.length === 0) {
      executePlayerPlay(idx, 'left');
      return;
    }

    const leftEnd = board[0][0];
    const rightEnd = board[board.length - 1][1];
    if (fit.left && fit.right && leftEnd !== rightEnd) {
      setPendingTileIdx(idx === pendingTileIdx ? null : idx);
      return;
    }

    executePlayerPlay(idx, fit.left ? 'left' : 'right');
  };

  const handleDrawFromBoneyard = () => {
    if (gameState !== 'PLAYING' || !isPlayerTurn || boneyard.length === 0) return;
    const nextBoneyard = [...boneyard];
    const drawn = nextBoneyard.pop()!;
    const nextHand = [...playerHand, drawn];
    setBoneyard(nextBoneyard);
    setPlayerHand(nextHand);
    setHintTileIdx(null);
    setMovesCount((m) => m + 1);
    playTone(500, 0.06, 'sine', soundOn);
    setStatusLog(`Você comprou [${drawn[0]}|${drawn[1]}] do monte.`);
  };

  const handlePlayerPass = () => {
    if (gameState !== 'PLAYING' || !isPlayerTurn || boneyard.length > 0) return;
    const hasPlayable = playerHand.some((t) => {
      const f = canPlayTile(t, board);
      return f.left || f.right;
    });
    if (hasPlayable) return;

    const nextMoves = movesCount + 1;
    const nextPasses = consecutivePasses + 1;
    setMovesCount(nextMoves);
    setConsecutivePasses(nextPasses);
    setHintTileIdx(null);
    playTone(300, 0.08, 'sine', soundOn);

    if (nextPasses >= 2) {
      const pSum = tileSum(playerHand);
      const cSum = tileSum(cpuHand);
      const outcome = pSum < cSum ? 'player' : cSum < pSum ? 'cpu' : 'draw';
      setStatusLog(`Jogo trancado! Você (${pSum} pts) × IA (${cSum} pts).`);
      finishMatch(outcome, playerHand, cpuHand, nextMoves);
      return;
    }

    setIsPlayerTurn(false);
    setStatusLog('Você passou a vez. Vez da IA...');
    runCpuTurn(board, playerHand, cpuHand, boneyard, nextPasses, nextMoves);
  };

  const handleShowHint = () => {
    if (!isPlayerTurn || gameState !== 'PLAYING') return;
    const hint = evaluateBestHint(playerHand, board);
    if (hint) {
      setHintTileIdx(hint.idx);
      const tile = playerHand[hint.idx];
      setStatusLog(
        `Dica: jogue [${tile[0]}|${tile[1]}] na ponta ${hint.side === 'left' ? 'Esquerda' : 'Direita'}.`
      );
      playTone(660, 0.07, 'sine', soundOn);
    } else {
      setStatusLog(
        boneyard.length > 0
          ? 'Nenhuma pedra encaixa — compre do monte.'
          : 'Nenhuma jogada possível — passe a vez.'
      );
    }
  };

  const playerHasAnyMove = playerHand.some((t) => {
    const f = canPlayTile(t, board);
    return f.left || f.right;
  });

  const myPipSum = useMemo(() => tileSum(playerHand), [playerHand]);
  const cpuPipSum = useMemo(() => tileSum(cpuHand), [cpuHand]);
  const leftEnd = board.length > 0 ? board[0][0] : null;
  const rightEnd = board.length > 0 ? board[board.length - 1][1] : null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Dominó Solo</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Duplo-6 com carroças verticais · Até 350 moedas
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
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-lg mx-auto text-center leading-relaxed">
            Receba 7 pedras e enfrente a IA no Dominó Duplo-6. Escolha o nível da mesa: no modo <strong>Mestre</strong> a IA lê suas pontas e rende bônus extras na vitória!
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setDifficulty('padrao')}
              className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                difficulty === 'padrao'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">Mesa Padrão</div>
              <div className="text-[11px] opacity-80">Ritmo equilibrado</div>
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('mestre')}
              className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                difficulty === 'mestre'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">Mesa Mestre (+25 pts)</div>
              <div className="text-[11px] opacity-80">IA tática de bloqueio</div>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={startGame}
              className="min-h-[46px] px-7 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              Iniciar Partida
            </button>
          </div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-5">
          {/* Status bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800 px-4 py-2.5 rounded-xl">
            <span className="font-semibold text-slate-800 dark:text-zinc-200">{statusLog}</span>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
              <span>Sua soma: {myPipSum} pts</span>
              <span>IA: {cpuHand.length} pedras</span>
              <span>Monte: {boneyard.length}</span>
            </div>
          </div>

          {/* Mesa de Dominó com Carroças Verticais */}
          <div className="rounded-2xl border border-emerald-500/30 bg-[#071510] p-4 min-h-[146px] flex flex-col justify-between gap-3 shadow-inner">
            <div className="flex items-center justify-between text-[11px] font-mono text-emerald-300/85">
              <span>Ponta Esq: {leftEnd ?? '—'}</span>
              <span>
                {difficulty === 'mestre' ? 'Mesa Mestre' : 'Mesa Padrão'} · {board.length} pedras
              </span>
              <span>Ponta Dir: {rightEnd ?? '—'}</span>
            </div>

            {board.length === 0 ? (
              <div className="text-center py-6 text-xs text-zinc-400">
                Mesa vazia. Jogue qualquer pedra para começar!
              </div>
            ) : (
              <div
                ref={boardScrollRef}
                className="flex items-center gap-1.5 py-2 overflow-x-auto"
              >
                {board.map((tile, i) => {
                  const isDouble = tile[0] === tile[1];
                  return (
                    <div
                      key={`${tile[0]}-${tile[1]}-${i}`}
                      className={`shrink-0 inline-flex items-center rounded-lg bg-white dark:bg-zinc-900 border border-lime-400/50 shadow-sm overflow-hidden ${
                        isDouble ? 'flex-col' : 'flex-row'
                      }`}
                    >
                      <PipFace value={tile[0]} compact />
                      <div
                        className={
                          isDouble
                            ? 'h-px w-4 bg-slate-300 dark:bg-zinc-700'
                            : 'w-px h-4 bg-slate-300 dark:bg-zinc-700'
                        }
                      />
                      <PipFace value={tile[1]} compact />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Escolha de ponta se pedra encaixar dos dois lados */}
          {pendingTileIdx !== null && playerHand[pendingTileIdx] && (
            <div className="rounded-xl border border-lime-400/50 bg-lime-50 dark:bg-lime-950/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900 dark:text-lime-200">
                A pedra [{playerHand[pendingTileIdx][0]}|{playerHand[pendingTileIdx][1]}] cabe nos dois lados. Onde encaixar?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => executePlayerPlay(pendingTileIdx, 'left')}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold cursor-pointer"
                >
                  Esquerda ({leftEnd})
                </button>
                <button
                  type="button"
                  onClick={() => executePlayerPlay(pendingTileIdx, 'right')}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer"
                >
                  Direita ({rightEnd})
                </button>
              </div>
            </div>
          )}

          {/* Mão do Jogador */}
          {gameState === 'PLAYING' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Suas Pedras ({playerHand.length})
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {isPlayerTurn && (
                    <button
                      type="button"
                      onClick={handleShowHint}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-lime-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                      Dica
                    </button>
                  )}
                  {boneyard.length > 0 && !playerHasAnyMove && isPlayerTurn && (
                    <button
                      type="button"
                      onClick={handleDrawFromBoneyard}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                    >
                      Comprar do Monte ({boneyard.length})
                    </button>
                  )}
                  {boneyard.length === 0 && !playerHasAnyMove && isPlayerTurn && (
                    <button
                      type="button"
                      onClick={handlePlayerPass}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold cursor-pointer"
                    >
                      Passar Vez
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {playerHand.map((tile, idx) => {
                  const fit = canPlayTile(tile, board);
                  const playable = isPlayerTurn && (fit.left || fit.right);
                  const selected = pendingTileIdx === idx;
                  const isHinted = hintTileIdx === idx;
                  return (
                    <button
                      key={`${tile[0]}-${tile[1]}-${idx}`}
                      type="button"
                      disabled={!playable}
                      onClick={() => handleTileClick(idx)}
                      className={`flex flex-col items-center rounded-xl border p-1 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        selected
                          ? 'bg-lime-100 dark:bg-lime-950/60 border-lime-400 ring-2 ring-lime-400 -translate-y-1'
                          : isHinted
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 ring-2 ring-amber-400 -translate-y-1'
                            : playable
                              ? 'bg-white dark:bg-zinc-950 border-emerald-400/70 hover:border-lime-400 hover:-translate-y-0.5 shadow-sm'
                              : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800'
                      }`}
                    >
                      <PipFace value={tile[0]} />
                      <div className="w-7 h-px bg-slate-300 dark:bg-zinc-700 my-0.5" />
                      <PipFace value={tile[1]} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {gameState === 'ROUND_SUMMARY' && (
            <div className="space-y-4">
              {cpuHand.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-600 dark:text-zinc-300">
                    Pedras restantes da IA ({cpuPipSum} pts na mão):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cpuHand.map((t, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-mono text-xs font-bold text-slate-700 dark:text-zinc-200"
                      >
                        [{t[0]}|{t[1]}]
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                      {winnerLabel === 'player'
                        ? 'Vitória no Dominó!'
                        : winnerLabel === 'draw'
                          ? 'Empate técnico!'
                          : 'A IA levou esta rodada'}{' '}
                      {submitting
                        ? '· Validando...'
                        : rewardInfo
                          ? `· +${rewardInfo.credited} moedas creditadas`
                          : ''}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};
