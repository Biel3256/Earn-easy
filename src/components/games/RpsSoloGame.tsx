import React, { useEffect, useRef, useState } from 'react';
import { Flame, RotateCcw, ShieldCheck, Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

type RpsMove = 'pedra' | 'papel' | 'tesoura';
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';
type CpuStyle = 'aleatorio' | 'analista';

const MOVES: Array<{ id: RpsMove; label: string; emoji: string; beats: RpsMove }> = [
  { id: 'pedra', label: 'Pedra', emoji: '🪨', beats: 'tesoura' },
  { id: 'papel', label: 'Papel', emoji: '📄', beats: 'pedra' },
  { id: 'tesoura', label: 'Tesoura', emoji: '✂️', beats: 'papel' },
];

function decideRound(player: RpsMove, cpu: RpsMove): 'win' | 'lose' | 'draw' {
  if (player === cpu) return 'draw';
  const meta = MOVES.find((m) => m.id === player)!;
  return meta.beats === cpu ? 'win' : 'lose';
}

function counterMoveFor(move: RpsMove): RpsMove {
  if (move === 'pedra') return 'papel';
  if (move === 'papel') return 'tesoura';
  return 'pedra';
}

function pickAnalystCpuMove(playerHistory: RpsMove[]): RpsMove {
  if (playerHistory.length < 2 || Math.random() < 0.25) {
    return MOVES[Math.floor(Math.random() * MOVES.length)].id;
  }
  const counts: Record<RpsMove, number> = { pedra: 0, papel: 0, tesoura: 0 };
  playerHistory.slice(-4).forEach((m) => {
    counts[m] += 1;
  });
  const likely = (Object.entries(counts) as Array<[RpsMove, number]>).sort((a, b) => b[1] - a[1])[0][0];
  return counterMoveFor(likely);
}

interface RoundLogEntry {
  player: RpsMove;
  cpu: RpsMove;
  outcome: 'win' | 'lose' | 'draw';
  doubled: boolean;
}

export const RpsSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [totalRounds, setTotalRounds] = useState<5 | 7>(5);
  const [cpuStyle, setCpuStyle] = useState<CpuStyle>('analista');

  const [round, setRound] = useState(1);
  const [wins, setWins] = useState(0);
  const [draws, setDraws] = useState(0);
  const [losses, setLosses] = useState(0);
  const [doubleArmed, setDoubleArmed] = useState(false);
  const [doubleUsed, setDoubleUsed] = useState(false);
  const [playerHistory, setPlayerHistory] = useState<RpsMove[]>([]);
  const [roundLogs, setRoundLogs] = useState<RoundLogEntry[]>([]);
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const nextTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    };
  }, []);

  const startGame = () => {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);
    setRound(1);
    setWins(0);
    setDraws(0);
    setLosses(0);
    setDoubleArmed(false);
    setDoubleUsed(false);
    setPlayerHistory([]);
    setRoundLogs([]);
    setCountdownText(null);
    setLocked(false);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (
    finalWins: number,
    finalDraws: number,
    finalLosses: number,
    logs: RoundLogEntry[]
  ) => {
    setGameState('ROUND_SUMMARY');
    const rawDuration = Date.now() - startedAtRef.current;
    const wonSeries = finalWins > finalLosses;
    const doubleBonus = logs.some((l) => l.doubled && l.outcome === 'win') ? 35 : 0;
    const styleBonus = cpuStyle === 'analista' && wonSeries ? 20 : 0;
    const perWin = totalRounds === 7 ? 30 : 40;
    const score = Math.min(
      280,
      40 + finalWins * perWin + finalDraws * 12 + (wonSeries ? 36 : 0) + doubleBonus + styleBonus
    );
    playTone(wonSeries ? 760 : 420, 0.16, 'triangle', soundOn);

    setSubmitting(true);
    try {
      const res = await onComplete(score, Math.max(rawDuration, 5000), totalRounds);
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePick = (move: RpsMove) => {
    if (gameState !== 'PLAYING' || locked) return;
    setLocked(true);
    setCountdownText('Pedra... Papel... Tesoura!');

    const nextHistory = [...playerHistory, move];
    const cpuPick =
      cpuStyle === 'analista'
        ? pickAnalystCpuMove(playerHistory)
        : MOVES[Math.floor(Math.random() * MOVES.length)].id;
    const usedBoostNow = doubleArmed && !doubleUsed;
    if (usedBoostNow) {
      setDoubleUsed(true);
      setDoubleArmed(false);
    }

    nextTimerRef.current = window.setTimeout(() => {
      setCountdownText(null);
      const outcome = decideRound(move, cpuPick);
      const nextWins = wins + (outcome === 'win' ? 1 : 0);
      const nextDraws = draws + (outcome === 'draw' ? 1 : 0);
      const nextLosses = losses + (outcome === 'lose' ? 1 : 0);
      const nextLogs: RoundLogEntry[] = [
        ...roundLogs,
        { player: move, cpu: cpuPick, outcome, doubled: usedBoostNow },
      ];

      setPlayerHistory(nextHistory);
      setWins(nextWins);
      setDraws(nextDraws);
      setLosses(nextLosses);
      setRoundLogs(nextLogs);

      playTone(
        outcome === 'win' ? 720 : outcome === 'draw' ? 460 : 250,
        0.11,
        outcome === 'lose' ? 'sawtooth' : 'triangle',
        soundOn
      );

      nextTimerRef.current = window.setTimeout(() => {
        if (round >= totalRounds) {
          finishMatch(nextWins, nextDraws, nextLosses, nextLogs);
        } else {
          setRound((r) => r + 1);
          setLocked(false);
        }
      }, 650);
    }, 340);
  };

  const moveMeta = (id: RpsMove) => MOVES.find((m) => m.id === id)!;
  const lastRound = roundLogs[roundLogs.length - 1] || null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">
            Pedra, Papel e Tesoura Solo
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            IA Analista + Carta 2x e histórico de rodadas · Até 280 moedas
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
            Configure seu duelo contra a IA e use sua <strong>Carta 2x</strong> única na hora certa para dobrar o bônus da rodada!
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setTotalRounds(5)}
              className={`min-h-[48px] p-3 rounded-xl border text-center text-xs font-extrabold cursor-pointer ${
                totalRounds === 5
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              Melhor de 5
            </button>
            <button
              type="button"
              onClick={() => setTotalRounds(7)}
              className={`min-h-[48px] p-3 rounded-xl border text-center text-xs font-extrabold cursor-pointer ${
                totalRounds === 7
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              Melhor de 7
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setCpuStyle('aleatorio')}
              className={`min-h-[54px] p-3 rounded-xl border text-left cursor-pointer ${
                cpuStyle === 'aleatorio'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">IA Imprevisível</div>
              <div className="text-[11px] opacity-80">Jogadas aleatórias</div>
            </button>
            <button
              type="button"
              onClick={() => setCpuStyle('analista')}
              className={`min-h-[54px] p-3 rounded-xl border text-left cursor-pointer ${
                cpuStyle === 'analista'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">IA Analista (+20 pts)</div>
              <div className="text-[11px] opacity-80">Lê padrões e contra-ataca</div>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={startGame}
              className="min-h-[46px] px-7 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm cursor-pointer"
            >
              Iniciar Duelo
            </button>
          </div>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-2.5 rounded-xl">
            <span className="font-bold text-slate-800 dark:text-zinc-200">
              Rodada {round} de {totalRounds} · {cpuStyle === 'analista' ? 'IA Analista' : 'IA Imprevisível'}
            </span>
            <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-zinc-300">
              V: {wins} · E: {draws} · D: {losses}
            </span>
          </div>

          {roundLogs.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {roundLogs.map((entry, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${
                    entry.outcome === 'win'
                      ? 'bg-lime-400/20 border-lime-400/50 text-lime-500'
                      : entry.outcome === 'draw'
                        ? 'bg-amber-400/15 border-amber-400/40 text-amber-400'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  }`}
                >
                  R{idx + 1}: {entry.outcome === 'win' ? 'V' : entry.outcome === 'draw' ? 'E' : 'D'}
                  {entry.doubled ? ' (2x)' : ''}
                </span>
              ))}
            </div>
          )}

          {countdownText ? (
            <div className="rounded-2xl border border-lime-400/40 bg-lime-400/10 p-6 text-center text-sm font-extrabold text-emerald-700 dark:text-lime-300 animate-pulse">
              {countdownText}
            </div>
          ) : lastRound ? (
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-5 flex items-center justify-around gap-4 text-center">
              <div>
                <div className="text-4xl">{moveMeta(lastRound.player).emoji}</div>
                <div className="text-xs font-bold mt-1 text-slate-800 dark:text-zinc-200">
                  Você ({moveMeta(lastRound.player).label})
                </div>
              </div>
              <div className="space-y-1">
                <div
                  className={`text-xs font-extrabold uppercase ${
                    lastRound.outcome === 'win'
                      ? 'text-emerald-600 dark:text-lime-400'
                      : lastRound.outcome === 'draw'
                        ? 'text-amber-500'
                        : 'text-rose-500'
                  }`}
                >
                  {lastRound.outcome === 'win'
                    ? 'Vitória!'
                    : lastRound.outcome === 'draw'
                      ? 'Empate'
                      : 'Derrota'}
                </div>
                {lastRound.doubled && (
                  <div className="text-[11px] font-bold text-amber-400 flex items-center justify-center gap-1">
                    <Flame className="w-3 h-3" /> Carta 2x
                  </div>
                )}
              </div>
              <div>
                <div className="text-4xl">{moveMeta(lastRound.cpu).emoji}</div>
                <div className="text-xs font-bold mt-1 text-slate-800 dark:text-zinc-200">
                  IA ({moveMeta(lastRound.cpu).label})
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 p-6 text-center text-xs text-slate-500 dark:text-zinc-400">
              Escolha sua jogada abaixo para iniciar a primeira rodada!
            </div>
          )}

          {gameState === 'PLAYING' && (
            <div className="space-y-3">
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={doubleUsed || locked}
                  onClick={() => setDoubleArmed((v) => !v)}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-40 ${
                    doubleArmed
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'border-slate-200 dark:border-zinc-700 text-amber-500 hover:border-amber-400'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {doubleUsed
                    ? 'Carta 2x Já Utilizada'
                    : doubleArmed
                      ? 'Carta 2x Ativada nesta Rodada!'
                      : 'Ativar Carta 2x (Bônus +35 se vencer)'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {MOVES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={locked}
                    onClick={() => handlePick(m.id)}
                    className="min-h-[96px] p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-lime-400 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
                  >
                    <span className="text-3xl">{m.emoji}</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
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
                    {wins > losses
                      ? 'Você venceu a série!'
                      : wins === losses
                        ? 'Série empatada!'
                        : 'A IA levou a série'}{' '}
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
