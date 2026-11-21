import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ArrowRight,
  Check,
  Clock,
  Eraser,
  Flame,
  Pencil,
  RotateCw,
  Send,
  Shuffle,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { MultiplayerPlayerInfo, MultiplayerRoomSnapshot } from '../../types/earneasy';

interface MultiplayerGameBoardsProps {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (payload: Record<string, unknown>) => void;
  onNextRound: () => void;
}

function getPlayerName(players: MultiplayerPlayerInfo[], uid: string | null | undefined): string {
  if (!uid) return 'Empate';
  return players.find((p) => p.uid === uid)?.displayName || 'Jogador';
}

/* ============================================================================
 * 1. DOMINÓ ONLINE
 * ==========================================================================*/
const PIP_POSITIONS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DominoHalf({ value, compact = false }: { value: number; compact?: boolean }) {
  const pips = PIP_POSITIONS[value] || [];
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 gap-0.5 ${
        compact ? 'w-6 h-6 p-1' : 'w-8 h-8 p-1.5'
      }`}
    >
      {Array.from({ length: 9 }).map((_, idx) => (
        <span
          key={idx}
          className={`rounded-full ${
            pips.includes(idx)
              ? 'bg-slate-900 dark:bg-zinc-950'
              : 'bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function DominoGameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    board: Array<[number, number]>;
    leftEnd: number | null;
    rightEnd: number | null;
    turnUid: string;
    boneyardCount: number;
    myHand: Array<[number, number]>;
    handsCount: Record<string, number>;
    roundStatus: string;
    lastActionText: string;
  };

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const isMyTurn = g.turnUid === myUid && g.roundStatus === 'active';
  const opponent = room.players.find((p) => p.uid !== myUid);
  const oppCount = opponent ? g.handsCount?.[opponent.uid] ?? 0 : 0;
  const myHand = g.myHand || [];

  const canPlayTile = (tile: [number, number]): { left: boolean; right: boolean } => {
    if (!g.board || g.board.length === 0) return { left: true, right: true };
    const [a, b] = tile;
    return {
      left: a === g.leftEnd || b === g.leftEnd,
      right: a === g.rightEnd || b === g.rightEnd,
    };
  };

  const hasAnyValidMove = myHand.some((t) => {
    const f = canPlayTile(t);
    return f.left || f.right;
  });

  const handleTileTap = (idx: number) => {
    if (!isMyTurn) return;
    const tile = myHand[idx];
    if (!tile) return;
    const fit = canPlayTile(tile);
    if (!fit.left && !fit.right) return;

    if (!g.board || g.board.length === 0) {
      onGameAction({ action: 'play', tileIndex: idx, side: 'right' });
      setSelectedIdx(null);
      return;
    }

    if (fit.left && fit.right && g.leftEnd !== g.rightEnd) {
      setSelectedIdx(selectedIdx === idx ? null : idx);
      return;
    }

    onGameAction({ action: 'play', tileIndex: idx, side: fit.left ? 'left' : 'right' });
    setSelectedIdx(null);
  };

  const selectedTile = selectedIdx !== null ? myHand[selectedIdx] : null;
  const selectedFit = selectedTile ? canPlayTile(selectedTile) : { left: false, right: false };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          className={`px-3 py-1.5 rounded-xl font-bold border ${
            isMyTurn
              ? 'bg-lime-400/15 border-lime-400/40 text-lime-700 dark:text-lime-300'
              : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
          }`}
        >
          {isMyTurn ? 'Sua vez de jogar!' : `Vez de ${getPlayerName(room.players, g.turnUid)}`}
        </span>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 font-semibold">
            {opponent?.displayName || 'Adversário'}: {oppCount} peças
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 font-semibold">
            Monte: {g.boneyardCount ?? 0}
          </span>
        </div>
      </div>

      {g.lastActionText && (
        <div className="text-xs text-center font-medium text-slate-600 dark:text-zinc-300 bg-slate-100/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2">
          {g.lastActionText}
        </div>
      )}

      {/* Mesa de Dominó */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950 via-[#0b1812] to-[#08100d] p-4 min-h-[150px] flex flex-col justify-between gap-3 shadow-inner">
        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-300/80">
          <span>Ponta Esq: {g.leftEnd ?? '—'}</span>
          <span>Peças na mesa: {g.board?.length || 0}</span>
          <span>Ponta Dir: {g.rightEnd ?? '—'}</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto py-3 px-2 justify-start sm:justify-center">
          {!g.board || g.board.length === 0 ? (
            <p className="text-xs text-emerald-200/60 mx-auto">
              Mesa vazia — jogue qualquer peça para começar!
            </p>
          ) : (
            g.board.map(([a, b], i) => {
              const isDouble = a === b;
              return (
                <div
                  key={`${a}-${b}-${i}`}
                  className={`shrink-0 rounded-lg bg-amber-50 border border-amber-200 shadow-md flex ${
                    isDouble ? 'flex-col' : 'flex-row'
                  } items-center`}
                >
                  <DominoHalf value={a} compact />
                  <div className={isDouble ? 'w-full h-px bg-slate-400' : 'h-6 w-px bg-slate-400'} />
                  <DominoHalf value={b} compact />
                </div>
              );
            })
          )}
        </div>

        {selectedIdx !== null && selectedFit.left && selectedFit.right && (
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onGameAction({ action: 'play', tileIndex: selectedIdx, side: 'left' });
                setSelectedIdx(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              Encaixar na Esquerda ({g.leftEnd})
            </button>
            <button
              type="button"
              onClick={() => {
                onGameAction({ action: 'play', tileIndex: selectedIdx, side: 'right' });
                setSelectedIdx(null);
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              Encaixar na Direita ({g.rightEnd})
            </button>
          </div>
        )}
      </div>

      {/* Controles e Mão do Jogador */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700 dark:text-zinc-200">
            Suas Peças ({myHand.length})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isMyTurn || g.boneyardCount === 0}
              onClick={() => onGameAction({ action: 'draw' })}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-800 dark:text-zinc-100 disabled:opacity-40 cursor-pointer"
            >
              Comprar do Monte ({g.boneyardCount})
            </button>
            <button
              type="button"
              disabled={!isMyTurn || hasAnyValidMove || g.boneyardCount > 0}
              onClick={() => onGameAction({ action: 'pass' })}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-400/50 bg-amber-500/15 text-xs font-bold text-amber-700 dark:text-amber-300 disabled:opacity-40 cursor-pointer"
            >
              Passar Vez
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center p-3 rounded-2xl bg-slate-100 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
          {myHand.map((tile, idx) => {
            const fit = canPlayTile(tile);
            const playable = isMyTurn && (fit.left || fit.right);
            const isSelected = selectedIdx === idx;
            return (
              <button
                key={`${tile[0]}-${tile[1]}-${idx}`}
                type="button"
                disabled={!playable}
                onClick={() => handleTileTap(idx)}
                className={`rounded-xl bg-amber-50 border-2 flex flex-col items-center p-0.5 transition-all ${
                  isSelected
                    ? 'border-lime-400 ring-2 ring-lime-400/60 -translate-y-1.5'
                    : playable
                      ? 'border-lime-500 hover:-translate-y-1 shadow-md cursor-pointer'
                      : 'border-slate-300 opacity-55 cursor-not-allowed'
                }`}
              >
                <DominoHalf value={tile[0]} />
                <div className="w-7 h-px bg-slate-400" />
                <DominoHalf value={tile[1]} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. STOP ONLINE
 * ==========================================================================*/
function StopGameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    letter: string;
    categories: string[];
    endsAt: number;
    roundStatus: string;
    submittedUids: string[];
    myAnswers: Record<string, string> | null;
    reveal: {
      pts0: number;
      pts1: number;
      breakdown: Record<string, { p0Word: string; p0Pts: number; p1Word: string; p1Pts: number }>;
    } | null;
  };

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    setAnswers({});
  }, [room.currentRound, g.letter]);

  useEffect(() => {
    if (g.roundStatus !== 'active') return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((g.endsAt - Date.now()) / 1000));
      setSecondsLeft(rem);
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [g.endsAt, g.roundStatus]);

  const alreadySubmitted = (g.submittedUids || []).includes(myUid);
  const filledCount = Object.values(answers).filter((v) => v.trim().length >= 2).length;
  const [p0, p1] = room.players;

  if (g.roundStatus === 'round_end' && g.reveal) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3">
          <span className="text-xs font-extrabold text-slate-900 dark:text-white">
            Letra Sorteada: <span className="text-lime-500 font-mono text-base">{g.letter}</span>
          </span>
          <div className="text-xs font-bold text-slate-700 dark:text-zinc-200">
            {p0?.displayName}: <span className="text-lime-500">{g.reveal.pts0} pts</span> · {p1?.displayName}:{' '}
            <span className="text-sky-400">{g.reveal.pts1} pts</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400">
              <tr>
                <th className="p-2.5">Categoria</th>
                <th className="p-2.5">{p0?.displayName || 'J1'}</th>
                <th className="p-2.5">{p1?.displayName || 'J2'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
              {(g.categories || []).map((cat) => {
                const row = g.reveal?.breakdown?.[cat];
                return (
                  <tr key={cat} className="bg-white dark:bg-[#0b1016]">
                    <td className="p-2.5 font-bold text-slate-800 dark:text-zinc-200">{cat}</td>
                    <td className="p-2.5">
                      <span className="font-medium">{row?.p0Word || '—'}</span>{' '}
                      <span className="font-mono text-[11px] font-bold text-lime-500">+{row?.p0Pts ?? 0}</span>
                    </td>
                    <td className="p-2.5">
                      <span className="font-medium">{row?.p1Word || '—'}</span>{' '}
                      <span className="font-mono text-[11px] font-bold text-sky-400">+{row?.p1Pts ?? 0}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-100 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-lime-400 text-slate-950 font-mono text-3xl font-black flex items-center justify-center shadow-lg">
            {g.letter}
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Escreva palavras que começam com a letra &ldquo;{g.letter}&rdquo;
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Preencha ao menos 4 categorias para gritar STOP!
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 font-mono text-sm font-bold">
          <Clock className="w-4 h-4" />
          {secondsLeft}s
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(g.categories || []).map((cat) => (
          <label
            key={cat}
            className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#090d12] p-3 space-y-1.5"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {cat}
            </span>
            <input
              type="text"
              disabled={alreadySubmitted}
              value={answers[cat] || ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [cat]: e.target.value }))}
              placeholder={`${g.letter}...`}
              maxLength={32}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-[#0e1319] text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-400 disabled:opacity-60"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={alreadySubmitted}
          onClick={() => onGameAction({ answers, callStop: false })}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-800 dark:text-zinc-100 disabled:opacity-50 cursor-pointer"
        >
          {alreadySubmitted ? 'Respostas Enviadas ✓' : 'Enviar Sem Gritar Stop'}
        </button>
        <button
          type="button"
          disabled={alreadySubmitted || filledCount < 4}
          onClick={() => onGameAction({ answers, callStop: true })}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black uppercase tracking-wide disabled:opacity-40 cursor-pointer"
        >
          STOP! ({filledCount}/6)
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * 3. DESENHE E ADIVINHE
 * ==========================================================================*/
interface CanvasStroke {
  points: Array<{ x: number; y: number }>;
  color: string;
  size: number;
}

function DrawGuessGameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    drawerUid: string;
    wordHint: string;
    wordLength: number;
    secretWord: string | null;
    strokes: CanvasStroke[];
    guesses: Array<{ uid: string; name: string; text: string; correct: boolean }>;
    endsAt: number;
    roundStatus: string;
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const drawingRef = useRef(false);

  const [brushColor, setBrushColor] = useState('#a3e635');
  const [brushSize, setBrushSize] = useState(5);
  const [guessText, setGuessText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(70);

  const isDrawer = g.drawerUid === myUid;

  useEffect(() => {
    if (g.roundStatus !== 'active') return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((g.endsAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [g.endsAt, g.roundStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawList = (strokes: CanvasStroke[]) => {
      for (const s of strokes) {
        if (!s.points || s.points.length === 0) continue;
        ctx.strokeStyle = s.color || '#a3e635';
        ctx.lineWidth = s.size || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        if (s.points.length === 1) {
          ctx.lineTo(s.points[0].x + 0.1, s.points[0].y + 0.1);
        }
        ctx.stroke();
      }
    };

    drawList(g.strokes || []);
  }, [g.strokes]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((e.clientY - rect.top) / rect.height) * canvas.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer || g.roundStatus !== 'active') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = getCanvasPoint(e);
    currentPointsRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !isDrawer || g.roundStatus !== 'active') return;
    const pt = getCanvasPoint(e);
    const pts = currentPointsRef.current;
    const prev = pts[pts.length - 1];
    pts.push(pt);

    // Draw locally immediately for 60fps smoothness
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && prev) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }

    if (pts.length >= 14) {
      const chunk = [...pts];
      currentPointsRef.current = [pt];
      onGameAction({
        action: 'stroke',
        stroke: { points: chunk, color: brushColor, size: brushSize },
      });
    }
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentPointsRef.current.length > 0) {
      onGameAction({
        action: 'stroke',
        stroke: {
          points: currentPointsRef.current,
          color: brushColor,
          size: brushSize,
        },
      });
      currentPointsRef.current = [];
    }
  };

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessText.trim() || isDrawer || g.roundStatus !== 'active') return;
    onGameAction({ action: 'guess', text: guessText.trim() });
    setGuessText('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-slate-100 dark:bg-[#090d12] border border-slate-200 dark:border-zinc-800">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            {isDrawer ? 'Você está desenhando! Palavra secreta:' : `${getPlayerName(room.players, g.drawerUid)} está desenhando`}
          </span>
          <p className="text-base sm:text-lg font-mono font-black tracking-widest text-lime-600 dark:text-lime-400">
            {g.secretWord ? g.secretWord : `${g.wordHint} (${g.wordLength} letras)`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-300 font-mono text-sm font-bold">
          <Clock className="w-4 h-4" />
          {secondsLeft}s
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-2.5">
          <div className="rounded-2xl overflow-hidden border-2 border-slate-300 dark:border-zinc-700 bg-[#090d12]">
            <canvas
              ref={canvasRef}
              width={560}
              height={320}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ touchAction: 'none' }}
              className={`w-full h-auto block ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}
            />
          </div>

          {isDrawer && g.roundStatus === 'active' && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-1.5">
                {['#a3e635', '#ffffff', '#38bdf8', '#f59e0b', '#f43f5e', '#c084fc'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setBrushColor(col)}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                      brushColor === col ? 'border-slate-950 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {[3, 6, 11].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setBrushSize(sz)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                      brushSize === sz
                        ? 'bg-lime-400 text-slate-950'
                        : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    {sz === 3 ? 'Fino' : sz === 6 ? 'Médio' : 'Grosso'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onGameAction({ action: 'clear' })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-500 text-xs font-bold cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Limpar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] p-3 min-h-[240px]">
          <div className="space-y-2 overflow-y-auto max-h-[250px] pr-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Palpites ao vivo
            </p>
            {(g.guesses || []).length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-zinc-500">
                {isDrawer ? 'Aguardando o amigo tentar adivinhar...' : 'Digite seu palpite abaixo!'}
              </p>
            ) : (
              (g.guesses || []).map((item, i) => (
                <div
                  key={i}
                  className={`px-2.5 py-1.5 rounded-xl text-xs ${
                    item.correct
                      ? 'bg-lime-400/20 border border-lime-400/40 text-lime-700 dark:text-lime-300 font-bold'
                      : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200'
                  }`}
                >
                  <span className="font-bold">{item.name}: </span>
                  <span>{item.text}</span>
                  {item.correct && ' ✓ ACERTOU!'}
                </div>
              ))
            )}
          </div>

          {!isDrawer && g.roundStatus === 'active' && (
            <form onSubmit={handleGuessSubmit} className="flex gap-1.5 pt-3">
              <input
                type="text"
                value={guessText}
                onChange={(e) => setGuessText(e.target.value)}
                placeholder="Qual é o desenho?"
                maxLength={60}
                className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0e1319] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-400"
              />
              <button
                type="submit"
                className="min-w-[40px] h-10 px-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold flex items-center justify-center cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. BATALHA NAVAL (7×7)
 * ==========================================================================*/
const SHIP_LENGTHS = [4, 3, 2, 2];

function generateRandomFleet(size = 7): Array<Array<{ r: number; c: number }>> {
  const occupied = new Set<string>();
  const ships: Array<Array<{ r: number; c: number }>> = [];
  for (const len of SHIP_LENGTHS) {
    let placed = false;
    for (let tries = 0; tries < 200; tries++) {
      const horiz = Math.random() < 0.5;
      const r0 = Math.floor(Math.random() * (horiz ? size : size - len + 1));
      const c0 = Math.floor(Math.random() * (horiz ? size - len + 1 : size));
      const cells: Array<{ r: number; c: number }> = [];
      let clash = false;
      for (let k = 0; k < len; k++) {
        const r = horiz ? r0 : r0 + k;
        const c = horiz ? c0 + k : c0;
        if (occupied.has(`${r}_${c}`)) {
          clash = true;
          break;
        }
        cells.push({ r, c });
      }
      if (!clash) {
        cells.forEach((cell) => occupied.add(`${cell.r}_${cell.c}`));
        ships.push(cells);
        placed = true;
        break;
      }
    }
    if (!placed) return generateRandomFleet(size);
  }
  return ships;
}

function BattleshipGameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    size: number;
    phase: 'placing' | 'battle';
    turnUid: string;
    myFleet: { ships: Array<Array<{ r: number; c: number }>>; totalCells: number } | null;
    myFleetPlaced: boolean;
    oppFleetPlaced: boolean;
    myShotsOnOpp: Record<string, 'hit' | 'miss'>;
    oppShotsOnMe: Record<string, 'hit' | 'miss'>;
    myHitsRemaining: number;
    oppHitsRemaining: number;
    roundStatus: string;
    lastActionText: string;
  };

  const size = g.size || 7;
  const [draftShips, setDraftShips] = useState<Array<Array<{ r: number; c: number }>>>(() =>
    generateRandomFleet(7)
  );
  const [horizontal, setHorizontal] = useState(true);
  const [nextShipIdx, setNextShipIdx] = useState(0);

  useEffect(() => {
    setDraftShips(generateRandomFleet(size));
    setNextShipIdx(0);
  }, [room.currentRound, size]);

  const draftOccupied = useMemo(() => {
    const map = new Set<string>();
    draftShips.forEach((ship) => ship.forEach((c) => map.add(`${c.r}_${c.c}`)));
    return map;
  }, [draftShips]);

  const handleManualCellPlace = (r: number, c: number) => {
    if (g.myFleetPlaced) return;
    const len = SHIP_LENGTHS[nextShipIdx];
    const cells: Array<{ r: number; c: number }> = [];
    for (let k = 0; k < len; k++) {
      const nr = horizontal ? r : r + k;
      const nc = horizontal ? c + k : c;
      if (nr >= size || nc >= size) return;
      cells.push({ r: nr, c: nc });
    }
    const others = new Set<string>();
    draftShips.forEach((ship, i) => {
      if (i !== nextShipIdx) ship.forEach((p) => others.add(`${p.r}_${p.c}`));
    });
    if (cells.some((p) => others.has(`${p.r}_${p.c}`))) return;

    setDraftShips((prev) => prev.map((ship, i) => (i === nextShipIdx ? cells : ship)));
    setNextShipIdx((prev) => (prev + 1) % SHIP_LENGTHS.length);
  };

  const isMyTurn = g.turnUid === myUid && g.phase === 'battle' && g.roundStatus === 'active';

  if (g.phase === 'placing') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Anchor className="w-4 h-4 text-sky-400" />
            {g.myFleetPlaced
              ? 'Frota confirmada! Aguardando seu amigo posicionar a dele...'
              : `Posicione o navio #${nextShipIdx + 1} (${SHIP_LENGTHS[nextShipIdx]} casas) ou sorteie`}
          </span>
          <span
            className={`px-2.5 py-1 rounded-lg font-bold ${
              g.oppFleetPlaced ? 'bg-lime-400/20 text-lime-500' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500'
            }`}
          >
            Adversário: {g.oppFleetPlaced ? 'Pronto ✓' : 'Posicionando...'}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 max-w-[320px] mx-auto">
          {Array.from({ length: size * size }).map((_, i) => {
            const r = Math.floor(i / size);
            const c = i % size;
            const hasShip = draftOccupied.has(`${r}_${c}`);
            return (
              <button
                key={i}
                type="button"
                disabled={g.myFleetPlaced}
                onClick={() => handleManualCellPlace(r, c)}
                className={`aspect-square rounded-lg border transition-colors ${
                  hasShip
                    ? 'bg-lime-400 border-lime-300 shadow-sm'
                    : 'bg-slate-100 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 hover:border-sky-400'
                }`}
              />
            );
          })}
        </div>

        {!g.myFleetPlaced && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setHorizontal((h) => !h)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Direção: {horizontal ? 'Horizontal' : 'Vertical'}
            </button>
            <button
              type="button"
              onClick={() => setDraftShips(generateRandomFleet(size))}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Sortear Frota
            </button>
            <button
              type="button"
              onClick={() => onGameAction({ action: 'place_fleet', ships: draftShips })}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Confirmar Frota
            </button>
          </div>
        )}
      </div>
    );
  }

  const myShipCells = new Set<string>();
  g.myFleet?.ships?.forEach((ship) => ship.forEach((p) => myShipCells.add(`${p.r}_${p.c}`)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          className={`px-3 py-1.5 rounded-xl font-bold border ${
            isMyTurn
              ? 'bg-lime-400/15 border-lime-400/40 text-lime-700 dark:text-lime-300'
              : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
          }`}
        >
          {isMyTurn ? 'Sua vez: dispare no radar inimigo!' : `Aguardando disparo de ${getPlayerName(room.players, g.turnUid)}`}
        </span>
        <span className="text-slate-600 dark:text-zinc-300 font-semibold">
          Restam {g.myHitsRemaining} acertos para vencer
        </span>
      </div>

      {g.lastActionText && (
        <div className="text-xs text-center font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 py-2">
          {g.lastActionText}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-extrabold text-center text-lime-600 dark:text-lime-400">
            Radar Inimigo (Clique para atirar)
          </p>
          <div className="grid grid-cols-7 gap-1.5 max-w-[300px] mx-auto">
            {Array.from({ length: size * size }).map((_, i) => {
              const r = Math.floor(i / size);
              const c = i % size;
              const shot = g.myShotsOnOpp?.[`${r}_${c}`];
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!isMyTurn || Boolean(shot)}
                  onClick={() => onGameAction({ action: 'shoot', r, c })}
                  className={`aspect-square rounded-lg border text-xs font-black flex items-center justify-center transition-all ${
                    shot === 'hit'
                      ? 'bg-red-500 border-red-400 text-white'
                      : shot === 'miss'
                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-400'
                        : isMyTurn
                          ? 'bg-slate-100 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 hover:border-lime-400 cursor-pointer'
                          : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 opacity-70'
                  }`}
                >
                  {shot === 'hit' ? '💥' : shot === 'miss' ? '•' : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-extrabold text-center text-slate-600 dark:text-zinc-300">
            Sua Frota (Restam {g.oppHitsRemaining} partes)
          </p>
          <div className="grid grid-cols-7 gap-1.5 max-w-[300px] mx-auto">
            {Array.from({ length: size * size }).map((_, i) => {
              const r = Math.floor(i / size);
              const c = i % size;
              const hasShip = myShipCells.has(`${r}_${c}`);
              const shot = g.oppShotsOnMe?.[`${r}_${c}`];
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg border text-xs font-black flex items-center justify-center ${
                    shot === 'hit'
                      ? 'bg-red-600 border-red-400 text-white'
                      : shot === 'miss'
                        ? 'bg-sky-500/20 border-sky-500/30 text-sky-400'
                        : hasShip
                          ? 'bg-lime-400/30 border-lime-400/60'
                          : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {shot === 'hit' ? '💥' : shot === 'miss' ? '•' : ''}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. LIGUE 4
 * ==========================================================================*/
function Connect4GameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    board: Array<Array<string | null>>;
    turnUid: string;
    colors: Record<string, 'lime' | 'sky'>;
    winningCells: Array<[number, number]>;
    roundStatus: string;
  };

  const isMyTurn = g.turnUid === myUid && g.roundStatus === 'active';
  const winSet = new Set((g.winningCells || []).map(([r, c]) => `${r}_${c}`));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={`px-3 py-1.5 rounded-xl font-bold border ${
            isMyTurn
              ? 'bg-lime-400/15 border-lime-400/40 text-lime-700 dark:text-lime-300'
              : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
          }`}
        >
          {isMyTurn ? 'Sua vez — escolha uma coluna!' : `Vez de ${getPlayerName(room.players, g.turnUid)}`}
        </span>
        <span className="font-semibold text-slate-600 dark:text-zinc-300">
          Sua cor: {g.colors?.[myUid] === 'lime' ? '🟢 Verde Neon' : '🔵 Azul Sky'}
        </span>
      </div>

      <div className="max-w-[380px] mx-auto rounded-2xl border border-slate-300 dark:border-zinc-700 bg-slate-900 p-3 space-y-2 shadow-xl">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, col) => {
            const colFull = g.board?.[0]?.[col] !== null;
            return (
              <button
                key={col}
                type="button"
                disabled={!isMyTurn || colFull}
                onClick={() => onGameAction({ col })}
                className="h-8 rounded-lg bg-zinc-800 hover:bg-lime-400 hover:text-slate-950 text-zinc-300 text-xs font-extrabold disabled:opacity-35 cursor-pointer transition-colors"
              >
                ↓
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {(g.board || []).map((row, r) =>
            row.map((cell, c) => {
              const color = cell ? g.colors?.[cell] : null;
              const isWin = winSet.has(`${r}_${c}`);
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  disabled={!isMyTurn || g.board?.[0]?.[c] !== null}
                  onClick={() => onGameAction({ col: c })}
                  className={`aspect-square rounded-full border-2 transition-all ${
                    color === 'lime'
                      ? 'bg-lime-400 border-lime-200 shadow-[0_0_10px_rgba(163,230,53,0.6)]'
                      : color === 'sky'
                        ? 'bg-sky-400 border-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.6)]'
                        : 'bg-zinc-950 border-zinc-800'
                  } ${isWin ? 'ring-2 ring-amber-300 scale-105' : ''}`}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. QUIZ MULTIPLAYER
 * ==========================================================================*/
function QuizGameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    questionCategory?: string;
    question: string;
    options: string[];
    endsAt: number;
    answeredUids: string[];
    myAnswer: { optionIdx: number; elapsedMs: number } | null;
    correctIndex: number | null;
    roundStatus: string;
    roundBreakdown: Record<string, { correct: boolean; points: number; elapsedMs: number | null }> | null;
  };

  const [msLeft, setMsLeft] = useState(18_000);
  useEffect(() => {
    if (g.roundStatus !== 'active') return;
    const tick = () => setMsLeft(Math.max(0, g.endsAt - Date.now()));
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, [g.endsAt, g.roundStatus]);

  const secondsLeft = Math.ceil(msLeft / 1000);
  const progressPct = Math.max(0, Math.min(100, (msLeft / 18_000) * 100));
  const answered = Boolean(g.myAnswer);
  const totalPlayers = room.players.length;
  const answeredCount = (g.answeredUids || []).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-emerald-700 dark:text-lime-400">
            Rodada {room.currentRound}/{room.totalRounds} · {g.questionCategory || 'Conhecimentos Gerais'}
          </span>
          <div className="flex items-center gap-3 font-mono font-bold tabular-nums">
            <span className="text-slate-500 dark:text-zinc-400">
              {answeredCount}/{totalPlayers} responderam
            </span>
            <span
              className={`inline-flex items-center gap-1 ${
                secondsLeft <= 5 ? 'text-rose-500' : 'text-amber-500'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {secondsLeft}s
            </span>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-150 rounded-full ${
              secondsLeft <= 5 ? 'bg-rose-500' : 'bg-lime-400'
            }`}
            style={{ width: `${g.roundStatus === 'active' ? progressPct : 0}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] p-4 sm:p-5">
        <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug">
          {g.question}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {(g.options || []).map((opt, idx) => {
          const isPicked = g.myAnswer?.optionIdx === idx;
          const isCorrect = g.roundStatus === 'round_end' && g.correctIndex === idx;
          const isWrongPicked = g.roundStatus === 'round_end' && isPicked && g.correctIndex !== idx;
          return (
            <button
              key={idx}
              type="button"
              disabled={answered || g.roundStatus !== 'active'}
              onClick={() => onGameAction({ optionIdx: idx })}
              className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                isCorrect
                  ? 'bg-lime-400 text-slate-950 border-lime-300 shadow-md shadow-lime-500/20'
                  : isWrongPicked
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : isPicked
                      ? 'bg-emerald-500/20 border-lime-400 text-lime-400'
                      : 'bg-white dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 hover:border-lime-400/60 text-slate-800 dark:text-zinc-100'
              }`}
            >
              <span className="font-mono mr-2 opacity-60">{String.fromCharCode(65 + idx)}.</span>
              {opt}
            </button>
          );
        })}
      </div>

      {answered && g.roundStatus === 'active' && (
        <p className="text-xs text-center font-semibold text-emerald-700 dark:text-lime-400">
          Resposta registrada! Aguardando seu amigo responder...
        </p>
      )}

      {g.roundStatus === 'round_end' && g.roundBreakdown && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {room.players.map((p) => {
            const b = g.roundBreakdown?.[p.uid];
            return (
              <div
                key={p.uid}
                className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#090d12] p-3 flex items-center justify-between text-xs"
              >
                <span className="font-bold text-slate-900 dark:text-zinc-100">{p.displayName}</span>
                <span className={b?.correct ? 'text-lime-500 font-bold' : 'text-red-400 font-semibold'}>
                  {b?.correct ? `+${b.points} pts (${b.elapsedMs}ms)` : 'Errou / Sem resposta'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 7. PEDRA, PAPEL E TESOURA
 * ==========================================================================*/
const RPS_ITEMS: Array<{ id: 'rock' | 'paper' | 'scissors'; label: string; emoji: string }> = [
  { id: 'rock', label: 'Pedra', emoji: '🪨' },
  { id: 'paper', label: 'Papel', emoji: '📄' },
  { id: 'scissors', label: 'Tesoura', emoji: '✂️' },
];

function RpsGameView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    chosenUids: string[];
    myChoice: 'rock' | 'paper' | 'scissors' | null;
    choices: Record<string, 'rock' | 'paper' | 'scissors'> | null;
    roundStatus: string;
    lastActionText: string;
  };

  return (
    <div className="space-y-4 text-center">
      <p className="text-xs font-bold text-slate-600 dark:text-zinc-300">{g.lastActionText}</p>
      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
        {RPS_ITEMS.map((item) => {
          const picked = g.myChoice === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={Boolean(g.myChoice) || g.roundStatus !== 'active'}
              onClick={() => onGameAction({ choice: item.id })}
              className={`rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                picked
                  ? 'bg-lime-400/20 border-lime-400 ring-2 ring-lime-400/40'
                  : 'bg-white dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 hover:border-lime-400/60 disabled:opacity-55'
              }`}
            >
              <span className="text-3xl">{item.emoji}</span>
              <span className="text-xs font-extrabold">{item.label}</span>
            </button>
          );
        })}
      </div>

      {g.choices && (
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto pt-2">
          {room.players.map((p) => {
            const c = g.choices?.[p.uid];
            const meta = RPS_ITEMS.find((x) => x.id === c);
            return (
              <div
                key={p.uid}
                className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] p-3 text-xs"
              >
                <p className="font-bold text-slate-500 dark:text-zinc-400">{p.displayName}</p>
                <p className="text-xl mt-1">
                  {meta?.emoji} <span className="text-xs font-extrabold">{meta?.label}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 8. JOGO DA VELHA ONLINE
 * ==========================================================================*/
function TicTacToeMpView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    board: Array<string | null>;
    turnUid: string;
    symbols: Record<string, string>;
    winLine: number[] | null;
    roundStatus: string;
  };
  const isMyTurn = g.turnUid === myUid && g.roundStatus === 'active';
  const winSet = new Set(g.winLine || []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span
          className={`px-3 py-1.5 rounded-xl font-bold border ${
            isMyTurn
              ? 'bg-lime-400/15 border-lime-400/40 text-lime-700 dark:text-lime-300'
              : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
          }`}
        >
          {isMyTurn ? 'Sua vez!' : `Vez de ${getPlayerName(room.players, g.turnUid)}`}
        </span>
        <span className="font-mono font-bold text-slate-600 dark:text-zinc-300">
          Seu símbolo: {g.symbols?.[myUid] || '?'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5 max-w-[270px] mx-auto">
        {(g.board || []).map((cell, idx) => (
          <button
            key={idx}
            type="button"
            disabled={!isMyTurn || cell !== null}
            onClick={() => onGameAction({ index: idx })}
            className={`aspect-square rounded-2xl border-2 text-3xl font-black flex items-center justify-center transition-all ${
              winSet.has(idx)
                ? 'bg-lime-400 text-slate-950 border-lime-300'
                : cell === 'X'
                  ? 'bg-lime-400/15 border-lime-400/40 text-lime-400'
                  : cell === 'O'
                    ? 'bg-sky-400/15 border-sky-400/40 text-sky-400'
                    : isMyTurn
                      ? 'bg-white dark:bg-[#090d12] border-slate-300 dark:border-zinc-700 hover:border-lime-400 cursor-pointer'
                      : 'bg-white dark:bg-[#090d12] border-slate-200 dark:border-zinc-800'
            }`}
          >
            {cell || ''}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * 9. ADIVINHE O NÚMERO
 * ==========================================================================*/
function GuessNumberView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    turnUid: string;
    history: Array<{ uid: string; name: string; guess: number; hint: string }>;
    minBound: number;
    maxBound: number;
    roundStatus: string;
    revealedTarget: number | null;
  };
  const [val, setVal] = useState('');
  const isMyTurn = g.turnUid === myUid && g.roundStatus === 'active';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Math.floor(Number(val));
    if (!Number.isInteger(num) || num < 1 || num > 100 || !isMyTurn) return;
    onGameAction({ guess: num });
    setVal('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span
          className={`px-3 py-1.5 rounded-xl font-bold border ${
            isMyTurn
              ? 'bg-lime-400/15 border-lime-400/40 text-lime-700 dark:text-lime-300'
              : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
          }`}
        >
          {isMyTurn ? 'Sua vez de chutar!' : `Vez de ${getPlayerName(room.players, g.turnUid)}`}
        </span>
        <span className="font-mono font-bold text-emerald-500">
          Intervalo atual: {g.minBound ?? 1} até {g.maxBound ?? 100}
        </span>
      </div>

      {g.revealedTarget !== null && (
        <div className="p-3 rounded-xl bg-lime-400/15 border border-lime-400/40 text-center text-sm font-black text-lime-500">
          O número secreto era: {g.revealedTarget}
        </div>
      )}

      {g.roundStatus === 'active' && (
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
          <input
            type="number"
            min={1}
            max={100}
            disabled={!isMyTurn}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={`Número entre ${g.minBound} e ${g.maxBound}`}
            className="flex-1 h-11 px-3.5 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#090d12] text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!isMyTurn}
            className="min-h-[44px] px-4 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black disabled:opacity-40 cursor-pointer"
          >
            Chutar
          </button>
        </form>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {(g.history || []).slice().reverse().map((h, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#090d12] text-xs"
          >
            <span className="font-bold">
              {h.name}: <span className="font-mono text-lime-500">{h.guess}</span>
            </span>
            <span className="font-extrabold text-amber-500">{h.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * 10. JOGO DA MEMÓRIA MULTIPLAYER
 * ==========================================================================*/
function MemoryMpView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    cards: Array<string | null>;
    matched: boolean[];
    tempFlipped: number[];
    turnUid: string;
    roundStatus: string;
  };
  const isMyTurn = g.turnUid === myUid && g.roundStatus === 'active';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span
          className={`px-3 py-1.5 rounded-xl font-bold border ${
            isMyTurn
              ? 'bg-lime-400/15 border-lime-400/40 text-lime-700 dark:text-lime-300'
              : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
          }`}
        >
          {isMyTurn ? 'Sua vez: vire 2 cartas!' : `Vez de ${getPlayerName(room.players, g.turnUid)}`}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2.5 max-w-[320px] mx-auto">
        {(g.cards || []).map((card, idx) => {
          const revealed = card !== null;
          const matched = Boolean(g.matched?.[idx]);
          return (
            <button
              key={idx}
              type="button"
              disabled={!isMyTurn || revealed}
              onClick={() => onGameAction({ index: idx })}
              className={`aspect-square rounded-2xl border-2 text-2xl flex items-center justify-center transition-all ${
                matched
                  ? 'bg-lime-400/20 border-lime-400'
                  : revealed
                    ? 'bg-sky-500/20 border-sky-400'
                    : isMyTurn
                      ? 'bg-slate-100 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 hover:border-lime-400 cursor-pointer'
                      : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800'
              }`}
            >
              {revealed ? card : '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
 * 11. TESTE DE REFLEXO
 * ==========================================================================*/
function ReflexMpView({
  room,
  myUid,
  onGameAction,
}: {
  room: MultiplayerRoomSnapshot;
  myUid: string;
  onGameAction: (p: Record<string, unknown>) => void;
}) {
  const g = (room.gameState || {}) as {
    phase: 'waiting' | 'go' | 'resolved';
    reactions: Record<string, number>;
    falseStartUid: string | null;
    roundStatus: string;
  };

  const myReaction = g.reactions?.[myUid];
  const isGo = g.phase === 'go';

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={g.roundStatus !== 'active' || myReaction !== undefined}
        onClick={() => onGameAction({ tap: true })}
        className={`w-full min-h-[190px] rounded-3xl border-2 flex flex-col items-center justify-center gap-2 p-6 text-center transition-all cursor-pointer ${
          g.falseStartUid
            ? 'bg-red-500/15 border-red-500 text-red-400'
            : isGo
              ? 'bg-lime-400 border-lime-200 text-slate-950 shadow-[0_0_35px_rgba(163,230,53,0.55)]'
              : 'bg-amber-500/15 border-amber-400/50 text-amber-400'
        }`}
      >
        <Zap className="w-10 h-10" />
        <span className="text-xl font-black">
          {g.falseStartUid
            ? `${getPlayerName(room.players, g.falseStartUid)} queimou a largada!`
            : myReaction !== undefined
              ? `Seu tempo: ${myReaction} ms`
              : isGo
                ? 'CLIQUE AGORA!'
                : 'AGUARDE FICAR VERDE NEON...'}
        </span>
        <span className="text-xs font-semibold opacity-80">
          {isGo ? 'Reaja o mais rápido possível!' : 'Clicar antes da hora dá vitória ao adversário'}
        </span>
      </button>

      {Object.keys(g.reactions || {}).length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {room.players.map((p) => (
            <div
              key={p.uid}
              className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#090d12] p-3 text-xs flex items-center justify-between"
            >
              <span className="font-bold">{p.displayName}</span>
              <span className="font-mono font-extrabold text-lime-500">
                {g.reactions?.[p.uid] !== undefined ? `${g.reactions[p.uid]} ms` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * DISPATCHER PRINCIPAL
 * ==========================================================================*/
export const MultiplayerGameBoards: React.FC<MultiplayerGameBoardsProps> = ({
  room,
  myUid,
  onGameAction,
  onNextRound,
}) => {
  const gs = (room.gameState || {}) as { roundStatus?: string; roundWinnerUid?: string | null };
  const isRoundEnd = gs.roundStatus === 'round_end' && room.status === 'playing';

  return (
    <div className="space-y-4">
      {room.gameId === 'domino' && (
        <DominoGameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'stop' && (
        <StopGameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'draw_guess' && (
        <DrawGuessGameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'battleship' && (
        <BattleshipGameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'connect4' && (
        <Connect4GameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'quiz' && (
        <QuizGameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'rps' && (
        <RpsGameView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'tictactoe_mp' && (
        <TicTacToeMpView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'guess_number' && (
        <GuessNumberView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'memory_mp' && (
        <MemoryMpView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}
      {room.gameId === 'reflex_mp' && (
        <ReflexMpView room={room} myUid={myUid} onGameAction={onGameAction} />
      )}

      {isRoundEnd && (
        <div className="rounded-2xl border border-lime-400/40 bg-lime-400/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-lime-400 shrink-0" />
            <div>
              <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                Fim da Rodada {room.currentRound} de {room.totalRounds}
              </p>
              <p className="text-xs text-slate-600 dark:text-zinc-300">
                {gs.roundWinnerUid
                  ? `Vencedor da rodada: ${getPlayerName(room.players, gs.roundWinnerUid)}`
                  : 'Rodada empatada!'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNextRound}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            Próxima Rodada
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
