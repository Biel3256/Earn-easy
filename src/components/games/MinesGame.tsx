import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bomb,
  Coins,
  Gem,
  History,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CasinoCurrency } from '../../types/earneasy';
import { casinoSound } from '../../utils/casinoSound';
import { extractReadableError, formatBRL, formatPoints } from '../../utils/pix';

interface MinesGameProps {
  onExit: () => void;
}

function formatCasinoValue(currency: CasinoCurrency, amount: number): string {
  return currency === 'brl' ? formatBRL(amount) : `${formatPoints(amount)} pts`;
}

function previewMinesMultiplier(minesCount: number, revealedCount: number): number {
  if (revealedCount <= 0) return 1;
  let prob = 1;
  for (let i = 0; i < revealedCount; i += 1) {
    prob *= (25 - minesCount - i) / (25 - i);
  }
  if (prob <= 0) return 1000;
  return Math.min(1000, Math.max(1.01, Math.round((0.97 / prob) * 100) / 100));
}

export const MinesGame: React.FC<MinesGameProps> = ({ onExit }) => {
  const {
    userAccount,
    myCasinoSessions,
    startMinesRound,
    revealMinesTile,
    cashoutMinesRound,
  } = useAuth();

  const [currency, setCurrency] = useState<CasinoCurrency>('points');
  const [betInput, setBetInput] = useState<string>('100');
  const [minesCount, setMinesCount] = useState<number>(3);
  const [muted, setMuted] = useState<boolean>(false);

  const [phase, setPhase] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCurrency, setActiveCurrency] = useState<CasinoCurrency>('points');
  const [activeBet, setActiveBet] = useState<number>(0);
  const [activeMinesCount, setActiveMinesCount] = useState<number>(3);

  const [revealedGems, setRevealedGems] = useState<number[]>([]);
  const [revealedBombs, setRevealedBombs] = useState<number[]>([]);
  const [explodedBombIndex, setExplodedBombIndex] = useState<number | null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1);
  const [currentPayout, setCurrentPayout] = useState<number>(0);
  const [nextMultiplier, setNextMultiplier] = useState<number>(previewMinesMultiplier(3, 1));

  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parsedBet = useMemo(() => {
    const clean = betInput.replace(',', '.').trim();
    const num = Number(clean);
    if (!Number.isFinite(num) || num <= 0) return 0;
    if (currency === 'brl') {
      return Math.min(50000, Math.max(0, Math.round(num * 100)));
    }
    return Math.min(50000, Math.max(0, Math.floor(num)));
  }, [betInput, currency]);

  const liveBalance =
    currency === 'points'
      ? userAccount?.pointsBalance ?? 0
      : userAccount?.brlBalanceCents ?? 0;

  const isPlaying = phase === 'playing';
  const activeMines = isPlaying ? activeMinesCount : minesCount;
  const safeTotal = 25 - activeMines;
  const remainingGems = Math.max(0, safeTotal - revealedGems.length);
  const unopenedCount = Math.max(1, 25 - revealedGems.length);
  const nextHitChancePct = Math.round((remainingGems / unopenedCount) * 100);
  const nextTilePayout = useMemo(() => {
    const baseBet = isPlaying ? activeBet : parsedBet;
    const targetMult = isPlaying ? nextMultiplier : previewMinesMultiplier(minesCount, 1);
    if (baseBet <= 0) return 0;
    return Math.min(2500000, baseBet * 1000, Math.round(baseBet * targetMult));
  }, [isPlaying, activeBet, parsedBet, nextMultiplier, minesCount]);

  const minesSessions = useMemo(
    () => myCasinoSessions.filter((s) => s.gameType === 'mines').slice(0, 6),
    [myCasinoSessions]
  );

  const switchCurrency = (next: CasinoCurrency) => {
    if (isPlaying || busy) return;
    setCurrency(next);
    setErrorMsg(null);
    setBetInput(next === 'brl' ? '1.00' : '100');
  };

  const adjustBet = (factor: number) => {
    if (isPlaying || busy) return;
    const base = parsedBet || 50;
    const nextRaw = Math.max(1, Math.min(50000, Math.round(base * factor)));
    setBetInput(currency === 'brl' ? (nextRaw / 100).toFixed(2) : String(nextRaw));
  };

  const setPresetBet = (unitAmount: number) => {
    if (isPlaying || busy) return;
    setBetInput(currency === 'brl' ? (unitAmount / 100).toFixed(2) : String(unitAmount));
  };

  const setMaxBet = () => {
    if (isPlaying || busy) return;
    const maxSafe = Math.max(1, Math.min(50000, Math.floor(liveBalance)));
    setBetInput(currency === 'brl' ? (maxSafe / 100).toFixed(2) : String(maxSafe));
  };

  const handleResetBoard = () => {
    setPhase('idle');
    setActiveSessionId(null);
    setRevealedGems([]);
    setRevealedBombs([]);
    setExplodedBombIndex(null);
    setCurrentMultiplier(1);
    setCurrentPayout(0);
    setNextMultiplier(previewMinesMultiplier(minesCount, 1));
    setErrorMsg(null);
  };

  const handleStartGame = async () => {
    if (isPlaying || busy) return;
    setErrorMsg(null);

    if (parsedBet < 1 || parsedBet > 50000) {
      setErrorMsg(
        currency === 'brl'
          ? 'Aposta deve estar entre R$ 0,01 e R$ 500,00.'
          : 'Aposta deve estar entre 1 e 50.000 moedas.'
      );
      return;
    }
    if (liveBalance < parsedBet) {
      setErrorMsg(
        currency === 'brl'
          ? 'Saldo em R$ insuficiente para iniciar.'
          : 'Saldo de moedas insuficiente para iniciar.'
      );
      return;
    }

    setBusy(true);
    try {
      const round = await startMinesRound({
        currency,
        betAmount: parsedBet,
        minesCount,
      });

      setActiveSessionId(round.sessionId);
      setActiveCurrency(currency);
      setActiveBet(round.betAmount);
      setActiveMinesCount(round.minesCount);
      setRevealedGems([]);
      setRevealedBombs([]);
      setExplodedBombIndex(null);
      setCurrentMultiplier(1);
      setCurrentPayout(0);
      setNextMultiplier(round.firstMultiplier);
      setPhase('playing');
    } catch (err) {
      setErrorMsg(extractReadableError(err, 'Não foi possível iniciar o Mines.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRevealTile = async (tileIndex: number) => {
    if (!isPlaying || !activeSessionId || busy) return;
    if (revealedGems.includes(tileIndex) || revealedBombs.includes(tileIndex)) return;

    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await revealMinesTile({ sessionId: activeSessionId, tileIndex });

      if (res.outcome === 'bomb') {
        setRevealedGems(res.revealedIndices);
        setRevealedBombs(res.mineIndices || [tileIndex]);
        setExplodedBombIndex(tileIndex);
        setCurrentMultiplier(0);
        setCurrentPayout(0);
        setPhase('lost');
        casinoSound.playMinesBomb(muted);
      } else if (res.outcome === 'cleared') {
        setRevealedGems(res.revealedIndices);
        setRevealedBombs(res.mineIndices || []);
        setCurrentMultiplier(res.multiplier);
        setCurrentPayout(res.payoutAmount);
        setPhase('won');
        casinoSound.playMinesCashout(muted);
      } else {
        setRevealedGems(res.revealedIndices);
        setCurrentMultiplier(res.multiplier);
        setCurrentPayout(res.payoutAmount);
        setNextMultiplier(
          res.nextMultiplier || previewMinesMultiplier(activeMinesCount, res.revealedCount + 1)
        );
        casinoSound.playMinesGem(muted, res.revealedCount);
      }
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg = extractReadableError(err, 'Não foi possível abrir esta casa.');
      const normalized = msg.toLowerCase();
      if (
        status === 404 ||
        status === 409 ||
        normalized.includes('expirad') ||
        normalized.includes('finalizad') ||
        normalized.includes('não encontrad')
      ) {
        handleResetBoard();
        setErrorMsg('Rodada expirada ou já finalizada no servidor. O tabuleiro foi liberado para uma nova partida.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRandomPick = () => {
    if (!isPlaying || busy) return;
    const closed: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      if (!revealedGems.includes(i) && !revealedBombs.includes(i)) {
        closed.push(i);
      }
    }
    if (closed.length === 0) return;
    const pick = closed[Math.floor(Math.random() * closed.length)];
    void handleRevealTile(pick);
  };

  const handleCashout = async () => {
    if (!isPlaying || !activeSessionId || busy || revealedGems.length < 1) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await cashoutMinesRound({ sessionId: activeSessionId });
      setRevealedGems(res.revealedIndices);
      setRevealedBombs(res.mineIndices);
      setCurrentMultiplier(res.multiplier);
      setCurrentPayout(res.payoutAmount);
      setPhase('won');
      casinoSound.playMinesCashout(muted);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg = extractReadableError(err, 'Erro ao retirar ganhos do Mines.');
      const normalized = msg.toLowerCase();
      if (
        status === 404 ||
        status === 409 ||
        normalized.includes('expirad') ||
        normalized.includes('finalizad') ||
        normalized.includes('não encontrad')
      ) {
        handleResetBoard();
        setErrorMsg('Rodada expirada ou já finalizada no servidor. O tabuleiro foi liberado para uma nova partida.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1923] text-xs font-bold text-slate-800 dark:text-zinc-200 hover:border-emerald-500/60 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Catálogo
        </button>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0f1923] border border-slate-700/80 text-white text-xs font-mono font-bold tabular-nums">
            {currency === 'points' ? (
              <Coins className="w-4 h-4 text-lime-400" />
            ) : (
              <Wallet className="w-4 h-4 text-emerald-400" />
            )}
            <span>{formatCasinoValue(currency, liveBalance)}</span>
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0f1923] text-slate-700 dark:text-zinc-200 flex items-center justify-center hover:border-emerald-500/60 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Mines Surface */}
      <div className="rounded-3xl border border-slate-800 bg-[#0f1923] text-white overflow-hidden shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT CONTROL PANEL */}
          <div className="lg:col-span-4 bg-[#1a242d] border-b lg:border-b-0 lg:border-r border-slate-800/90 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
                  <Gem className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-base font-display font-extrabold tracking-tight text-white">
                    Mines
                  </h1>
                  <p className="text-[11px] text-slate-400">Campo Minado 5×5 · Multiplicador Vivo</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                RNG Server
              </span>
            </div>

            {/* Currency Switcher */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Apostar usando
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isPlaying || busy}
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
                  disabled={isPlaying || busy}
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

            {/* Bet Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-slate-400">
                  Valor da Aposta
                </span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {formatCasinoValue(currency, parsedBet)}
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
                    disabled={isPlaying || busy}
                    value={betInput}
                    onChange={(e) => setBetInput(e.target.value)}
                    className="w-full min-h-[44px] pl-11 pr-3 rounded-xl bg-[#0f1923] border border-slate-700 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                  />
                </div>
                <button
                  type="button"
                  disabled={isPlaying || busy}
                  onClick={() => adjustBet(0.5)}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-[#0f1923] border border-slate-700 hover:border-slate-500 text-xs font-mono font-bold text-slate-200 cursor-pointer disabled:opacity-50"
                >
                  ½
                </button>
                <button
                  type="button"
                  disabled={isPlaying || busy}
                  onClick={() => adjustBet(2)}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-[#0f1923] border border-slate-700 hover:border-slate-500 text-xs font-mono font-bold text-slate-200 cursor-pointer disabled:opacity-50"
                >
                  2x
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {(currency === 'points' ? [50, 100, 500, 1000] : [50, 100, 200, 500]).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isPlaying || busy}
                    onClick={() => setPresetBet(chip)}
                    className="min-h-[34px] rounded-lg bg-[#0f1923] border border-slate-800 hover:border-emerald-500/60 text-[11px] font-mono font-bold text-slate-300 cursor-pointer disabled:opacity-50"
                  >
                    {currency === 'brl' ? formatBRL(chip) : chip}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={isPlaying || busy}
                onClick={setMaxBet}
                className="w-full min-h-[32px] rounded-lg bg-[#0f1923] border border-slate-800 hover:border-slate-600 text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
              >
                Usar Saldo Máximo Disponível
              </button>
            </div>

            {/* Mines Selector (1-24) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold uppercase tracking-wider text-slate-400">
                  Número de Minas
                </span>
                <span className="font-mono font-bold text-rose-400">
                  {activeMines} bombas · {safeTotal} diamantes
                </span>
              </div>

              <select
                disabled={isPlaying || busy}
                value={activeMines}
                onChange={(e) => setMinesCount(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0f1923] border border-slate-700 text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-500 disabled:opacity-60"
              >
                {Array.from({ length: 24 }, (_, idx) => idx + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'Mina' : 'Minas'} (1º Diamante: {previewMinesMultiplier(n, 1).toFixed(2)}x)
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-6 gap-1.5">
                {[1, 3, 5, 10, 15, 24].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isPlaying || busy}
                    onClick={() => setMinesCount(preset)}
                    className={`min-h-[32px] rounded-lg border text-[11px] font-mono font-bold cursor-pointer disabled:opacity-50 ${
                      activeMines === preset
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-[#0f1923] border-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Risk Bar */}
            <div className="rounded-xl bg-[#0f1923] border border-slate-800 px-3 py-2.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-semibold">Chance próximo diamante</span>
              <span className="font-mono font-bold text-emerald-400 tabular-nums">
                {nextHitChancePct}% · {formatCasinoValue(isPlaying ? activeCurrency : currency, nextTilePayout)}
              </span>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/70 text-xs text-rose-200 space-y-2">
                <p>{errorMsg}</p>
                {isPlaying && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleResetBoard}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-[11px] font-bold text-rose-100 cursor-pointer"
                  >
                    Reiniciar tabuleiro
                  </button>
                )}
              </div>
            )}

            {/* Main Action Buttons */}
            {isPlaying ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={busy || revealedGems.length < 1}
                  onClick={handleCashout}
                  className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/25"
                >
                  <Gem className="w-4 h-4" />
                  {revealedGems.length < 1
                    ? 'Abra 1 casa para liberar Retirada'
                    : `Retirar ${formatCasinoValue(activeCurrency, currentPayout)} (${currentMultiplier.toFixed(2)}x)`}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleRandomPick}
                  className="w-full min-h-[42px] rounded-xl bg-[#0f1923] border border-slate-700 hover:border-sky-400 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  Escolha Aleatória
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleStartGame}
                className="w-full min-h-[52px] rounded-xl bg-[#f12c4c] hover:bg-[#ff3b5c] disabled:opacity-60 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-600/30"
              >
                <Play className="w-4 h-4 fill-current" />
                {busy ? 'Gerando Minas...' : 'Começar o Jogo'}
              </button>
            )}
          </div>

          {/* RIGHT 5x5 BOARD + LIVE MULTIPLIER HUD */}
          <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between gap-5 bg-[#0b131b]">
            {/* Live HUD Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-[#131e29] border border-slate-800 px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Diamantes Restantes
                </div>
                <div className="text-base font-mono font-extrabold text-emerald-400 tabular-nums mt-0.5">
                  {remainingGems} / {safeTotal}
                </div>
              </div>

              <div className="rounded-xl bg-[#131e29] border border-slate-800 px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Multiplicador Atual
                </div>
                <div className="text-base font-mono font-extrabold text-white tabular-nums mt-0.5">
                  {currentMultiplier.toFixed(2)}x
                </div>
              </div>

              <div className="rounded-xl bg-[#131e29] border border-slate-800 px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Próximo Acerto
                </div>
                <div className="text-base font-mono font-extrabold text-sky-400 tabular-nums mt-0.5">
                  {isPlaying
                    ? `${nextMultiplier.toFixed(2)}x`
                    : `${previewMinesMultiplier(minesCount, 1).toFixed(2)}x`}
                </div>
              </div>

              <div className="rounded-xl bg-[#131e29] border border-slate-800 px-3.5 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Lucro no Cashout
                </div>
                <div className="text-base font-mono font-extrabold text-lime-400 tabular-nums mt-0.5">
                  {formatCasinoValue(isPlaying ? activeCurrency : currency, currentPayout)}
                </div>
              </div>
            </div>

            {/* 5x5 Interactive Grid */}
            <div className="relative max-w-[430px] w-full mx-auto">
              <div className="grid grid-cols-5 gap-2.5 sm:gap-3">
                {Array.from({ length: 25 }, (_, idx) => {
                  const isGem = revealedGems.includes(idx);
                  const isBomb = revealedBombs.includes(idx);
                  const isExploded = explodedBombIndex === idx;
                  const canClick = isPlaying && !busy && !isGem && !isBomb;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!canClick}
                      onClick={() => handleRevealTile(idx)}
                      aria-label={`Casa ${idx + 1}`}
                      className={`aspect-square rounded-2xl flex items-center justify-center transition-all duration-150 select-none ${
                        isExploded
                          ? 'bg-rose-600/30 border-2 border-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.45)] scale-95'
                          : isBomb
                            ? 'bg-[#1a1520] border border-rose-500/45 opacity-85'
                            : isGem
                              ? 'bg-emerald-500/20 border-2 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.28)]'
                              : canClick
                                ? 'bg-[#21303f] hover:bg-[#2a3d4f] border-b-4 border-[#131c26] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-md'
                                : 'bg-[#16212c] border-b-4 border-[#0e151d] opacity-75 cursor-default'
                      }`}
                    >
                      {isBomb ? (
                        <Bomb
                          className={`w-7 h-7 sm:w-8 sm:h-8 ${
                            isExploded ? 'text-rose-400 animate-bounce' : 'text-rose-400/80'
                          }`}
                        />
                      ) : isGem ? (
                        <Gem className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-600/40" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Round Outcome Overlay Banner */}
              {(phase === 'won' || phase === 'lost') && (
                <div
                  className={`mt-4 p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                    phase === 'won'
                      ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-500/60 text-rose-200'
                  }`}
                >
                  <div>
                    <div className="text-sm font-extrabold text-white">
                      {phase === 'won'
                        ? `Cashout realizado! +${formatCasinoValue(activeCurrency, currentPayout)}`
                        : 'Bomba detonada! Mais sorte na próxima rodada.'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-300">
                      {revealedGems.length} diamante(s) · Multiplicador:{' '}
                      {phase === 'won' ? `${currentMultiplier.toFixed(2)}x` : '0.00x'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-extrabold ${
                        phase === 'won' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-600 text-white'
                      }`}
                    >
                      {phase === 'won'
                        ? `+${formatCasinoValue(activeCurrency, currentPayout)}`
                        : `-${formatCasinoValue(activeCurrency, activeBet)}`}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleStartGame}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold text-white cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Jogar de Novo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Recent Mines History */}
            {minesSessions.length > 0 && (
              <div className="border-t border-slate-800 pt-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <History className="w-3.5 h-3.5" />
                  Suas Últimas Partidas no Mines
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {minesSessions.slice(0, 4).map((s) => (
                    <div
                      key={s.sessionId}
                      className="px-3 py-2 rounded-xl bg-[#0f1923] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-slate-300 truncate">{s.outcomeSummary}</span>
                      <span
                        className={`font-mono font-bold shrink-0 tabular-nums ${
                          s.status === 'won'
                            ? 'text-emerald-400'
                            : s.status === 'lost'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                        }`}
                      >
                        {s.status === 'won'
                          ? `+${formatCasinoValue(s.currency, s.payoutAmount)}`
                          : s.status === 'lost'
                            ? `-${formatCasinoValue(s.currency, s.betAmount)}`
                            : 'Em jogo'}
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
