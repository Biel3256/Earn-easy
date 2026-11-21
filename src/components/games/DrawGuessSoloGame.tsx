import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Lightbulb, ListChecks, RotateCcw, Send, ShieldCheck, SkipForward, Trophy, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

interface DrawItem {
  word: string;
  category: string;
  drawStep: (ctx: CanvasRenderingContext2D, progress: number) => void;
}

const SEEN_DRAW_KEY = 'earneasy_draw_solo_seen';
const ROUND_SECONDS = 25;

function drawArcProgress(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  t: number,
  color = '#a3e635'
) {
  if (t <= 0) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.arc(cx, cy, r, 0, Math.PI * 2 * Math.min(1, t));
  ctx.stroke();
}

function drawLineProgress(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
  color = '#e2e8f0'
) {
  if (t <= 0) return;
  const k = Math.min(1, t);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k);
  ctx.stroke();
}

const DRAW_BANK: DrawItem[] = [
  {
    word: 'CASA',
    category: 'Construção',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 90, 120, 90, 200, p * 4, '#a3e635');
      drawLineProgress(ctx, 90, 200, 210, 200, (p - 0.15) * 4, '#a3e635');
      drawLineProgress(ctx, 210, 200, 210, 120, (p - 0.3) * 4, '#a3e635');
      drawLineProgress(ctx, 75, 125, 150, 55, (p - 0.45) * 4, '#38bdf8');
      drawLineProgress(ctx, 150, 55, 225, 125, (p - 0.6) * 4, '#38bdf8');
      drawLineProgress(ctx, 135, 200, 135, 155, (p - 0.72) * 5, '#fbbf24');
      drawLineProgress(ctx, 135, 155, 165, 155, (p - 0.8) * 5, '#fbbf24');
      drawLineProgress(ctx, 165, 155, 165, 200, (p - 0.88) * 5, '#fbbf24');
    },
  },
  {
    word: 'SOL',
    category: 'Natureza',
    drawStep: (ctx, p) => {
      drawArcProgress(ctx, 150, 130, 42, p * 2.5, '#fbbf24');
      const angles = [0, 45, 90, 135, 180, 225, 270, 315];
      angles.forEach((deg, idx) => {
        const rad = (deg * Math.PI) / 180;
        const t = (p - 0.4 - idx * 0.06) * 8;
        drawLineProgress(
          ctx,
          150 + Math.cos(rad) * 54,
          130 + Math.sin(rad) * 54,
          150 + Math.cos(rad) * 80,
          130 + Math.sin(rad) * 80,
          t,
          '#fde047'
        );
      });
    },
  },
  {
    word: 'ARVORE',
    category: 'Natureza',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 138, 210, 138, 135, p * 4, '#d97706');
      drawLineProgress(ctx, 162, 210, 162, 135, (p - 0.15) * 4, '#d97706');
      drawArcProgress(ctx, 150, 102, 42, (p - 0.3) * 3, '#4ade80');
      drawArcProgress(ctx, 120, 120, 28, (p - 0.55) * 3, '#22c55e');
      drawArcProgress(ctx, 180, 120, 28, (p - 0.72) * 3, '#22c55e');
    },
  },
  {
    word: 'BARCO',
    category: 'Transporte',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 70, 165, 230, 165, p * 4, '#38bdf8');
      drawLineProgress(ctx, 70, 165, 100, 200, (p - 0.15) * 4, '#38bdf8');
      drawLineProgress(ctx, 100, 200, 200, 200, (p - 0.3) * 4, '#38bdf8');
      drawLineProgress(ctx, 200, 200, 230, 165, (p - 0.45) * 4, '#38bdf8');
      drawLineProgress(ctx, 150, 165, 150, 65, (p - 0.6) * 4, '#a3e635');
      drawLineProgress(ctx, 150, 65, 210, 145, (p - 0.75) * 4, '#f8fafc');
      drawLineProgress(ctx, 210, 145, 150, 145, (p - 0.88) * 5, '#f8fafc');
    },
  },
  {
    word: 'RELOGIO',
    category: 'Objeto',
    drawStep: (ctx, p) => {
      drawArcProgress(ctx, 150, 130, 56, p * 2.5, '#38bdf8');
      drawArcProgress(ctx, 150, 130, 6, (p - 0.4) * 5, '#a3e635');
      drawLineProgress(ctx, 150, 130, 150, 88, (p - 0.52) * 4, '#fbbf24');
      drawLineProgress(ctx, 150, 130, 182, 145, (p - 0.68) * 4, '#f43f5e');
      drawLineProgress(ctx, 132, 72, 132, 42, (p - 0.82) * 5, '#94a3b8');
      drawLineProgress(ctx, 168, 72, 168, 42, (p - 0.88) * 5, '#94a3b8');
    },
  },
  {
    word: 'ESTRELA',
    category: 'Espaço',
    drawStep: (ctx, p) => {
      const pts: Array<[number, number]> = [
        [150, 48],
        [174, 104],
        [232, 108],
        [186, 145],
        [202, 204],
        [150, 170],
        [98, 204],
        [114, 145],
        [68, 108],
        [126, 104],
        [150, 48],
      ];
      for (let i = 0; i < pts.length - 1; i++) {
        drawLineProgress(
          ctx,
          pts[i][0],
          pts[i][1],
          pts[i + 1][0],
          pts[i + 1][1],
          (p - i * 0.09) * 10,
          '#facc15'
        );
      }
    },
  },
  {
    word: 'OCULOS',
    category: 'Acessório',
    drawStep: (ctx, p) => {
      drawArcProgress(ctx, 105, 140, 32, p * 3, '#38bdf8');
      drawArcProgress(ctx, 195, 140, 32, (p - 0.3) * 3, '#38bdf8');
      drawLineProgress(ctx, 137, 140, 163, 140, (p - 0.6) * 5, '#a3e635');
      drawLineProgress(ctx, 73, 132, 48, 95, (p - 0.75) * 4, '#a3e635');
      drawLineProgress(ctx, 227, 132, 252, 95, (p - 0.85) * 4, '#a3e635');
    },
  },
  {
    word: 'FOGUETE',
    category: 'Espaço',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 150, 44, 120, 105, p * 4, '#f8fafc');
      drawLineProgress(ctx, 150, 44, 180, 105, (p - 0.12) * 4, '#f8fafc');
      drawLineProgress(ctx, 120, 105, 120, 185, (p - 0.25) * 4, '#e2e8f0');
      drawLineProgress(ctx, 180, 105, 180, 185, (p - 0.35) * 4, '#e2e8f0');
      drawLineProgress(ctx, 120, 185, 180, 185, (p - 0.45) * 4, '#e2e8f0');
      drawArcProgress(ctx, 150, 125, 14, (p - 0.56) * 4, '#38bdf8');
      drawLineProgress(ctx, 120, 160, 95, 196, (p - 0.7) * 5, '#fb7185');
      drawLineProgress(ctx, 180, 160, 205, 196, (p - 0.8) * 5, '#fb7185');
      drawLineProgress(ctx, 142, 188, 150, 222, (p - 0.88) * 5, '#fbbf24');
      drawLineProgress(ctx, 158, 188, 150, 222, (p - 0.9) * 5, '#fbbf24');
    },
  },
  {
    word: 'CORACAO',
    category: 'Símbolo',
    drawStep: (ctx, p) => {
      drawArcProgress(ctx, 120, 105, 32, p * 3, '#f43f5e');
      drawArcProgress(ctx, 180, 105, 32, (p - 0.28) * 3, '#f43f5e');
      drawLineProgress(ctx, 90, 118, 150, 200, (p - 0.55) * 3.5, '#fb7185');
      drawLineProgress(ctx, 210, 118, 150, 200, (p - 0.75) * 3.5, '#fb7185');
    },
  },
  {
    word: 'CHAVE',
    category: 'Objeto',
    drawStep: (ctx, p) => {
      drawArcProgress(ctx, 92, 120, 30, p * 3, '#fbbf24');
      drawArcProgress(ctx, 92, 120, 11, (p - 0.25) * 4, '#fde047');
      drawLineProgress(ctx, 122, 120, 232, 120, (p - 0.45) * 3.5, '#fbbf24');
      drawLineProgress(ctx, 202, 120, 202, 150, (p - 0.72) * 5, '#fbbf24');
      drawLineProgress(ctx, 224, 120, 224, 144, (p - 0.85) * 5, '#fbbf24');
    },
  },
  {
    word: 'BICICLETA',
    category: 'Transporte',
    drawStep: (ctx, p) => {
      drawArcProgress(ctx, 92, 165, 34, p * 3, '#38bdf8');
      drawArcProgress(ctx, 208, 165, 34, (p - 0.22) * 3, '#38bdf8');
      drawLineProgress(ctx, 92, 165, 145, 165, (p - 0.45) * 5, '#a3e635');
      drawLineProgress(ctx, 145, 165, 188, 112, (p - 0.58) * 5, '#a3e635');
      drawLineProgress(ctx, 92, 165, 128, 118, (p - 0.7) * 5, '#a3e635');
      drawLineProgress(ctx, 128, 118, 188, 112, (p - 0.8) * 5, '#a3e635');
      drawLineProgress(ctx, 188, 112, 208, 165, (p - 0.88) * 6, '#f8fafc');
    },
  },
  {
    word: 'COROA',
    category: 'Realeza',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 75, 175, 225, 175, p * 4, '#fbbf24');
      drawLineProgress(ctx, 75, 175, 68, 95, (p - 0.18) * 4, '#fbbf24');
      drawLineProgress(ctx, 68, 95, 115, 138, (p - 0.34) * 4, '#fbbf24');
      drawLineProgress(ctx, 115, 138, 150, 82, (p - 0.5) * 4, '#fde047');
      drawLineProgress(ctx, 150, 82, 185, 138, (p - 0.65) * 4, '#fde047');
      drawLineProgress(ctx, 185, 138, 232, 95, (p - 0.78) * 4, '#fbbf24');
      drawLineProgress(ctx, 232, 95, 225, 175, (p - 0.9) * 5, '#fbbf24');
    },
  },
  {
    word: 'PIZZA',
    category: 'Comida',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 150, 50, 85, 192, p * 3.5, '#fbbf24');
      drawLineProgress(ctx, 150, 50, 215, 192, (p - 0.2) * 3.5, '#fbbf24');
      drawLineProgress(ctx, 85, 192, 215, 192, (p - 0.4) * 3.5, '#d97706');
      drawArcProgress(ctx, 148, 128, 11, (p - 0.62) * 4, '#ef4444');
      drawArcProgress(ctx, 126, 164, 11, (p - 0.76) * 4, '#ef4444');
      drawArcProgress(ctx, 172, 162, 10, (p - 0.88) * 4, '#ef4444');
    },
  },
  {
    word: 'SORVETE',
    category: 'Comida',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 110, 126, 150, 214, p * 3.5, '#d97706');
      drawLineProgress(ctx, 190, 126, 150, 214, (p - 0.2) * 3.5, '#d97706');
      drawLineProgress(ctx, 110, 126, 190, 126, (p - 0.4) * 4, '#f59e0b');
      drawArcProgress(ctx, 150, 104, 38, (p - 0.56) * 3.5, '#f472b6');
      drawArcProgress(ctx, 150, 62, 22, (p - 0.8) * 4, '#38bdf8');
    },
  },
  {
    word: 'GUARDA-CHUVA',
    category: 'Objeto',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 72, 126, 228, 126, p * 4, '#38bdf8');
      drawLineProgress(ctx, 72, 126, 150, 62, (p - 0.18) * 4, '#a3e635');
      drawLineProgress(ctx, 150, 62, 228, 126, (p - 0.36) * 4, '#a3e635');
      drawLineProgress(ctx, 150, 126, 150, 200, (p - 0.58) * 4, '#e2e8f0');
      drawArcProgress(ctx, 164, 200, 14, (p - 0.8) * 4, '#fbbf24');
    },
  },
  {
    word: 'ROBO',
    category: 'Tecnologia',
    drawStep: (ctx, p) => {
      drawLineProgress(ctx, 98, 86, 202, 86, p * 4, '#94a3b8');
      drawLineProgress(ctx, 202, 86, 202, 186, (p - 0.16) * 4, '#94a3b8');
      drawLineProgress(ctx, 202, 186, 98, 186, (p - 0.32) * 4, '#94a3b8');
      drawLineProgress(ctx, 98, 186, 98, 86, (p - 0.48) * 4, '#94a3b8');
      drawArcProgress(ctx, 128, 124, 12, (p - 0.62) * 4, '#a3e635');
      drawArcProgress(ctx, 172, 124, 12, (p - 0.72) * 4, '#a3e635');
      drawLineProgress(ctx, 125, 160, 175, 160, (p - 0.82) * 5, '#38bdf8');
      drawLineProgress(ctx, 150, 86, 150, 56, (p - 0.9) * 6, '#fbbf24');
    },
  },
];

function normalizeWord(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function loadSeenWords(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SEEN_DRAW_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

export const DrawGuessSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [deck, setDeck] = useState<DrawItem[]>([]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [guess, setGuess] = useState('');
  const [revealedCount, setRevealedCount] = useState(1);
  const [showChoicesMode, setShowChoicesMode] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const roundHandledRef = useRef(false);

  const currentItem = deck[roundIdx];

  const multipleChoices = useMemo(() => {
    if (!currentItem) return [];
    const distractors = DRAW_BANK.filter((d) => d.word !== currentItem.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((d) => d.word);
    return [currentItem.word, ...distractors].sort(() => Math.random() - 0.5);
  }, [currentItem]);

  useEffect(() => {
    if (gameState !== 'PLAYING' || !currentItem) return;
    roundHandledRef.current = false;
    setProgress(0.05);
    setTimeLeft(ROUND_SECONDS);
    const interval = window.setInterval(() => {
      setProgress((prev) => (prev >= 1 ? 1 : Math.min(1, prev + 0.045)));
    }, 300);
    return () => window.clearInterval(interval);
  }, [gameState, roundIdx, currentItem]);

  useEffect(() => {
    if (gameState !== 'PLAYING' || !currentItem) return;
    if (timeLeft <= 0 && !roundHandledRef.current) {
      roundHandledRef.current = true;
      const nextMoves = movesCount + 1;
      setMovesCount(nextMoves);
      playTone(250, 0.09, 'sawtooth', soundOn);
      advanceRound(8, false, nextMoves);
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [gameState, timeLeft, currentItem]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentItem) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 30; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 30; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    currentItem.drawStep(ctx, progress);
  }, [currentItem, progress]);

  const startGame = () => {
    const seen = new Set(loadSeenWords());
    let unseen = DRAW_BANK.filter((item) => !seen.has(item.word));
    let chosen: DrawItem[];

    if (unseen.length >= 5) {
      chosen = [...unseen].sort(() => Math.random() - 0.5).slice(0, 5);
    } else {
      const part1 = [...unseen].sort(() => Math.random() - 0.5);
      const pickedSet = new Set(part1.map((x) => x.word));
      const part2 = DRAW_BANK.filter((x) => !pickedSet.has(x.word))
        .sort(() => Math.random() - 0.5)
        .slice(0, 5 - part1.length);
      chosen = [...part1, ...part2];
      seen.clear();
    }

    try {
      const updated = Array.from(new Set([...seen, ...chosen.map((c) => c.word)]));
      window.localStorage.setItem(SEEN_DRAW_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage error
    }

    setDeck(chosen);
    setRoundIdx(0);
    setProgress(0.05);
    setTimeLeft(ROUND_SECONDS);
    setGuess('');
    setRevealedCount(1);
    setShowChoicesMode(false);
    setTotalScore(0);
    setCorrectCount(0);
    setMovesCount(0);
    setFeedback('');
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(560, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (finalScore: number, totalMoves: number) => {
    setGameState('ROUND_SUMMARY');
    const rawDuration = Date.now() - startedAtRef.current;
    const bounded = Math.min(360, Math.max(40, finalScore));
    setSubmitting(true);
    try {
      const res = await onComplete(bounded, Math.max(rawDuration, 6000), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const advanceRound = (addedPts: number, isCorrect: boolean, nextMoves: number) => {
    const nextScore = totalScore + addedPts;
    const nextCorrect = correctCount + (isCorrect ? 1 : 0);
    setTotalScore(nextScore);
    setCorrectCount(nextCorrect);

    if (roundIdx + 1 >= deck.length) {
      finishMatch(nextScore, nextMoves);
    } else {
      setRoundIdx((r) => r + 1);
      setGuess('');
      setRevealedCount(1);
      setShowChoicesMode(false);
      setFeedback('');
    }
  };

  const submitAnswerText = (candidate: string, viaOptions = false) => {
    if (!currentItem || !candidate.trim() || roundHandledRef.current) return;
    const nextMoves = movesCount + 1;
    setMovesCount(nextMoves);

    if (normalizeWord(candidate) === normalizeWord(currentItem.word)) {
      roundHandledRef.current = true;
      const basePts = viaOptions ? 42 : 66;
      const timeBonus = Math.min(14, Math.floor(timeLeft / 2));
      const bonus = Math.max(30, basePts + timeBonus - (revealedCount - 1) * 8);
      playTone(760, 0.14, 'triangle', soundOn);
      advanceRound(bonus, true, nextMoves);
    } else {
      playTone(260, 0.09, 'sawtooth', soundOn);
      setFeedback('Ainda não! Observe os traços e tente novamente.');
      setGuess('');
    }
  };

  const handleGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAnswerText(guess, false);
  };

  const handleSkip = () => {
    if (!currentItem || roundHandledRef.current) return;
    roundHandledRef.current = true;
    const nextMoves = movesCount + 1;
    setMovesCount(nextMoves);
    playTone(320, 0.08, 'sine', soundOn);
    advanceRound(10, false, nextMoves);
  };

  const hintDisplay = currentItem
    ? currentItem.word
        .split('')
        .map((ch, idx) => (ch === '-' ? '-' : idx < revealedCount ? ch : '_'))
        .join(' ')
    : '';

  const timerPct = Math.max(0, Math.min(100, (timeLeft / ROUND_SECONDS) * 100));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">
            Desenhe e Adivinhe Solo
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {DRAW_BANK.length} ilustrações sem repetição · Até 360 moedas
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
        <div className="text-center py-6 space-y-5">
          <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            Acompanhe o pincel digital desenhando traço por traço em até 25 segundos. Digite a palavra para ganhar bônus máximo ou ative <strong>4 Opções</strong> quando quiser ajuda!
          </p>
          <button
            type="button"
            onClick={startGame}
            className="min-h-[46px] px-7 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm cursor-pointer"
          >
            Iniciar Desenhos
          </button>
        </div>
      )}

      {gameState === 'PLAYING' && currentItem && (
        <div className="space-y-4">
          <div className="space-y-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-3 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-800 dark:text-zinc-200">
                Desenho {roundIdx + 1}/{deck.length} · Tema: {currentItem.category}
              </span>
              <div className="flex items-center gap-3 font-mono font-bold tabular-nums">
                <span className="text-emerald-600 dark:text-lime-400">{totalScore} pts</span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    timeLeft <= 6 ? 'text-rose-500' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {timeLeft}s
                </span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  timeLeft <= 6 ? 'bg-rose-500' : 'bg-lime-400'
                }`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <canvas
              ref={canvasRef}
              width={300}
              height={240}
              className="rounded-2xl border border-lime-400/35 bg-[#090d12] shadow-inner max-w-full"
            />
            <div className="text-center space-y-1">
              <div className="font-mono text-lg font-extrabold tracking-widest text-slate-900 dark:text-lime-300">
                {hintDisplay}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                {currentItem.word.length} caracteres
              </div>
            </div>
          </div>

          {feedback && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400 text-center">
              {feedback}
            </p>
          )}

          {showChoicesMode ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <span>Toque na resposta correta:</span>
                <button
                  type="button"
                  onClick={() => setShowChoicesMode(false)}
                  className="font-bold text-emerald-600 dark:text-lime-400 hover:underline cursor-pointer"
                >
                  Prefiro digitar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {multipleChoices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => submitAnswerText(choice, true)}
                    className="min-h-[44px] px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 hover:border-lime-400 text-xs font-extrabold text-slate-900 dark:text-zinc-100 cursor-pointer"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleGuessSubmit} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Digite o que está sendo desenhado..."
                className="flex-1 min-w-[180px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-400"
              />
              <button
                type="submit"
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-extrabold rounded-xl cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </form>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={revealedCount >= currentItem.word.length - 1}
              onClick={() => setRevealedCount((c) => Math.min(currentItem.word.length - 1, c + 1))}
              className="min-h-[38px] inline-flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-45 cursor-pointer"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              Dica de Letra
            </button>
            {!showChoicesMode && (
              <button
                type="button"
                onClick={() => setShowChoicesMode(true)}
                className="min-h-[38px] inline-flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <ListChecks className="w-3.5 h-3.5 text-sky-400" />
                Mostrar 4 Opções
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              className="min-h-[38px] inline-flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-400 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Pular
            </button>
          </div>
        </div>
      )}

      {gameState === 'ROUND_SUMMARY' && (
        <div className="border-t border-slate-100 dark:border-zinc-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                Você acertou {correctCount} de {deck.length} desenhos!{' '}
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
  );
};
