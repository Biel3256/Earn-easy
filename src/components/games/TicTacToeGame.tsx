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

type Cell = 'X' | 'O' | null;
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkWinner(board: Cell[]): { winner: Cell | 'DRAW'; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'DRAW', line: null };
  }
  return { winner: null, line: null };
}

function minimax(board: Cell[], depth: number, isMaximizing: boolean): number {
  const { winner } = checkWinner(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (winner === 'DRAW') return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, depth + 1, false));
        board[i] = null;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, depth + 1, true));
        board[i] = null;
      }
    }
    return best;
  }
}

function pickBotMove(board: Cell[], difficulty: 'balanced' | 'master'): number {
  const emptyIndices = board.map((v, idx) => (v === null ? idx : -1)).filter((idx) => idx !== -1);
  if (emptyIndices.length === 0) return -1;

  // Balanced gives 30% chance of heuristic/random move so players can win fairly with good strategy
  if (difficulty === 'balanced' && Math.random() < 0.35) {
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  }

  let bestScore = -Infinity;
  let bestMove = emptyIndices[0];
  for (const idx of emptyIndices) {
    board[idx] = 'O';
    const score = minimax(board, 0, false);
    board[idx] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }
  return bestMove;
}

export const TicTacToeGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [difficulty, setDifficulty] = useState<'balanced' | 'master'>('balanced');
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [resultLabel, setResultLabel] = useState<'X' | 'O' | 'DRAW' | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [movesCount, setMovesCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{ credited: number; verificationStatus: string; fraudReason: string } | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const botTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
    };
  }, []);

  const startGame = () => {
    if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
    setBoard(Array(9).fill(null));
    setIsPlayerTurn(true);
    setWinLine(null);
    setResultLabel(null);
    setRewardInfo(null);
    setMovesCount(0);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(520, 0.08, 'sine', soundOn);
  };

  const finishMatch = async (winner: 'X' | 'O' | 'DRAW', totalMoves: number) => {
    setResultLabel(winner);
    const rawDuration = Date.now() - startedAtRef.current;
    const baseScore =
      winner === 'X'
        ? difficulty === 'master'
          ? 240
          : 180
        : winner === 'DRAW'
          ? 85
          : 30;

    if (winner === 'X') playTone(740, 0.18, 'triangle', soundOn);
    else if (winner === 'DRAW') playTone(440, 0.14, 'sine', soundOn);
    else playTone(240, 0.18, 'sawtooth', soundOn);

    setGameState('ROUND_SUMMARY');
    setSubmitting(true);
    try {
      const res = await onComplete(baseScore, Math.max(rawDuration, 3500), Math.max(totalMoves, 1));
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCellClick = (index: number) => {
    if (gameState !== 'PLAYING' || !isPlayerTurn || board[index] !== null) return;

    const nextBoard = [...board];
    nextBoard[index] = 'X';
    const nextMoves = movesCount + 1;
    setBoard(nextBoard);
    setMovesCount(nextMoves);
    playTone(580, 0.06, 'sine', soundOn);

    const check = checkWinner(nextBoard);
    if (check.winner) {
      setWinLine(check.line);
      finishMatch(check.winner, nextMoves);
      return;
    }

    setIsPlayerTurn(false);
    botTimerRef.current = window.setTimeout(() => {
      const botIndex = pickBotMove([...nextBoard], difficulty);
      if (botIndex === -1) return;
      const afterBot = [...nextBoard];
      afterBot[botIndex] = 'O';
      setBoard(afterBot);
      playTone(410, 0.06, 'sine', soundOn);

      const botCheck = checkWinner(afterBot);
      if (botCheck.winner) {
        setWinLine(botCheck.line);
        finishMatch(botCheck.winner, nextMoves);
      } else {
        setIsPlayerTurn(true);
      }
    }, 450);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Jogo da Velha</h3>
          <p className="text-xs text-slate-500 mt-0.5">Vitória: até 240 pts · Empate: 85 pts · Participação: 30 pts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundOn((s) => !s)}
            aria-label={soundOn ? 'Desativar som' : 'Ativar som'}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Voltar ao Lobby
          </button>
        </div>
      </div>

      {gameState === 'TITLE_MENU' && (
        <div className="text-center py-6 space-y-6">
          <div className="max-w-md mx-auto space-y-2">
            <p className="text-sm text-slate-600 leading-relaxed">
              Enfrente a IA estratégica do Earn Easy. Complete linhas horizontais, verticais ou diagonais com <strong>X</strong> antes do oponente <strong>O</strong>.
            </p>
          </div>

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setDifficulty('balanced')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                difficulty === 'balanced'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Modo Padrão (180 pts)
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('master')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                difficulty === 'master'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Modo Mestre Minimax (240 pts)
            </button>
          </div>

          <button
            type="button"
            onClick={startGame}
            className="px-6 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
          >
            Iniciar Partida
          </button>
        </div>
      )}

      {(gameState === 'PLAYING' || gameState === 'ROUND_SUMMARY') && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 bg-slate-50 px-4 py-2.5 rounded-lg">
            <span>
              {gameState === 'PLAYING'
                ? isPlayerTurn
                  ? 'Sua vez (X)'
                  : 'IA analisando jogada (O)...'
                : resultLabel === 'X'
                  ? 'Você venceu a rodada!'
                  : resultLabel === 'DRAW'
                    ? 'Empate estratégico!'
                    : 'A IA venceu esta rodada'}
            </span>
            <span className="font-mono tabular-nums">Jogadas: {movesCount}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
            {board.map((cell, idx) => {
              const isWinCell = winLine?.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={gameState !== 'PLAYING' || !isPlayerTurn || cell !== null}
                  onClick={() => handleCellClick(idx)}
                  className={`h-24 rounded-xl border text-3xl font-extrabold flex items-center justify-center transition-transform duration-150 active:scale-95 cursor-pointer disabled:cursor-default ${
                    isWinCell
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cell === 'X' && <span className="text-slate-900">X</span>}
                  {cell === 'O' && <span className="text-sky-600">O</span>}
                </button>
              );
            })}
          </div>

          {gameState === 'ROUND_SUMMARY' && (
            <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 tabular-nums">
                    {submitting
                      ? 'Validando partida no sistema antifraude...'
                      : rewardInfo
                        ? `+${rewardInfo.credited} pontos creditados`
                        : 'Partida concluída'}
                  </p>
                  {rewardInfo && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
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
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
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
