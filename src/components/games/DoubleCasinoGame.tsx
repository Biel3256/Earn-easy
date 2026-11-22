import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  Crown,
  Flame,
  History,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { CasinoCurrency, CasinoSession } from '../../types/earneasy';
import { casinoSound } from '../../utils/casinoSound';
import { extractReadableError, formatBRL, formatPoints, timestampToMillis } from '../../utils/pix';

interface DoubleCasinoGameProps {
  onBack: () => void;
}

type DoubleColor = 'red' | 'black' | 'white';

interface HistoryItem {
  id: string;
  slot: number;
  color: DoubleColor;
  won: boolean;
  delta: number;
  currency: CasinoCurrency;
}

// Alternating 15-slot sequence matching classic Double layout (0 = Branco 14x, 1..7 = Vermelho 2x, 8..14 = Preto 2x)
const WHEEL_ORDER: number[] = [0, 1, 8, 2, 9, 3, 10, 4, 11, 5, 12, 6, 13, 7, 14];
const TILE_WIDTH = 76;
const TILE_GAP = 10;
const TILE_STRIDE = TILE_WIDTH + TILE_GAP; // 86px per slot
const SPIN_DURATION_MS = 3500;

function getSlotColor(slot: number): DoubleColor {
  if (slot === 0) return 'white';
  if (slot >= 1 && slot <= 7) return 'red';
  return 'black';
}

function parseDoubleHistoryItem(session: CasinoSession): HistoryItem | null {
  const details = typeof session.details === 'string' ? session.details : '';
  const match = details.match(/Casa\s+(\d+)\s+\((red|black|white)\)/i);
  if (!match) return null;
  const slot = Number(match[1]);
  const color = match[2].toLowerCase() as DoubleColor;
  if (!Number.isInteger(slot) || slot < 0 || slot > 14) return null;
  const stake = Number(session.stakeAmount) || 0;
  const payout = Number(session.payoutAmount) || 0;
  return {
    id: session.sessionId,
    slot,
    color,
    won: session.status === 'won',
    delta: payout - stake,
    currency: session.currency === 'brl' ? 'brl' : 'points',
  };
}

const POINTS_CHIPS = [10, 50, 100, 500, 1000];
const BRL_CHIPS_CENTS = [10, 50, 100, 500, 1000];

// Precomputed decelerating tick offsets (ms) matching cubic-bezier(0.12, 0.85, 0.18, 1) over ~3.5s
const SPIN_TICK_OFFSETS_MS = [
  60, 130, 205, 285, 370, 460, 555, 655, 765, 885, 1015, 1160, 1320, 1500, 1705, 1940, 2210, 2520, 2880, 3260,
];

export const DoubleCasinoGame: React.FC<DoubleCasinoGameProps> = ({ onBack }) => {
  const { firebaseUser, userAccount, settleDoubleRound } = useAuth();
  const pointsBalance = userAccount?.pointsBalance ?? 0;
  const brlBalanceCents = userAccount?.brlBalanceCents ?? 0;

  const [currency, setCurrency] = useState<CasinoCurrency>('points');
  const [stakePoints, setStakePoints] = useState<number>(50);
  const [stakeCents, setStakeCents] = useState<number>(50);
  const [choice, setChoice] = useState<DoubleColor>('red');
  const [muted, setMuted] = useState<boolean>(false);

  const [spinning, setSpinning] = useState(false);
  const [trackOffsetPx, setTrackOffsetPx] = useState<number>(0);
  const [transitionMs, setTransitionMs] = useState<number>(0);
  const [landedTrackIndex, setLandedTrackIndex] = useState<number | null>(null);
  const [resultBanner, setResultBanner] = useState<{
    slot: number;
    winningColor: DoubleColor;
    won: boolean;
    payoutAmount: number;
    stakeAmount: number;
    currency: CasinoCurrency;
    multiplier: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeTrackIndexRef = useRef<number>(7);
  const spinningRef = useRef<boolean>(false);
  const mutedRef = useRef<boolean>(muted);
  const spinTimerRef = useRef<number | null>(null);
  const tickTimersRef = useRef<number[]>([]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const repeatedSlots = useMemo(() => {
    const arr: number[] = [];
    for (let c = 0; c < 7; c += 1) {
      arr.push(...WHEEL_ORDER);
    }
    return arr;
  }, []);

  const clearScheduledSpinTimers = () => {
    if (spinTimerRef.current) {
      window.clearTimeout(spinTimerRef.current);
      spinTimerRef.current = null;
    }
    tickTimersRef.current.forEach((id) => window.clearTimeout(id));
    tickTimersRef.current = [];
  };

  // Load real Double history from user's Firestore casinoSessions (client-sorted to avoid composite index requirements)
  useEffect(() => {
    let active = true;
    const uid = firebaseUser?.uid;
    if (!uid) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    const q = query(collection(db, 'casinoSessions'), where('userId', '==', uid), limit(60));
    getDocs(q)
      .then((snap) => {
        if (!active) return;
        const rows = snap.docs
          .map((d) => d.data() as CasinoSession)
          .filter((s) => s.gameType === 'double')
          .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt))
          .map(parseDoubleHistoryItem)
          .filter((item): item is HistoryItem => item !== null)
          .slice(0, 16);
        setHistory(rows);
      })
      .catch(() => {
        if (active) setHistory([]);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [firebaseUser?.uid]);

  // Keep roulette horizontally centered dynamically via ResizeObserver
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const recenter = () => {
      if (spinningRef.current) return;
      const vpWidth = el.clientWidth || 640;
      const centerShift = vpWidth / 2 - TILE_WIDTH / 2;
      setTransitionMs(0);
      setTrackOffsetPx(centerShift - activeTrackIndexRef.current * TILE_STRIDE);
    };

    recenter();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(recenter);
      observer.observe(el);
      return () => {
        observer.disconnect();
        clearScheduledSpinTimers();
      };
    }

    window.addEventListener('resize', recenter);
    return () => {
      window.removeEventListener('resize', recenter);
      clearScheduledSpinTimers();
    };
  }, []);

  const currentStake = currency === 'points' ? stakePoints : stakeCents;
  const availableBalance = currency === 'points' ? pointsBalance : brlBalanceCents;
  const minStake = currency === 'points' ? 10 : 1;
  const maxStake = currency === 'points' ? 10000 : 5000;
  const effectiveMax = Math.min(maxStake, availableBalance);

  const handleAdjustStake = (factor: number) => {
    if (spinning) return;
    setErrorMsg(null);
    if (currency === 'points') {
      const next = Math.max(minStake, Math.min(effectiveMax || minStake, Math.floor(stakePoints * factor)));
      setStakePoints(next);
    } else {
      const next = Math.max(minStake, Math.min(effectiveMax || minStake, Math.floor(stakeCents * factor)));
      setStakeCents(next);
    }
  };

  const handleMaxStake = () => {
    if (spinning) return;
    setErrorMsg(null);
    const cap = Math.max(minStake, Math.min(maxStake, availableBalance));
    if (currency === 'points') {
      setStakePoints(cap);
    } else {
      setStakeCents(cap);
    }
  };

  const handleSpin = async () => {
    if (spinning) return;
    setErrorMsg(null);
    setResultBanner(null);

    if (currentStake < minStake || currentStake > maxStake) {
      setErrorMsg(
        currency === 'points'
          ? 'Escolha uma aposta entre 10 e 10.000 pontos.'
          : 'Escolha uma aposta entre R$ 0,01 e R$ 50,00.'
      );
      return;
    }

    if (availableBalance < currentStake) {
      setErrorMsg(
        currency === 'points'
          ? 'Saldo de pontos insuficiente. Jogue partidas solo ou reduza o valor da aposta.'
          : 'Saldo da carteira insuficiente. Converta seus pontos ou reduza a aposta.'
      );
      return;
    }

    clearScheduledSpinTimers();
    spinningRef.current = true;
    setSpinning(true);
    setLandedTrackIndex(null);

    try {
      const outcome = await settleDoubleRound({
        currency,
        stakeAmount: currentStake,
        choice,
      });

      const vpWidth = viewportRef.current?.clientWidth || 640;
      const centerShift = vpWidth / 2 - TILE_WIDTH / 2;
      const posInWheel = WHEEL_ORDER.indexOf(outcome.slot);
      const safePos = posInWheel >= 0 ? posInWheel : 0;
      const startIdx = safePos;
      const targetIdx = 5 * WHEEL_ORDER.length + safePos;

      // Reset cleanly at cycle 0 position, then animate straight into exact centered tile in cycle 5
      activeTrackIndexRef.current = startIdx;
      setTransitionMs(0);
      setTrackOffsetPx(centerShift - startIdx * TILE_STRIDE);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          activeTrackIndexRef.current = targetIdx;
          setTransitionMs(SPIN_DURATION_MS);
          setTrackOffsetPx(centerShift - targetIdx * TILE_STRIDE);

          tickTimersRef.current = SPIN_TICK_OFFSETS_MS.map((offsetMs, idx) =>
            window.setTimeout(() => {
              const pitch = 1.15 - (idx / SPIN_TICK_OFFSETS_MS.length) * 0.35;
              casinoSound.playSpinTick(mutedRef.current, pitch);
            }, offsetMs)
          );
        });
      });

      spinTimerRef.current = window.setTimeout(() => {
        spinningRef.current = false;
        setSpinning(false);
        setLandedTrackIndex(targetIdx);

        if (outcome.won) {
          casinoSound.playDoubleWin(mutedRef.current, outcome.winningColor === 'white');
        } else {
          casinoSound.playDoubleLoss(mutedRef.current);
        }

        setResultBanner({
          slot: outcome.slot,
          winningColor: outcome.winningColor,
          won: outcome.won,
          payoutAmount: outcome.payoutAmount,
          stakeAmount: outcome.stakeAmount,
          currency: outcome.currency,
          multiplier: outcome.multiplier,
        });
        setHistory((prev) => [
          {
            id: outcome.sessionId,
            slot: outcome.slot,
            color: outcome.winningColor,
            won: outcome.won,
            delta: outcome.netDelta,
            currency: outcome.currency,
          },
          ...prev.slice(0, 15),
        ]);
      }, SPIN_DURATION_MS + 120);
    } catch (err) {
      spinningRef.current = false;
      setSpinning(false);
      clearScheduledSpinTimers();
      setErrorMsg(extractReadableError(err, 'Não foi possível concluir a rodada do Double agora.'));
    }
  };

  const potentialPayout = currentStake * (choice === 'white' ? 14 : 2);

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={spinning}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-rose-400/60 disabled:opacity-50 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar aos Jogos
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((prev) => !prev)}
            aria-label={muted ? 'Ativar som do Double' : 'Silenciar som do Double'}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:border-zinc-500 inline-flex items-center gap-1.5 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-emerald-500" />}
            <span className="hidden sm:inline">{muted ? 'Som mudo' : 'Som ativo'}</span>
          </button>

          <div className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs font-mono font-bold tabular-nums text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 shrink-0" />
            {formatPoints(pointsBalance)} pts
          </div>
          <div className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 shrink-0" />
            {formatBRL(brlBalanceCents)}
          </div>
        </div>
      </div>

      {/* Main Arena Surface */}
      <div className="bg-[#0b0f17] border border-zinc-800/90 rounded-3xl overflow-hidden shadow-2xl text-white">
        {/* Arena Header */}
        <div className="px-5 py-4 border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#131a27] via-[#101621] to-[#1f1219]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500/25 to-amber-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-inner">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-display font-extrabold tracking-tight text-white">
                Double Earn Easy
              </h1>
              <p className="text-[11px] text-zinc-400">
                Vermelho (2x) · Preto (2x) · Branco (14x) · Apenas pontos ou saldo do app
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            Sorteio validado no servidor
          </div>
        </div>

        {/* Real Session History Bar */}
        <div className="px-5 py-3 border-b border-zinc-800/80 bg-[#070a10] flex items-center gap-2.5 overflow-x-auto">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 shrink-0">
            <History className="w-3.5 h-3.5 text-zinc-400" />
            Suas últimas:
          </span>

          {historyLoading ? (
            <span className="text-xs text-zinc-500">Carregando seu histórico...</span>
          ) : history.length === 0 ? (
            <span className="text-xs text-zinc-500">
              Nenhuma rodada registrada ainda — gire a roleta para iniciar seu histórico.
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              {history.map((item, idx) => (
                <div
                  key={item.id}
                  title={`Casa ${item.slot} (${item.color === 'white' ? 'Branco 14x' : item.color === 'red' ? 'Vermelho 2x' : 'Preto 2x'})`}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-extrabold tabular-nums shrink-0 border transition-transform ${
                    idx === 0 ? 'ring-2 ring-lime-400/80 scale-105' : 'opacity-90'
                  } ${
                    item.color === 'white'
                      ? 'bg-gradient-to-b from-white to-zinc-200 text-slate-950 border-white'
                      : item.color === 'red'
                        ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white border-rose-400/50'
                        : 'bg-gradient-to-b from-zinc-700 to-zinc-900 text-zinc-100 border-zinc-600'
                  }`}
                >
                  {item.color === 'white' ? <Crown className="w-3.5 h-3.5 text-amber-600" /> : item.slot}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Roulette Stage + Controls */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Roulette Track Viewport — properly centered vertically & horizontally */}
          <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-zinc-800 via-zinc-600/50 to-zinc-800 shadow-inner">
            <div
              ref={viewportRef}
              className="relative w-full h-[124px] rounded-[15px] bg-[#06090f] overflow-hidden select-none"
            >
              {/* Subtle center ambient spotlight */}
              <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-32 bg-radial from-lime-400/12 via-transparent to-transparent z-0" />

              {/* Center Target Framing & Pointer Line */}
              <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] bg-lime-400 z-20 shadow-[0_0_16px_rgba(163,230,53,0.95)]" />
              <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-lime-400 z-20" />
              <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[10px] border-b-lime-400 z-20" />

              {/* Side Vignettes */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#06090f] via-[#06090f]/80 to-transparent z-10" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#06090f] via-[#06090f]/80 to-transparent z-10" />

              {/* Moving Slots Track: inset-y-0 + flex items-center guarantees true vertical centering */}
              <div
                className="absolute inset-y-0 left-0 flex items-center will-change-transform"
                style={{
                  gap: `${TILE_GAP}px`,
                  transform: `translate3d(${trackOffsetPx}px, 0, 0)`,
                  transition:
                    transitionMs > 0
                      ? `transform ${transitionMs}ms cubic-bezier(0.12, 0.85, 0.18, 1)`
                      : 'none',
                }}
              >
                {repeatedSlots.map((slot, index) => {
                  const slotColor = getSlotColor(slot);
                  const isLanded = landedTrackIndex === index;
                  return (
                    <div
                      key={index}
                      style={{ width: `${TILE_WIDTH}px`, height: `${TILE_WIDTH}px` }}
                      className={`rounded-2xl shrink-0 flex flex-col items-center justify-center font-mono font-extrabold tabular-nums border transition-all duration-300 ${
                        isLanded
                          ? 'ring-2 ring-lime-400 ring-offset-2 ring-offset-[#06090f] scale-[1.06] z-10'
                          : ''
                      } ${
                        slotColor === 'white'
                          ? 'bg-gradient-to-b from-white via-zinc-100 to-zinc-300 text-slate-950 border-white shadow-md shadow-white/10'
                          : slotColor === 'red'
                            ? 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 text-white border-rose-400/60 shadow-md shadow-rose-950/50'
                            : 'bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 text-zinc-100 border-zinc-600 shadow-md shadow-black/60'
                      }`}
                    >
                      {slotColor === 'white' ? (
                        <>
                          <Crown className="w-5 h-5 text-amber-600 mb-0.5" />
                          <span className="text-[10px] tracking-wider uppercase font-extrabold text-amber-800">
                            14x
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-xl leading-none">{slot}</span>
                          <span className="text-[9px] uppercase tracking-wider opacity-70 mt-1">
                            2x
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Result Banner */}
          {resultBanner && (
            <div
              className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                resultBanner.won
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-100'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-extrabold tabular-nums border ${
                    resultBanner.winningColor === 'white'
                      ? 'bg-white text-slate-950 border-white'
                      : resultBanner.winningColor === 'red'
                        ? 'bg-rose-600 text-white border-rose-400'
                        : 'bg-zinc-800 text-white border-zinc-600'
                  }`}
                >
                  {resultBanner.winningColor === 'white' ? (
                    <Crown className="w-5 h-5 text-amber-600" />
                  ) : (
                    resultBanner.slot
                  )}
                </div>
                <div>
                  <div className="text-sm font-extrabold">
                    {resultBanner.won
                      ? `Você ganhou (${resultBanner.multiplier}x)!`
                      : `Caiu ${
                          resultBanner.winningColor === 'white'
                            ? 'Branco (0)'
                            : resultBanner.winningColor === 'red'
                              ? `Vermelho (${resultBanner.slot})`
                              : `Preto (${resultBanner.slot})`
                        }`}
                  </div>
                  <div className="text-xs opacity-90 font-mono tabular-nums">
                    {resultBanner.won
                      ? `Retorno creditado: +${
                          resultBanner.currency === 'points'
                            ? `${formatPoints(resultBanner.payoutAmount)} pts`
                            : formatBRL(resultBanner.payoutAmount)
                        }`
                      : `Valor apostado: -${
                          resultBanner.currency === 'points'
                            ? `${formatPoints(resultBanner.stakeAmount)} pts`
                            : formatBRL(resultBanner.stakeAmount)
                        }`}
                  </div>
                </div>
              </div>
              <Sparkles className="w-5 h-5 shrink-0 opacity-85" />
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-xs font-semibold text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Controls Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Currency & Stake */}
            <div className="lg:col-span-5 bg-[#121822] border border-zinc-800 rounded-2xl p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300">Apostar usando:</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#080c12] border border-zinc-800">
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => {
                      setCurrency('points');
                      setErrorMsg(null);
                    }}
                    className={`min-h-[40px] py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                      currency === 'points'
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Coins className="w-3.5 h-3.5" />
                    Pontos
                  </button>
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => {
                      setCurrency('brl');
                      setErrorMsg(null);
                    }}
                    className={`min-h-[40px] py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                      currency === 'brl'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Saldo Carteira
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="font-bold text-zinc-300">Valor da Aposta</span>
                  <span className="text-zinc-400 font-mono tabular-nums">
                    Disponível:{' '}
                    {currency === 'points' ? `${formatPoints(pointsBalance)} pts` : formatBRL(brlBalanceCents)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={currency === 'points' ? 10 : 0.01}
                    max={currency === 'points' ? 10000 : 50}
                    step={currency === 'points' ? 10 : 0.1}
                    disabled={spinning}
                    value={currency === 'points' ? stakePoints : Number((stakeCents / 100).toFixed(2))}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isFinite(val)) return;
                      if (currency === 'points') {
                        setStakePoints(Math.max(0, Math.min(10000, Math.floor(val))));
                      } else {
                        setStakeCents(Math.max(0, Math.min(5000, Math.round(val * 100))));
                      }
                    }}
                    className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#080c12] border border-zinc-700 text-sm font-mono font-bold tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => handleAdjustStake(0.5)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-mono font-bold text-zinc-200 cursor-pointer"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => handleAdjustStake(2)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-mono font-bold text-zinc-200 cursor-pointer"
                  >
                    2x
                  </button>
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={handleMaxStake}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-bold text-amber-300 cursor-pointer"
                  >
                    Máx
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(currency === 'points' ? POINTS_CHIPS : BRL_CHIPS_CENTS).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      disabled={spinning}
                      onClick={() => (currency === 'points' ? setStakePoints(chip) : setStakeCents(chip))}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold tabular-nums border transition-colors cursor-pointer disabled:opacity-50 ${
                        currentStake === chip
                          ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                          : 'bg-[#080c12] border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {currency === 'points' ? `${chip} pts` : formatBRL(chip)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Color Selection & Spin CTA */}
            <div className="lg:col-span-7 bg-[#121822] border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-zinc-300">Escolha a Cor da Rodada</label>
                  <span className="text-[11px] text-zinc-500 font-mono">15 casas na roleta</span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setChoice('red')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer disabled:opacity-60 ${
                      choice === 'red'
                        ? 'bg-gradient-to-b from-rose-500 to-rose-700 border-white shadow-lg shadow-rose-950/50 scale-[1.01]'
                        : 'bg-rose-600/20 border-rose-500/35 hover:bg-rose-600/35'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-extrabold text-white">Vermelho</div>
                    <div className="text-[11px] font-mono font-bold text-rose-100 mt-1 tabular-nums">
                      Paga 2x · 7/15
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setChoice('white')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer disabled:opacity-60 ${
                      choice === 'white'
                        ? 'bg-gradient-to-b from-white to-zinc-200 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-[1.01]'
                        : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1">
                      <Crown className={`w-3.5 h-3.5 ${choice === 'white' ? 'text-amber-600' : 'text-amber-300'}`} />
                      Branco
                    </div>
                    <div
                      className={`text-[11px] font-mono font-bold mt-1 tabular-nums ${
                        choice === 'white' ? 'text-amber-800' : 'text-amber-200'
                      }`}
                    >
                      Paga 14x · 1/15
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setChoice('black')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer disabled:opacity-60 ${
                      choice === 'black'
                        ? 'bg-gradient-to-b from-zinc-700 to-zinc-900 border-white shadow-lg shadow-black/60 scale-[1.01]'
                        : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-extrabold text-white">Preto</div>
                    <div className="text-[11px] font-mono font-bold text-zinc-300 mt-1 tabular-nums">
                      Paga 2x · 7/15
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800">
                <div className="text-xs text-zinc-400">
                  Retorno potencial:{' '}
                  <span className="font-mono font-extrabold text-lime-300 tabular-nums">
                    {currency === 'points' ? `${formatPoints(potentialPayout)} pts` : formatBRL(potentialPayout)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={spinning}
                  onClick={handleSpin}
                  className="min-h-[48px] px-6 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 disabled:opacity-60 text-white text-sm font-extrabold inline-flex items-center gap-2 shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
                >
                  {spinning ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      Girando Roleta...
                    </>
                  ) : (
                    <>
                      <Flame className="w-4 h-4" />
                      Girar Double
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
