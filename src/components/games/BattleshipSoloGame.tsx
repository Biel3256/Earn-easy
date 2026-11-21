import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Radar,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Shuffle,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

const GRID_SIZE = 7;
const SHIP_SIZES = [4, 3, 2, 2]; // 11 ship cells total
type ShotState = 'unseen' | 'miss' | 'hit';
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

interface FleetData {
  board: boolean[];
  ships: number[][];
}

function createRandomFleetData(): FleetData {
  const board = Array(GRID_SIZE * GRID_SIZE).fill(false);
  const ships: number[][] = [];
  for (const size of SHIP_SIZES) {
    let placed = false;
    let tries = 0;
    while (!placed && tries < 250) {
      tries++;
      const horizontal = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horizontal ? GRID_SIZE : GRID_SIZE - size + 1));
      const c = Math.floor(Math.random() * (horizontal ? GRID_SIZE - size + 1 : GRID_SIZE));
      const indices: number[] = [];
      let clear = true;
      for (let i = 0; i < size; i++) {
        const rr = horizontal ? r : r + i;
        const cc = horizontal ? c + i : c;
        const idx = rr * GRID_SIZE + cc;
        if (board[idx]) {
          clear = false;
          break;
        }
        indices.push(idx);
      }
      if (clear) {
        indices.forEach((idx) => {
          board[idx] = true;
        });
        ships.push(indices);
        placed = true;
      }
    }
  }
  return { board, ships };
}

function buildBoardFromShips(ships: number[][]): boolean[] {
  const board = Array(GRID_SIZE * GRID_SIZE).fill(false);
  ships.forEach((ship) => ship.forEach((idx) => { board[idx] = true; }));
  return board;
}

function pickCpuTarget(playerBoard: boolean[], cpuShots: ShotState[]): number {
  const available: number[] = [];
  const huntQueue: number[] = [];

  cpuShots.forEach((shot, idx) => {
    if (shot === 'unseen') {
      available.push(idx);
    }
  });

  cpuShots.forEach((shot, idx) => {
    if (shot === 'hit' && playerBoard[idx]) {
      const r = Math.floor(idx / GRID_SIZE);
      const c = idx % GRID_SIZE;
      const neighbors = [
        r > 0 ? (r - 1) * GRID_SIZE + c : -1,
        r < GRID_SIZE - 1 ? (r + 1) * GRID_SIZE + c : -1,
        c > 0 ? r * GRID_SIZE + (c - 1) : -1,
        c < GRID_SIZE - 1 ? r * GRID_SIZE + (c + 1) : -1,
      ];
      neighbors.forEach((n) => {
        if (n >= 0 && cpuShots[n] === 'unseen') {
          huntQueue.push(n);
        }
      });
    }
  });

  if (huntQueue.length > 0) {
    return huntQueue[Math.floor(Math.random() * huntQueue.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

export const BattleshipSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);

  const [playerShips, setPlayerShips] = useState<number[][]>(() => createRandomFleetData().ships);
  const [horizontalPlace, setHorizontalPlace] = useState(true);
  const [nextShipIdx, setNextShipIdx] = useState(0);

  const [enemyFleet, setEnemyFleet] = useState<FleetData>(() => createRandomFleetData());
  const [playerShots, setPlayerShots] = useState<ShotState[]>(() =>
    Array(GRID_SIZE * GRID_SIZE).fill('unseen')
  );
  const [cpuShots, setCpuShots] = useState<ShotState[]>(() =>
    Array(GRID_SIZE * GRID_SIZE).fill('unseen')
  );

  const [sonarUsed, setSonarUsed] = useState(false);
  const [sonarArmed, setSonarArmed] = useState(false);
  const [sonarNotice, setSonarNotice] = useState<string | null>(null);

  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [movesCount, setMovesCount] = useState(0);
  const [statusText, setStatusText] = useState('Dispare contra o radar inimigo!');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
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

  const playerBoard = useMemo(() => buildBoardFromShips(playerShips), [playerShips]);
  const totalShipCells = SHIP_SIZES.reduce((a, b) => a + b, 0);
  const playerHits = playerShots.filter((c) => c === 'hit').length;
  const cpuHits = cpuShots.filter((c) => c === 'hit').length;

  const handleManualPlace = (idx: number) => {
    if (gameState !== 'TITLE_MENU') return;
    const size = SHIP_SIZES[nextShipIdx];
    const r = Math.floor(idx / GRID_SIZE);
    const c = idx % GRID_SIZE;
    if (horizontalPlace && c + size > GRID_SIZE) return;
    if (!horizontalPlace && r + size > GRID_SIZE) return;

    const newCells: number[] = [];
    for (let i = 0; i < size; i++) {
      const rr = horizontalPlace ? r : r + i;
      const cc = horizontalPlace ? c + i : c;
      newCells.push(rr * GRID_SIZE + cc);
    }

    const otherCells = new Set<number>();
    playerShips.forEach((ship, sIdx) => {
      if (sIdx !== nextShipIdx) ship.forEach((cell) => otherCells.add(cell));
    });
    if (newCells.some((cell) => otherCells.has(cell))) return;

    setPlayerShips((prev) => prev.map((s, sIdx) => (sIdx === nextShipIdx ? newCells : s)));
    setNextShipIdx((prev) => (prev + 1) % SHIP_SIZES.length);
    playTone(520, 0.05, 'sine', soundOn);
  };

  const startBattle = () => {
    if (cpuTimerRef.current) window.clearTimeout(cpuTimerRef.current);
    setEnemyFleet(createRandomFleetData());
    setPlayerShots(Array(GRID_SIZE * GRID_SIZE).fill('unseen'));
    setCpuShots(Array(GRID_SIZE * GRID_SIZE).fill('unseen'));
    setSonarUsed(false);
    setSonarArmed(false);
    setSonarNotice(null);
    setIsPlayerTurn(true);
    setMovesCount(0);
    setWinner(null);
    setRewardInfo(null);
    setStatusText('Sua vez! Selecione uma coordenada ou use o Sonar 3×3.');
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (
    outcome: 'player' | 'cpu',
    hitsLanded: number,
    totalMoves: number
  ) => {
    setWinner(outcome);
    setGameState('ROUND_SUMMARY');
    const rawDuration = Date.now() - startedAtRef.current;

    const score =
      outcome === 'player'
        ? Math.min(380, 280 + Math.max(0, 100 - Math.max(0, totalMoves - totalShipCells) * 4))
        : Math.min(160, 45 + hitsLanded * 8);

    playTone(outcome === 'player' ? 760 : 240, 0.18, outcome === 'player' ? 'triangle' : 'sawtooth', soundOn);

    setSubmitting(true);
    try {
      const res = await onComplete(score, Math.max(rawDuration, 6000), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnemyCellClick = (idx: number) => {
    if (gameState !== 'PLAYING' || !isPlayerTurn) return;

    // Modo Sonar 3×3: não gasta o turno de tiro!
    if (sonarArmed && !sonarUsed) {
      const r0 = Math.floor(idx / GRID_SIZE);
      const c0 = idx % GRID_SIZE;
      let detected = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r0 + dr;
          const cc = c0 + dc;
          if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
            const cellIdx = rr * GRID_SIZE + cc;
            if (enemyFleet.board[cellIdx] && playerShots[cellIdx] !== 'hit') {
              detected++;
            }
          }
        }
      }
      setSonarUsed(true);
      setSonarArmed(false);
      const msg =
        detected > 0
          ? `Sonar (${r0 + 1},${c0 + 1}): ${detected} parte(s) de navio inimigo nessa área 3×3! Agora atire.`
          : `Sonar (${r0 + 1},${c0 + 1}): nenhuma embarcação nessa área 3×3. Agora atire.`;
      setSonarNotice(msg);
      setStatusText(msg);
      playTone(680, 0.1, 'sine', soundOn);
      return;
    }

    if (playerShots[idx] !== 'unseen') return;

    const nextShots = [...playerShots];
    const wasHit = enemyFleet.board[idx];
    nextShots[idx] = wasHit ? 'hit' : 'miss';
    const nextMoves = movesCount + 1;
    const nextHits = nextShots.filter((c) => c === 'hit').length;

    setPlayerShots(nextShots);
    setMovesCount(nextMoves);
    playTone(wasHit ? 720 : 320, 0.08, wasHit ? 'triangle' : 'sine', soundOn);

    if (nextHits >= totalShipCells) {
      setStatusText('Frota inimiga completamente destruída! Vitória!');
      finishMatch('player', nextHits, nextMoves);
      return;
    }

    const sunkJustNow = wasHit
      ? enemyFleet.ships.find(
          (ship) => ship.includes(idx) && ship.every((cell) => nextShots[cell] === 'hit')
        )
      : undefined;

    setIsPlayerTurn(false);
    setStatusText(
      sunkJustNow
        ? `Afundou um navio de ${sunkJustNow.length} casas! Inimigo contra-atacando...`
        : wasHit
          ? 'Acertou um navio! Frota inimiga contra-atacando...'
          : 'Água! Frota inimiga mirando...'
    );

    cpuTimerRef.current = window.setTimeout(() => {
      const targetIdx = pickCpuTarget(playerBoard, cpuShots);
      const nextCpuShots = [...cpuShots];
      const cpuHit = playerBoard[targetIdx];
      nextCpuShots[targetIdx] = cpuHit ? 'hit' : 'miss';
      const nextCpuHits = nextCpuShots.filter((c) => c === 'hit').length;

      setCpuShots(nextCpuShots);
      playTone(cpuHit ? 260 : 410, 0.07, 'sine', soundOn);

      if (nextCpuHits >= totalShipCells) {
        setStatusText('O Almirante IA afundou toda a sua frota!');
        finishMatch('cpu', nextHits, nextMoves);
        return;
      }

      setStatusText(cpuHit ? 'Inimigo acertou um navio seu! Sua vez.' : 'Inimigo atirou na água! Sua vez.');
      setIsPlayerTurn(true);
    }, 450);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">
            Batalha Naval Solo
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Posicionamento manual, Sonar 3×3 e rastreio de navios · Até 380 moedas
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
        <div className="space-y-4 text-center py-2">
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-md mx-auto">
            Toque em qualquer célula para reposicionar o <strong>Navio #{nextShipIdx + 1} ({SHIP_SIZES[nextShipIdx]} casas)</strong> ou sorteie sua esquadra antes da batalha.
          </p>

          <div className="max-w-[260px] mx-auto grid grid-cols-7 gap-1.5 p-3 rounded-2xl bg-[#090d12] border border-lime-400/30">
            {playerBoard.map((hasShip, idx) => {
              const isSelectedShip = playerShips[nextShipIdx]?.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleManualPlace(idx)}
                  aria-label={`Posicionar na célula ${idx + 1}`}
                  className={`aspect-square rounded-md transition-colors cursor-pointer ${
                    isSelectedShip
                      ? 'bg-amber-400 border border-amber-200'
                      : hasShip
                        ? 'bg-lime-400'
                        : 'bg-slate-800/80 hover:bg-slate-700'
                  }`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setHorizontalPlace((h) => !h)}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              {horizontalPlace ? 'Horizontal' : 'Vertical'}
            </button>
            <button
              type="button"
              onClick={() => setPlayerShips(createRandomFleetData().ships)}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Sortear Frota
            </button>
            <button
              type="button"
              onClick={startBattle}
              className="min-h-[42px] inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              <Crosshair className="w-4 h-4" />
              Iniciar Batalha
            </button>
          </div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-2.5 rounded-xl">
            <span className="font-semibold text-slate-800 dark:text-zinc-200">{statusText}</span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
              Seus acertos: {playerHits}/{totalShipCells} · IA: {cpuHits}/{totalShipCells}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-600 dark:text-zinc-400">Navios inimigos:</span>
              {enemyFleet.ships.map((ship, idx) => {
                const sunk = ship.every((cell) => playerShots[cell] === 'hit');
                return (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-md font-mono font-bold border ${
                      sunk
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 line-through'
                        : 'bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200'
                    }`}
                  >
                    {ship.length}c
                  </span>
                );
              })}
            </div>

            {gameState === 'PLAYING' && (
              <button
                type="button"
                disabled={sonarUsed || !isPlayerTurn}
                onClick={() => setSonarArmed((v) => !v)}
                className={`min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-40 ${
                  sonarArmed
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : 'border-slate-200 dark:border-zinc-700 text-sky-600 dark:text-sky-400 hover:border-sky-400'
                }`}
              >
                <Radar className="w-3.5 h-3.5" />
                {sonarUsed ? 'Sonar Usado' : sonarArmed ? 'Clique no Radar (3×3)' : 'Usar Sonar 3×3 (1x)'}
              </button>
            )}
          </div>

          {sonarNotice && (
            <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-xl px-3.5 py-2">
              {sonarNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-zinc-300 text-center">
                {sonarArmed ? 'Escolha o centro do Sonar 3×3' : 'Radar Inimigo (Clique para Atirar)'}
              </div>
              <div className="grid grid-cols-7 gap-1.5 p-3 rounded-2xl bg-[#090d12] border border-cyan-500/35 max-w-[270px] mx-auto">
                {playerShots.map((shot, idx) => {
                  const canClick =
                    gameState === 'PLAYING' &&
                    isPlayerTurn &&
                    (sonarArmed || shot === 'unseen');
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!canClick}
                      onClick={() => handleEnemyCellClick(idx)}
                      className={`aspect-square rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:cursor-default flex items-center justify-center ${
                        shot === 'hit'
                          ? 'bg-rose-500 text-white'
                          : shot === 'miss'
                            ? 'bg-slate-700 text-slate-400'
                            : sonarArmed
                              ? 'bg-sky-900/50 hover:bg-sky-400/50 border border-sky-400/50'
                              : 'bg-slate-800/90 hover:bg-cyan-500/40 border border-slate-700'
                      }`}
                    >
                      {shot === 'hit' ? '✕' : shot === 'miss' ? '•' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 dark:text-zinc-300 text-center">
                Sua Frota
              </div>
              <div className="grid grid-cols-7 gap-1.5 p-3 rounded-2xl bg-[#090d12] border border-lime-500/25 max-w-[240px] mx-auto">
                {playerBoard.map((hasShip, idx) => {
                  const shot = cpuShots[idx];
                  return (
                    <div
                      key={idx}
                      className={`aspect-square rounded-lg text-xs font-bold flex items-center justify-center ${
                        shot === 'hit'
                          ? 'bg-rose-500 text-white'
                          : shot === 'miss'
                            ? 'bg-slate-700 text-slate-400'
                            : hasShip
                              ? 'bg-lime-400 text-slate-950'
                              : 'bg-slate-800/80'
                      }`}
                    >
                      {shot === 'hit' ? '✕' : shot === 'miss' ? '•' : ''}
                    </div>
                  );
                })}
              </div>
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
                    {winner === 'player' ? 'Vitória Naval!' : 'Sua frota caiu desta vez'}{' '}
                    {submitting
                      ? '· Validando...'
                      : rewardInfo
                        ? `· +${rewardInfo.credited} moedas`
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
                onClick={() => {
                  setPlayerShips(createRandomFleetData().ships);
                  startBattle();
                }}
                disabled={submitting}
                className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold rounded-xl cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nova Batalha
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
