import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
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

type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';
type VaultTier = 'bronze' | 'prata' | 'ouro';

const VAULT_CONFIG: Record<VaultTier, { label: string; max: number; attempts: number; baseWin: number }> = {
  bronze: { label: 'Cofre Bronze (1–100 · 7 chutes)', max: 100, attempts: 7, baseWin: 160 },
  prata: { label: 'Cofre Prata (1–250 · 8 chutes)', max: 250, attempts: 8, baseWin: 185 },
  ouro: { label: 'Cofre Ouro (1–500 · 9 chutes)', max: 500, attempts: 9, baseWin: 210 },
};

interface AttemptEntry {
  value: number;
  hint: 'higher' | 'lower' | 'exact';
  temp: string;
}

export const GuessNumberSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [tier, setTier] = useState<VaultTier>('bronze');

  const cfg = VAULT_CONFIG[tier];
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 100) + 1);
  const [minBound, setMinBound] = useState(1);
  const [maxBound, setMaxBound] = useState(100);
  const [inputVal, setInputVal] = useState('50');
  const [attempts, setAttempts] = useState<AttemptEntry[]>([]);
  const [parityHint, setParityHint] = useState<string | null>(null);
  const [won, setWon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const startedAtRef = useRef<number>(Date.now());

  const startGame = (selectedTier: VaultTier = tier) => {
    const nextCfg = VAULT_CONFIG[selectedTier];
    setTier(selectedTier);
    setTarget(Math.floor(Math.random() * nextCfg.max) + 1);
    setMinBound(1);
    setMaxBound(nextCfg.max);
    setInputVal(String(Math.round((1 + nextCfg.max) / 2)));
    setAttempts([]);
    setParityHint(null);
    setWon(false);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (didWin: boolean, totalMoves: number) => {
    setWon(didWin);
    setGameState('ROUND_SUMMARY');
    const rawDuration = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, cfg.attempts - totalMoves);
    const score = didWin ? Math.min(300, cfg.baseWin + remaining * 18) : 45;
    playTone(didWin ? 780 : 250, 0.16, didWin ? 'triangle' : 'sawtooth', soundOn);

    setSubmitting(true);
    try {
      const res = await onComplete(score, Math.max(rawDuration, 4000), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const adjustGuessValue = (deltaOrExact: number, isExact = false) => {
    const cur = Number(inputVal) || Math.round((minBound + maxBound) / 2);
    const rawNext = isExact ? deltaOrExact : cur + deltaOrExact;
    const clamped = Math.max(minBound, Math.min(maxBound, rawNext));
    setInputVal(String(clamped));
  };

  const handleGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (gameState !== 'PLAYING') return;
    const n = Number(inputVal);
    if (!Number.isInteger(n) || n < 1 || n > cfg.max) return;

    const diff = Math.abs(n - target);
    const ratio = diff / cfg.max;
    const temp =
      diff === 0
        ? 'Exato!'
        : ratio <= 0.04
          ? 'Pelando!'
          : ratio <= 0.12
            ? 'Quente'
            : ratio <= 0.25
              ? 'Morno'
              : 'Frio';
    const hint: AttemptEntry['hint'] = n === target ? 'exact' : n < target ? 'higher' : 'lower';

    const nextAttempts = [...attempts, { value: n, hint, temp }];
    setAttempts(nextAttempts);

    let nextMin = minBound;
    let nextMax = maxBound;
    if (hint === 'higher') {
      nextMin = Math.max(minBound, n + 1);
      setMinBound(nextMin);
    } else if (hint === 'lower') {
      nextMax = Math.min(maxBound, n - 1);
      setMaxBound(nextMax);
    }
    setInputVal(String(Math.round((nextMin + nextMax) / 2)));

    if (hint === 'exact') {
      finishMatch(true, nextAttempts.length);
      return;
    }

    playTone(ratio <= 0.08 ? 640 : 420, 0.08, 'sine', soundOn);

    if (nextAttempts.length >= cfg.attempts) {
      finishMatch(false, nextAttempts.length);
    }
  };

  const midGuess = Math.round((minBound + maxBound) / 2);
  const leftGaugePct = ((minBound - 1) / cfg.max) * 100;
  const widthGaugePct = Math.max(2, ((maxBound - minBound + 1) / cfg.max) * 100);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">
            Adivinhe o Número Solo
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            3 níveis de cofre, medidor visual e Scanner Par/Ímpar · Até 300 moedas
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
            Escolha o nível do cofre e use busca lógica, medidor de intervalo e o <strong>Scanner Par/Ímpar</strong> para abrir a senha antes de acabarem os chutes!
          </p>

          <div className="space-y-2 max-w-md mx-auto">
            {(['bronze', 'prata', 'ouro'] as VaultTier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl border text-left text-xs font-extrabold transition-colors cursor-pointer ${
                  tier === t
                    ? 'bg-lime-400 text-slate-950 border-lime-300'
                    : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                }`}
              >
                {VAULT_CONFIG[t].label}
              </button>
            ))}
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => startGame(tier)}
              className="min-h-[46px] px-7 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm cursor-pointer"
            >
              Gerar Código do Cofre
            </button>
          </div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-4">
          <div className="space-y-2.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-3 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                Intervalo ativo:{' '}
                <strong className="font-mono text-emerald-600 dark:text-lime-400">
                  {minBound} até {maxBound}
                </strong>
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                Tentativas: {attempts.length}/{cfg.attempts}
              </span>
            </div>

            <div className="relative h-2.5 w-full rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="absolute top-0 bottom-0 bg-lime-400 rounded-full transition-all duration-300"
                style={{ left: `${leftGaugePct}%`, width: `${widthGaugePct}%` }}
              />
            </div>
          </div>

          {gameState === 'PLAYING' && (
            <div className="space-y-3 max-w-md mx-auto">
              <form onSubmit={handleGuess} className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={cfg.max}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={`${minBound} - ${maxBound}`}
                  className="flex-1 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-4 py-2.5 text-base font-mono font-bold text-center text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-400"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold rounded-xl cursor-pointer"
                >
                  Chutar
                </button>
              </form>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustGuessValue(-10)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-mono font-bold hover:border-lime-400 cursor-pointer"
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => adjustGuessValue(-1)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-mono font-bold hover:border-lime-400 cursor-pointer"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => adjustGuessValue(midGuess, true)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 text-xs font-bold text-emerald-700 dark:text-lime-400 cursor-pointer"
                >
                  Meio ({midGuess})
                </button>
                <button
                  type="button"
                  onClick={() => adjustGuessValue(1)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-mono font-bold hover:border-lime-400 cursor-pointer"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => adjustGuessValue(10)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-mono font-bold hover:border-lime-400 cursor-pointer"
                >
                  +10
                </button>
                <button
                  type="button"
                  disabled={Boolean(parityHint)}
                  onClick={() => {
                    setParityHint(
                      target % 2 === 0
                        ? 'Scanner: o código secreto é PAR.'
                        : 'Scanner: o código secreto é ÍMPAR.'
                    );
                    playTone(660, 0.08, 'sine', soundOn);
                  }}
                  className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-400/50 text-xs font-bold text-amber-500 disabled:opacity-45 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {parityHint ? 'Scanner Usado' : 'Scanner Par/Ímpar'}
                </button>
              </div>

              {parityHint && (
                <p className="text-xs font-bold text-center text-amber-500">{parityHint}</p>
              )}
            </div>
          )}

          {attempts.length > 0 && (
            <div className="space-y-2 max-w-md mx-auto">
              {attempts.map((a, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs"
                >
                  <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-zinc-100">
                    #{idx + 1}: {a.value}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-bold ${
                      a.hint === 'exact'
                        ? 'text-emerald-600 dark:text-lime-400'
                        : a.hint === 'higher'
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {a.hint === 'exact' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Acertou!
                      </>
                    ) : a.hint === 'higher' ? (
                      <>
                        <ArrowUp className="w-3.5 h-3.5" /> É MAIOR · {a.temp}
                      </>
                    ) : (
                      <>
                        <ArrowDown className="w-3.5 h-3.5" /> É MENOR · {a.temp}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {gameState === 'ROUND_SUMMARY' && (
            <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                    {won
                      ? `Cofre aberto! Número era ${target}.`
                      : `Tentativas esgotadas! O número era ${target}.`}{' '}
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
                onClick={() => startGame(tier)}
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
