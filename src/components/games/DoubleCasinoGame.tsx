import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Coins, Crown, Flame, RotateCcw, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CasinoCurrency } from '../../types/earneasy';
import { extractReadableError, formatBRL, formatPoints } from '../../utils/pix';

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
const TILE_WIDTH = 72;
const TILE_GAP = 8;
const TILE_STRIDE = TILE_WIDTH + TILE_GAP; // 80px per slot

function getSlotColor(slot: number): DoubleColor {
  if (slot === 0) return 'white';
  if (slot >= 1 && slot <= 7) return 'red';
  return 'black';
}

const POINTS_CHIPS = [10, 50, 100, 500, 1000];
const BRL_CHIPS_CENTS = [10, 50, 100, 500, 1000];

export const DoubleCasinoGame: React.FC<DoubleCasinoGameProps> = ({ onBack }) => {
  const { userAccount, settleDoubleRound } = useAuth();
  const pointsBalance = userAccount?.pointsBalance ?? 0;
  const brlBalanceCents = userAccount?.brlBalanceCents ?? 0;

  const [currency, setCurrency] = useState<CasinoCurrency>('points');
  const [stakePoints, setStakePoints] = useState<number>(50);
  const [stakeCents, setStakeCents] = useState<number>(50);
  const [choice, setChoice] = useState<DoubleColor>('red');

  const [spinning, setSpinning] = useState(false);
  const [trackOffsetPx, setTrackOffsetPx] = useState<number>(0);
  const [transitionMs, setTransitionMs] = useState<number>(0);
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
  const [history, setHistory] = useState<HistoryItem[]>([
    { id: 'seed-1', slot: 3, color: 'red', won: true, delta: 0, currency: 'points' },
    { id: 'seed-2', slot: 11, color: 'black', won: true, delta: 0, currency: 'points' },
    { id: 'seed-3', slot: 0, color: 'white', won: true, delta: 0, currency: 'points' },
    { id: 'seed-4', slot: 6, color: 'red', won: true, delta: 0, currency: 'points' },
    { id: 'seed-5', slot: 9, color: 'black', won: true, delta: 0, currency: 'points' },
  ]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const spinTimerRef = useRef<number | null>(null);

  const repeatedSlots = useMemo(() => {
    const arr: number[] = [];
    for (let c = 0; c < 7; c += 1) {
      arr.push(...WHEEL_ORDER);
    }
    return arr;
  }, []);

  // Center tile index 7 initially so strip sits flush
  useEffect(() => {
    const vpWidth = viewportRef.current?.clientWidth || 640;
    const centerShift = vpWidth / 2 - TILE_WIDTH / 2;
    setTransitionMs(0);
    setTrackOffsetPx(centerShift - 7 * TILE_STRIDE);

    return () => {
      if (spinTimerRef.current) {
        window.clearTimeout(spinTimerRef.current);
      }
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

    setSpinning(true);

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

      // Reset cleanly inside cycle 0, then animate across ~4 cycles to cycle 5
      setTransitionMs(0);
      setTrackOffsetPx(centerShift - safePos * TILE_STRIDE);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const targetIdx = 5 * WHEEL_ORDER.length + safePos;
          const jitter = Math.floor((Math.random() - 0.5) * 28);
          setTransitionMs(3400);
          setTrackOffsetPx(centerShift - targetIdx * TILE_STRIDE + jitter);
        });
      });

      spinTimerRef.current = window.setTimeout(() => {
        setSpinning(false);
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
          ...prev.slice(0, 14),
        ]);
      }, 3550);
    } catch (err) {
      setSpinning(false);
      setErrorMsg(extractReadableError(err, 'Não foi possível concluir a rodada do Double agora.'));
    }
  };

  const potentialPayout = currentStake * (choice === 'white' ? 14 : 2);

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={spinning}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-rose-400/60 disabled:opacity-50 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar aos Jogos
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs font-mono font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5" />
            {formatPoints(pointsBalance)} pts
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            {formatBRL(brlBalanceCents)}
          </div>
        </div>
      </div>

      {/* Main Arena Surface */}
      <div className="bg-[#0d121a] border border-zinc-800 rounded-3xl overflow-hidden shadow-xl text-white">
        {/* Title & Rules Strip */}
        <div className="px-5 py-4 border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#131924] via-[#101620] to-[#1a1116]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-display font-extrabold tracking-tight text-white">
                Double Earn Easy
              </h1>
              <p className="text-[11px] text-zinc-400">
                Vermelho (2x) · Preto (2x) · Branco (14x) · Apenas pontos ou saldo do app (sem dinheiro real)
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            Sorteio validado no servidor
          </div>
        </div>

        {/* History Bar */}
        <div className="px-5 py-3 border-b border-zinc-800/80 bg-[#090d14] flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 shrink-0 mr-1">
            Anteriores:
          </span>
          {history.map((item, idx) => (
            <div
              key={item.id}
              title={`Número ${item.slot}`}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-extrabold shrink-0 border ${
                idx === 0 ? 'ring-2 ring-lime-400/70' : ''
              } ${
                item.color === 'white'
                  ? 'bg-white text-slate-950 border-zinc-200'
                  : item.color === 'red'
                    ? 'bg-rose-600 text-white border-rose-400/40'
                    : 'bg-zinc-800 text-zinc-100 border-zinc-700'
              }`}
            >
              {item.color === 'white' ? <Crown className="w-3.5 h-3.5 text-amber-600" /> : item.slot}
            </div>
          ))}
        </div>

        {/* Roulette Track Viewport */}
        <div className="p-5 sm:p-6 space-y-5">
          <div
            ref={viewportRef}
            className="relative w-full h-28 rounded-2xl bg-[#070a0f] border border-zinc-800 overflow-hidden select-none"
          >
            {/* Center Pointer Line */}
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] bg-lime-400 z-20 shadow-[0_0_12px_rgba(163,230,53,0.9)]" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-lime-400 z-20" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[9px] border-b-lime-400 z-20" />

            {/* Side Vignettes */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#070a0f] to-transparent z-10" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#070a0f] to-transparent z-10" />

            {/* Moving Slots Track */}
            <div
              className="absolute top-1/2 -translate-y-1/2 flex items-center"
              style={{
                gap: `${TILE_GAP}px`,
                transform: `translate3d(${trackOffsetPx}px, -50%, 0)`,
                transition:
                  transitionMs > 0
                    ? `transform ${transitionMs}ms cubic-bezier(0.12, 0.85, 0.18, 1)`
                    : 'none',
              }}
            >
              {repeatedSlots.map((slot, index) => {
                const slotColor = getSlotColor(slot);
                return (
                  <div
                    key={index}
                    style={{ width: `${TILE_WIDTH}px`, height: `${TILE_WIDTH}px` }}
                    className={`rounded-xl shrink-0 flex flex-col items-center justify-center font-mono font-extrabold border shadow-inner ${
                      slotColor === 'white'
                        ? 'bg-gradient-to-b from-white to-zinc-200 text-slate-950 border-white'
                        : slotColor === 'red'
                          ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white border-rose-400/50'
                          : 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-100 border-zinc-700'
                    }`}
                  >
                    {slotColor === 'white' ? (
                      <>
                        <Crown className="w-5 h-5 text-amber-600 mb-0.5" />
                        <span className="text-[10px] tracking-wider uppercase font-extrabold">14x</span>
                      </>
                    ) : (
                      <span className="text-lg">{slot}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result Banner */}
          {resultBanner && (
            <div
              className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                resultBanner.won
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-extrabold border ${
                    resultBanner.winningColor === 'white'
                      ? 'bg-white text-slate-950 border-white'
                      : resultBanner.winningColor === 'red'
                        ? 'bg-rose-600 text-white border-rose-400'
                        : 'bg-zinc-800 text-white border-zinc-600'
                  }`}
                >
                  {resultBanner.winningColor === 'white' ? <Crown className="w-5 h-5 text-amber-600" /> : resultBanner.slot}
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
                  <div className="text-xs opacity-85">
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
              <Sparkles className="w-5 h-5 shrink-0 opacity-80" />
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
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#090d14] border border-zinc-800">
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => {
                      setCurrency('points');
                      setErrorMsg(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
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
                    className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
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

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-300">Valor da Aposta</span>
                  <span className="text-zinc-400 font-mono">
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
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#090d14] border border-zinc-700 text-sm font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => handleAdjustStake(0.5)}
                    className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold text-zinc-200 cursor-pointer"
                  >
                    ½
                  </button>
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => handleAdjustStake(2)}
                    className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold text-zinc-200 cursor-pointer"
                  >
                    2x
                  </button>
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={handleMaxStake}
                    className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-amber-300 cursor-pointer"
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                        currentStake === chip
                          ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                          : 'bg-[#090d14] border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {currency === 'points' ? `${chip} pts` : formatBRL(chip)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Color Selection & Roll */}
            <div className="lg:col-span-7 bg-[#121822] border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-300">Escolha a Cor da Rodada</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setChoice('red')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      choice === 'red'
                        ? 'bg-rose-600 border-white shadow-lg shadow-rose-900/40'
                        : 'bg-rose-600/25 border-rose-500/40 hover:bg-rose-600/40'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-white">Vermelho</div>
                    <div className="text-[11px] font-mono font-bold text-rose-100 mt-0.5">Paga 2x</div>
                  </button>

                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setChoice('white')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      choice === 'white'
                        ? 'bg-white text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25'
                        : 'bg-white/10 text-white border-white/25 hover:bg-white/20'
                    }`}
                  >
                    <div className="text-xs font-extrabold flex items-center gap-1">
                      <Crown className={`w-3.5 h-3.5 ${choice === 'white' ? 'text-amber-600' : 'text-amber-300'}`} />
                      Branco
                    </div>
                    <div
                      className={`text-[11px] font-mono font-bold mt-0.5 ${
                        choice === 'white' ? 'text-amber-700' : 'text-amber-200'
                      }`}
                    >
                      Paga 14x
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={spinning}
                    onClick={() => setChoice('black')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                      choice === 'black'
                        ? 'bg-zinc-900 border-white shadow-lg shadow-black/50'
                        : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="text-xs font-extrabold text-white">Preto</div>
                    <div className="text-[11px] font-mono font-bold text-zinc-300 mt-0.5">Paga 2x</div>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800">
                <div className="text-xs text-zinc-400">
                  Retorno potencial:{' '}
                  <span className="font-mono font-extrabold text-lime-300">
                    {currency === 'points' ? `${formatPoints(potentialPayout)} pts` : formatBRL(potentialPayout)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={spinning}
                  onClick={handleSpin}
                  className="min-h-[46px] px-6 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-sm font-extrabold inline-flex items-center gap-2 transition-colors cursor-pointer"
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
