import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bomb,
  Coins,
  Gem,
  Play,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CasinoCurrency } from '../../types/earneasy';
import { extractReadableError, formatBRL, formatPoints } from '../../utils/pix';

interface MinesCasinoGameProps {
  onBack: () => void;
}

const POINTS_CHIPS = [10, 50, 100, 500, 1000];
const BRL_CHIPS_CENTS = [10, 50, 100, 500, 1000];
const MINES_PRESETS = [3, 5, 10, 15];

function previewMinesMultiplier(minesCount: number, safeCount: number): number {
  if (safeCount <= 0) return 1;
  let factor = 0.97;
  for (let i = 0; i < safeCount; i += 1) {
    const remainingTiles = 25 - i;
    const remainingSafe = 25 - minesCount - i;
    if (remainingSafe <= 0) break;
    factor *= remainingTiles / remainingSafe;
  }
  return Math.min(50, Math.max(1.01, Math.floor(factor * 100) / 100));
}

export const MinesCasinoGame: React.FC<MinesCasinoGameProps> = ({ onBack }) => {
  const { firebaseUser, userAccount, startMinesSession, finishMinesSession } = useAuth();
  const pointsBalance = userAccount?.pointsBalance ?? 0;
  const brlBalanceCents = userAccount?.brlBalanceCents ?? 0;

  const [currency, setCurrency] = useState<CasinoCurrency>('points');
  const [stakePoints, setStakePoints] = useState<number>(50);
  const [stakeCents, setStakeCents] = useState<number>(50);
  const [minesCount, setMinesCount] = useState<number>(3);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeCurrency, setActiveCurrency] = useState<CasinoCurrency>('points');
  const [activeStake, setActiveStake] = useState<number>(0);
  const [activeMinesCount, setActiveMinesCount] = useState<number>(3);
  const [revealedSafe, setRevealedSafe] = useState<number[]>([]);
  const [minePositions, setMinePositions] = useState<number[]>([]);
  const [bustedTile, setBustedTile] = useState<number | null>(null);
  const [roundOutcome, setRoundOutcome] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1);
  const [nextMultiplier, setNextMultiplier] = useState<number>(previewMinesMultiplier(3, 1));
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [busyAction, setBusyAction] = useState(false);
  const [loadingTile, setLoadingTile] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentStake = currency === 'points' ? stakePoints : stakeCents;
  const availableBalance = currency === 'points' ? pointsBalance : brlBalanceCents;
  const minStake = currency === 'points' ? 10 : 1;
  const maxStake = currency === 'points' ? 10000 : 5000;
  const isPlaying = roundOutcome === 'playing';

  const mineSet = useMemo(() => new Set(minePositions), [minePositions]);
  const safeSet = useMemo(() => new Set(revealedSafe), [revealedSafe]);

  const formatAmount = (val: number, curr: CasinoCurrency = currency) =>
    curr === 'points' ? `${formatPoints(val)} pts` : formatBRL(val);

  const handleStartRound = async () => {
    if (busyAction || isPlaying) return;
    setErrorMsg(null);

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
          ? 'Saldo de pontos insuficiente para iniciar a partida.'
          : 'Saldo da carteira insuficiente para iniciar a partida.'
      );
      return;
    }

    setBusyAction(true);
    try {
      const started = await startMinesSession({
        currency,
        stakeAmount: currentStake,
        minesCount,
      });

      setSessionId(started.sessionId);
      setActiveCurrency(started.currency);
      setActiveStake(started.stakeAmount);
      setActiveMinesCount(started.minesCount);
      setRevealedSafe([]);
      setMinePositions([]);
      setBustedTile(null);
      setCurrentMultiplier(1);
      setNextMultiplier(started.nextMultiplier);
      setPayoutAmount(0);
      setRoundOutcome('playing');
    } catch (err) {
      setErrorMsg(extractReadableError(err, 'Não foi possível iniciar o Mines agora.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleRevealTile = async (tileIndex: number) => {
    if (!isPlaying || !sessionId || !firebaseUser || busyAction || loadingTile !== null) return;
    if (safeSet.has(tileIndex)) return;

    setErrorMsg(null);
    setLoadingTile(tileIndex);

    try {
      const res = await fetch('/api/casino/mines/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userId: firebaseUser.uid,
          tileIndex,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erro ao revelar casa.');
      }

      if (data.busted) {
        setBustedTile(tileIndex);
        setMinePositions(Array.isArray(data.minePositions) ? data.minePositions : []);
        setRoundOutcome('lost');
        setCurrentMultiplier(0);
        setPayoutAmount(0);
        await finishMinesSession({
          sessionId,
          won: false,
          payoutAmount: 0,
          multiplier: 0,
          details: `Mines · Bomba na casa ${tileIndex + 1} (${activeMinesCount} bombas)`,
          integrityHash: String(data.integrityHash || 'busted'),
        });
        setSessionId(null);
        return;
      }

      const nextSafe: number[] = Array.isArray(data.revealedSafe) ? data.revealedSafe : [...revealedSafe, tileIndex];
      const nextMult = Number(data.currentMultiplier) || 1;
      const currPayout = Number(data.currentPayoutAmount) || activeStake;

      setRevealedSafe(nextSafe);
      setCurrentMultiplier(nextMult);
      setPayoutAmount(currPayout);
      setNextMultiplier(Number(data.nextMultiplier) || nextMult);

      if (data.allSafeCleared) {
        setMinePositions(Array.isArray(data.minePositions) ? data.minePositions : []);
        setRoundOutcome('won');
        await finishMinesSession({
          sessionId,
          won: true,
          payoutAmount: Number(data.payoutAmount) || currPayout,
          multiplier: nextMult,
          details: `Mines · Tabuleiro limpo (${nextSafe.length} diamantes · ${nextMult.toFixed(2)}x)`,
          integrityHash: String(data.integrityHash || 'cleared'),
        });
        setSessionId(null);
      }
    } catch (err) {
      setErrorMsg(extractReadableError(err, 'Falha de comunicação ao abrir casa.'));
    } finally {
      setLoadingTile(null);
    }
  };

  const handleCashout = async () => {
    if (!isPlaying || !sessionId || !firebaseUser || revealedSafe.length < 1 || busyAction) return;
    setBusyAction(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/casino/mines/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userId: firebaseUser.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível retirar o prêmio.');
      }

      const finalPayout = Number(data.payoutAmount) || payoutAmount;
      const finalMult = Number(data.multiplier) || currentMultiplier;
      setMinePositions(Array.isArray(data.minePositions) ? data.minePositions : []);
      setCurrentMultiplier(finalMult);
      setPayoutAmount(finalPayout);
      setRoundOutcome('won');

      await finishMinesSession({
        sessionId,
        won: true,
        payoutAmount: finalPayout,
        multiplier: finalMult,
        details: `Mines · Retirada (${revealedSafe.length} diamantes · ${finalMult.toFixed(2)}x)`,
        integrityHash: String(data.integrityHash || 'cashout'),
      });
      setSessionId(null);
    } catch (err) {
      setErrorMsg(extractReadableError(err, 'Erro ao retirar seu prêmio do Mines.'));
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (isPlaying) {
              setErrorMsg(
                revealedSafe.length >= 1
                  ? 'Clique em "Retirar Agora" para encerrar sua partida antes de voltar.'
                  : 'Abra pelo menos 1 casa ou finalize sua partida antes de sair.'
              );
              return;
            }
            onBack();
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-sky-400/60 cursor-pointer"
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

      {/* Main Container */}
      <div className="bg-[#0d121a] border border-zinc-800 rounded-3xl overflow-hidden shadow-xl text-white">
        <div className="px-5 py-4 border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#0e1522] via-[#101827] to-[#0f1f2b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
              <Gem className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-display font-extrabold tracking-tight text-white">
                Mines Earn Easy
              </h1>
              <p className="text-[11px] text-zinc-400">
                Grade 5×5 · Encontre diamantes, evite as bombas e retire quando quiser (sem dinheiro real)
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            Campo protegido no servidor
          </div>
        </div>

        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Controls Panel */}
          <div className="lg:col-span-5 bg-[#121822] border border-zinc-800 rounded-2xl p-4 space-y-4">
            {/* Currency */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300">Apostar usando:</label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#090d14] border border-zinc-800">
                <button
                  type="button"
                  disabled={isPlaying || busyAction}
                  onClick={() => {
                    setCurrency('points');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
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
                  disabled={isPlaying || busyAction}
                  onClick={() => {
                    setCurrency('brl');
                    setErrorMsg(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
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

            {/* Stake Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-300">Valor da Aposta</span>
                <span className="text-zinc-400 font-mono">
                  Disponível: {formatAmount(availableBalance)}
                </span>
              </div>
              <input
                type="number"
                min={currency === 'points' ? 10 : 0.01}
                max={currency === 'points' ? 10000 : 50}
                step={currency === 'points' ? 10 : 0.1}
                disabled={isPlaying || busyAction}
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090d14] border border-zinc-700 text-sm font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-1.5">
                {(currency === 'points' ? POINTS_CHIPS : BRL_CHIPS_CENTS).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isPlaying || busyAction}
                    onClick={() => (currency === 'points' ? setStakePoints(chip) : setStakeCents(chip))}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                      currentStake === chip
                        ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                        : 'bg-[#090d14] border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {currency === 'points' ? `${chip} pts` : formatBRL(chip)}
                  </button>
                ))}
              </div>
            </div>

            {/* Mines Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-300">Quantidade de Bombas</span>
                <span className="font-mono font-bold text-rose-400">{minesCount} bombas</span>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                disabled={isPlaying || busyAction}
                value={minesCount}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  setMinesCount(m);
                  if (!isPlaying) {
                    setNextMultiplier(previewMinesMultiplier(m, 1));
                  }
                }}
                className="w-full accent-sky-400 cursor-pointer disabled:opacity-50"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {MINES_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isPlaying || busyAction}
                    onClick={() => {
                      setMinesCount(preset);
                      if (!isPlaying) setNextMultiplier(previewMinesMultiplier(preset, 1));
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold border cursor-pointer disabled:opacity-50 ${
                      minesCount === preset
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-[#090d14] border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-semibold text-red-200">
                {errorMsg}
              </div>
            )}

            {/* Primary CTA */}
            {!isPlaying ? (
              <button
                type="button"
                disabled={busyAction}
                onClick={handleStartRound}
                className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                {busyAction ? 'Iniciando...' : roundOutcome === 'idle' ? 'Começar Partida' : 'Jogar Novamente'}
              </button>
            ) : (
              <button
                type="button"
                disabled={busyAction || revealedSafe.length < 1}
                onClick={handleCashout}
                className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {revealedSafe.length < 1
                  ? 'Abra 1 casa para liberar retirada'
                  : `Retirar Agora (${formatAmount(payoutAmount, activeCurrency)})`}
              </button>
            )}
          </div>

          {/* Right: 5x5 Board & Live Stats */}
          <div className="lg:col-span-7 space-y-4">
            {/* Multiplier Strip */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-[#121822] border border-zinc-800 rounded-2xl p-3">
                <div className="text-[11px] text-zinc-400">Multiplicador Atual</div>
                <div className="text-lg font-mono font-extrabold text-lime-300 mt-0.5">
                  {currentMultiplier.toFixed(2)}x
                </div>
              </div>
              <div className="bg-[#121822] border border-zinc-800 rounded-2xl p-3">
                <div className="text-[11px] text-zinc-400">Próxima Casa</div>
                <div className="text-lg font-mono font-extrabold text-sky-300 mt-0.5">
                  {nextMultiplier.toFixed(2)}x
                </div>
              </div>
              <div className="bg-[#121822] border border-zinc-800 rounded-2xl p-3">
                <div className="text-[11px] text-zinc-400">Diamantes</div>
                <div className="text-lg font-mono font-extrabold text-white mt-0.5">
                  {revealedSafe.length} / {25 - (isPlaying ? activeMinesCount : minesCount)}
                </div>
              </div>
            </div>

            {roundOutcome === 'won' && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs sm:text-sm font-bold text-emerald-200 flex items-center justify-between gap-2">
                <span>
                  Você garantiu {formatAmount(payoutAmount, activeCurrency)} ({currentMultiplier.toFixed(2)}x)!
                </span>
                <Gem className="w-5 h-5 text-emerald-300 shrink-0" />
              </div>
            )}

            {roundOutcome === 'lost' && (
              <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs sm:text-sm font-bold text-rose-200 flex items-center justify-between gap-2">
                <span>
                  Bomba encontrada! Você perdeu {formatAmount(activeStake, activeCurrency)}.
                </span>
                <Bomb className="w-5 h-5 text-rose-300 shrink-0" />
              </div>
            )}

            {/* 5x5 Tile Grid */}
            <div className="bg-[#090d14] border border-zinc-800 rounded-2xl p-3 sm:p-4 max-w-[440px] mx-auto">
              <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
                {Array.from({ length: 25 }).map((_, idx) => {
                  const isSafe = safeSet.has(idx);
                  const isMine = mineSet.has(idx);
                  const isHit = bustedTile === idx;
                  const isLoading = loadingTile === idx;
                  const showAllEnded = roundOutcome === 'won' || roundOutcome === 'lost';

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!isPlaying || isSafe || loadingTile !== null || busyAction}
                      onClick={() => handleRevealTile(idx)}
                      aria-label={`Casa ${idx + 1}`}
                      className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${
                        isHit
                          ? 'bg-rose-600 border-rose-300 text-white shadow-lg shadow-rose-600/40 scale-[0.98]'
                          : isMine
                            ? 'bg-rose-950/60 border-rose-500/40 text-rose-300 opacity-85'
                            : isSafe
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-inner shadow-emerald-500/20'
                              : isPlaying
                                ? 'bg-[#17202e] hover:bg-[#1e2a3c] border-zinc-700 hover:border-sky-400/70 text-zinc-500 cursor-pointer active:scale-95'
                                : showAllEnded
                                  ? 'bg-[#121822]/70 border-zinc-800/80 text-zinc-700'
                                  : 'bg-[#141c28] border-zinc-800 text-zinc-600'
                      }`}
                    >
                      {isHit || isMine ? (
                        <Bomb className="w-6 h-6" />
                      ) : isSafe ? (
                        <Gem className="w-6 h-6" />
                      ) : isLoading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-current opacity-35" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
