import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

interface MathQuestion {
  prompt: string;
  answer: number;
  options: number[];
}

function generateQuestion(level: number): MathQuestion {
  const ops = level >= 5 ? ['+', '-', '×', '÷'] : ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = 0;
  let b = 0;
  let ans = 0;

  if (op === '+') {
    a = Math.floor(Math.random() * (18 + level * 4)) + 5;
    b = Math.floor(Math.random() * (15 + level * 3)) + 3;
    ans = a + b;
  } else if (op === '-') {
    b = Math.floor(Math.random() * (12 + level * 2)) + 2;
    ans = Math.floor(Math.random() * (18 + level * 3)) + 4;
    a = b + ans;
  } else if (op === '×') {
    a = Math.floor(Math.random() * 11) + 2;
    b = Math.floor(Math.random() * 10) + 2;
    ans = a * b;
  } else {
    b = Math.floor(Math.random() * 9) + 2;
    ans = Math.floor(Math.random() * 11) + 2;
    a = b * ans;
  }

  const distractors = new Set<number>([ans]);
  while (distractors.size < 4) {
    const offset = Math.floor(Math.random() * 11) - 5;
    const candidate = ans + (offset === 0 ? 3 : offset);
    if (candidate >= 0) distractors.add(candidate);
  }

  const options = Array.from(distractors).sort(() => Math.random() - 0.5);
  return { prompt: `${a} ${op} ${b}`, answer: ans, options };
}

export const MathSprintGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY'>('TITLE_MENU');
  const [timeLeft, setTimeLeft] = useState(40);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [question, setQuestion] = useState<MathQuestion>(() => generateQuestion(1));
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{ credited: number; verificationStatus: string; fraudReason: string } | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const scoreRef = useRef(0);
  const answeredRef = useRef(0);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    answeredRef.current = answeredCount;
  }, [answeredCount]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          finishSprint();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [gameState]);

  const finishSprint = async () => {
    setGameState('ROUND_SUMMARY');
    setSubmitting(true);
    const duration = Date.now() - startedAtRef.current;
    const finalScore = Math.min(450, scoreRef.current);
    try {
      const res = await onComplete(finalScore, Math.max(duration, 8000), Math.max(answeredRef.current, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const startGame = () => {
    setTimeLeft(40);
    setScore(0);
    scoreRef.current = 0;
    setStreak(0);
    setAnsweredCount(0);
    answeredRef.current = 0;
    setCorrectCount(0);
    setFeedback(null);
    setRewardInfo(null);
    setQuestion(generateQuestion(1));
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(540, 0.08, 'sine', soundOn);
  };

  const handleAnswer = (chosen: number) => {
    if (gameState !== 'PLAYING') return;
    const nextAnswered = answeredCount + 1;
    setAnsweredCount(nextAnswered);

    if (chosen === question.answer) {
      const nextStreak = streak + 1;
      const multiplier = nextStreak >= 6 ? 3 : nextStreak >= 3 ? 2 : 1;
      const gained = 15 * multiplier;
      setScore((s) => Math.min(450, s + gained));
      setStreak(nextStreak);
      setCorrectCount((c) => c + 1);
      setFeedback('correct');
      playTone(680 + nextStreak * 25, 0.07, 'triangle', soundOn);
    } else {
      setStreak(0);
      setFeedback('wrong');
      playTone(220, 0.1, 'sawtooth', soundOn);
    }

    setQuestion(generateQuestion(nextAnswered));
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Desafio Matemático</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">40 segundos de cálculo rápido com multiplicador de sequência · Até 450 pts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            aria-label={soundOn ? 'Desativar som' : 'Ativar som'}
            className="p-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>

      {gameState === 'TITLE_MENU' && (
        <div className="text-center py-6 space-y-6">
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            Resolva o máximo de operações matemáticas em 40 segundos. Acertos consecutivos ativam multiplicadores de <strong>2x</strong> e <strong>3x</strong>!
          </p>
          <button
            type="button"
            onClick={startGame}
            className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Começar Sprint (40s)
          </button>
        </div>
      )}

      {gameState === 'PLAYING' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Tempo</div>
              <div className={`text-lg font-mono font-bold tabular-nums ${timeLeft <= 8 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-zinc-50'}`}>
                {timeLeft}s
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Sequência</div>
              <div className="text-lg font-mono font-bold tabular-nums text-sky-600 dark:text-sky-400">
                {streak} ({streak >= 6 ? '3x' : streak >= 3 ? '2x' : '1x'})
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Pontos</div>
              <div className="text-lg font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{score}</div>
            </div>
          </div>

          <div
            className={`py-8 px-4 rounded-xl border text-center transition-colors ${
              feedback === 'correct'
                ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                : feedback === 'wrong'
                  ? 'bg-red-50/70 dark:bg-red-950/40 border-red-200 dark:border-red-800'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800'
            }`}
          >
            <div className="text-xs text-slate-500 dark:text-zinc-400 mb-2">Resolva a expressão</div>
            <div className="text-4xl font-display font-extrabold text-slate-900 dark:text-zinc-50 font-mono tabular-nums">
              {question.prompt} = ?
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            {question.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleAnswer(opt)}
                className="py-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 hover:bg-slate-900 dark:hover:bg-emerald-600 hover:text-white hover:border-slate-900 dark:hover:border-emerald-600 text-xl font-mono font-bold tabular-nums transition-colors active:scale-95 cursor-pointer"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState === 'ROUND_SUMMARY' && (
        <div className="space-y-6 py-4">
          <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Acertos</div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                {correctCount}/{answeredCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Precisão</div>
              <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                {answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-zinc-400">Pontos</div>
              <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{score}</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                  {submitting
                    ? 'Validando sprint no sistema antifraude...'
                    : rewardInfo
                      ? `+${rewardInfo.credited} pontos creditados`
                      : 'Sprint encerrado!'}
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
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Novo Sprint
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
