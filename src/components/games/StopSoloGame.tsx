import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, RefreshCw, RotateCcw, ShieldCheck, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { playTone } from '../../utils/antifraud';

interface GameProps {
  onComplete: (score: number, durationMs: number, movesCount: number) => Promise<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  }>;
  onExit: () => void;
}

type CategoryKey = 'nome' | 'animal' | 'fruta' | 'lugar' | 'objeto' | 'cor';
type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';
type StopMode = 'classico' | 'turbo';

const CATEGORIES: Array<{ key: CategoryKey; label: string; placeholder: string }> = [
  { key: 'nome', label: 'Nome', placeholder: 'Ex: Ana, Bruno...' },
  { key: 'animal', label: 'Animal', placeholder: 'Ex: Arara, Baleia...' },
  { key: 'fruta', label: 'Fruta / Comida', placeholder: 'Ex: Abacaxi, Bolo...' },
  { key: 'lugar', label: 'Cidade / País', placeholder: 'Ex: Alemanha, Bahia...' },
  { key: 'objeto', label: 'Objeto', placeholder: 'Ex: Anel, Bola...' },
  { key: 'cor', label: 'Cor', placeholder: 'Ex: Azul, Branco...' },
];

const STOP_DICT: Record<string, Record<CategoryKey, string[]>> = {
  A: {
    nome: ['Ana', 'Arthur', 'Alice', 'André', 'Amanda'],
    animal: ['Arara', 'Anta', 'Abelha', 'Águia', 'Alce'],
    fruta: ['Abacaxi', 'Abacate', 'Amora', 'Ameixa', 'Arroz'],
    lugar: ['Alemanha', 'Argentina', 'Aracaju', 'Acre', 'Angola'],
    objeto: ['Anel', 'Apito', 'Armário', 'Agulha', 'Abajur'],
    cor: ['Azul', 'Amarelo', 'Anil', 'Âmbar'],
  },
  B: {
    nome: ['Bruno', 'Beatriz', 'Bianca', 'Beto', 'Bárbara'],
    animal: ['Baleia', 'Bode', 'Borboleta', 'Búfalo', 'Beija-flor'],
    fruta: ['Banana', 'Batata', 'Bolo', 'Brócolis', 'Biscoito'],
    lugar: ['Brasil', 'Bahia', 'Bélgica', 'Brasília', 'Belém'],
    objeto: ['Bola', 'Balde', 'Banco', 'Botão', 'Bússola'],
    cor: ['Branco', 'Bege', 'Bordô', 'Bronze'],
  },
  C: {
    nome: ['Carlos', 'Camila', 'Caio', 'Clara', 'Carolina'],
    animal: ['Cachorro', 'Cavalo', 'Camelo', 'Coruja', 'Capivara'],
    fruta: ['Caju', 'Cereja', 'Coco', 'Carambola', 'Chocolate'],
    lugar: ['Canadá', 'Chile', 'Curitiba', 'Ceará', 'Colômbia'],
    objeto: ['Cadeira', 'Caneta', 'Copo', 'Chave', 'Caderno'],
    cor: ['Cinza', 'Ciano', 'Caramelo', 'Carmim'],
  },
  D: {
    nome: ['Daniel', 'Diego', 'Diana', 'Davi', 'Danilo'],
    animal: ['Dinossauro', 'Dromedário', 'Dragão', 'Doninha', 'Dourado'],
    fruta: ['Damasco', 'Dendê', 'Doce', 'Dobradinha'],
    lugar: ['Dinamarca', 'Dubai', 'Diamantina', 'Diadema'],
    objeto: ['Dado', 'Dicionário', 'Disco', 'Dedal', 'Dominó'],
    cor: ['Dourado', 'Damasco'],
  },
  E: {
    nome: ['Eduardo', 'Elena', 'Enzo', 'Elisa', 'Eduarda'],
    animal: ['Elefante', 'Esquilo', 'Ema', 'Escorpião', 'Estrela-do-mar'],
    fruta: ['Ervilha', 'Empada', 'Espinafre', 'Esfiha'],
    lugar: ['Espanha', 'Egito', 'Equador', 'Escócia', 'Estados Unidos'],
    objeto: ['Escova', 'Espelho', 'Escada', 'Envelope', 'Estante'],
    cor: ['Esmeralda', 'Escarlate'],
  },
  F: {
    nome: ['Felipe', 'Fernanda', 'Fábio', 'Flávia', 'Francisco'],
    animal: ['Foca', 'Falcão', 'Flamingo', 'Formiga', 'Furão'],
    fruta: ['Figo', 'Framboesa', 'Feijão', 'Farofa', 'Frango'],
    lugar: ['França', 'Fortaleza', 'Florianópolis', 'Finlândia'],
    objeto: ['Faca', 'Fio', 'Fogão', 'Fivela', 'Fone'],
    cor: ['Fúcsia', 'Ferrugem'],
  },
  G: {
    nome: ['Gabriel', 'Gustavo', 'Gabriela', 'Giovanna', 'Guilherme'],
    animal: ['Gato', 'Girafa', 'Galo', 'Gorila', 'Gavião'],
    fruta: ['Goiaba', 'Graviola', 'Groselha', 'Gelatina'],
    lugar: ['Grécia', 'Goiás', 'Gramado', 'Guatemala', 'Goiânia'],
    objeto: ['Garfo', 'Garrafa', 'Gaveta', 'Guitarra', 'Gorro'],
    cor: ['Grafite', 'Grená', 'Gelo'],
  },
  J: {
    nome: ['João', 'Júlia', 'Juliana', 'Jorge', 'Jéssica'],
    animal: ['Jacaré', 'Jaguar', 'Jabuti', 'Joaninha', 'Jiboia'],
    fruta: ['Jaca', 'Jabuticaba', 'Jambo', 'Jenipapo'],
    lugar: ['Japão', 'Jamaica', 'João Pessoa', 'Joinville'],
    objeto: ['Janela', 'Jarra', 'Jornal', 'Jaqueta', 'Joia'],
    cor: ['Jade', 'Jambo'],
  },
  L: {
    nome: ['Lucas', 'Larissa', 'Leonardo', 'Luana', 'Letícia'],
    animal: ['Leão', 'Lobo', 'Lagarto', 'Lontra', 'Leopardo'],
    fruta: ['Laranja', 'Limão', 'Lichia', 'Lasanha'],
    lugar: ['Londres', 'Lisboa', 'Lima', 'Londrina'],
    objeto: ['Lápis', 'Livro', 'Lâmpada', 'Lanterna', 'Lixeira'],
    cor: ['Lilás', 'Laranja', 'Lavanda'],
  },
  M: {
    nome: ['Marcos', 'Mariana', 'Mateus', 'Maria', 'Marcelo'],
    animal: ['Macaco', 'Morcego', 'Mula', 'Marreco', 'Mico'],
    fruta: ['Maçã', 'Manga', 'Melancia', 'Morango', 'Melão'],
    lugar: ['México', 'Minas Gerais', 'Manaus', 'Madrid', 'Maranhão'],
    objeto: ['Mesa', 'Martelo', 'Mochila', 'Moeda', 'Microfone'],
    cor: ['Marrom', 'Magenta', 'Mostarda'],
  },
  P: {
    nome: ['Pedro', 'Paula', 'Paulo', 'Patrícia', 'Priscila'],
    animal: ['Pato', 'Papagaio', 'Pantera', 'Pinguim', 'Peixe'],
    fruta: ['Pera', 'Pêssego', 'Pitanga', 'Pizza', 'Pão'],
    lugar: ['Portugal', 'Paraná', 'Paris', 'Peru', 'Porto Alegre'],
    objeto: ['Prato', 'Pente', 'Porta', 'Panela', 'Pincel'],
    cor: ['Preto', 'Prata', 'Púrpura'],
  },
  R: {
    nome: ['Rafael', 'Renata', 'Rodrigo', 'Raquel', 'Ricardo'],
    animal: ['Rato', 'Raposa', 'Rinoceronte', 'Rouxinol', 'Rã'],
    fruta: ['Romã', 'Rúcula', 'Risoto', 'Rabanete'],
    lugar: ['Recife', 'Rússia', 'Roma', 'Rondônia', 'Roraima'],
    objeto: ['Relógio', 'Rádio', 'Régua', 'Roda', 'Rede'],
    cor: ['Rosa', 'Roxo', 'Rubro'],
  },
  S: {
    nome: ['Samuel', 'Sofia', 'Sérgio', 'Sabrina', 'Sandra'],
    animal: ['Sapo', 'Serpente', 'Sagui', 'Salmão', 'Sabiá'],
    fruta: ['Salada', 'Sopa', 'Siriguela', 'Sorvete'],
    lugar: ['Salvador', 'Suíça', 'São Paulo', 'Suécia', 'Sergipe'],
    objeto: ['Sofá', 'Sapato', 'Sino', 'Sacola', 'Selo'],
    cor: ['Salmão', 'Sépia'],
  },
  T: {
    nome: ['Thiago', 'Tatiana', 'Tomás', 'Teresa', 'Tiago'],
    animal: ['Tigre', 'Tartaruga', 'Tucano', 'Tatu', 'Tubarão'],
    fruta: ['Tangerina', 'Tomate', 'Tamarindo', 'Torta'],
    lugar: ['Tóquio', 'Turquia', 'Tocantins', 'Toronto', 'Teresina'],
    objeto: ['Tapete', 'Tesoura', 'Tábua', 'Travesseiro', 'Teclado'],
    cor: ['Turquesa', 'Terracota'],
  },
  V: {
    nome: ['Vinícius', 'Vanessa', 'Vitor', 'Vitória', 'Valéria'],
    animal: ['Vaca', 'Veado', 'Vespa', 'Vagalume'],
    fruta: ['Vagem', 'Vatapá', 'Vitamina'],
    lugar: ['Venezuela', 'Vitória', 'Veneza', 'Viena'],
    objeto: ['Vaso', 'Vela', 'Violão', 'Vassoura', 'Ventilador'],
    cor: ['Verde', 'Vermelho', 'Violeta'],
  },
};

const LETTERS = Object.keys(STOP_DICT);

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isReasonableWord(word: string, targetNorm: string): boolean {
  const norm = normalizeText(word);
  if (norm.length < 2 || !norm.startsWith(targetNorm)) return false;
  if (!/^[a-z\s-]+$/.test(norm)) return false;
  // Evita letras repetidas tipo "aaaa"
  if (/^(.)\1+$/.test(norm.replace(/\s+/g, ''))) return false;
  return true;
}

interface RoundResultRow {
  label: string;
  playerWord: string;
  cpuWord: string;
  points: number;
  note: string;
}

export const StopSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [mode, setMode] = useState<StopMode>('classico');
  const [letter, setLetter] = useState('A');
  const [usedReroll, setUsedReroll] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [answers, setAnswers] = useState<Record<CategoryKey, string>>({
    nome: '',
    animal: '',
    fruta: '',
    lugar: '',
    objeto: '',
    cor: '',
  });
  const [results, setResults] = useState<RoundResultRow[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [rewardInfo, setRewardInfo] = useState<{
    credited: number;
    verificationStatus: string;
    fraudReason: string;
  } | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const roundSeconds = mode === 'turbo' ? 40 : 60;

  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    if (timeLeft <= 0) {
      handleSubmitStop();
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [gameState, timeLeft]);

  const validLiveCount = useMemo(() => {
    const targetNorm = normalizeText(letter);
    return CATEGORIES.filter((c) => isReasonableWord(answers[c.key] || '', targetNorm)).length;
  }, [answers, letter]);

  const hasTypedAnything = useMemo(
    () => Object.values(answers).some((v) => v.trim().length > 0),
    [answers]
  );

  const startGame = () => {
    const nextLetter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    setLetter(nextLetter);
    setUsedReroll(false);
    setTimeLeft(roundSeconds);
    setAnswers({ nome: '', animal: '', fruta: '', lugar: '', objeto: '', cor: '' });
    setResults([]);
    setFinalScore(0);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(580, 0.08, 'sine', soundOn);
  };

  const handleRerollLetter = () => {
    if (usedReroll || hasTypedAnything || gameState !== 'PLAYING') return;
    const otherLetters = LETTERS.filter((l) => l !== letter);
    const nextLetter = otherLetters[Math.floor(Math.random() * otherLetters.length)];
    setLetter(nextLetter);
    setUsedReroll(true);
    playTone(640, 0.07, 'sine', soundOn);
  };

  const handleSubmitStop = async () => {
    if (gameState !== 'PLAYING') return;
    const rawDuration = Date.now() - startedAtRef.current;
    const targetNorm = normalizeText(letter);
    const dict = STOP_DICT[letter] || STOP_DICT.A;
    const curAnswers = answersRef.current;

    let validCount = 0;
    let totalEarned = 0;
    const rows: RoundResultRow[] = CATEGORIES.map((cat) => {
      const playerRaw = (curAnswers[cat.key] || '').trim();
      const playerNorm = normalizeText(playerRaw);
      const cpuOptions = dict[cat.key] || ['—'];
      const cpuPick = cpuOptions[Math.floor(Math.random() * cpuOptions.length)];
      const cpuNorm = normalizeText(cpuPick);

      const isValid = isReasonableWord(playerRaw, targetNorm);
      let pts = 0;
      let note = 'Inválida / Vazia';
      if (isValid) {
        validCount++;
        if (playerNorm === cpuNorm) {
          pts = 30;
          note = 'Igual à IA';
        } else {
          pts = 50;
          note = 'Exclusiva!';
        }
      }
      totalEarned += pts;
      return {
        label: cat.label,
        playerWord: playerRaw || '—',
        cpuWord: cpuPick,
        points: pts,
        note,
      };
    });

    const modeBonus = mode === 'turbo' && validCount >= 4 ? 25 : 0;
    const speedBonus = validCount >= 4 && timeLeft > 8 ? Math.min(60, timeLeft) : 0;
    const score = Math.min(360, Math.max(40, totalEarned + speedBonus + modeBonus));

    setResults(rows);
    setFinalScore(score);
    setGameState('ROUND_SUMMARY');

    if (validCount >= 4) {
      playTone(760, 0.16, 'triangle', soundOn);
    } else {
      playTone(440, 0.12, 'sine', soundOn);
    }

    setSubmitting(true);
    try {
      const res = await onComplete(
        score,
        Math.max(rawDuration, 6000),
        Math.max(validCount, 1)
      );
      setRewardInfo(res);
    } finally {
      setSubmitting(false);
    }
  };

  const timePct = Math.max(0, Math.min(100, (timeLeft / roundSeconds) * 100));
  const targetNorm = normalizeText(letter);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Stop Solo</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            15 letras sorteadas, validação ao vivo e modo Turbo · Até 360 moedas
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
            Sorteie uma letra e preencha os 6 temas antes do tempo acabar. Palavras inéditas que a IA não escolheu valem <strong>50 pts</strong> cada!
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setMode('classico')}
              className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                mode === 'classico'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold">Clássico (60s)</div>
              <div className="text-[11px] opacity-80">Mais calma para pensar</div>
            </button>
            <button
              type="button"
              onClick={() => setMode('turbo')}
              className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                mode === 'turbo'
                  ? 'bg-lime-400 text-slate-950 border-lime-300'
                  : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="text-xs font-extrabold flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                Turbo (40s · +25 pts)
              </div>
              <div className="text-[11px] opacity-80">Bônus por agilidade</div>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={startGame}
              className="min-h-[46px] px-7 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm cursor-pointer"
            >
              Sortear Letra e Jogar
            </button>
          </div>
        </div>
      )}

      {gameState === 'PLAYING' && (
        <div className="space-y-4">
          <div className="space-y-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-lime-400 text-slate-950 font-display text-2xl font-black flex items-center justify-center shadow-sm">
                  {letter}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                    Letra: {letter} · {validLiveCount}/6 válidas
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Todas devem começar com {letter}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {!usedReroll && !hasTypedAnything && (
                  <button
                    type="button"
                    onClick={handleRerollLetter}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-[11px] font-bold text-slate-700 dark:text-zinc-200 hover:border-lime-400 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Trocar Letra (1x)
                  </button>
                )}
                <div
                  className={`inline-flex items-center gap-1.5 font-mono text-sm font-extrabold tabular-nums ${
                    timeLeft <= 10 ? 'text-rose-500' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  {timeLeft}s
                </div>
              </div>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  timeLeft <= 10 ? 'bg-rose-500' : 'bg-lime-400'
                }`}
                style={{ width: `${timePct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => {
              const val = answers[cat.key];
              const isValid = isReasonableWord(val, targetNorm);
              return (
                <label key={cat.key} className="space-y-1 block">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-zinc-300">
                      {cat.label}
                    </span>
                    {val.trim().length > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                          isValid ? 'text-emerald-600 dark:text-lime-400' : 'text-amber-500'
                        }`}
                      >
                        {isValid ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Válida
                          </>
                        ) : (
                          `Comece com ${letter}`
                        )}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={val}
                    maxLength={32}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [cat.key]: e.target.value }))
                    }
                    placeholder={cat.placeholder}
                    className={`w-full rounded-xl border bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 ${
                      isValid
                        ? 'border-emerald-400 focus:ring-lime-400'
                        : 'border-slate-300 dark:border-zinc-700 focus:ring-lime-400'
                    }`}
                  />
                </label>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSubmitStop}
            className="w-full min-h-[46px] py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            STOP! Finalizar ({validLiveCount}/6 preenchidas)
          </button>
        </div>
      )}

      {gameState === 'ROUND_SUMMARY' && (
        <div className="space-y-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Categoria</th>
                  <th className="py-2.5 px-3 font-semibold">Sua Resposta</th>
                  <th className="py-2.5 px-3 font-semibold">IA</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Pontos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {results.map((r) => (
                  <tr key={r.label}>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-zinc-200">{r.label}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-zinc-300">
                      <div>{r.playerWord}</div>
                      <div className="text-[10px] text-slate-400">{r.note}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-zinc-400">{r.cpuWord}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-bold ${
                        r.points > 0 ? 'text-emerald-600 dark:text-lime-400' : 'text-slate-400'
                      }`}
                    >
                      +{r.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                  {submitting
                    ? `Calculando (${finalScore} pts)...`
                    : rewardInfo
                      ? `+${rewardInfo.credited} moedas creditadas`
                      : `Pontuação: ${finalScore}`}
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
              Nova Letra
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
