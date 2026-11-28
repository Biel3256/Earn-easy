import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  Flame,
  History,
  Play,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  TrendingUp,
  Volume2,
  VolumeX,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { adsenseService } from '../../services/adsenseService';
import { CasinoCurrency, DoubleColor } from '../../types/earneasy';
import { casinoSound } from '../../utils/casinoSound';
import { extractReadableError, formatBRL, formatPoints } from '../../utils/pix';

interface DoubleGameProps {
  onExit: () => void;
}

interface WheelTile {
  number: number;
  color: DoubleColor;
}

interface DoubleRollItem {
  id: string;
  number: number;
  color: DoubleColor;
  rolledAt: string;
}

const DOUBLE_WHEEL_TILES: WheelTile[] = [
  { number: 0, color: 'white' },
  { number: 11, color: 'black' },
  { number: 5, color: 'red' },
  { number: 10, color: 'black' },
  { number: 6, color: 'red' },
  { number: 9, color: 'black' },
  { number: 7, color: 'red' },
  { number: 8, color: 'black' },
  { number: 1, color: 'red' },
  { number: 14, color: 'black' },
  { number: 2, color: 'red' },
  { number: 13, color: 'black' },
  { number: 3, color: 'red' },
  { number: 12, color: 'black' },
  { number: 4, color: 'red' },
];

const TILE_WIDTH = 86;
const TILE_GAP = 8;
const TILE_STEP = TILE_WIDTH + TILE_GAP;
const STRIP_CYCLES = 8;
const NORMAL_SPIN_DURATION_MS = 4300;
const TURBO_SPIN_DURATION_MS = 1900;

const STRIP_TILES: WheelTile[] = Array.from({ length: STRIP_CYCLES }, () => DOUBLE_WHEEL_TILES).flat();

function formatCasinoValue(currency: CasinoCurrency, amount: number): string {
  return currency === 'brl' ? formatBRL(amount) : `${formatPoints(amount)} pts`;
}

function colorNamePt(color: DoubleColor): string {
  if (color === 'white') return 'Branco';
  if (color === 'red') return 'Vermelho';
  return 'Preto';
}

export const DoubleGame: React.FC<DoubleGameProps> = ({ onExit }) => {
  const { userAccount, myCasinoSessions, playDoubleSpin } = useAuth();

  const [mode, setMode] = useState<'normal' | 'auto'>('normal');
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [stopOnWin, setStopOnWin] = useState<boolean>(false);
  const [currency, setCurrency] = useState<CasinoCurrency>('points');
  const [betInput, setBetInput] = useState<string>('100');
  const [selectedColors, setSelectedColors] = useState<Record<DoubleColor, boolean>>({
    red: true,
    black: false,
    white: false,
  });
  const [lastBetConfig, setLastBetConfig] = useState<{
    currency: CasinoCurrency;
    betInput: string;
    selectedColors: Record<DoubleColor, boolean>;
  } | null>(null);
  const [autoRoundsTarget, setAutoRoundsTarget] = useState<number>(10);
  const [autoRoundsLeft, setAutoRoundsLeft] = useState<number>(0);
  const [autoActive, setAutoActive] = useState<boolean>(false);

  const [muted, setMuted] = useState<boolean>(false);
  const [history, setHistory] = useState<DoubleRollItem[]>([]);
  const [spinning, setSpinning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [heldPayout, setHeldPayout] = useState<{ currency: CasinoCurrency; amount: number } | null>(null);
  const [lastResult, setLastResult] = useState<{
    number: number;
    color: DoubleColor;
    totalBet: number;
    payoutAmount: number;
    multiplier: number;
    currency: CasinoCurrency;
    status: 'won' | 'lost';
    integrityHash: string;
  } | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const currentTileIdxRef = useRef<number>(0);
  const currentOffsetRef = useRef<number>(0);
  const autoActiveRef = useRef<boolean>(false);
  const mutedRef = useRef<boolean>(false);
  const spinningRef = useRef<boolean>(false);
  const turboRef = useRef<boolean>(false);
  const stopOnWinRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    autoActiveRef.current = autoActive;
  }, [autoActive]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    spinningRef.current = spinning;
  }, [spinning]);

  useEffect(() => {
    turboRef.current = turboMode;
  }, [turboMode]);

  useEffect(() => {
    stopOnWinRef.current = stopOnWin;
  }, [stopOnWin]);

  const setStripTransform = useCallback((offsetPx: number) => {
    currentOffsetRef.current = offsetPx;
    if (stripRef.current) {
      stripRef.current.style.transform = `translate3d(${offsetPx}px, 0, 0)`;
    }
  }, []);

  const computeCenteredOffset = useCallback((globalTileIdx: number, jitterPx = 0) => {
    const viewportWidth = viewportRef.current?.clientWidth || 640;
    return viewportWidth / 2 - (globalTileIdx * TILE_STEP + TILE_WIDTH / 2 + jitterPx);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const initOffset = computeCenteredOffset(15 + currentTileIdxRef.current, 0);
    setStripTransform(initOffset);

    fetch('/api/casino/double/history')
      .then((res) => res.json())
      .then((data) => {
        if (mountedRef.current && Array.isArray(data?.history)) {
          setHistory(data.history);
          const last = data.history[data.history.length - 1];
          if (last) {
            const idx = DOUBLE_WHEEL_TILES.findIndex(
              (t) => t.number === last.number && t.color === last.color
            );
            if (idx >= 0) {
              currentTileIdxRef.current = idx;
              setStripTransform(computeCenteredOffset(15 + idx, 0));
            }
          }
        }
      })
      .catch(() => {});

    const onResize = () => {
      if (!spinningRef.current) {
        setStripTransform(computeCenteredOffset(15 + currentTileIdxRef.current, 0));
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('resize', onResize);
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
    };
  }, [computeCenteredOffset, setStripTransform]);

  const switchCurrency = (next: CasinoCurrency) => {
    if (spinning || autoActive) return;
    setCurrency(next);
    setErrorMsg(null);
    setLastResult(null);
    setBetInput(next === 'brl' ? '1.00' : '100');
  };

  const parsedBetPerColor = useMemo(() => {
    const clean = betInput.replace(',', '.').trim();
    const num = Number(clean);
    if (!Number.isFinite(num) || num <= 0) return 0;
    if (currency === 'brl') {
      return Math.min(50000, Math.max(0, Math.round(num * 100)));
    }
    return Math.min(50000, Math.max(0, Math.floor(num)));
  }, [betInput, currency]);

  const activeColorCount =
    (selectedColors.red ? 1 : 0) +
    (selectedColors.black ? 1 : 0) +
    (selectedColors.white ? 1 : 0);

  const totalStake = parsedBetPerColor * activeColorCount;

  const maxPotentialPayout = useMemo(() => {
    if (parsedBetPerColor <= 0) return 0;
    if (selectedColors.white) return parsedBetPerColor * 14;
    if (selectedColors.red || selectedColors.black) return parsedBetPerColor * 2;
    return 0;
  }, [parsedBetPerColor, selectedColors]);

  const liveBalance =
    currency === 'points'
      ? userAccount?.pointsBalance ?? 0
      : userAccount?.brlBalanceCents ?? 0;

  const displayedBalance =
    heldPayout && heldPayout.currency === currency
      ? Math.max(0, liveBalance - heldPayout.amount)
      : liveBalance;

  const adjustBet = (factor: number) => {
    if (spinning || autoActive) return;
    const base = parsedBetPerColor || (currency === 'brl' ? 50 : 50);
    const nextRaw = Math.max(1, Math.min(50000, Math.round(base * factor)));
    setBetInput(currency === 'brl' ? (nextRaw / 100).toFixed(2) : String(nextRaw));
  };

  const setPresetBet = (unitAmount: number) => {
    if (spinning || autoActive) return;
    setBetInput(currency === 'brl' ? (unitAmount / 100).toFixed(2) : String(unitAmount));
  };

  const setMaxBet = () => {
    if (spinning || autoActive) return;
    const count = Math.max(1, activeColorCount);
    const maxPerColor = Math.min(50000, Math.floor(liveBalance / count));
    const safe = Math.max(1, maxPerColor);
    setBetInput(currency === 'brl' ? (safe / 100).toFixed(2) : String(safe));
  };

  const handleRepeatLastBet = () => {
    if (spinning || autoActive || !lastBetConfig) return;
    setCurrency(lastBetConfig.currency);
    setBetInput(lastBetConfig.betInput);
    setSelectedColors(lastBetConfig.selectedColors);
    setErrorMsg(null);
  };

  const toggleColor = (color: DoubleColor) => {
    if (spinning || autoActive) return;
    setSelectedColors((prev) => ({
      ...prev,
      [color]: !prev[color],
    }));
  };

  const doubleSessions = useMemo(
    () => myCasinoSessions.filter((s) => s.gameType === 'double').slice(0, 10),
    [myCasinoSessions]
  );

  const historyStats = useMemo(() => {
    const sample = history.slice(-30);
    const total = Math.max(1, sample.length);
    const red = sample.filter((h) => h.color === 'red').length;
    const black = sample.filter((h) => h.color === 'black').length;
    const white = sample.filter((h) => h.color === 'white').length;

    let streakColor: DoubleColor | null = null;
    let streakCount = 0;
    for (let i = sample.length - 1; i >= 0; i -= 1) {
      const c = sample[i].color;
      if (streakColor === null) {
        streakColor = c;
        streakCount = 1;
      } else if (c === streakColor) {
        streakCount += 1;
      } else {
        break;
      }
    }

    return {
      redPct: Math.round((red / total) * 100),
      blackPct: Math.round((black / total) * 100),
      whitePct: Math.round((white / total) * 100),
      streakColor,
      streakCount,
    };
  }, [history]);

  const runSingleSpin = useCallback(
    async (remainingAutoAfterThis = 0) => {
      if (spinningRef.current) return;
      setErrorMsg(null);

      if (activeColorCount === 0) {
        setErrorMsg('Selecione pelo menos 1 cor (Vermelho 2x, Branco 14x ou Preto 2x).');
        setAutoActive(false);
        return;
      }
      if (parsedBetPerColor < 1 || totalStake < 1 || totalStake > 50000) {
        setErrorMsg(
          currency === 'brl'
            ? 'Aposta total deve estar entre R$ 0,01 e R$ 500,00.'
            : 'Aposta total deve estar entre 1 e 50.000 moedas.'
        );
        setAutoActive(false);
        return;
      }
      if (liveBalance < totalStake) {
        setErrorMsg(
          currency === 'brl'
            ? 'Saldo em R$ insuficiente para esta aposta.'
            : 'Saldo de moedas insuficiente para esta aposta.'
        );
        setAutoActive(false);
        return;
      }

      const bets: Record<DoubleColor, number> = {
        red: selectedColors.red ? parsedBetPerColor : 0,
        black: selectedColors.black ? parsedBetPerColor : 0,
        white: selectedColors.white ? parsedBetPerColor : 0,
      };

      setLastBetConfig({
        currency,
        betInput,
        selectedColors: { ...selectedColors },
      });

      spinningRef.current = true;
      setSpinning(true);
      setLastResult(null);

      try {
        const result = await playDoubleSpin({ currency, bets });
        if (!mountedRef.current) return;

        if (result.payoutAmount > 0) {
          setHeldPayout({ currency, amount: result.payoutAmount });
        }

        const startGlobalIndex = 15 + currentTileIdxRef.current;
        const startOffset = computeCenteredOffset(startGlobalIndex, 0);
        setStripTransform(startOffset);

        const targetGlobalIndex = 15 * 5 + result.tileIndex;
        const jitterPx = Math.round((Math.random() - 0.5) * 34);
        const endOffset = computeCenteredOffset(targetGlobalIndex, jitterPx);
        const distance = endOffset - startOffset;

        const durationMs = turboRef.current ? TURBO_SPIN_DURATION_MS : NORMAL_SPIN_DURATION_MS;
        const startTime = performance.now();
        let lastCrossedStep = Math.floor((-startOffset + (viewportRef.current?.clientWidth || 640) / 2) / TILE_STEP);

        const stepFrame = (now: number) => {
          if (!mountedRef.current) return;
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / durationMs);
          const eased = 1 - Math.pow(1 - progress, 4);
          const nextOffset = startOffset + distance * eased;
          setStripTransform(nextOffset);

          const vpWidth = viewportRef.current?.clientWidth || 640;
          const currentCenterStripX = -nextOffset + vpWidth / 2;
          const currentStep = Math.floor(currentCenterStripX / TILE_STEP);
          if (currentStep !== lastCrossedStep) {
            lastCrossedStep = currentStep;
            const pitchRatio = 1.15 - 0.35 * progress;
            casinoSound.playSpinTick(mutedRef.current, pitchRatio);
          }

          if (progress < 1) {
            animFrameRef.current = requestAnimationFrame(stepFrame);
            return;
          }

          currentTileIdxRef.current = result.tileIndex;
          setStripTransform(computeCenteredOffset(15 + result.tileIndex, jitterPx));
          setHeldPayout(null);
          spinningRef.current = false;
          setSpinning(false);
          if (result.history.length > 0) {
            setHistory(result.history);
          }
          setLastResult({
            number: result.number,
            color: result.color,
            totalBet: result.totalBet,
            payoutAmount: result.payoutAmount,
            multiplier: result.multiplier,
            currency,
            status: result.status,
            integrityHash: result.integrityHash,
          });

          if (result.payoutAmount > 0) {
            casinoSound.playDoubleWin(mutedRef.current, result.color === 'white');
          } else {
            casinoSound.playDoubleLoss(mutedRef.current);
          }

          if (autoActiveRef.current && stopOnWinRef.current && result.payoutAmount > 0) {
            setAutoActive(false);
            setAutoRoundsLeft(0);
            adsenseService.notifyGameRoundCompleted({
              category: 'double',
              label: 'Double 3.0',
            });
            return;
          }

          if (autoActiveRef.current && remainingAutoAfterThis > 0) {
            setAutoRoundsLeft(remainingAutoAfterThis);
            autoTimerRef.current = window.setTimeout(() => {
              if (mountedRef.current && autoActiveRef.current) {
                void runSingleSpin(remainingAutoAfterThis - 1);
              }
            }, turboRef.current ? 550 : 1100);
          } else {
            if (autoActiveRef.current) {
              setAutoActive(false);
              setAutoRoundsLeft(0);
            }
            adsenseService.notifyGameRoundCompleted({
              category: 'double',
              label: 'Double 3.0',
            });
          }
        };

        animFrameRef.current = requestAnimationFrame(stepFrame);
      } catch (err) {
        if (!mountedRef.current) return;
        setHeldPayout(null);
        spinningRef.current = false;
        setSpinning(false);
        setAutoActive(false);
        setAutoRoundsLeft(0);
        setErrorMsg(extractReadableError(err, 'Erro ao girar a roleta do Double 3.0.'));
      }
    },
    [
      activeColorCount,
      parsedBetPerColor,
      totalStake,
      currency,
      liveBalance,
      selectedColors,
      betInput,
      playDoubleSpin,
      computeCenteredOffset,
      setStripTransform,
    ]
  );

  const handlePrimaryAction = () => {
    if (mode === 'auto') {
      if (autoActive) {
        setAutoActive(false);
        setAutoRoundsLeft(0);
        if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
        return;
      }
      const rounds = Math.max(1, autoRoundsTarget);
      setAutoActive(true);
      setAutoRoundsLeft(rounds);
      void runSingleSpin(rounds - 1);
      return;
    }

    void runSingleSpin(0);
  };

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setAutoActive(false);
            onExit();
          }}
          className="inline-flex items-center gap-2 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1923] text-xs font-bold text-slate-800 dark:text-zinc-200 hover:border-rose-500/60 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Catálogo
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={spinning || autoActive}
            onClick={() => setTurboMode((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 min-h-[42px] px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 ${
              turboMode
                ? 'bg-amber-500/15 border-amber-400 text-amber-500 dark:text-amber-300'
                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1923] text-slate-700 dark:text-zinc-300'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Turbo {turboMode ? 'ON' : 'OFF'}
          </button>

          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0f1923] border border-slate-700/80 text-white text-xs font-mono font-bold tabular-nums">
            {currency === 'points' ? (
              <Coins className="w-4 h-4 text-lime-400" />
            ) : (
              <Wallet className="w-4 h-4 text-emerald-400" />
            )}
            <span>{formatCasinoValue(currency, displayedBalance)}</span>
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1923] text-slate-700 dark:text-zinc-200 flex items-center justify-center hover:border-rose-500/60 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Double 3.0 Surface */}
      <div className="rounded-3xl border border-slate-800 bg-[#0f1923] text-white overflow-hidden shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT CONTROL PANEL */}
          <div className="lg:col-span-4 bg-[#1a242d] border-b lg:border-b-0 lg:border-r border-slate-800/90 p-5 space-y-4">
            {/* Brand Header + Normal/Auto Tabs */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500/30 to-amber-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-base font-display font-extrabold tracking-tight text-white">
                      Double 3.0
                    </h1>
                    <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/40 text-[10px] font-mono font-extrabold text-rose-300">
                      PRO
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">Roleta Turbo · 2x e 14x</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                RNG Server
              </span>
            </div>

            <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0f1923] border border-slate-800">
              <button
                type="button"
                disabled={spinning || autoActive}
                onClick={() => setMode('normal')}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  mode === 'normal'
                    ? 'bg-[#273441] text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                disabled={spinning || autoActive}
                onClick={() => setMode('auto')}
                className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                  mode === 'auto'
                    ? 'bg-[#273441] text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                Auto
              </button>
            </div>

            {/* Currency Switcher */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Apostar usando
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => switchCurrency('points')}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    currency === 'points'
                      ? 'bg-lime-400/15 border-lime-400 text-lime-300'
                      : 'bg-[#0f1923] border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  Moedas (pts)
                </button>
                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => switchCurrency('brl')}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    currency === 'brl'
                      ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                      : 'bg-[#0f1923] border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Real (R$)
                </button>
              </div>
            </div>

            {/* Bet Amount Input + 1/2 + 2x */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-slate-400">
                  Quantia por cor
                </span>
                <span className="font-mono text-slate-400 tabular-nums">
                  Total: <strong className="text-white">{formatCasinoValue(currency, totalStake)}</strong>
                </span>
              </div>

              <div className="flex items-stretch gap-1.5">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                    {currency === 'brl' ? 'R$' : 'PTS'}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={spinning || autoActive}
                    value={betInput}
                    onChange={(e) => setBetInput(e.target.value)}
                    className="w-full min-h-[44px] pl-11 pr-3 rounded-xl bg-[#0f1923] border border-slate-700 text-sm font-mono font-bold text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => adjustBet(0.5)}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-[#0f1923] border border-slate-700 hover:border-slate-500 text-xs font-mono font-bold text-slate-200 cursor-pointer"
                >
                  ½
                </button>
                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => adjustBet(2)}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-[#0f1923] border border-slate-700 hover:border-slate-500 text-xs font-mono font-bold text-slate-200 cursor-pointer"
                >
                  2x
                </button>
              </div>

              {/* Quick Chips */}
              <div className="grid grid-cols-4 gap-1.5">
                {(currency === 'points' ? [50, 100, 500, 1000] : [50, 100, 200, 500]).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={spinning || autoActive}
                    onClick={() => setPresetBet(chip)}
                    className="min-h-[34px] rounded-lg bg-[#0f1923] border border-slate-800 hover:border-rose-500/60 text-[11px] font-mono font-bold text-slate-300 cursor-pointer"
                  >
                    {currency === 'brl' ? formatBRL(chip) : chip}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={setMaxBet}
                  className="min-h-[34px] rounded-lg bg-[#0f1923] border border-slate-800 hover:border-slate-600 text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  Usar Saldo Máximo
                </button>
                <button
                  type="button"
                  disabled={spinning || autoActive || !lastBetConfig}
                  onClick={handleRepeatLastBet}
                  className="min-h-[34px] rounded-lg bg-[#0f1923] border border-slate-800 hover:border-rose-500/60 disabled:opacity-40 text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  Repetir Última
                </button>
              </div>
            </div>

            {/* Color Multipliers Selector (Vermelho 2x | Branco 14x | Preto 2x) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-slate-400">
                  Selecionar Cor
                </span>
                <span className="font-mono text-emerald-400 font-bold tabular-nums">
                  Máx: {formatCasinoValue(currency, maxPotentialPayout)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => toggleColor('red')}
                  className={`min-h-[62px] rounded-xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${
                    selectedColors.red
                      ? 'bg-[#f12c4c] border-white text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                      : 'bg-[#f12c4c]/25 border-[#f12c4c]/40 text-rose-200 hover:bg-[#f12c4c]/40'
                  }`}
                >
                  <span className="text-xs font-extrabold">Vermelho</span>
                  <span className="text-[11px] font-mono font-bold opacity-95">2x</span>
                  <span className="text-[9px] font-mono opacity-75">46.7%</span>
                </button>

                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => toggleColor('white')}
                  className={`min-h-[62px] rounded-xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${
                    selectedColors.white
                      ? 'bg-white border-amber-400 text-[#0f1923] shadow-lg shadow-white/25 scale-[1.02]'
                      : 'bg-white/15 border-white/30 text-white hover:bg-white/25'
                  }`}
                >
                  <span className="text-xs font-extrabold">Branco</span>
                  <span className="text-[11px] font-mono font-bold opacity-95">14x</span>
                  <span className="text-[9px] font-mono opacity-75">6.7%</span>
                </button>

                <button
                  type="button"
                  disabled={spinning || autoActive}
                  onClick={() => toggleColor('black')}
                  className={`min-h-[62px] rounded-xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${
                    selectedColors.black
                      ? 'bg-[#262f3c] border-white text-white shadow-lg shadow-black/50 scale-[1.02]'
                      : 'bg-[#262f3c]/60 border-slate-700 text-slate-300 hover:bg-[#262f3c]'
                  }`}
                >
                  <span className="text-xs font-extrabold">Preto</span>
                  <span className="text-[11px] font-mono font-bold opacity-95">2x</span>
                  <span className="text-[9px] font-mono opacity-75">46.7%</span>
                </button>
              </div>
            </div>

            {mode === 'auto' && (
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Rodadas no Auto
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 25, 50].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        disabled={spinning || autoActive}
                        onClick={() => setAutoRoundsTarget(cnt)}
                        className={`min-h-[36px] rounded-lg border text-xs font-mono font-bold cursor-pointer ${
                          autoRoundsTarget === cnt
                            ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                            : 'bg-[#0f1923] border-slate-800 text-slate-300'
                        }`}
                      >
                        {cnt}x
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#0f1923] border border-slate-800 text-xs text-slate-300 cursor-pointer">
                  <span className="font-semibold">Parar Auto ao ganhar</span>
                  <input
                    type="checkbox"
                    disabled={spinning || autoActive}
                    checked={stopOnWin}
                    onChange={(e) => setStopOnWin(e.target.checked)}
                    className="accent-rose-500 w-4 h-4"
                  />
                </label>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/70 text-xs text-rose-200">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={spinning && !autoActive}
              onClick={handlePrimaryAction}
              className={`w-full min-h-[50px] rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                autoActive
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  : 'bg-[#f12c4c] hover:bg-[#ff3b5c] disabled:opacity-60 text-white shadow-rose-600/30'
              }`}
            >
              {autoActive ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  Parar Auto ({autoRoundsLeft} restante{autoRoundsLeft === 1 ? '' : 's'})
                </>
              ) : spinning ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  {turboMode ? 'Giro Turbo...' : 'Girando Roleta...'}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Girar Double 3.0 ({formatCasinoValue(currency, totalStake)})
                </>
              )}
            </button>
          </div>

          {/* RIGHT WHEEL STAGE + HISTORY */}
          <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between gap-6 bg-[#0b131b]">
            {/* Top: Recent Rolls Strip, Streak & Color Distribution */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold uppercase tracking-wider text-slate-400">
                    Giros Anteriores
                  </span>
                  {historyStats.streakColor && historyStats.streakCount >= 2 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-[11px] font-mono font-bold text-amber-300">
                      <TrendingUp className="w-3 h-3" />
                      {historyStats.streakCount}x {colorNamePt(historyStats.streakColor)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                  <span className="inline-flex items-center gap-1.5 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#f12c4c]" />
                    {historyStats.redPct}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-sm bg-white" />
                    {historyStats.whitePct}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#262f3c] border border-slate-600" />
                    {historyStats.blackPct}%
                  </span>
                </div>
              </div>

              {/* Distribution Progress Bar */}
              <div className="h-1.5 w-full rounded-full overflow-hidden bg-slate-800 flex">
                <div className="bg-[#f12c4c] transition-all" style={{ width: `${historyStats.redPct}%` }} />
                <div className="bg-white transition-all" style={{ width: `${historyStats.whitePct}%` }} />
                <div className="bg-[#334155] transition-all" style={{ width: `${historyStats.blackPct}%` }} />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[...history].reverse().slice(0, 20).map((item) => (
                  <div
                    key={item.id}
                    className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-mono text-xs font-extrabold border ${
                      item.color === 'white'
                        ? 'bg-white text-[#0f1923] border-amber-300'
                        : item.color === 'red'
                          ? 'bg-[#f12c4c] text-white border-rose-400/50'
                          : 'bg-[#262f3c] text-white border-slate-600'
                    }`}
                  >
                    {item.color === 'white' ? '✦' : item.number}
                  </div>
                ))}
              </div>
            </div>

            {/* Center: Horizontal Blaze Roulette Track */}
            <div className="relative py-6">
              <div
                className="pointer-events-none absolute inset-y-2 left-1/2 -translate-x-1/2 w-[3px] bg-amber-400 z-20 shadow-[0_0_16px_rgba(251,191,36,0.95)]"
                aria-hidden="true"
              >
                <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -translate-x-[5px] -translate-y-1.5 rounded-[2px]" />
                <div className="w-3.5 h-3.5 bg-amber-400 rotate-45 -translate-x-[5px] absolute bottom-0 translate-y-1.5 rounded-[2px]" />
              </div>

              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0b131b] to-transparent z-10"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0b131b] to-transparent z-10"
                aria-hidden="true"
              />

              <div
                ref={viewportRef}
                className="relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#0f1923] py-5"
              >
                <div
                  ref={stripRef}
                  className="flex items-center will-change-transform"
                  style={{ gap: `${TILE_GAP}px` }}
                >
                  {STRIP_TILES.map((tile, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${TILE_WIDTH}px`, height: `${TILE_WIDTH}px` }}
                      className={`shrink-0 rounded-2xl flex flex-col items-center justify-center border-b-4 select-none ${
                        tile.color === 'white'
                          ? 'bg-white text-[#0f1923] border-amber-300 shadow-inner'
                          : tile.color === 'red'
                            ? 'bg-[#f12c4c] text-white border-rose-800'
                            : 'bg-[#262f3c] text-white border-slate-900'
                      }`}
                    >
                      {tile.color === 'white' ? (
                        <div className="flex flex-col items-center">
                          <Sparkles className="w-6 h-6 text-[#f12c4c]" />
                          <span className="text-[11px] font-mono font-extrabold mt-0.5">14x</span>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center font-mono text-lg font-extrabold">
                          {tile.number}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Result Banner */}
            <div className="min-h-[68px] flex items-center justify-center">
              {spinning ? (
                <div className="px-5 py-3 rounded-2xl bg-[#1a242d] border border-slate-700 text-xs font-bold text-slate-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  {turboMode ? 'Giro Turbo em andamento...' : 'Roleta girando... aguarde o resultado!'}
                </div>
              ) : lastResult ? (
                <div
                  className={`w-full p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                    lastResult.status === 'won'
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-extrabold text-sm ${
                        lastResult.color === 'white'
                          ? 'bg-white text-[#0f1923]'
                          : lastResult.color === 'red'
                            ? 'bg-[#f12c4c] text-white'
                            : 'bg-[#262f3c] text-white border border-slate-600'
                      }`}
                    >
                      {lastResult.color === 'white' ? '14x' : lastResult.number}
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-white">
                        {lastResult.status === 'won'
                          ? `Você ganhou ${formatCasinoValue(lastResult.currency, lastResult.payoutAmount)}!`
                          : `Caiu #${lastResult.number} (${colorNamePt(lastResult.color)})`}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Apostado: {formatCasinoValue(lastResult.currency, lastResult.totalBet)} · Retorno:{' '}
                        {lastResult.multiplier > 0 ? `${lastResult.multiplier}x` : '0x'}
                        {lastResult.integrityHash ? ` · Seed #${lastResult.integrityHash.slice(0, 8)}` : ''}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-extrabold ${
                      lastResult.status === 'won'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {lastResult.status === 'won'
                      ? `+${formatCasinoValue(lastResult.currency, lastResult.payoutAmount)}`
                      : `-${formatCasinoValue(lastResult.currency, lastResult.totalBet)}`}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-center">
                  Escolha Vermelho (2x), Branco (14x) ou Preto (2x) e clique em <strong>Girar Double 3.0</strong>.
                </div>
              )}
            </div>

            {/* Personal Recent Spins */}
            {doubleSessions.length > 0 && (
              <div className="border-t border-slate-800 pt-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <History className="w-3.5 h-3.5" />
                  Suas Últimas Rodadas no Double 3.0
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {doubleSessions.slice(0, 4).map((s) => (
                    <div
                      key={s.sessionId}
                      className="px-3 py-2 rounded-xl bg-[#0f1923] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-slate-300 truncate">{s.outcomeSummary}</span>
                      <span
                        className={`font-mono font-bold shrink-0 tabular-nums ${
                          s.status === 'won' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {s.status === 'won'
                          ? `+${formatCasinoValue(s.currency, s.payoutAmount)}`
                          : `-${formatCasinoValue(s.currency, s.betAmount)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
