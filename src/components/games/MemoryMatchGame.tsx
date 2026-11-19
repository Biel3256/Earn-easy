import React, { useEffect, useRef, useState } from 'react';
import {
  Banknote,
  Compass,
  Cpu,
  Gem,
  KeyRound,
  Landmark,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wallet,
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

const CARD_DEFS = [
  { key: 'wallet', label: 'Carteira', Icon: Wallet },
  { key: 'bank', label: 'Banco', Icon: Landmark },
  { key: 'cash', label: 'Pix', Icon: Banknote },
  { key: 'gem', label: 'Prêmio', Icon: Gem },
  { key: 'cpu', label: 'Sistema', Icon: Cpu },
  { key: 'key', label: 'Chave', Icon: KeyRound },
  { key: 'compass', label: 'Meta', Icon: Compass },
  { key: 'star', label: 'Bônus', Icon: Sparkles },
];

interface CardItem {
  id: number;
  key: string;
  label: string;
  Icon: React.FC<{ className?: string }>;
  matched: boolean;
}

function buildDeck(): CardItem[] {
  const doubled = [...CARD_DEFS, ...CARD_DEFS].map((item, idx) => ({
    id: idx,
    key: item.key,
    label: item.label,
    Icon: item.Icon,
    matched: false,
  }));
  return doubled.sort(() => Math.random() - 0.5);
}

export const MemoryMatchGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY'>('TITLE_MENU');
  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [movesCount, setMovesCount] = useState(0);
  const [locked, setLocked] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{ credited: number; verificationStatus: string; fraudReason: string } | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const startGame = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setCards(buildDeck());
    setFlippedIds([]);
    setMovesCount(0);
    setLocked(false);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(520, 0.08, 'sine', soundOn);
  };

  const handleCardClick = (cardId: number) => {
    if (gameState !== 'PLAYING' || locked) return;
    const target = cards.find((c) => c.id === cardId);
    if (!target || target.matched || flippedIds.includes(cardId)) return;

    const nextFlipped = [...flippedIds, cardId];
    setFlippedIds(nextFlipped);
    playTone(580, 0.05, 'sine', soundOn);

    if (nextFlipped.length === 2) {
      const nextMoves = movesCount + 1;
      setMovesCount(nextMoves);
      setLocked(true);
      const [firstId, secondId] = nextFlipped;
      const first = cards.find((c) => c.id === firstId);
      const second = cards.find((c) => c.id === secondId);

      if (first && second && first.key === second.key) {
        const updated = cards.map((c) =>
          c.id === firstId || c.id === secondId ? { ...c, matched: true } : c
        );
        setCards(updated);
        setFlippedIds([]);
        setLocked(false);
        playTone(740, 0.1, 'triangle', soundOn);

        if (updated.every((c) => c.matched)) {
          const efficiencyScore = Math.max(150, Math.min(380, 420 - nextMoves * 10));
          const duration = Date.now() - startedAtRef.current;
          setGameState('ROUND_SUMMARY');
          setSubmitting(true);
          onComplete(efficiencyScore, Math.max(duration, 6000), nextMoves)
            .then((res) => setRewardInfo(res))
            .finally(() => setSubmitting(false));
        }
      } else {
        timerRef.current = window.setTimeout(() => {
          setFlippedIds([]);
          setLocked(false);
        }, 650);
      }
    }
  };

  const matchedPairs = cards.filter((c) => c.matched).length / 2;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Memória Premiada</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Encontre os 8 pares com o menor número de jogadas · Até 380 pts</p>
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
            Vire duas cartas por vez para revelar pares idênticos. Quanto menos tentativas você usar, maior será sua pontuação verificada.
          </p>
          <button
            type="button"
            onClick={startGame}
            className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Embaralhar Cartas
          </button>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 px-4 py-2.5 rounded-lg">
            <span>
              Pares encontrados: <strong className="text-slate-900 dark:text-zinc-50 tabular-nums">{matchedPairs}/8</strong>
            </span>
            <span className="font-mono tabular-nums">Tentativas: {movesCount}</span>
          </div>

          <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
            {cards.map((card) => {
              const isRevealed = card.matched || flippedIds.includes(card.id);
              const { Icon } = card;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCardClick(card.id)}
                  disabled={gameState !== 'PLAYING' || isRevealed}
                  className={`h-20 sm:h-24 rounded-xl border flex flex-col items-center justify-center gap-1 transition-transform duration-150 active:scale-95 cursor-pointer disabled:cursor-default ${
                    card.matched
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-400'
                      : isRevealed
                        ? 'bg-white dark:bg-zinc-800 border-sky-500 text-slate-900 dark:text-zinc-50'
                        : 'bg-slate-900 dark:bg-zinc-950 border-slate-800 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 hover:bg-slate-800 dark:hover:bg-zinc-800'
                  }`}
                >
                  {isRevealed ? (
                    <>
                      <Icon className="w-6 h-6" />
                      <span className="text-[11px] font-medium">{card.label}</span>
                    </>
                  ) : (
                    <span className="font-display font-bold text-sm text-slate-400 dark:text-zinc-500">EE</span>
                  )}
                </button>
              );
            })}
          </div>

          {gameState === 'ROUND_SUMMARY' && (
            <div className="border-t border-slate-100 dark:border-zinc-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                    {submitting
                      ? 'Validando partida no sistema antifraude...'
                      : rewardInfo
                        ? `+${rewardInfo.credited} pontos creditados`
                        : 'Tabuleiro finalizado!'}
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
                Jogar Novamente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
