import React, { useRef, useState } from 'react';
import { ArrowLeft, Play, RotateCcw, ShieldCheck, Sparkles, Trophy } from 'lucide-react';

type Cell = 0 | 1;
type Shape = { cells: Array<[number, number]>; color: string };
interface Props {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{ credited: number; verificationStatus: string; fraudReason: string }>;
  onExit: () => void;
}
const SIZE = 8;
const SHAPES: Shape[] = [
  { cells: [[0,0],[0,1],[1,0],[1,1]], color: 'bg-sky-400' },
  { cells: [[0,0],[0,1],[0,2],[0,3]], color: 'bg-violet-400' },
  { cells: [[0,0],[1,0],[2,0],[3,0]], color: 'bg-violet-400' },
  { cells: [[0,0],[1,0],[2,0],[2,1]], color: 'bg-amber-400' },
  { cells: [[0,1],[1,1],[2,0],[2,1]], color: 'bg-amber-400' },
  { cells: [[0,0],[0,1],[0,2],[1,1]], color: 'bg-pink-400' },
  { cells: [[0,0],[0,1],[1,1],[1,2]], color: 'bg-emerald-400' },
  { cells: [[0,0],[0,1],[0,2]], color: 'bg-cyan-400' },
  { cells: [[0,0]], color: 'bg-rose-400' },
  { cells: [[0,0],[1,0],[2,0],[2,1],[2,2]], color: 'bg-orange-400' },
];
const emptyBoard = (): Cell[][] => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0));
const randomTray = (): Shape[] => Array.from({ length: 3 }, () => SHAPES[Math.floor(Math.random() * SHAPES.length)]);
const rewardFor = (score: number) => Math.min(60, Math.floor(score / 500) * 3);
function canPlace(board: Cell[][], shape: Shape, start: number) {
  const row = Math.floor(start / SIZE), col = start % SIZE;
  return shape.cells.every(([r,c]) => row + r < SIZE && col + c < SIZE && board[row + r][col + c] === 0);
}

export const BlockBlastGame: React.FC<Props> = ({ onComplete, onExit }) => {
  const [phase, setPhase] = useState<'ready'|'playing'|'finished'>('ready');
  const [board, setBoard] = useState<Cell[][]>(emptyBoard);
  const [tray, setTray] = useState<Shape[]>(randomTray);
  const [selected, setSelected] = useState<number|null>(null);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [lines, setLines] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{credited:number;verificationStatus:string;fraudReason:string}|null>(null);
  const startedAt = useRef(0);
  const finishing = useRef(false);

  const startGame = () => {
    setBoard(emptyBoard()); setTray(randomTray()); setSelected(null);
    setScore(0); setMoves(0); setLines(0); setResult(null);
    finishing.current = false; startedAt.current = Date.now(); setPhase('playing');
  };

  const finishGame = async (finalScore:number, totalMoves:number) => {
    if (finishing.current) return;
    finishing.current = true; setPhase('finished'); setSelected(null);
    const reward = rewardFor(finalScore);
    if (reward < 3) {
      setResult({ credited:0, verificationStatus:'verified', fraudReason:'Faça pelo menos 500 pontos para receber moedas.' });
      return;
    }
    setSubmitting(true);
    try {
      setResult(await onComplete(reward, Date.now() - startedAt.current, Math.max(1,totalMoves)));
    } catch (error) {
      setResult({ credited:0, verificationStatus:'rejected', fraudReason:error instanceof Error ? error.message : 'Não foi possível registrar os pontos.' });
    } finally { setSubmitting(false); }
  };

  const placePiece = (pieceIndex:number, start:number) => {
    if (phase !== 'playing' || !tray[pieceIndex]) return;
    const piece = tray[pieceIndex];
    if (!canPlace(board,piece,start)) return;
    const next = board.map(row => row.slice());
    const baseRow = Math.floor(start/SIZE), baseCol = start%SIZE;
    piece.cells.forEach(([r,c]) => { next[baseRow+r][baseCol+c]=1; });
    const fullRows = next.map((row,i)=>row.every(cell=>cell===1)?i:-1).filter(i=>i>=0);
    const fullCols = Array.from({length:SIZE},(_,c)=>c).filter(c=>next.every(row=>row[c]===1));
    fullRows.forEach(r=>{ for(let c=0;c<SIZE;c++) next[r][c]=0; });
    fullCols.forEach(c=>{ for(let r=0;r<SIZE;r++) next[r][c]=0; });
    const nextScore=score+piece.cells.length*10+(fullRows.length+fullCols.length)*100;
    const nextMoves=moves+1;
    const remaining=tray.filter((_,i)=>i!==pieceIndex);
    const nextTray=remaining.length?remaining:randomTray();
    setBoard(next); setScore(nextScore); setMoves(nextMoves);
    setLines(value=>value+fullRows.length+fullCols.length);
    setTray(nextTray); setSelected(null);
    const hasMove=nextTray.some(shape=>Array.from({length:SIZE*SIZE},(_,i)=>i).some(i=>canPlace(next,shape,i)));
    if(!hasMove) void finishGame(nextScore,nextMoves);
  };

  const reward=rewardFor(score);
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onExit} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 dark:border-zinc-700 px-3 py-2 text-sm font-bold text-slate-700 dark:text-zinc-200"><ArrowLeft className="h-4 w-4"/>Voltar aos jogos</button>
        <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-xs font-bold text-lime-600 dark:text-lime-300">BLOCK BLAST</span>
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-[#0e1319] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Block Blast</h2><p className="text-xs text-slate-500 dark:text-zinc-400">Encaixe as peças e complete linhas e colunas.</p></div>
          <div className="rounded-2xl bg-lime-400/15 px-4 py-2 text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Pontuação</div><div className="font-mono text-2xl font-black text-emerald-700 dark:text-lime-300">{score.toLocaleString('pt-BR')}</div></div>
        </div>
        {phase==='ready' && <div className="rounded-2xl border border-dashed border-lime-400/40 bg-lime-400/5 px-5 py-10 text-center"><div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-400/15 text-4xl">🧩</div><h3 className="text-xl font-extrabold text-slate-900 dark:text-white">Prepare suas peças!</h3><p className="mx-auto mt-2 max-w-sm text-sm text-slate-600 dark:text-zinc-300">Selecione uma peça e toque no tabuleiro para encaixar. No computador, também pode arrastar. Complete linhas ou colunas para liberar espaço.</p><button type="button" onClick={startGame} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-lime-400 px-6 py-3 font-extrabold text-slate-950 hover:bg-lime-300"><Play className="h-4 w-4 fill-current"/>Começar partida</button></div>}
        {phase!=='ready' && <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-100 p-3 text-center dark:bg-zinc-900"><div className="text-[10px] uppercase text-slate-500">Linhas</div><b className="text-lg text-slate-900 dark:text-white">{lines}</b></div>
            <div className="rounded-xl bg-slate-100 p-3 text-center dark:bg-zinc-900"><div className="text-[10px] uppercase text-slate-500">Jogadas</div><b className="text-lg text-slate-900 dark:text-white">{moves}</b></div>
            <div className="rounded-xl bg-slate-100 p-3 text-center dark:bg-zinc-900"><div className="text-[10px] uppercase text-slate-500">Earn Easy</div><b className="text-lg text-emerald-700 dark:text-lime-300">{reward}</b></div>
          </div>
          <div className="mx-auto grid w-full max-w-[480px] grid-cols-8 gap-1 rounded-2xl border border-slate-200 bg-slate-200 p-2 dark:border-zinc-700 dark:bg-[#080d12] sm:gap-1.5 sm:p-3">
            {board.flatMap((row,ri)=>row.map((cell,ci)=>{
              const index=ri*SIZE+ci;
              const valid=phase==='playing' && selected!==null && canPlace(board,tray[selected],index);
              return <button key={index} type="button" disabled={phase!=='playing'||selected===null} onClick={()=>selected!==null&&placePiece(selected,index)} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const p=Number(event.dataTransfer.getData('text/plain'));if(Number.isInteger(p))placePiece(p,index);}} aria-label={'Casa '+(index+1)} className={'aspect-square min-w-0 rounded-[4px] border transition-colors '+(cell?'border-lime-300 bg-lime-400 shadow-inner':valid?'border-lime-400/60 bg-lime-400/20':'border-slate-300/70 bg-white dark:border-zinc-700 dark:bg-[#17212c]')}/>;
            }))}
          </div>
          {phase==='playing' && <div className="mt-5"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-slate-600 dark:text-zinc-300">Suas próximas peças</span><span className="text-[10px] text-slate-500">Selecione ou arraste</span></div><div className="grid grid-cols-3 gap-2 sm:gap-4">{tray.map((piece,index)=><button key={index} type="button" draggable onDragStart={event=>{event.dataTransfer.setData('text/plain',String(index));setSelected(index);}} onClick={()=>setSelected(index)} className={'flex min-h-24 items-center justify-center rounded-2xl border p-2 transition-all '+(selected===index?'border-lime-400 bg-lime-400/15 ring-2 ring-lime-400/30':'border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900')}><div className="grid grid-cols-4 gap-1">{Array.from({length:16},(_,i)=>{const r=Math.floor(i/4),c=i%4;const filled=piece.cells.some(([pr,pc])=>pr===r&&pc===c);return <span key={i} className={'h-3.5 w-3.5 rounded-[3px] sm:h-4 sm:w-4 '+(filled?piece.color:'bg-transparent')}/>;})}</div></button>)}</div></div>}
          {phase==='finished' && <div className="mt-5 rounded-2xl border border-lime-400/30 bg-lime-400/5 p-5 text-center"><Trophy className="mx-auto h-9 w-9 text-amber-400"/><h3 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">Fim de jogo!</h3><p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">Você fez {score.toLocaleString('pt-BR')} pontos.</p><div className="mt-3 text-2xl font-black text-emerald-700 dark:text-lime-300">+{result?.credited??0} pontos Earn Easy</div>{submitting&&<p className="mt-2 text-xs text-slate-500">Validando sua recompensa...</p>}{result&&<div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-zinc-300"><ShieldCheck className="h-4 w-4 text-emerald-500"/>{result.verificationStatus==='verified'?result.fraudReason||'Partida registrada com sucesso.':result.fraudReason||'Partida não validada.'}</div>}<button type="button" onClick={startGame} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-lime-400 px-5 py-2.5 font-extrabold text-slate-950 hover:bg-lime-300"><RotateCcw className="h-4 w-4"/>Jogar novamente</button></div>}
        </>}
        <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-zinc-900 dark:text-zinc-300"><div className="mb-1 flex items-center gap-1.5 font-bold"><Sparkles className="h-3.5 w-3.5 text-amber-400"/>Recompensas por partida</div>500 pontos = 3 · 1.000 = 6 · 2.000 = 12 · 5.000 = 30 · 10.000 = 60 pontos Earn Easy.</div>
      </div>
    </section>
  );
};
