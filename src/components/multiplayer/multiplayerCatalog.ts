import {
  Anchor,
  Brain,
  CircleDot,
  Grid3X3,
  Hand,
  Hash,
  HelpCircle,
  LayoutGrid,
  Pencil,
  Sparkles,
  Zap,
} from 'lucide-react';
import React from 'react';
import { MultiplayerGameId } from '../../types/earneasy';

export interface MultiplayerCatalogItem {
  id: MultiplayerGameId;
  name: string;
  tagline: string;
  rulesHint: string;
  category: 'Tabuleiro' | 'Palavras' | 'Estratégia' | 'Velocidade' | 'Clássico';
  accentClass: string;
  Icon: React.FC<{ className?: string }>;
}

export const MULTIPLAYER_CATALOG: MultiplayerCatalogItem[] = [
  {
    id: 'domino',
    name: 'Dominó Online',
    tagline: 'Encaixe suas peças nas pontas da mesa e bata antes do adversário.',
    rulesHint: '7 peças para cada jogador, compra no monte e contagem de pontos se trancar.',
    category: 'Tabuleiro',
    accentClass: 'from-lime-500/20 to-emerald-500/10 border-lime-400/35 text-lime-300',
    Icon: LayoutGrid,
  },
  {
    id: 'stop',
    name: 'Stop Online',
    tagline: 'Preencha as 6 categorias com a letra sorteada e grite STOP primeiro!',
    rulesHint: 'Palavra única vale 10 pts, repetida vale 5 pts. Cronômetro de 60 segundos.',
    category: 'Palavras',
    accentClass: 'from-emerald-500/20 to-teal-500/10 border-emerald-400/35 text-emerald-300',
    Icon: Sparkles,
  },
  {
    id: 'draw_guess',
    name: 'Desenhe e Adivinhe',
    tagline: 'Um jogador desenha na tela em tempo real e o outro tenta acertar a palavra.',
    rulesHint: 'Quem desenha vê a palavra secreta; quem adivinha envia palpites no chat.',
    category: 'Palavras',
    accentClass: 'from-cyan-500/20 to-sky-500/10 border-cyan-400/35 text-cyan-300',
    Icon: Pencil,
  },
  {
    id: 'battleship',
    name: 'Batalha Naval',
    tagline: 'Posicione sua frota secreta 7×7 e dispare torpedos até afundar tudo.',
    rulesHint: 'Frota de 4 navios (4, 3, 2, 2). Acerto dá direito a um novo disparo!',
    category: 'Estratégia',
    accentClass: 'from-sky-500/20 to-blue-500/10 border-sky-400/35 text-sky-300',
    Icon: Anchor,
  },
  {
    id: 'connect4',
    name: 'Ligue 4',
    tagline: 'Derrube fichas nas colunas e alinhe 4 peças na horizontal, vertical ou diagonal.',
    rulesHint: 'Tabuleiro 7×6 com física de gravidade e turnos alternados.',
    category: 'Estratégia',
    accentClass: 'from-lime-500/20 to-green-500/10 border-lime-400/35 text-lime-300',
    Icon: CircleDot,
  },
  {
    id: 'quiz',
    name: 'Quiz Multiplayer',
    tagline: 'Responda perguntas de conhecimentos gerais mais rápido que seu amigo.',
    rulesHint: 'Acerto + bônus de velocidade em cada rodada de 18 segundos.',
    category: 'Palavras',
    accentClass: 'from-violet-500/20 to-purple-500/10 border-violet-400/35 text-violet-300',
    Icon: HelpCircle,
  },
  {
    id: 'rps',
    name: 'Pedra, Papel e Tesoura',
    tagline: 'Escolha em segredo e revelem juntos em um duelo clássico instantâneo.',
    rulesHint: 'As escolhas ficam ocultas no servidor até os dois confirmarem.',
    category: 'Clássico',
    accentClass: 'from-amber-500/20 to-orange-500/10 border-amber-400/35 text-amber-300',
    Icon: Hand,
  },
  {
    id: 'tictactoe_mp',
    name: 'Jogo da Velha Online',
    tagline: 'Clássico 3×3 ao vivo contra seu amigo com placar por rodadas.',
    rulesHint: 'Alternância justa de quem começa a cada nova rodada.',
    category: 'Clássico',
    accentClass: 'from-emerald-500/20 to-lime-500/10 border-emerald-400/35 text-emerald-300',
    Icon: Grid3X3,
  },
  {
    id: 'guess_number',
    name: 'Adivinhe o Número',
    tagline: 'Descubra o número secreto de 1 a 100 usando as dicas de maior ou menor.',
    rulesHint: 'O servidor sorteia o número e reduz o intervalo conforme os palpites.',
    category: 'Estratégia',
    accentClass: 'from-teal-500/20 to-cyan-500/10 border-teal-400/35 text-teal-300',
    Icon: Hash,
  },
  {
    id: 'memory_mp',
    name: 'Jogo da Memória Multiplayer',
    tagline: 'Encontre os pares no tabuleiro 4×4. Acertar um par mantém a sua vez!',
    rulesHint: 'Vence a rodada quem acumular mais pares combinados.',
    category: 'Tabuleiro',
    accentClass: 'from-fuchsia-500/20 to-pink-500/10 border-fuchsia-400/35 text-fuchsia-300',
    Icon: Brain,
  },
  {
    id: 'reflex_mp',
    name: 'Teste de Reflexo',
    tagline: 'Espere o sinal verde neon e clique em milissegundos. Quem queimar perde!',
    rulesHint: 'Sinal sincronizado pelo servidor para medir o tempo real de reação.',
    category: 'Velocidade',
    accentClass: 'from-lime-500/25 to-yellow-500/10 border-lime-400/40 text-lime-300',
    Icon: Zap,
  },
];
