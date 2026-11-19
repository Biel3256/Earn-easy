import React, { useMemo, useRef, useState } from 'react';
import { Lightbulb, RotateCcw, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

interface WordTheme {
  id: string;
  title: string;
  words: string[];
}

const THEMES: WordTheme[] = [
  {
    id: 'finance',
    title: 'Finanças & Pix',
    words: ['PIX', 'SALDO', 'LUCRO', 'RENDA', 'BANCO', 'MOEDA', 'SAQUE'],
  },
  {
    id: 'tech',
    title: 'Tecnologia & Segurança',
    words: ['NUVEM', 'DADOS', 'CODIGO', 'CHAVE', 'SENHA', 'REDE', 'TOKEN'],
  },
  {
    id: 'strategy',
    title: 'Jogos & Estratégia',
    words: ['PONTO', 'JOGADA', 'NIVEL', 'PREMIO', 'META', 'TABELA', 'VITORIA'],
  },
];

const GRID_SIZE = 10;
const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [0, -1],
];

interface PlacedWord {
  word: string;
  cells: [number, number][];
}

function buildPuzzle(words: string[]): { grid: string[][]; placed: PlacedWord[] } {
  const grid: string[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(''));
  const placed: PlacedWord[] = [];

  for (const rawWord of words) {
    const word = rawWord.toUpperCase();
    let done = false;
    for (let attempt = 0; attempt < 150 && !done; attempt++) {
      const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
      const r0 = Math.floor(Math.random() * GRID_SIZE);
      const c0 = Math.floor(Math.random() * GRID_SIZE);
      const rEnd = r0 + dr * (word.length - 1);
      const cEnd = c0 + dc * (word.length - 1);

      if (rEnd < 0 || rEnd >= GRID_SIZE || cEnd < 0 || cEnd >= GRID_SIZE) continue;

      let fits = true;
      const cells: [number, number][] = [];
      for (let i = 0; i < word.length; i++) {
        const r = r0 + dr * i;
        const c = c0 + dc * i;
        if (grid[r][c] !== '' && grid[r][c] !== word[i]) {
          fits = false;
          break;
        }
        cells.push([r, c]);
      }

      if (fits) {
        cells.forEach(([r, c], i) => {
          grid[r][c] = word[i];
        });
        placed.push({ word, cells });
        done = true;
      }
    }
  }

  const alphabet = 'ABCDEFGHIJLMNOPQRSTUVXZ';
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }

  return { grid, placed };
}

function getLineCells(start: [number, number], end: [number, number]): [number, number][] {
  const dr = end[0] - start[0];
  const dc = end[1] - start[1];
  const absR = Math.abs(dr);
  const absC = Math.abs(dc);

  if (dr !== 0 && dc !== 0 && absR !== absC) {
    return [start];
  }
  const steps = Math.max(absR, absC);
  const stepR = dr === 0 ? 0 : dr / absR;
  const stepC = dc === 0 ? 0 : dc / absC;
  const cells: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    cells.push([start[0] + stepR * i, start[1] + stepC * i]);
  }
  return cells;
}

export const WordSearchGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY'>('TITLE_MENU');
  const [themeIdx, setThemeIdx] = useState(0);
  const [seed, setSeed] = useState(0);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [foundCellKeys, setFoundCellKeys] = useState<Set<string>>(new Set());
  const [hintCellKey, setHintCellKey] = useState<string | null>(null);
  const [startCell, setStartCell] = useState<[number, number] | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [movesCount, setMovesCount] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{ credited: number; verificationStatus: string; fraudReason: string } | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  const theme = THEMES[themeIdx];
  const puzzle = useMemo(() => buildPuzzle(theme.words), [theme, seed]);

  const previewCells = useMemo(() => {
    if (!startCell || !hoverCell) return new Set<string>();
    return new Set(getLineCells(startCell, hoverCell).map(([r, c]) => `${r},${c}`));
  }, [startCell, hoverCell]);

  const startGame = (nextThemeIdx = themeIdx) => {
    setThemeIdx(nextThemeIdx);
    setSeed((s) => s + 1);
    setFoundWords([]);
    setFoundCellKeys(new Set());
    setHintCellKey(null);
    setStartCell(null);
    setHoverCell(null);
    setMovesCount(0);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(500, 0.08, 'sine', soundOn);
  };

  const handleCellClick = async (r: number, c: number) => {
    if (gameState !== 'PLAYING') return;
    if (!startCell) {
      setStartCell([r, c]);
      setHoverCell([r, c]);
      playTone(460, 0.04, 'sine', soundOn);
      return;
    }

    const line = getLineCells(startCell, [r, c]);
    const nextMoves = movesCount + 1;
    setMovesCount(nextMoves);
    setStartCell(null);
    setHoverCell(null);

    const selectedStr = line.map(([lr, lc]) => puzzle.grid[lr][lc]).join('');
    const reversedStr = selectedStr.split('').reverse().join('');

    const matched = puzzle.placed.find(
      (p) => !foundWords.includes(p.word) && (p.word === selectedStr || p.word === reversedStr)
    );

    if (matched) {
      const nextFound = [...foundWords, matched.word];
      const nextKeys = new Set(foundCellKeys);
      line.forEach(([lr, lc]) => nextKeys.add(`${lr},${lc}`));
      setFoundWords(nextFound);
      setFoundCellKeys(nextKeys);
      setHintCellKey(null);
      playTone(720, 0.12, 'triangle', soundOn);

      if (nextFound.length === puzzle.placed.length) {
        const totalScore = Math.min(450, nextFound.length * 50 + 100);
        const duration = Date.now() - startedAtRef.current;
        setGameState('ROUND_SUMMARY');
        setSubmitting(true);
        try {
          const res = await onComplete(totalScore, Math.max(duration, 6000), nextMoves);
          setRewardInfo(res);
        } finally {
          setSubmitting(false);
        }
      }
    } else {
      playTone(260, 0.07, 'sine', soundOn);
    }
  };

  const revealHint = () => {
    const remaining = puzzle.placed.find((p) => !foundWords.includes(p.word));
    if (!remaining) return;
    const [r, c] = remaining.cells[0];
    setHintCellKey(`${r},${c}`);
    playTone(580, 0.07, 'sine', soundOn);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 max-w-3xl mx-auto select-none">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Caça-Palavras</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">+50 pts por palavra encontrada + 100 pts de conclusão · Até 450 pts</p>
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
            Clique na <strong>primeira letra</strong> e depois na <strong>última letra</strong> de cada palavra (horizontal, vertical ou diagonal) para marcá-la no quadro.
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {THEMES.map((t, idx) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setThemeIdx(idx)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  themeIdx === idx
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                    : 'bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800'
                }`}
              >
                {t.title} ({t.words.length} palavras)
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => startGame(themeIdx)}
            className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Gerar Tabuleiro
          </button>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-start">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-10 gap-1 w-fit mx-auto bg-slate-100 dark:bg-black p-2 rounded-xl border border-slate-200 dark:border-zinc-800">
              {puzzle.grid.map((row, r) =>
                row.map((letter, c) => {
                  const key = `${r},${c}`;
                  const isStart = startCell?.[0] === r && startCell?.[1] === c;
                  const isPreview = previewCells.has(key);
                  const isFound = foundCellKeys.has(key);
                  const isHint = hintCellKey === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCellClick(r, c)}
                      onMouseEnter={() => startCell && setHoverCell([r, c])}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-md font-display font-bold text-base flex items-center justify-center transition-colors cursor-pointer ${
                        isFound
                          ? 'bg-emerald-600 text-white'
                          : isStart || isPreview
                            ? 'bg-sky-600 text-white'
                            : isHint
                              ? 'bg-amber-200 dark:bg-amber-700 text-amber-950 dark:text-amber-50 ring-2 ring-amber-500'
                              : 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">{theme.title}</span>
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-zinc-400">
                {foundWords.length}/{puzzle.placed.length}
              </span>
            </div>

            <ul className="space-y-1.5">
              {puzzle.placed.map((p) => {
                const found = foundWords.includes(p.word);
                return (
                  <li
                    key={p.word}
                    className={`text-sm font-mono px-2.5 py-1.5 rounded-md border ${
                      found
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 line-through'
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200'
                    }`}
                  >
                    {p.word}
                  </li>
                );
              })}
            </ul>

            {gameState === 'PLAYING' && (
              <button
                type="button"
                onClick={revealHint}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                Dica (1ª letra)
              </button>
            )}
          </div>
        </div>
      )}

      {gameState === 'ROUND_SUMMARY' && (
        <div className="border-t border-slate-100 dark:border-zinc-800 pt-5 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
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
                    : 'Caça-Palavras concluído!'}
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
            onClick={() => startGame((themeIdx + 1) % THEMES.length)}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Novo Tema
          </button>
        </div>
      )}
    </div>
  );
};
