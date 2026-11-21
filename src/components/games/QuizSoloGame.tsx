import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Flame,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Timer,
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

type QuizTheme =
  | 'Todos'
  | 'Ciências & Tech'
  | 'Brasil & Geografia'
  | 'Lógica & Matemática'
  | 'Cultura & Atualidades';

interface QuizQuestion {
  id: string;
  q: string;
  options: string[];
  answer: number;
  theme: Exclude<QuizTheme, 'Todos'>;
  category: string;
  explanation: string;
}

const SEEN_STORAGE_KEY = 'earneasy_quiz_solo_seen';

const QUIZ_BANK: QuizQuestion[] = [
  // Ciências & Tech (14)
  {
    id: 'ct1',
    q: 'Qual é o maior planeta do Sistema Solar?',
    options: ['Saturno', 'Júpiter', 'Netuno', 'Marte'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Astronomia',
    explanation: 'Júpiter é um gigante gasoso com mais de 11 vezes o diâmetro da Terra.',
  },
  {
    id: 'ct2',
    q: 'Qual é a fórmula química da água?',
    options: ['CO2', 'H2O', 'O2', 'NaCl'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Química',
    explanation: 'Cada molécula de água combina dois átomos de hidrogênio e um de oxigênio.',
  },
  {
    id: 'ct3',
    q: 'Qual gás os vegetais absorvem principalmente na fotossíntese?',
    options: ['Oxigênio', 'Gás Carbônico', 'Nitrogênio', 'Hélio'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Biologia',
    explanation: 'As plantas usam CO₂, água e luz solar para produzir glicose e liberar oxigênio.',
  },
  {
    id: 'ct4',
    q: 'Qual linguagem é executada nativamente nos navegadores web junto com HTML e CSS?',
    options: ['JavaScript', 'C++', 'Rust', 'Cobol'],
    answer: 0,
    theme: 'Ciências & Tech',
    category: 'Tecnologia',
    explanation: 'JavaScript é a linguagem padrão interpretada diretamente pelos navegadores modernos.',
  },
  {
    id: 'ct5',
    q: 'Em informática, quantos bits formam 1 byte?',
    options: ['4', '8', '16', '32'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Tecnologia',
    explanation: 'Um byte equivale a 8 bits, permitindo representar 256 valores distintos.',
  },
  {
    id: 'ct6',
    q: 'Qual planeta é conhecido como Planeta Vermelho?',
    options: ['Vênus', 'Marte', 'Mercúrio', 'Urano'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Astronomia',
    explanation: 'O solo rico em óxido de ferro dá a Marte sua aparência avermelhada.',
  },
  {
    id: 'ct7',
    q: 'Qual elemento químico tem símbolo "Au" na tabela periódica?',
    options: ['Prata', 'Alumínio', 'Ouro', 'Cobre'],
    answer: 2,
    theme: 'Ciências & Tech',
    category: 'Química',
    explanation: 'O símbolo Au vem do latim "aurum", que significa ouro.',
  },
  {
    id: 'ct8',
    q: 'Qual vitamina o corpo humano sintetiza com auxílio da luz solar?',
    options: ['Vitamina A', 'Vitamina C', 'Vitamina D', 'Vitamina K'],
    answer: 2,
    theme: 'Ciências & Tech',
    category: 'Biologia',
    explanation: 'Os raios UVB estimulam a produção de vitamina D na pele.',
  },
  {
    id: 'ct9',
    q: 'Qual metal é encontrado em estado líquido à temperatura ambiente?',
    options: ['Ferro', 'Mercúrio', 'Chumbo', 'Zinco'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Química',
    explanation: 'O mercúrio derrete a -38,8 °C, sendo líquido em temperatura ambiente.',
  },
  {
    id: 'ct10',
    q: 'Qual protocolo criptografado exibe o cadeado de segurança nos navegadores?',
    options: ['HTTP', 'FTP', 'HTTPS', 'SMTP'],
    answer: 2,
    theme: 'Ciências & Tech',
    category: 'Tecnologia',
    explanation: 'O HTTPS protege a comunicação entre navegador e servidor via TLS/SSL.',
  },
  {
    id: 'ct11',
    q: 'Qual sigla representa a memória volátil de acesso rápido de um computador?',
    options: ['SSD', 'RAM', 'BIOS', 'HD'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Tecnologia',
    explanation: 'RAM significa Random Access Memory e guarda dados dos programas em execução.',
  },
  {
    id: 'ct12',
    q: 'Qual planeta possui o sistema de anéis mais visível do Sistema Solar?',
    options: ['Júpiter', 'Saturno', 'Urano', 'Mercúrio'],
    answer: 1,
    theme: 'Ciências & Tech',
    category: 'Astronomia',
    explanation: 'Os anéis de Saturno são compostos principalmente por bilhões de fragmentos de gelo.',
  },
  {
    id: 'ct13',
    q: 'Qual órgão humano é responsável por bombear o sangue para todo o corpo?',
    options: ['Pulmão', 'Fígado', 'Coração', 'Rim'],
    answer: 2,
    theme: 'Ciências & Tech',
    category: 'Biologia',
    explanation: 'O coração impulsiona o sangue arterial e venoso por todo o sistema circulatório.',
  },
  {
    id: 'ct14',
    q: 'Qual é a velocidade aproximada da luz no vácuo?',
    options: ['30 mil km/s', '150 mil km/s', '300 mil km/s', '1 milhão km/s'],
    answer: 2,
    theme: 'Ciências & Tech',
    category: 'Física',
    explanation: 'A luz viaja no vácuo a cerca de 299.792 km por segundo.',
  },

  // Brasil & Geografia (14)
  {
    id: 'bg1',
    q: 'Em qual cidade brasileira fica o Cristo Redentor?',
    options: ['São Paulo', 'Salvador', 'Rio de Janeiro', 'Curitiba'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Brasil',
    explanation: 'O monumento fica no topo do Morro do Corcovado, no Rio de Janeiro.',
  },
  {
    id: 'bg2',
    q: 'Qual é o oceano que banha o litoral do Brasil?',
    options: ['Pacífico', 'Índico', 'Atlântico', 'Ártico'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'Todo o litoral brasileiro, do Oiapoque ao Chuí, é banhado pelo Oceano Atlântico.',
  },
  {
    id: 'bg3',
    q: 'Qual é o menor estado brasileiro em extensão territorial?',
    options: ['Alagoas', 'Sergipe', 'Espírito Santo', 'Paraíba'],
    answer: 1,
    theme: 'Brasil & Geografia',
    category: 'Brasil',
    explanation: 'Sergipe possui cerca de 21,9 mil km², sendo o menor estado do país.',
  },
  {
    id: 'bg4',
    q: 'Qual animal é símbolo da nota de R$ 200?',
    options: ['Arara-azul', 'Onça-pintada', 'Lobo-guará', 'Mico-leão-dourado'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Brasil',
    explanation: 'Lançada em 2020, a cédula de R$ 200 estampa o lobo-guará do Cerrado.',
  },
  {
    id: 'bg5',
    q: 'Qual é a capital da Austrália?',
    options: ['Sydney', 'Melbourne', 'Camberra', 'Perth'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'Camberra foi planejada e escolhida como capital para equilibrar Sydney e Melbourne.',
  },
  {
    id: 'bg6',
    q: 'Em qual continente fica o deserto do Saara?',
    options: ['Ásia', 'África', 'América', 'Oceania'],
    answer: 1,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'O Saara é o maior deserto quente do mundo e ocupa o norte da África.',
  },
  {
    id: 'bg7',
    q: 'Qual é a capital do Canadá?',
    options: ['Toronto', 'Vancouver', 'Ottawa', 'Montreal'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'Ottawa, na província de Ontário, é a capital federal do Canadá.',
  },
  {
    id: 'bg8',
    q: 'Qual é o rio mais extenso que atravessa o Brasil?',
    options: ['São Francisco', 'Paraná', 'Amazonas', 'Tocantins'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Brasil',
    explanation: 'O Rio Amazonas é o mais extenso e também o de maior volume de água do planeta.',
  },
  {
    id: 'bg9',
    q: 'Em qual país ficam as famosas pirâmides de Gizé?',
    options: ['México', 'Egito', 'Peru', 'Marrocos'],
    answer: 1,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'O complexo de Gizé fica nos arredores do Cairo, no Egito.',
  },
  {
    id: 'bg10',
    q: 'Qual é a capital do estado do Paraná?',
    options: ['Londrina', 'Maringá', 'Curitiba', 'Ponta Grossa'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Brasil',
    explanation: 'Curitiba é a capital paranaense e referência nacional em planejamento urbano.',
  },
  {
    id: 'bg11',
    q: 'Qual país tem um formato semelhante ao de uma bota no mapa da Europa?',
    options: ['Grécia', 'Itália', 'Portugal', 'Espanha'],
    answer: 1,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'A Península Itálica desenha o contorno clássico de uma bota no Mar Mediterrâneo.',
  },
  {
    id: 'bg12',
    q: 'Qual é a montanha mais alta da Terra acima do nível do mar?',
    options: ['K2', 'Aconcágua', 'Monte Everest', 'Kilimanjaro'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Geografia',
    explanation: 'O Monte Everest, no Himalaia, atinge 8.848 metros de altitude.',
  },
  {
    id: 'bg13',
    q: 'Em que ano foi proclamada a República no Brasil?',
    options: ['1822', '1888', '1889', '1930'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'História',
    explanation: 'A Proclamação da República aconteceu em 15 de novembro de 1889.',
  },
  {
    id: 'bg14',
    q: 'Qual bioma brasileiro é a maior planície alagável do mundo?',
    options: ['Cerrado', 'Caatinga', 'Pantanal', 'Pampa'],
    answer: 2,
    theme: 'Brasil & Geografia',
    category: 'Brasil',
    explanation: 'O Pantanal abriga biodiversidade riquíssima entre Mato Grosso e Mato Grosso do Sul.',
  },

  // Lógica & Matemática (13)
  {
    id: 'lm1',
    q: 'Quantos lados possui um hexágono?',
    options: ['5', '6', '7', '8'],
    answer: 1,
    theme: 'Lógica & Matemática',
    category: 'Geometria',
    explanation: 'O prefixo "hexa" indica seis lados e seis ângulos internos.',
  },
  {
    id: 'lm2',
    q: 'Quantos minutos tem 2 horas e meia?',
    options: ['120', '140', '150', '160'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Medidas',
    explanation: '2 horas = 120 min, somados a 30 min totalizam 150 minutos.',
  },
  {
    id: 'lm3',
    q: 'Qual é o resultado de 12 × 12?',
    options: ['124', '132', '144', '156'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Aritmética',
    explanation: 'Doze ao quadrado equivale a 144.',
  },
  {
    id: 'lm4',
    q: 'Quanto é 15 × 12?',
    options: ['160', '170', '180', '190'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Aritmética',
    explanation: '15 × 10 = 150 e 15 × 2 = 30; somando dá 180.',
  },
  {
    id: 'lm5',
    q: 'Qual é o único número primo par?',
    options: ['0', '2', '4', '6'],
    answer: 1,
    theme: 'Lógica & Matemática',
    category: 'Teoria dos Números',
    explanation: 'O 2 só é divisível por 1 e por ele mesmo; qualquer outro par divide por 2.',
  },
  {
    id: 'lm6',
    q: 'Quanto é 2 elevado à 6ª potência (2⁶)?',
    options: ['32', '48', '64', '128'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Potenciação',
    explanation: '2×2×2×2×2×2 resulta em 64.',
  },
  {
    id: 'lm7',
    q: 'Quantos graus tem a soma dos ângulos internos de qualquer triângulo?',
    options: ['90°', '180°', '270°', '360°'],
    answer: 1,
    theme: 'Lógica & Matemática',
    category: 'Geometria',
    explanation: 'Na geometria euclidiana, os três ângulos internos somam sempre 180°.',
  },
  {
    id: 'lm8',
    q: 'Qual é a raiz quadrada de 196?',
    options: ['12', '13', '14', '16'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Aritmética',
    explanation: '14 × 14 = 196.',
  },
  {
    id: 'lm9',
    q: 'Quanto é 25% de 240?',
    options: ['48', '50', '60', '72'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Porcentagem',
    explanation: '25% corresponde a um quarto do total: 240 ÷ 4 = 60.',
  },
  {
    id: 'lm10',
    q: 'Qual número completa a sequência lógica: 2, 6, 12, 20, 30, __?',
    options: ['38', '40', '42', '44'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Lógica',
    explanation: 'As diferenças aumentam de 2 em 2 (+4, +6, +8, +10, +12), então 30 + 12 = 42.',
  },
  {
    id: 'lm11',
    q: 'Quantos vértices tem um cubo?',
    options: ['6', '8', '10', '12'],
    answer: 1,
    theme: 'Lógica & Matemática',
    category: 'Geometria',
    explanation: 'Um cubo possui 6 faces, 12 arestas e 8 vértices.',
  },
  {
    id: 'lm12',
    q: 'Quanto é 7 × 8 + 14?',
    options: ['64', '68', '70', '72'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Aritmética',
    explanation: 'Primeiro multiplicamos (7 × 8 = 56) e depois somamos 14 = 70.',
  },
  {
    id: 'lm13',
    q: 'Se 3 camisetas custam R$ 90, quanto custarão 5 camisetas iguais?',
    options: ['R$ 120', 'R$ 135', 'R$ 150', 'R$ 180'],
    answer: 2,
    theme: 'Lógica & Matemática',
    category: 'Regra de Três',
    explanation: 'Cada camiseta custa R$ 30; cinco unidades saem por R$ 150.',
  },

  // Cultura & Atualidades (13)
  {
    id: 'ca1',
    q: 'Qual país venceu mais Copas do Mundo de Futebol masculino?',
    options: ['Alemanha', 'Itália', 'Argentina', 'Brasil'],
    answer: 3,
    theme: 'Cultura & Atualidades',
    category: 'Esportes',
    explanation: 'O Brasil é pentacampeão mundial (1958, 1962, 1970, 1994 e 2002).',
  },
  {
    id: 'ca2',
    q: 'Qual sistema de pagamento instantâneo foi criado pelo Banco Central do Brasil?',
    options: ['DOC', 'Pix', 'SWIFT', 'Boleto'],
    answer: 1,
    theme: 'Cultura & Atualidades',
    category: 'Atualidades',
    explanation: 'O Pix entrou em operação em 2020 permitindo transferências 24h em segundos.',
  },
  {
    id: 'ca3',
    q: 'Quem pintou a obra Mona Lisa?',
    options: ['Michelangelo', 'Leonardo da Vinci', 'Pablo Picasso', 'Van Gogh'],
    answer: 1,
    theme: 'Cultura & Atualidades',
    category: 'Artes',
    explanation: 'Leonardo da Vinci iniciou a pintura por volta de 1503; hoje está no Museu do Louvre.',
  },
  {
    id: 'ca4',
    q: 'Quem escreveu o clássico brasileiro "Dom Casmurro"?',
    options: ['José de Alencar', 'Machado de Assis', 'Clarice Lispector', 'Jorge Amado'],
    answer: 1,
    theme: 'Cultura & Atualidades',
    category: 'Literatura',
    explanation: 'Publicado em 1899 por Machado de Assis, traz os personagens Bentinho e Capitu.',
  },
  {
    id: 'ca5',
    q: 'Qual é a moeda oficial do Japão?',
    options: ['Won', 'Yuan', 'Iene', 'Dólar'],
    answer: 2,
    theme: 'Cultura & Atualidades',
    category: 'Economia',
    explanation: 'O iene japonês (¥ / JPY) é a moeda oficial do Japão.',
  },
  {
    id: 'ca6',
    q: 'Quantas peças tem um jogo tradicional de dominó Duplo-6?',
    options: ['24', '28', '32', '36'],
    answer: 1,
    theme: 'Cultura & Atualidades',
    category: 'Jogos',
    explanation: 'Todas as combinações de 0 a 6 sem repetição formam exatamente 28 pedras.',
  },
  {
    id: 'ca7',
    q: 'Em que ano o ser humano pisou na Lua pela primeira vez?',
    options: ['1965', '1969', '1972', '1959'],
    answer: 1,
    theme: 'Cultura & Atualidades',
    category: 'História',
    explanation: 'A missão Apollo 11 pousou na Lua em 20 de julho de 1969.',
  },
  {
    id: 'ca8',
    q: 'Quantas casas possui um tabuleiro padrão de xadrez?',
    options: ['48', '56', '64', '72'],
    answer: 2,
    theme: 'Cultura & Atualidades',
    category: 'Jogos',
    explanation: 'O tabuleiro é uma grade 8×8, totalizando 64 casas alternadas.',
  },
  {
    id: 'ca9',
    q: 'Qual esporte utiliza os termos "strike" e "spare"?',
    options: ['Beisebol', 'Boliche', 'Tênis', 'Golfe'],
    answer: 1,
    theme: 'Cultura & Atualidades',
    category: 'Esportes',
    explanation: 'No boliche, derrubar todos os pinos de primeira é strike; na segunda tentativa é spare.',
  },
  {
    id: 'ca10',
    q: 'Quantos dias possui um ano bissexto?',
    options: ['364', '365', '366', '367'],
    answer: 2,
    theme: 'Cultura & Atualidades',
    category: 'Atualidades',
    explanation: 'A cada 4 anos (com exceções seculares), fevereiro ganha o dia 29.',
  },
  {
    id: 'ca11',
    q: 'Qual país sediou os Jogos Olímpicos de Verão de 2016?',
    options: ['Reino Unido', 'Japão', 'Brasil', 'França'],
    answer: 2,
    theme: 'Cultura & Atualidades',
    category: 'Esportes',
    explanation: 'O Rio de Janeiro foi a primeira cidade da América do Sul a sediar uma Olimpíada.',
  },
  {
    id: 'ca12',
    q: 'Qual pintor pós-impressionista criou a obra "A Noite Estrelada"?',
    options: ['Claude Monet', 'Pablo Picasso', 'Vincent van Gogh', 'Salvador Dalí'],
    answer: 2,
    theme: 'Cultura & Atualidades',
    category: 'Artes',
    explanation: 'Van Gogh pintou "A Noite Estrelada" em 1889.',
  },
  {
    id: 'ca13',
    q: 'Quantos jogadores de cada time entram em campo no início de uma partida de futebol?',
    options: ['9', '10', '11', '12'],
    answer: 2,
    theme: 'Cultura & Atualidades',
    category: 'Esportes',
    explanation: 'Cada equipe joga com 10 atletas de linha e 1 goleiro.',
  },
];

const THEMES: QuizTheme[] = [
  'Todos',
  'Ciências & Tech',
  'Brasil & Geografia',
  'Lógica & Matemática',
  'Cultura & Atualidades',
];

const LENGTH_OPTIONS = [5, 8, 12] as const;

type GameState = 'TITLE_MENU' | 'PLAYING' | 'ROUND_SUMMARY';

function loadSeenIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveSeenIds(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore storage quota issues
  }
}

export const QuizSoloGame: React.FC<GameProps> = ({ onComplete, onExit }) => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [soundOn, setSoundOn] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState<QuizTheme>('Todos');
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [seenIds, setSeenIds] = useState<string[]>(() => loadSeenIds());

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [maxTimeForQ, setMaxTimeForQ] = useState(15);
  const [picked, setPicked] = useState<number | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [used5050, setUsed5050] = useState(false);
  const [usedExtraTime, setUsedExtraTime] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [movesCount, setMovesCount] = useState(0);
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

  const poolForTheme = useMemo(
    () =>
      selectedTheme === 'Todos'
        ? QUIZ_BANK
        : QUIZ_BANK.filter((item) => item.theme === selectedTheme),
    [selectedTheme]
  );

  const unseenInThemeCount = useMemo(() => {
    const seenSet = new Set(seenIds);
    return poolForTheme.filter((q) => !seenSet.has(q.id)).length;
  }, [poolForTheme, seenIds]);

  const finishMatch = useCallback(
    async (finalScore: number, totalMoves: number) => {
      setGameState('ROUND_SUMMARY');
      const rawDuration = Date.now() - startedAtRef.current;
      const bounded = Math.min(360, Math.max(40, Math.round(finalScore)));
      setSubmitting(true);
      try {
        const res = await onComplete(bounded, Math.max(rawDuration, 6000), Math.max(totalMoves, 1));
        setRewardInfo(res);
      } finally {
        setSubmitting(false);
      }
    },
    [onComplete]
  );

  const advanceNextQuestion = useCallback(
    (nextScore: number, nextMoves: number) => {
      if (nextTimerRef.current) {
        window.clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }
      if (qIdx + 1 >= questions.length) {
        finishMatch(nextScore, nextMoves);
      } else {
        setQIdx((i) => i + 1);
        setTimeLeft(15);
        setMaxTimeForQ(15);
        setPicked(null);
        setEliminatedOptions([]);
      }
    },
    [finishMatch, qIdx, questions.length]
  );

  const handleOption = useCallback(
    (optionIdx: number) => {
      if (gameState !== 'PLAYING' || picked !== null || !questions[qIdx]) return;
      if (eliminatedOptions.includes(optionIdx)) return;

      const currentQ = questions[qIdx];
      const isCorrect = optionIdx === currentQ.answer;
      const nextMoves = movesCount + 1;

      setPicked(optionIdx);
      setMovesCount(nextMoves);

      const nextStreak = isCorrect ? streak + 1 : 0;
      const nextBest = Math.max(bestStreak, nextStreak);
      const multiplier = Math.min(2.0, 1 + Math.max(0, nextStreak - 1) * 0.15);
      const basePts = questions.length === 5 ? 42 : questions.length === 8 ? 30 : 22;
      const speedBonus = isCorrect ? Math.round((timeLeft / maxTimeForQ) * 10) : 0;
      const gained = isCorrect ? Math.round(basePts * multiplier) + speedBonus : 4;
      const nextScore = score + gained;

      setStreak(nextStreak);
      setBestStreak(nextBest);
      setScore(nextScore);
      if (isCorrect) setCorrectCount((c) => c + 1);

      playTone(isCorrect ? 740 : 250, 0.12, isCorrect ? 'triangle' : 'sawtooth', soundOn);

      nextTimerRef.current = window.setTimeout(() => {
        advanceNextQuestion(nextScore, nextMoves);
      }, 2200);
    },
    [
      advanceNextQuestion,
      bestStreak,
      eliminatedOptions,
      gameState,
      maxTimeForQ,
      movesCount,
      picked,
      qIdx,
      questions,
      score,
      soundOn,
      streak,
      timeLeft,
    ]
  );

  useEffect(() => {
    if (gameState !== 'PLAYING' || picked !== null) return;
    if (timeLeft <= 0) {
      handleOption(-1);
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [gameState, picked, timeLeft, handleOption]);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (picked !== null) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advanceNextQuestion(score, movesCount);
        }
        return;
      }
      const idx = ['1', '2', '3', '4'].indexOf(e.key);
      if (idx !== -1) {
        e.preventDefault();
        handleOption(idx);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advanceNextQuestion, gameState, handleOption, movesCount, picked, score]);

  const startGame = () => {
    if (nextTimerRef.current) window.clearTimeout(nextTimerRef.current);

    const pool = poolForTheme;
    const seenSet = new Set(seenIds);
    let unseen = pool.filter((q) => !seenSet.has(q.id));
    let nextSeen = [...seenIds];

    // Se restarem menos perguntas inéditas do que o tamanho da partida, completa sem repetir e reseta o ciclo do tema
    let chosen: QuizQuestion[] = [];
    const targetLen = Math.min(questionCount, pool.length);

    if (unseen.length >= targetLen) {
      chosen = [...unseen].sort(() => Math.random() - 0.5).slice(0, targetLen);
    } else {
      const pickedSoFar = [...unseen].sort(() => Math.random() - 0.5);
      const pickedSet = new Set(pickedSoFar.map((x) => x.id));
      const poolIds = new Set(pool.map((x) => x.id));
      // Limpa apenas as perguntas desse tema para reiniciar um ciclo fresco
      nextSeen = nextSeen.filter((id) => !poolIds.has(id));
      const remainder = pool
        .filter((x) => !pickedSet.has(x.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, targetLen - pickedSoFar.length);
      chosen = [...pickedSoFar, ...remainder];
    }

    const updatedSeen = Array.from(new Set([...nextSeen, ...chosen.map((c) => c.id)]));
    setSeenIds(updatedSeen);
    saveSeenIds(updatedSeen);

    setQuestions(chosen);
    setQIdx(0);
    setTimeLeft(15);
    setMaxTimeForQ(15);
    setPicked(null);
    setEliminatedOptions([]);
    setUsed5050(false);
    setUsedExtraTime(false);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setMovesCount(0);
    setRewardInfo(null);
    startedAtRef.current = Date.now();
    setGameState('PLAYING');
    playTone(560, 0.08, 'sine', soundOn);
  };

  const handleUse5050 = () => {
    if (used5050 || picked !== null || !questions[qIdx]) return;
    const currentQ = questions[qIdx];
    const wrongIndices = currentQ.options
      .map((_, idx) => idx)
      .filter((idx) => idx !== currentQ.answer)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    setEliminatedOptions(wrongIndices);
    setUsed5050(true);
    playTone(620, 0.08, 'sine', soundOn);
  };

  const handleUseExtraTime = () => {
    if (usedExtraTime || picked !== null) return;
    setTimeLeft((t) => t + 10);
    setMaxTimeForQ((m) => Math.max(m, timeLeft + 10));
    setUsedExtraTime(true);
    playTone(680, 0.08, 'sine', soundOn);
  };

  const currentQ = questions[qIdx];
  const streakMultiplier = Math.min(2.0, 1 + Math.max(0, streak - 1) * 0.15).toFixed(2);
  const timerPct = Math.max(0, Math.min(100, (timeLeft / maxTimeForQ) * 100));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Quiz Solo</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {QUIZ_BANK.length} perguntas inéditas sem repetição · Até 360 moedas
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
        <div className="space-y-5 py-2">
          <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
            Escolha o tema e a duração da partida. Suas perguntas nunca se repetem até completar todo o banco do tema! Use ajudas táticas (<strong>50/50</strong> e <strong>+10s</strong>) e acerte em sequência para multiplicar seus pontos.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
              <span>Tema do Quiz</span>
              <span className="font-mono text-[11px] text-emerald-600 dark:text-lime-400">
                {unseenInThemeCount > 0
                  ? `${unseenInThemeCount}/${poolForTheme.length} inéditas`
                  : `Ciclo pronto (${poolForTheme.length} perguntas)`}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {THEMES.map((theme) => {
                const active = selectedTheme === theme;
                return (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => setSelectedTheme(theme)}
                    className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-left text-xs font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-lime-400 text-slate-950 border-lime-300'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-lime-400/60'
                    }`}
                  >
                    {theme}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 block">
              Tamanho da Partida
            </span>
            <div className="grid grid-cols-3 gap-2">
              {LENGTH_OPTIONS.map((len) => {
                const active = questionCount === len;
                return (
                  <button
                    key={len}
                    type="button"
                    onClick={() => setQuestionCount(len)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-extrabold transition-colors cursor-pointer ${
                      active
                        ? 'bg-lime-400 text-slate-950 border-lime-300'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-lime-400/60'
                    }`}
                  >
                    {len} Perguntas
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={startGame}
            className="w-full min-h-[48px] px-6 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold rounded-xl shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Começar Quiz ({Math.min(questionCount, poolForTheme.length)} perguntas)
          </button>
        </div>
      )}

      {gameState === 'PLAYING' && currentQ && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-4 py-2.5 rounded-xl">
              <span className="font-bold text-slate-800 dark:text-zinc-200">
                Pergunta {qIdx + 1}/{questions.length} · {currentQ.category}
              </span>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                {streak > 0 && (
                  <span className="inline-flex items-center gap-1 text-orange-500 font-bold">
                    <Flame className="w-3.5 h-3.5" />
                    ×{streakMultiplier}
                  </span>
                )}
                <span className="text-emerald-600 dark:text-lime-400 font-bold">{score} pts</span>
                <span
                  className={`inline-flex items-center gap-1 font-bold ${
                    timeLeft <= 5 ? 'text-rose-500' : 'text-amber-600 dark:text-amber-400'
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
                  timeLeft <= 5 ? 'bg-rose-500' : 'bg-lime-400'
                }`}
                style={{ width: `${picked !== null ? 0 : timerPct}%` }}
              />
            </div>
          </div>

          <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-50 leading-snug">
            {currentQ.q}
          </h4>

          {/* Lifelines */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={used5050 || picked !== null}
              onClick={handleUse5050}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-lime-400 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              {used5050 ? '50/50 Usado' : 'Eliminar 2 Erradas (50/50)'}
            </button>
            <button
              type="button"
              disabled={usedExtraTime || picked !== null}
              onClick={handleUseExtraTime}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-lime-400 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Timer className="w-3.5 h-3.5 text-sky-400" />
              {usedExtraTime ? '+10s Usado' : '+10 Segundos'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentQ.options.map((opt, idx) => {
              const isEliminated = eliminatedOptions.includes(idx);
              const isSelected = picked === idx;
              const isCorrectOption = idx === currentQ.answer;
              let btnClass =
                'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 hover:border-lime-400';
              if (isEliminated) {
                btnClass =
                  'bg-slate-100/40 dark:bg-zinc-950/40 border-slate-200/50 dark:border-zinc-800/50 text-slate-400 dark:text-zinc-600 line-through opacity-45';
              } else if (picked !== null) {
                if (isCorrectOption) {
                  btnClass =
                    'bg-emerald-500/20 border-emerald-500 text-emerald-800 dark:text-lime-300';
                } else if (isSelected) {
                  btnClass = 'bg-rose-500/20 border-rose-500 text-rose-700 dark:text-rose-300';
                }
              }

              return (
                <button
                  key={opt}
                  type="button"
                  disabled={picked !== null || isEliminated}
                  onClick={() => handleOption(idx)}
                  className={`min-h-[52px] p-3.5 rounded-xl border text-left text-sm font-semibold transition-colors cursor-pointer disabled:cursor-default ${btnClass}`}
                >
                  <span className="font-mono text-xs opacity-60 mr-2">{idx + 1}.</span>
                  {opt}
                </button>
              );
            })}
          </div>

          {picked !== null && (
            <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <p
                  className={`font-extrabold ${
                    picked === currentQ.answer
                      ? 'text-emerald-600 dark:text-lime-400'
                      : 'text-rose-500'
                  }`}
                >
                  {picked === currentQ.answer
                    ? 'Resposta certa!'
                    : picked === -1
                      ? 'Tempo esgotado!'
                      : 'Quase lá!'}
                </p>
                <p className="text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {currentQ.explanation}
                </p>
              </div>
              <button
                type="button"
                onClick={() => advanceNextQuestion(score, movesCount)}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {qIdx + 1 >= questions.length ? 'Ver Resultado' : 'Próxima'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
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
                {correctCount}/{questions.length} acertos · Melhor combo: {bestStreak}x{' '}
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGameState('TITLE_MENU')}
              disabled={submitting}
              className="min-h-[42px] px-4 py-2 border border-slate-200 dark:border-zinc-700 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
            >
              Mudar Tema
            </button>
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
        </div>
      )}
    </div>
  );
};
