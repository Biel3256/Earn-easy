import crypto from 'crypto';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';

export type MultiplayerGameId =
  | 'domino'
  | 'stop'
  | 'draw_guess'
  | 'battleship'
  | 'connect4'
  | 'quiz'
  | 'rps'
  | 'tictactoe_mp'
  | 'guess_number'
  | 'memory_mp'
  | 'reflex_mp';

export type RoomStakeStatus = 'agreed' | 'pending_opponent' | 'counter_proposed' | 'rejected';
export type RoomVisibility = 'private' | 'public';

export interface ServerPlayer {
  uid: string;
  displayName: string;
  photoURL: string;
  pointsBalance: number;
  connected: boolean;
  isHost: boolean;
  acceptedRules: boolean;
  score: number;
  verified: boolean;
  verifiedBadge: 'none' | 'blue' | 'owner';
  ws: WebSocket | null;
}

export interface GlobalMatchListing {
  roomCode: string;
  hostUid: string;
  hostName: string;
  hostPhotoURL: string;
  hostVerified: boolean;
  hostVerifiedBadge: 'none' | 'blue' | 'owner';
  gameId: MultiplayerGameId;
  totalRounds: number;
  stakePoints: number;
  createdAt: number;
}

export interface SettlementPayload {
  matchId: string;
  roomCode: string;
  gameId: MultiplayerGameId;
  participantUids: string[];
  winnerUid: string;
  loserUid: string;
  isDraw: boolean;
  stakePoints: number;
  scoresByUid: Record<string, number>;
  settlementProof: string;
  settledAt: string;
}

interface RoomState {
  roomCode: string;
  hostUid: string;
  gameId: MultiplayerGameId;
  visibility: RoomVisibility;
  postedToGlobal: boolean;
  totalRounds: number;
  currentRound: number;
  status: 'lobby' | 'playing' | 'finished';
  stakePoints: number;
  proposedCounterPoints: number | null;
  counterProposedByUid: string | null;
  stakeStatus: RoomStakeStatus;
  players: ServerPlayer[];
  gameData: Record<string, any> | null;
  roundTimer: NodeJS.Timeout | null;
  settlement: SettlementPayload | null;
  usedQuizIndices: Set<number>;
  usedDrawWords: Set<string>;
  usedStopLetters: Set<string>;
  createdAt: number;
  updatedAt: number;
}

const VALID_GAMES: Set<MultiplayerGameId> = new Set([
  'domino',
  'stop',
  'draw_guess',
  'battleship',
  'connect4',
  'quiz',
  'rps',
  'tictactoe_mp',
  'guess_number',
  'memory_mp',
  'reflex_mp',
]);

const STOP_LETTERS = 'ABCDEFGHIJLMNOPQRSTUVXZ'.split('');
const STOP_CATEGORIES = ['Nome', 'Animal', 'Fruta', 'Cidade/País', 'Objeto', 'Cor'];

const DRAW_WORDS = [
  'ABACAXI', 'FOGUETE', 'BICICLETA', 'ELEFANTE', 'VIOLAO', 'MONTANHA', 'CASTELO',
  'CACHORRO', 'BORBOLETA', 'SOL', 'COROA', 'DIAMANTE', 'GUITARRA', 'AVIAO',
  'TARTARUGA', 'PIZZA', 'SORVETE', 'RELOGIO', 'LIVRO', 'CHAVE', 'BARCO',
  'VULCAO', 'CORACAO', 'ROBO', 'DRAGAO', 'ESTRELA', 'FUTEBOL', 'COMPUTADOR',
  'GIRAFA', 'MORANGO', 'ESCORREGADOR', 'CACTO', 'FOGUEIRA', 'PIRAMIDE',
  'HELICOPTERO', 'SUBMARINO', 'CAMERA', 'TROFEU', 'LAMPADA', 'BALAO',
  'ANCHORA', 'FAROL', 'PINGUIM', 'BALEIA', 'MICROFONE', 'TESOURA', 'CHAPEUS', 'CARRO',
];

const QUIZ_BANK: Array<{ q: string; opts: string[]; ans: number; cat: string }> = [
  { q: 'Qual é o maior planeta do Sistema Solar?', opts: ['Saturno', 'Júpiter', 'Netuno', 'Urano'], ans: 1, cat: 'Ciências' },
  { q: 'Qual elemento químico tem símbolo "Au"?', opts: ['Prata', 'Alumínio', 'Ouro', 'Cobre'], ans: 2, cat: 'Ciências' },
  { q: 'Em qual país ficam as pirâmides de Gizé?', opts: ['México', 'Egito', 'Peru', 'Marrocos'], ans: 1, cat: 'Geografia' },
  { q: 'Quantos lados tem um hexágono?', opts: ['5', '6', '7', '8'], ans: 1, cat: 'Matemática' },
  { q: 'Qual é a capital da Austrália?', opts: ['Sydney', 'Melbourne', 'Camberra', 'Perth'], ans: 2, cat: 'Geografia' },
  { q: 'Quanto é 15 × 12?', opts: ['160', '170', '180', '190'], ans: 2, cat: 'Matemática' },
  { q: 'Qual oceano banha o litoral brasileiro?', opts: ['Índico', 'Pacífico', 'Atlântico', 'Ártico'], ans: 2, cat: 'Geografia' },
  { q: 'Qual animal é símbolo da nota de R$ 200?', opts: ['Onça-pintada', 'Lobo-guará', 'Arara-azul', 'Garça'], ans: 1, cat: 'Brasil' },
  { q: 'Quem pintou a obra "Mona Lisa"?', opts: ['Michelangelo', 'Leonardo da Vinci', 'Van Gogh', 'Picasso'], ans: 1, cat: 'Artes' },
  { q: 'Quantos minutos existem em 3 horas e meia?', opts: ['190', '200', '210', '220'], ans: 2, cat: 'Matemática' },
  { q: 'Qual gás as plantas absorvem na fotossíntese?', opts: ['Oxigênio', 'Nitrogênio', 'Gás Carbônico', 'Hélio'], ans: 2, cat: 'Biologia' },
  { q: 'Qual é o menor número primo par?', opts: ['0', '2', '4', '6'], ans: 1, cat: 'Matemática' },
  { q: 'Em que ano o homem pisou na Lua pela primeira vez?', opts: ['1965', '1969', '1972', '1959'], ans: 1, cat: 'História' },
  { q: 'Qual é o idioma oficial da Áustria?', opts: ['Austríaco', 'Inglês', 'Alemão', 'Francês'], ans: 2, cat: 'Geografia' },
  { q: 'Quantas peças tem um jogo tradicional de dominó?', opts: ['24', '28', '32', '36'], ans: 1, cat: 'Jogos' },
  { q: 'Qual vitamina é produzida com auxílio da luz solar?', opts: ['Vitamina A', 'Vitamina C', 'Vitamina D', 'Vitamina K'], ans: 2, cat: 'Biologia' },
  { q: 'Qual é o rio mais extenso do Brasil?', opts: ['São Francisco', 'Paraná', 'Amazonas', 'Tocantins'], ans: 2, cat: 'Brasil' },
  { q: 'Quanto é 2 elevado à 6ª potência (2⁶)?', opts: ['32', '48', '64', '128'], ans: 2, cat: 'Matemática' },
  { q: 'Qual país venceu mais Copas do Mundo de Futebol masculino?', opts: ['Alemanha', 'Itália', 'Argentina', 'Brasil'], ans: 3, cat: 'Esportes' },
  { q: 'Qual é o menor estado brasileiro em território?', opts: ['Alagoas', 'Sergipe', 'Espírito Santo', 'Paraíba'], ans: 1, cat: 'Brasil' },
  { q: 'Em informática, quantos bits formam 1 byte?', opts: ['4', '8', '16', '32'], ans: 1, cat: 'Tecnologia' },
  { q: 'Qual planeta é conhecido como Planeta Vermelho?', opts: ['Vênus', 'Marte', 'Mercúrio', 'Urano'], ans: 1, cat: 'Ciências' },
  { q: 'Quem escreveu "Dom Casmurro"?', opts: ['José de Alencar', 'Machado de Assis', 'Clarice Lispector', 'Jorge Amado'], ans: 1, cat: 'Cultura' },
  { q: 'Qual é a capital do Canadá?', opts: ['Toronto', 'Vancouver', 'Ottawa', 'Montreal'], ans: 2, cat: 'Geografia' },
  { q: 'Qual órgão do corpo humano bombeia o sangue?', opts: ['Pulmão', 'Fígado', 'Coração', 'Rim'], ans: 2, cat: 'Biologia' },
  { q: 'Quantos graus tem a soma dos ângulos internos de um triângulo?', opts: ['90°', '180°', '270°', '360°'], ans: 1, cat: 'Matemática' },
  { q: 'Qual é a moeda oficial do Japão?', opts: ['Won', 'Yuan', 'Iene', 'Dólar'], ans: 2, cat: 'Atualidades' },
  { q: 'Qual instrumento mede a temperatura?', opts: ['Barômetro', 'Termômetro', 'Anemômetro', 'Higrômetro'], ans: 1, cat: 'Ciências' },
  { q: 'Qual destes é um animal mamífero aquático?', opts: ['Tubarão', 'Baleia', 'Polvo', 'Cavalo-marinho'], ans: 1, cat: 'Biologia' },
  { q: 'Em qual continente fica o deserto do Saara?', opts: ['Ásia', 'África', 'América', 'Oceania'], ans: 1, cat: 'Geografia' },
  { q: 'Qual é a raiz quadrada de 196?', opts: ['12', '13', '14', '16'], ans: 2, cat: 'Matemática' },
  { q: 'Qual empresa desenvolveu o sistema operacional Android?', opts: ['Apple', 'Microsoft', 'Google', 'Nokia'], ans: 2, cat: 'Tecnologia' },
  { q: 'Qual é a maior floresta tropical do mundo?', opts: ['Congo', 'Taiga', 'Amazônica', 'Mata Atlântica'], ans: 2, cat: 'Brasil' },
  { q: 'Quantos jogadores cada time tem em campo no futebol?', opts: ['9', '10', '11', '12'], ans: 2, cat: 'Esportes' },
  { q: 'Qual metal é líquido em temperatura ambiente?', opts: ['Ferro', 'Mercúrio', 'Chumbo', 'Zinco'], ans: 1, cat: 'Ciências' },
  { q: 'Em que ano foi proclamada a República no Brasil?', opts: ['1822', '1888', '1889', '1930'], ans: 2, cat: 'História' },
  { q: 'Qual sigla representa a memória volátil de acesso rápido do computador?', opts: ['SSD', 'RAM', 'BIOS', 'GPU'], ans: 1, cat: 'Tecnologia' },
  { q: 'Qual é a montanha mais alta da Terra acima do nível do mar?', opts: ['K2', 'Aconcágua', 'Monte Everest', 'Kilimanjaro'], ans: 2, cat: 'Geografia' },
  { q: 'Quanto é 25% de 240?', opts: ['48', '50', '60', '72'], ans: 2, cat: 'Matemática' },
  { q: 'Qual pintor cortou parte da própria orelha?', opts: ['Claude Monet', 'Pablo Picasso', 'Vincent van Gogh', 'Salvador Dalí'], ans: 2, cat: 'Artes' },
  { q: 'Qual planeta possui os anéis mais visíveis do Sistema Solar?', opts: ['Júpiter', 'Saturno', 'Netuno', 'Marte'], ans: 1, cat: 'Ciências' },
  { q: 'Qual é a capital do estado do Paraná?', opts: ['Londrina', 'Maringá', 'Curitiba', 'Cascavel'], ans: 2, cat: 'Brasil' },
  { q: 'Quantas casas tem um tabuleiro de xadrez?', opts: ['48', '56', '64', '72'], ans: 2, cat: 'Jogos' },
  { q: 'Qual protocolo criptografado exibe o cadeado de segurança nos sites?', opts: ['HTTP', 'FTP', 'HTTPS', 'SMTP'], ans: 2, cat: 'Tecnologia' },
  { q: 'Qual vitamina está presente em alta concentração na laranja e acerola?', opts: ['Vitamina B12', 'Vitamina C', 'Vitamina E', 'Vitamina K'], ans: 1, cat: 'Biologia' },
  { q: 'Qual é o único satélite natural da Terra?', opts: ['Titã', 'Fobos', 'Lua', 'Europa'], ans: 2, cat: 'Ciências' },
  { q: 'Quantos dias tem um ano bissexto?', opts: ['364', '365', '366', '367'], ans: 2, cat: 'Atualidades' },
  { q: 'Qual esporte utiliza termos como "strike" e "spare"?', opts: ['Beisebol', 'Boliche', 'Tênis', 'Golfe'], ans: 1, cat: 'Esportes' },
  { q: 'Qual país tem formato aproximado de uma bota no mapa?', opts: ['Grécia', 'Itália', 'Portugal', 'Turquia'], ans: 1, cat: 'Geografia' },
  { q: 'Quanto é 7 × 8 + 14?', opts: ['64', '68', '70', '72'], ans: 2, cat: 'Matemática' },
  { q: 'Qual invenção é atribuída a Johannes Gutenberg no século XV?', opts: ['Telégrafo', 'Imprensa de tipos móveis', 'Motor a vapor', 'Telescópio'], ans: 1, cat: 'História' },
  { q: 'Qual bioma brasileiro é famoso por suas araucárias e clima subtropical?', opts: ['Caatinga', 'Pantanal', 'Pampa', 'Mata de Araucárias'], ans: 3, cat: 'Brasil' },
  { q: 'Qual é a velocidade aproximada da luz no vácuo?', opts: ['30 mil km/s', '150 mil km/s', '300 mil km/s', '1 milhão km/s'], ans: 2, cat: 'Ciências' },
  { q: 'Qual país sediou os Jogos Olímpicos de 2016?', opts: ['Reino Unido', 'Japão', 'Brasil', 'França'], ans: 2, cat: 'Esportes' },
  { q: 'Quantos vértices tem um cubo?', opts: ['6', '8', '10', '12'], ans: 1, cat: 'Matemática' },
  { q: 'Qual tecnologia de pagamentos instantâneos do Brasil funciona 24 horas por dia?', opts: ['TED', 'DOC', 'Pix', 'Cheque'], ans: 2, cat: 'Brasil' },
];

const MEMORY_ICONS = ['⚡', '💎', '🔥', '🍀', '🎯', '🚀', '👑', '🎮'];
const BATTLESHIP_SIZE = 7;
const BATTLESHIP_FLEET_LENGTHS = [4, 3, 2, 2];

function normalizeWord(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function generateRoomCode(existing: Map<string, RoomState>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const code = `EE-${suffix}`;
    if (!existing.has(code)) return code;
  }
  return `EE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SERVER_PROFANITY_ROOTS = [
  'porra', 'poha', 'puta', 'puto', 'putinha', 'putao', 'putaria',
  'merda', 'bosta', 'cuzao', 'cuzinho', 'cuzona', 'fdp', 'pqp', 'vsf', 'vtnc',
  'caralho', 'karalho', 'buceta', 'boceta', 'xereca', 'chereca', 'arrombado', 'arrombada',
  'piroca', 'filhodaputa', 'punheta', 'siririca', 'boquete', 'desgraca', 'desgracado',
  'foder', 'fodase', 'fudido', 'fodido', 'viado', 'boiola', 'piranha', 'vadia', 'vagabundo',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'pussy', 'cunt', 'whore', 'slut',
  'faggot', 'nigger', 'nigga', 'nazi', 'hitler',
];

function sanitizeGlobalName(rawName: string): string {
  const clean = String(rawName || 'Jogador').trim().slice(0, 40) || 'Jogador';
  const normalized = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/[^a-z0-9]/g, '');
  if (SERVER_PROFANITY_ROOTS.some((root) => normalized.includes(root))) {
    return 'Jogador ***';
  }
  return clean;
}

export class MultiplayerEngine {
  private rooms = new Map<string, RoomState>();
  private socketToRoom = new Map<WebSocket, { roomCode: string; uid: string }>();
  private allSockets = new Set<WebSocket>();
  private issuedSettlements = new Map<string, SettlementPayload>();
  private signingSecret: string;

  constructor(signingSecret: string) {
    this.signingSecret = signingSecret;
  }

  public verifySettlement(payload: Partial<SettlementPayload>): {
    valid: boolean;
    reason?: string;
    settlement?: SettlementPayload;
  } {
    if (!payload.matchId || !payload.settlementProof) {
      return { valid: false, reason: 'Comprovante de partida ausente.' };
    }
    const stored = this.issuedSettlements.get(payload.matchId);
    if (!stored) {
      // Fallback: recompute HMAC if server restarted before settlement write
      const expected = this.computeSettlementProof({
        matchId: String(payload.matchId),
        roomCode: String(payload.roomCode || ''),
        gameId: String(payload.gameId || '') as MultiplayerGameId,
        winnerUid: String(payload.winnerUid || ''),
        loserUid: String(payload.loserUid || ''),
        stakePoints: Number(payload.stakePoints || 0),
        isDraw: Boolean(payload.isDraw),
        settledAt: String(payload.settledAt || ''),
      });
      if (expected !== payload.settlementProof) {
        return { valid: false, reason: 'Assinatura de partida multiplayer inválida.' };
      }
      return { valid: true, settlement: payload as SettlementPayload };
    }
    if (stored.settlementProof !== payload.settlementProof) {
      return { valid: false, reason: 'Assinatura divergente do servidor.' };
    }
    return { valid: true, settlement: stored };
  }

  private computeSettlementProof(data: {
    matchId: string;
    roomCode: string;
    gameId: MultiplayerGameId;
    winnerUid: string;
    loserUid: string;
    stakePoints: number;
    isDraw: boolean;
    settledAt: string;
  }): string {
    const raw = `${data.matchId}|${data.roomCode}|${data.gameId}|${data.winnerUid}|${data.loserUid}|${data.stakePoints}|${data.isDraw}|${data.settledAt}`;
    return crypto.createHmac('sha256', this.signingSecret).update(raw).digest('hex');
  }

  public attachToServer(server: import('http').Server) {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const host = request.headers.host || 'localhost';
      let pathname = '';
      try {
        pathname = new URL(request.url || '/', `http://${host}`).pathname;
      } catch {
        pathname = '';
      }
      if (pathname !== '/ws/multiplayer') {
        return; // Leave Vite HMR / other WS paths untouched
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    wss.on('connection', (ws: WebSocket) => {
      this.allSockets.add(ws);
      this.send(ws, 'global:matches', this.getOpenGlobalMatches());

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(ws, msg);
        } catch {
          this.sendError(ws, 'Mensagem WebSocket inválida.');
        }
      });

      ws.on('close', () => {
        this.allSockets.delete(ws);
        this.handleDisconnect(ws);
      });
    });
  }

  private getOpenGlobalMatches(): GlobalMatchListing[] {
    const open: GlobalMatchListing[] = [];
    for (const room of this.rooms.values()) {
      if (
        room.visibility === 'public' &&
        room.postedToGlobal &&
        room.status === 'lobby' &&
        room.players.length === 1 &&
        room.players[0]?.connected
      ) {
        const host = room.players[0];
        open.push({
          roomCode: room.roomCode,
          hostUid: host.uid,
          hostName: sanitizeGlobalName(host.displayName),
          hostPhotoURL: host.photoURL,
          hostVerified: Boolean(host.verified || host.verifiedBadge !== 'none'),
          hostVerifiedBadge: host.verifiedBadge || (host.verified ? 'blue' : 'none'),
          gameId: room.gameId,
          totalRounds: room.totalRounds,
          stakePoints: room.stakePoints,
          createdAt: room.createdAt,
        });
      }
    }
    return open.sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
  }

  private broadcastGlobalMatches() {
    const listings = this.getOpenGlobalMatches();
    for (const sock of this.allSockets) {
      if (sock.readyState === WebSocket.OPEN) {
        this.send(sock, 'global:matches', listings);
      }
    }
  }

  private send(ws: WebSocket | null, type: string, payload: unknown) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
  }

  private sendError(ws: WebSocket, message: string) {
    this.send(ws, 'error', { message });
  }

  private broadcastRoom(room: RoomState) {
    room.updatedAt = Date.now();
    for (const player of room.players) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        this.send(player.ws, 'room:state', this.serializeRoomFor(room, player.uid));
      }
    }
  }

  private serializeRoomFor(room: RoomState, viewerUid: string) {
    return {
      roomCode: room.roomCode,
      hostUid: room.hostUid,
      gameId: room.gameId,
      visibility: room.visibility,
      postedToGlobal: room.postedToGlobal,
      totalRounds: room.totalRounds,
      currentRound: room.currentRound,
      status: room.status,
      stakePoints: room.stakePoints,
      proposedCounterPoints: room.proposedCounterPoints,
      counterProposedByUid: room.counterProposedByUid,
      stakeStatus: room.stakeStatus,
      players: room.players.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        photoURL: p.photoURL,
        pointsBalance: p.pointsBalance,
        connected: p.connected,
        isHost: p.isHost,
        acceptedRules: p.acceptedRules,
        score: p.score,
        verified: Boolean(p.verified || p.verifiedBadge !== 'none'),
        verifiedBadge: p.verifiedBadge || (p.verified ? 'blue' : 'none'),
      })),
      gameState: room.gameData ? this.sanitizeGameStateFor(room, viewerUid) : null,
      settlement: room.settlement,
      updatedAt: room.updatedAt,
    };
  }

  private sanitizeGameStateFor(room: RoomState, viewerUid: string): Record<string, any> | null {
    const g = room.gameData;
    if (!g) return null;

    if (room.gameId === 'domino') {
      const handsCount: Record<string, number> = {};
      for (const p of room.players) {
        handsCount[p.uid] = (g.hands[p.uid] || []).length;
      }
      return {
        board: g.board,
        leftEnd: g.leftEnd,
        rightEnd: g.rightEnd,
        turnUid: g.turnUid,
        boneyardCount: (g.boneyard || []).length,
        myHand: g.hands[viewerUid] || [],
        handsCount,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        lastActionText: g.lastActionText,
      };
    }

    if (room.gameId === 'stop') {
      return {
        letter: g.letter,
        categories: g.categories,
        endsAt: g.endsAt,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        submittedUids: Object.keys(g.submissions || {}),
        myAnswers: g.submissions?.[viewerUid] || null,
        reveal: g.roundStatus === 'round_end' ? g.reveal : null,
      };
    }

    if (room.gameId === 'draw_guess') {
      const isDrawer = g.drawerUid === viewerUid;
      return {
        drawerUid: g.drawerUid,
        wordHint: g.word.replace(/[A-Z0-9]/g, '_ '),
        wordLength: g.word.length,
        secretWord: isDrawer || g.roundStatus === 'round_end' ? g.word : null,
        strokes: g.strokes || [],
        guesses: g.guesses || [],
        endsAt: g.endsAt,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
      };
    }

    if (room.gameId === 'battleship') {
      const opponent = room.players.find((p) => p.uid !== viewerUid);
      const myFleet = g.fleets?.[viewerUid] || null;
      const oppUid = opponent?.uid || '';
      const oppFleet = g.fleets?.[oppUid] || null;
      const myShotsOnOpp = g.shots?.[viewerUid] || {};
      const oppShotsOnMe = oppUid ? g.shots?.[oppUid] || {} : {};
      const myFleetPlaced = Boolean(myFleet);
      const oppFleetPlaced = Boolean(oppFleet);

      return {
        size: BATTLESHIP_SIZE,
        fleetLengths: BATTLESHIP_FLEET_LENGTHS,
        phase: g.phase,
        turnUid: g.turnUid,
        myFleet,
        myFleetPlaced,
        oppFleetPlaced,
        myShotsOnOpp,
        oppShotsOnMe,
        myHitsRemaining: oppFleet ? Math.max(0, oppFleet.totalCells - Object.values(myShotsOnOpp).filter((v) => v === 'hit').length) : 11,
        oppHitsRemaining: myFleet ? Math.max(0, myFleet.totalCells - Object.values(oppShotsOnMe).filter((v) => v === 'hit').length) : 11,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        lastActionText: g.lastActionText,
      };
    }

    if (room.gameId === 'quiz') {
      return {
        questionIndex: g.questionIndex,
        questionCategory: g.questionCategory || 'Geral',
        question: g.questionText,
        options: g.options,
        endsAt: g.endsAt,
        answeredUids: Object.keys(g.answers || {}),
        myAnswer: g.answers?.[viewerUid] ?? null,
        correctIndex: g.roundStatus === 'round_end' ? g.correctIndex : null,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        roundBreakdown: g.roundStatus === 'round_end' ? g.roundBreakdown : null,
      };
    }

    if (room.gameId === 'rps') {
      const reveal = g.roundStatus === 'round_end';
      return {
        chosenUids: Object.keys(g.choices || {}),
        myChoice: g.choices?.[viewerUid] || null,
        choices: reveal ? g.choices : null,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        lastActionText: g.lastActionText,
      };
    }

    if (room.gameId === 'guess_number') {
      return {
        turnUid: g.turnUid,
        history: g.history || [],
        minBound: g.minBound,
        maxBound: g.maxBound,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        revealedTarget: g.roundStatus === 'round_end' ? g.target : null,
      };
    }

    if (room.gameId === 'memory_mp') {
      const revealedIndices = new Set<number>(g.tempFlipped || []);
      const visibleBoard = (g.cards as string[]).map((card, idx) =>
        g.matched[idx] || revealedIndices.has(idx) ? card : null
      );
      return {
        cards: visibleBoard,
        matched: g.matched,
        tempFlipped: g.tempFlipped || [],
        turnUid: g.turnUid,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
      };
    }

    if (room.gameId === 'reflex_mp') {
      return {
        phase: g.phase,
        goAt: g.goAt,
        reactions: g.reactions || {},
        falseStartUid: g.falseStartUid || null,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
      };
    }

    // connect4 & tictactoe_mp have no hidden info
    return { ...g };
  }

  private handleDisconnect(ws: WebSocket) {
    const info = this.socketToRoom.get(ws);
    if (!info) return;
    this.socketToRoom.delete(ws);

    const room = this.rooms.get(info.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.uid === info.uid);
    if (!player) return;

    if (player.ws === ws) {
      player.ws = null;
      player.connected = false;
    }

    if (room.players.every((p) => !p.connected)) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      if (room.status === 'lobby') {
        this.rooms.delete(room.roomCode);
      }
      this.broadcastGlobalMatches();
      return;
    }

    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private handleMessage(ws: WebSocket, msg: any) {
    const { type, payload = {} } = msg || {};
    switch (type) {
      case 'room:create':
        this.createRoom(ws, payload);
        break;
      case 'room:join':
        this.joinRoom(ws, payload);
        break;
      case 'room:leave':
        this.leaveRoom(ws);
        break;
      case 'room:update_balance':
        this.updateBalance(ws, payload);
        break;
      case 'room:config':
        this.updateConfig(ws, payload);
        break;
      case 'room:post_global':
        this.postRoomToGlobal(ws);
        break;
      case 'room:unpost_global':
        this.unpostRoomFromGlobal(ws);
        break;
      case 'room:stake_accept':
        this.acceptStake(ws);
        break;
      case 'room:stake_counter':
        this.counterStake(ws, payload);
        break;
      case 'room:stake_respond':
        this.respondCounterStake(ws, payload);
        break;
      case 'room:start':
        this.startMatch(ws);
        break;
      case 'room:rematch':
        this.resetToLobby(ws);
        break;
      case 'room:forfeit':
        this.forfeitMatch(ws);
        break;
      case 'game:action':
        this.handleGameAction(ws, payload);
        break;
      case 'game:next_round':
        this.handleNextRoundRequest(ws);
        break;
      default:
        this.sendError(ws, 'Evento desconhecido.');
    }
  }

  private detachSocketFromCurrentRoom(ws: WebSocket) {
    const prev = this.socketToRoom.get(ws);
    if (!prev) return;
    const prevRoom = this.rooms.get(prev.roomCode);
    if (prevRoom) {
      const p = prevRoom.players.find((item) => item.uid === prev.uid);
      if (p) {
        p.ws = null;
        p.connected = false;
      }
      if (prevRoom.status === 'lobby' && prevRoom.players.every((item) => !item.connected)) {
        if (prevRoom.roundTimer) clearTimeout(prevRoom.roundTimer);
        this.rooms.delete(prevRoom.roomCode);
      } else {
        this.broadcastRoom(prevRoom);
      }
      this.broadcastGlobalMatches();
    }
    this.socketToRoom.delete(ws);
  }

  private createRoom(ws: WebSocket, payload: any) {
    const uid = String(payload.uid || '').trim();
    const displayName = sanitizeGlobalName(String(payload.displayName || 'Jogador'));
    const photoURL = String(payload.photoURL || '').slice(0, 60000);
    const pointsBalance = Math.max(0, Math.floor(Number(payload.pointsBalance || 0)));
    const gameId = String(payload.gameId || 'domino') as MultiplayerGameId;
    const visibility: RoomVisibility = payload.visibility === 'public' ? 'public' : 'private';
    const postToGlobal = visibility === 'public' && payload.postToGlobal !== false;
    const verifiedBadge: 'none' | 'blue' | 'owner' =
      payload.verifiedBadge === 'owner'
        ? 'owner'
        : payload.verifiedBadge === 'blue' || payload.verified
          ? 'blue'
          : 'none';
    const verified = verifiedBadge !== 'none';
    const totalRounds = [1, 3, 5, 7].includes(Number(payload.totalRounds)) ? Number(payload.totalRounds) : 3;
    const stakePoints = Math.max(0, Math.min(50000, Math.floor(Number(payload.stakePoints || 0))));

    if (!uid) {
      this.sendError(ws, 'Faça login para criar uma sala.');
      return;
    }
    if (!VALID_GAMES.has(gameId)) {
      this.sendError(ws, 'Jogo inválido selecionado.');
      return;
    }
    if (stakePoints > pointsBalance) {
      this.sendError(ws, 'Você não tem pontos suficientes para apostar essa quantia.');
      return;
    }

    this.detachSocketFromCurrentRoom(ws);

    // Ensure at most one active public global lobby per host
    for (const [oldCode, oldRoom] of this.rooms.entries()) {
      if (oldRoom.hostUid === uid && oldRoom.status === 'lobby' && oldRoom.players.length <= 1) {
        if (oldRoom.roundTimer) clearTimeout(oldRoom.roundTimer);
        this.rooms.delete(oldCode);
      }
    }

    const roomCode = generateRoomCode(this.rooms);
    const now = Date.now();
    const room: RoomState = {
      roomCode,
      hostUid: uid,
      gameId,
      visibility,
      postedToGlobal: postToGlobal,
      totalRounds,
      currentRound: 0,
      status: 'lobby',
      stakePoints,
      proposedCounterPoints: null,
      counterProposedByUid: null,
      stakeStatus: 'pending_opponent',
      players: [
        {
          uid,
          displayName,
          photoURL,
          pointsBalance,
          connected: true,
          isHost: true,
          acceptedRules: true,
          score: 0,
          verified,
          verifiedBadge,
          ws,
        },
      ],
      gameData: null,
      roundTimer: null,
      settlement: null,
      usedQuizIndices: new Set<number>(),
      usedDrawWords: new Set<string>(),
      usedStopLetters: new Set<string>(),
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(ws, { roomCode, uid });
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private joinRoom(ws: WebSocket, payload: any) {
    const roomCode = String(payload.roomCode || '').trim().toUpperCase();
    const uid = String(payload.uid || '').trim();
    const displayName = sanitizeGlobalName(String(payload.displayName || 'Jogador'));
    const photoURL = String(payload.photoURL || '').slice(0, 60000);
    const verifiedBadge: 'none' | 'blue' | 'owner' =
      payload.verifiedBadge === 'owner'
        ? 'owner'
        : payload.verifiedBadge === 'blue' || payload.verified
          ? 'blue'
          : 'none';
    const verified = verifiedBadge !== 'none';
    const pointsBalance = Math.max(0, Math.floor(Number(payload.pointsBalance || 0)));

    if (!uid || !roomCode) {
      this.sendError(ws, 'Informe seu usuário e o código da sala.');
      return;
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendError(ws, 'Sala não encontrada ou já encerrada.');
      this.broadcastGlobalMatches();
      return;
    }

    this.detachSocketFromCurrentRoom(ws);

    const existing = room.players.find((p) => p.uid === uid);
    if (existing) {
      existing.displayName = displayName || existing.displayName;
      existing.photoURL = photoURL || existing.photoURL;
      existing.pointsBalance = pointsBalance;
      existing.verified = verified;
      existing.verifiedBadge = verifiedBadge;
      existing.connected = true;
      existing.ws = ws;
      this.socketToRoom.set(ws, { roomCode, uid });
      this.broadcastRoom(room);
      this.broadcastGlobalMatches();
      return;
    }

    if (room.status !== 'lobby') {
      this.sendError(ws, 'Esta partida já está em andamento.');
      return;
    }
    if (room.players.length >= 2) {
      this.sendError(ws, 'Esta sala já está cheia (2/2 jogadores).');
      this.broadcastGlobalMatches();
      return;
    }

    room.players.push({
      uid,
      displayName: displayName || 'Amigo',
      photoURL,
      pointsBalance,
      connected: true,
      isHost: false,
      acceptedRules: false,
      score: 0,
      verified,
      verifiedBadge,
      ws,
    });
    // Remove immediately from Global Match Chat as soon as opponent accepts/joins!
    room.postedToGlobal = false;
    room.stakeStatus = 'pending_opponent';
    room.proposedCounterPoints = null;
    room.counterProposedByUid = null;

    this.socketToRoom.set(ws, { roomCode, uid });
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private leaveRoom(ws: WebSocket) {
    const info = this.socketToRoom.get(ws);
    if (!info) return;
    this.socketToRoom.delete(ws);

    const room = this.rooms.get(info.roomCode);
    if (!room) return;

    if (room.status === 'playing') {
      const opponent = room.players.find((p) => p.uid !== info.uid);
      room.players = room.players.filter((p) => p.uid !== info.uid);
      if (opponent) {
        this.finalizeMatchWithWinner(room, opponent.uid, false);
      } else {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        this.rooms.delete(room.roomCode);
      }
      this.send(ws, 'room:left', { roomCode: info.roomCode });
      this.broadcastGlobalMatches();
      return;
    }

    room.players = room.players.filter((p) => p.uid !== info.uid);
    if (room.players.length === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      this.rooms.delete(room.roomCode);
    } else {
      if (room.hostUid === info.uid) {
        room.hostUid = room.players[0].uid;
        room.players[0].isHost = true;
      }
      room.postedToGlobal = false;
      room.players.forEach((p) => {
        p.acceptedRules = p.isHost;
      });
      room.stakeStatus = 'pending_opponent';
      room.proposedCounterPoints = null;
      this.broadcastRoom(room);
    }
    this.send(ws, 'room:left', { roomCode: info.roomCode });
    this.broadcastGlobalMatches();
  }

  private getSocketContext(ws: WebSocket): { room: RoomState; player: ServerPlayer } | null {
    const info = this.socketToRoom.get(ws);
    if (!info) return null;
    const room = this.rooms.get(info.roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.uid === info.uid);
    if (!player) return null;
    return { room, player };
  }

  private updateBalance(ws: WebSocket, payload: any) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const nextBalance = Math.max(0, Math.floor(Number(payload.pointsBalance || 0)));
    ctx.player.pointsBalance = nextBalance;
    this.broadcastRoom(ctx.room);
  }

  private updateConfig(ws: WebSocket, payload: any) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'lobby') return;
    if (!player.isHost) {
      this.sendError(ws, 'Apenas o criador da sala pode alterar jogo, rodadas ou aposta.');
      return;
    }

    if (payload.gameId && VALID_GAMES.has(payload.gameId)) {
      room.gameId = payload.gameId;
    }
    if ([1, 3, 5, 7].includes(Number(payload.totalRounds))) {
      room.totalRounds = Number(payload.totalRounds);
    }
    if (payload.visibility === 'public' || payload.visibility === 'private') {
      room.visibility = payload.visibility;
      if (room.visibility === 'private') {
        room.postedToGlobal = false;
      }
    }
    if (payload.stakePoints !== undefined) {
      const nextStake = Math.max(0, Math.min(50000, Math.floor(Number(payload.stakePoints))));
      if (nextStake > player.pointsBalance) {
        this.sendError(ws, 'Aposte no máximo o saldo disponível na sua conta.');
        return;
      }
      room.stakePoints = nextStake;
    }

    room.proposedCounterPoints = null;
    room.counterProposedByUid = null;
    room.stakeStatus = 'pending_opponent';
    room.players.forEach((p) => {
      p.acceptedRules = p.isHost;
    });
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private postRoomToGlobal(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (!player.isHost) {
      this.sendError(ws, 'Apenas o anfitrião pode publicar a partida no Chat Global.');
      return;
    }
    if (room.status !== 'lobby' || room.players.length >= 2) {
      this.sendError(ws, 'Só é possível publicar salas abertas aguardando adversário.');
      return;
    }
    room.visibility = 'public';
    room.postedToGlobal = true;
    room.createdAt = Date.now();
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private unpostRoomFromGlobal(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (!player.isHost) return;
    room.postedToGlobal = false;
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private acceptStake(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'lobby') return;
    if (room.stakePoints > player.pointsBalance) {
      this.sendError(ws, 'Seu saldo atual é menor que o valor combinado para a partida.');
      return;
    }
    player.acceptedRules = true;
    const allAccepted = room.players.length === 2 && room.players.every((p) => p.acceptedRules);
    room.stakeStatus = allAccepted ? 'agreed' : 'pending_opponent';
    this.broadcastRoom(room);
  }

  private counterStake(ws: WebSocket, payload: any) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'lobby') return;
    if (player.isHost) {
      this.sendError(ws, 'Como criador, altere diretamente a aposta na configuração.');
      return;
    }

    const counter = Math.max(0, Math.min(50000, Math.floor(Number(payload.counterPoints))));
    if (counter > player.pointsBalance) {
      this.sendError(ws, 'Você não possui pontos suficientes para essa contraproposta.');
      return;
    }

    room.proposedCounterPoints = counter;
    room.counterProposedByUid = player.uid;
    room.stakeStatus = 'counter_proposed';
    room.players.forEach((p) => {
      p.acceptedRules = p.uid === player.uid;
    });
    this.broadcastRoom(room);
  }

  private respondCounterStake(ws: WebSocket, payload: any) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'lobby' || !player.isHost) return;
    if (room.stakeStatus !== 'counter_proposed' || room.proposedCounterPoints === null) return;

    const accept = Boolean(payload.accept);
    if (accept) {
      const counter = room.proposedCounterPoints;
      if (counter > player.pointsBalance) {
        this.sendError(ws, 'Seu saldo atual é insuficiente para aceitar essa contraproposta.');
        return;
      }
      room.stakePoints = counter;
      room.proposedCounterPoints = null;
      room.counterProposedByUid = null;
      room.stakeStatus = 'agreed';
      room.players.forEach((p) => {
        p.acceptedRules = true;
      });
    } else {
      room.proposedCounterPoints = null;
      room.counterProposedByUid = null;
      room.stakeStatus = 'rejected';
      room.players.forEach((p) => {
        p.acceptedRules = p.isHost;
      });
    }
    this.broadcastRoom(room);
  }

  private startMatch(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (!player.isHost) {
      this.sendError(ws, 'Apenas o anfitrião da sala pode iniciar a partida.');
      return;
    }
    if (room.players.length < 2) {
      this.sendError(ws, 'Aguarde um amigo entrar na sala pelo código antes de iniciar.');
      return;
    }
    if (room.players.some((p) => !p.connected)) {
      this.sendError(ws, 'Todos os jogadores precisam estar conectados para iniciar.');
      return;
    }
    if (room.stakeStatus !== 'agreed' || room.players.some((p) => !p.acceptedRules)) {
      this.sendError(ws, 'O adversário precisa aceitar as regras e os pontos da partida antes de começar.');
      return;
    }
    for (const p of room.players) {
      if (p.pointsBalance < room.stakePoints) {
        this.sendError(ws, `${p.displayName} não possui saldo suficiente (${room.stakePoints} pts) para esta partida.`);
        return;
      }
    }

    room.status = 'playing';
    room.postedToGlobal = false;
    room.currentRound = 1;
    room.settlement = null;
    room.players.forEach((p) => {
      p.score = 0;
    });
    this.initRound(room);
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private resetToLobby(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room } = ctx;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.status = 'lobby';
    room.postedToGlobal = false;
    room.currentRound = 0;
    room.gameData = null;
    room.settlement = null;
    room.stakeStatus = 'pending_opponent';
    room.proposedCounterPoints = null;
    room.counterProposedByUid = null;
    room.players.forEach((p) => {
      p.score = 0;
      p.acceptedRules = p.isHost;
    });
    this.broadcastRoom(room);
    this.broadcastGlobalMatches();
  }

  private forfeitMatch(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'playing') return;
    const opponent = room.players.find((p) => p.uid !== player.uid);
    if (!opponent) return;
    this.finalizeMatchWithWinner(room, opponent.uid, false);
  }

  private initRound(room: RoomState) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    const p0 = room.players[0];
    const p1 = room.players[1];
    const starterIdx = (room.currentRound - 1) % 2;
    const starterUid = room.players[starterIdx]?.uid || p0.uid;

    switch (room.gameId) {
      case 'domino': {
        const tiles: Array<[number, number]> = [];
        for (let a = 0; a <= 6; a++) {
          for (let b = a; b <= 6; b++) tiles.push([a, b]);
        }
        const deck = shuffleArray(tiles);
        const hand0 = deck.slice(0, 7);
        const hand1 = deck.slice(7, 14);
        const boneyard = deck.slice(14);
        room.gameData = {
          hands: { [p0.uid]: hand0, [p1.uid]: hand1 },
          boneyard,
          board: [] as Array<[number, number]>,
          leftEnd: null as number | null,
          rightEnd: null as number | null,
          turnUid: starterUid,
          consecutivePasses: 0,
          roundStatus: 'active',
          roundWinnerUid: null,
          lastActionText: 'Rodada iniciada! Escolha uma peça para jogar na mesa.',
        };
        break;
      }

      case 'stop': {
        let availableLetters = STOP_LETTERS.filter((l) => !room.usedStopLetters.has(l));
        if (availableLetters.length === 0) {
          room.usedStopLetters.clear();
          availableLetters = [...STOP_LETTERS];
        }
        const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
        room.usedStopLetters.add(letter);
        const endsAt = Date.now() + 60_000;
        room.gameData = {
          letter,
          categories: STOP_CATEGORIES,
          endsAt,
          submissions: {} as Record<string, Record<string, string>>,
          roundStatus: 'active',
          roundWinnerUid: null,
          reveal: null,
        };
        room.roundTimer = setTimeout(() => {
          this.resolveStopRound(room);
        }, 60_500);
        break;
      }

      case 'draw_guess': {
        const drawerUid = starterUid;
        let availableWords = DRAW_WORDS.filter((w) => !room.usedDrawWords.has(w));
        if (availableWords.length === 0) {
          room.usedDrawWords.clear();
          availableWords = [...DRAW_WORDS];
        }
        const word = availableWords[Math.floor(Math.random() * availableWords.length)];
        room.usedDrawWords.add(word);
        const endsAt = Date.now() + 70_000;
        room.gameData = {
          drawerUid,
          word,
          strokes: [] as Array<{ points: Array<{ x: number; y: number }>; color: string; size: number }>,
          guesses: [] as Array<{ uid: string; name: string; text: string; correct: boolean }>,
          endsAt,
          roundStatus: 'active',
          roundWinnerUid: null,
        };
        room.roundTimer = setTimeout(() => {
          if (room.status === 'playing' && room.gameData?.roundStatus === 'active') {
            room.gameData.roundStatus = 'round_end';
            room.gameData.roundWinnerUid = null;
            this.afterRoundResolved(room);
          }
        }, 70_500);
        break;
      }

      case 'battleship': {
        room.gameData = {
          phase: 'placing',
          turnUid: starterUid,
          fleets: {} as Record<string, { ships: Array<Array<{ r: number; c: number }>>; totalCells: number }>,
          shots: {} as Record<string, Record<string, 'hit' | 'miss'>>,
          roundStatus: 'active',
          roundWinnerUid: null,
          lastActionText: 'Posicione sua frota e clique em Confirmar Frota!',
        };
        break;
      }

      case 'connect4': {
        room.gameData = {
          board: Array.from({ length: 6 }, () => Array<string | null>(7).fill(null)),
          turnUid: starterUid,
          colors: { [p0.uid]: 'lime', [p1.uid]: 'sky' },
          winningCells: [] as Array<[number, number]>,
          roundStatus: 'active',
          roundWinnerUid: null,
        };
        break;
      }

      case 'quiz': {
        let unusedIndices = QUIZ_BANK.map((_, i) => i).filter((i) => !room.usedQuizIndices.has(i));
        if (unusedIndices.length === 0) {
          room.usedQuizIndices.clear();
          unusedIndices = QUIZ_BANK.map((_, i) => i);
        }
        const pickedIndex = unusedIndices[Math.floor(Math.random() * unusedIndices.length)];
        room.usedQuizIndices.add(pickedIndex);
        const item = QUIZ_BANK[pickedIndex];
        const endsAt = Date.now() + 18_000;
        room.gameData = {
          questionIndex: room.currentRound,
          questionCategory: item.cat,
          questionText: item.q,
          options: item.opts,
          correctIndex: item.ans,
          startedAt: Date.now(),
          endsAt,
          answers: {} as Record<string, { optionIdx: number; elapsedMs: number }>,
          roundStatus: 'active',
          roundWinnerUid: null,
          roundBreakdown: null,
        };
        room.roundTimer = setTimeout(() => {
          this.resolveQuizRound(room);
        }, 18_500);
        break;
      }

      case 'rps': {
        room.gameData = {
          choices: {} as Record<string, 'rock' | 'paper' | 'scissors'>,
          roundStatus: 'active',
          roundWinnerUid: null,
          lastActionText: 'Escolha Pedra, Papel ou Tesoura em segredo!',
        };
        break;
      }

      case 'tictactoe_mp': {
        room.gameData = {
          board: Array<string | null>(9).fill(null),
          turnUid: starterUid,
          symbols: { [p0.uid]: 'X', [p1.uid]: 'O' },
          winLine: null as number[] | null,
          roundStatus: 'active',
          roundWinnerUid: null,
        };
        break;
      }

      case 'guess_number': {
        room.gameData = {
          target: 1 + Math.floor(Math.random() * 100),
          minBound: 1,
          maxBound: 100,
          turnUid: starterUid,
          history: [] as Array<{ uid: string; name: string; guess: number; hint: string }>,
          roundStatus: 'active',
          roundWinnerUid: null,
        };
        break;
      }

      case 'memory_mp': {
        const cards = shuffleArray([...MEMORY_ICONS, ...MEMORY_ICONS]);
        room.gameData = {
          cards,
          matched: Array<boolean>(16).fill(false),
          tempFlipped: [] as number[],
          locked: false,
          turnUid: starterUid,
          pairScores: { [p0.uid]: 0, [p1.uid]: 0 },
          roundStatus: 'active',
          roundWinnerUid: null,
        };
        break;
      }

      case 'reflex_mp': {
        const waitMs = 1800 + Math.floor(Math.random() * 2400);
        room.gameData = {
          phase: 'waiting',
          goAt: null as number | null,
          reactions: {} as Record<string, number>,
          falseStartUid: null as string | null,
          roundStatus: 'active',
          roundWinnerUid: null,
        };
        room.roundTimer = setTimeout(() => {
          if (room.status === 'playing' && room.gameData?.phase === 'waiting') {
            room.gameData.phase = 'go';
            room.gameData.goAt = Date.now();
            this.broadcastRoom(room);
            room.roundTimer = setTimeout(() => {
              this.resolveReflexTimeout(room);
            }, 4000);
          }
        }, waitMs);
        break;
      }
    }
  }

  private afterRoundResolved(room: RoomState) {
    const isLastRound = room.currentRound >= room.totalRounds;
    if (isLastRound) {
      const [p0, p1] = room.players;
      if (p0.score === p1.score) {
        this.finalizeMatchWithWinner(room, '', true);
      } else {
        const winner = p0.score > p1.score ? p0 : p1;
        this.finalizeMatchWithWinner(room, winner.uid, false);
      }
      return;
    }
    this.broadcastRoom(room);
  }

  private finalizeMatchWithWinner(room: RoomState, winnerUid: string, isDraw: boolean) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.status = 'finished';

    const loserUid =
      !isDraw && winnerUid
        ? room.players.find((p) => p.uid !== winnerUid)?.uid || ''
        : '';

    const scoresByUid: Record<string, number> = {};
    room.players.forEach((p) => {
      scoresByUid[p.uid] = p.score;
    });

    const matchId = `mp_${room.roomCode.replace(/[^A-Z0-9]/g, '')}_${Date.now()}`;
    const settledAt = new Date().toISOString();
    const settlementProof = this.computeSettlementProof({
      matchId,
      roomCode: room.roomCode,
      gameId: room.gameId,
      winnerUid,
      loserUid,
      stakePoints: room.stakePoints,
      isDraw,
      settledAt,
    });

    const settlement: SettlementPayload = {
      matchId,
      roomCode: room.roomCode,
      gameId: room.gameId,
      participantUids: room.players.map((p) => p.uid),
      winnerUid,
      loserUid,
      isDraw,
      stakePoints: room.stakePoints,
      scoresByUid,
      settlementProof,
      settledAt,
    };

    room.settlement = settlement;
    this.issuedSettlements.set(matchId, settlement);
    this.broadcastRoom(room);
  }

  private handleNextRoundRequest(ws: WebSocket) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room } = ctx;
    if (room.status !== 'playing' || !room.gameData) return;
    if (room.gameData.roundStatus !== 'round_end') return;
    if (room.currentRound >= room.totalRounds) return;

    room.currentRound += 1;
    this.initRound(room);
    this.broadcastRoom(room);
  }

  private handleGameAction(ws: WebSocket, payload: any) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== 'playing' || !room.gameData) return;
    const g = room.gameData;
    if (g.roundStatus !== 'active') return;

    const opponent = room.players.find((p) => p.uid !== player.uid);
    if (!opponent) return;

    switch (room.gameId) {
      case 'domino':
        this.actDomino(room, player, opponent, payload);
        break;
      case 'stop':
        this.actStop(room, player, payload);
        break;
      case 'draw_guess':
        this.actDrawGuess(room, player, opponent, payload);
        break;
      case 'battleship':
        this.actBattleship(room, player, opponent, payload);
        break;
      case 'connect4':
        this.actConnect4(room, player, opponent, payload);
        break;
      case 'quiz':
        this.actQuiz(room, player, payload);
        break;
      case 'rps':
        this.actRps(room, player, opponent, payload);
        break;
      case 'tictactoe_mp':
        this.actTicTacToe(room, player, opponent, payload);
        break;
      case 'guess_number':
        this.actGuessNumber(room, player, opponent, payload);
        break;
      case 'memory_mp':
        this.actMemory(room, player, opponent, payload);
        break;
      case 'reflex_mp':
        this.actReflex(room, player, opponent);
        break;
    }
  }

  // --- 1. DOMINÓ ONLINE ---
  private actDomino(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.turnUid !== player.uid) return;
    const hand: Array<[number, number]> = g.hands[player.uid];

    if (payload.action === 'play') {
      const tileIdx = Number(payload.tileIndex);
      const side: 'left' | 'right' = payload.side === 'left' ? 'left' : 'right';
      const tile = hand[tileIdx];
      if (!tile) return;

      if (g.board.length === 0) {
        g.board.push(tile);
        g.leftEnd = tile[0];
        g.rightEnd = tile[1];
      } else if (side === 'left') {
        if (tile[1] === g.leftEnd) {
          g.board.unshift([tile[0], tile[1]]);
          g.leftEnd = tile[0];
        } else if (tile[0] === g.leftEnd) {
          g.board.unshift([tile[1], tile[0]]);
          g.leftEnd = tile[1];
        } else {
          this.sendError(player.ws!, 'Esta peça não encaixa na ponta esquerda.');
          return;
        }
      } else {
        if (tile[0] === g.rightEnd) {
          g.board.push([tile[0], tile[1]]);
          g.rightEnd = tile[1];
        } else if (tile[1] === g.rightEnd) {
          g.board.push([tile[1], tile[0]]);
          g.rightEnd = tile[0];
        } else {
          this.sendError(player.ws!, 'Esta peça não encaixa na ponta direita.');
          return;
        }
      }

      hand.splice(tileIdx, 1);
      g.consecutivePasses = 0;
      g.lastActionText = `${player.displayName} jogou [${tile[0]}|${tile[1]}].`;

      if (hand.length === 0) {
        player.score += 1;
        g.roundStatus = 'round_end';
        g.roundWinnerUid = player.uid;
        g.lastActionText = `${player.displayName} bateu o Dominó!`;
        this.afterRoundResolved(room);
        return;
      }

      g.turnUid = opponent.uid;
      this.broadcastRoom(room);
      return;
    }

    if (payload.action === 'draw') {
      if (g.boneyard.length === 0) {
        this.sendError(player.ws!, 'Monte vazio! Passe a vez se não tiver jogada.');
        return;
      }
      const drawn = g.boneyard.pop()!;
      hand.push(drawn);
      g.lastActionText = `${player.displayName} comprou 1 peça do monte.`;
      this.broadcastRoom(room);
      return;
    }

    if (payload.action === 'pass') {
      const canPlayAny =
        g.board.length === 0 ||
        hand.some(
          ([a, b]) => a === g.leftEnd || b === g.leftEnd || a === g.rightEnd || b === g.rightEnd
        );
      if (canPlayAny) {
        this.sendError(player.ws!, 'Você ainda tem peça válida na mão!');
        return;
      }
      if (g.boneyard.length > 0) {
        this.sendError(player.ws!, 'Compre do monte antes de passar a vez!');
        return;
      }

      g.consecutivePasses += 1;
      g.lastActionText = `${player.displayName} passou a vez.`;

      if (g.consecutivePasses >= 2) {
        const myPips = hand.reduce((s, [a, b]) => s + a + b, 0);
        const oppPips = (g.hands[opponent.uid] as Array<[number, number]>).reduce(
          (s, [a, b]) => s + a + b,
          0
        );
        g.roundStatus = 'round_end';
        if (myPips < oppPips) {
          player.score += 1;
          g.roundWinnerUid = player.uid;
          g.lastActionText = `Jogo trancado! ${player.displayName} venceu nos pontos (${myPips} vs ${oppPips}).`;
        } else if (oppPips < myPips) {
          opponent.score += 1;
          g.roundWinnerUid = opponent.uid;
          g.lastActionText = `Jogo trancado! ${opponent.displayName} venceu nos pontos (${oppPips} vs ${myPips}).`;
        } else {
          g.roundWinnerUid = null;
          g.lastActionText = `Jogo trancado em empate (${myPips} pontos cada).`;
        }
        this.afterRoundResolved(room);
        return;
      }

      g.turnUid = opponent.uid;
      this.broadcastRoom(room);
    }
  }

  // --- 2. STOP ONLINE ---
  private actStop(room: RoomState, player: ServerPlayer, payload: any) {
    const g = room.gameData!;
    const rawAnswers = (payload.answers || {}) as Record<string, string>;
    const clean: Record<string, string> = {};
    for (const cat of STOP_CATEGORIES) {
      clean[cat] = String(rawAnswers[cat] || '').trim().slice(0, 32);
    }
    g.submissions[player.uid] = clean;

    const triggerStop = Boolean(payload.callStop);
    const filledCount = Object.values(clean).filter((v) => v.length >= 2).length;
    const bothSubmitted = room.players.every((p) => Boolean(g.submissions[p.uid]));

    if ((triggerStop && filledCount >= 4) || bothSubmitted) {
      this.resolveStopRound(room);
    } else {
      this.broadcastRoom(room);
    }
  }

  private resolveStopRound(room: RoomState) {
    const g = room.gameData;
    if (!g || g.roundStatus !== 'active' || room.status !== 'playing') return;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    const [p0, p1] = room.players;
    const a0: Record<string, string> = g.submissions[p0.uid] || {};
    const a1: Record<string, string> = g.submissions[p1.uid] || {};
    const letter: string = g.letter;

    let pts0 = 0;
    let pts1 = 0;
    const breakdown: Record<string, { p0Word: string; p0Pts: number; p1Word: string; p1Pts: number }> = {};

    for (const cat of STOP_CATEGORIES) {
      const w0 = normalizeWord(a0[cat] || '');
      const w1 = normalizeWord(a1[cat] || '');
      const v0 = w0.length >= 2 && w0.startsWith(letter);
      const v1 = w1.length >= 2 && w1.startsWith(letter);

      let s0 = 0;
      let s1 = 0;
      if (v0 && v1 && w0 === w1) {
        s0 = 5;
        s1 = 5;
      } else {
        if (v0) s0 = 10;
        if (v1) s1 = 10;
      }
      pts0 += s0;
      pts1 += s1;
      breakdown[cat] = {
        p0Word: a0[cat] || '—',
        p0Pts: s0,
        p1Word: a1[cat] || '—',
        p1Pts: s1,
      };
    }

    g.roundStatus = 'round_end';
    if (pts0 > pts1) {
      p0.score += 1;
      g.roundWinnerUid = p0.uid;
    } else if (pts1 > pts0) {
      p1.score += 1;
      g.roundWinnerUid = p1.uid;
    } else {
      g.roundWinnerUid = null;
    }
    g.reveal = { pts0, pts1, breakdown };
    this.afterRoundResolved(room);
  }

  // --- 3. DESENHE E ADIVINHE ---
  private actDrawGuess(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (payload.action === 'stroke' && player.uid === g.drawerUid) {
      const stroke = payload.stroke;
      if (stroke && Array.isArray(stroke.points) && stroke.points.length > 0) {
        g.strokes.push({
          points: stroke.points.slice(0, 200),
          color: String(stroke.color || '#a3e635').slice(0, 20),
          size: Math.max(2, Math.min(20, Number(stroke.size || 4))),
        });
        if (g.strokes.length > 250) g.strokes.shift();
        this.broadcastRoom(room);
      }
      return;
    }

    if (payload.action === 'clear' && player.uid === g.drawerUid) {
      g.strokes = [];
      this.broadcastRoom(room);
      return;
    }

    if (payload.action === 'guess' && player.uid !== g.drawerUid) {
      const rawGuess = String(payload.text || '').trim().slice(0, 60);
      if (!rawGuess) return;
      const correct = normalizeWord(rawGuess) === normalizeWord(g.word);
      g.guesses.push({
        uid: player.uid,
        name: player.displayName,
        text: rawGuess,
        correct,
      });

      if (correct) {
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
        }
        player.score += 2;
        opponent.score += 1; // Drawer gets 1 point for clear drawing
        g.roundStatus = 'round_end';
        g.roundWinnerUid = player.uid;
        this.afterRoundResolved(room);
      } else {
        this.broadcastRoom(room);
      }
    }
  }

  // --- 4. BATALHA NAVAL ---
  private actBattleship(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (payload.action === 'place_fleet' && g.phase === 'placing') {
      const ships = payload.ships as Array<Array<{ r: number; c: number }>>;
      if (!Array.isArray(ships) || ships.length !== BATTLESHIP_FLEET_LENGTHS.length) {
        this.sendError(player.ws!, 'Frota inválida. Posicione todos os 4 navios.');
        return;
      }
      const seen = new Set<string>();
      let totalCells = 0;
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!Array.isArray(ship) || ship.length !== BATTLESHIP_FLEET_LENGTHS[i]) {
          this.sendError(player.ws!, 'Tamanho de navio inválido.');
          return;
        }
        for (const cell of ship) {
          if (
            cell.r < 0 ||
            cell.r >= BATTLESHIP_SIZE ||
            cell.c < 0 ||
            cell.c >= BATTLESHIP_SIZE
          ) {
            this.sendError(player.ws!, 'Navio fora do tabuleiro.');
            return;
          }
          const key = `${cell.r}_${cell.c}`;
          if (seen.has(key)) {
            this.sendError(player.ws!, 'Navios não podem se sobrepor.');
            return;
          }
          seen.add(key);
          totalCells += 1;
        }
      }

      g.fleets[player.uid] = { ships, totalCells };
      if (g.fleets[opponent.uid]) {
        g.phase = 'battle';
        g.lastActionText = 'Frotas prontas! Hora do combate!';
      } else {
        g.lastActionText = `${player.displayName} posicionou a frota. Aguardando adversário...`;
      }
      this.broadcastRoom(room);
      return;
    }

    if (payload.action === 'shoot' && g.phase === 'battle') {
      if (g.turnUid !== player.uid) return;
      const r = Number(payload.r);
      const c = Number(payload.c);
      if (r < 0 || r >= BATTLESHIP_SIZE || c < 0 || c >= BATTLESHIP_SIZE) return;

      const key = `${r}_${c}`;
      g.shots[player.uid] = g.shots[player.uid] || {};
      if (g.shots[player.uid][key]) return;

      const oppFleet = g.fleets[opponent.uid];
      const isHit = oppFleet.ships.some((ship: Array<{ r: number; c: number }>) =>
        ship.some((cell) => cell.r === r && cell.c === c)
      );

      g.shots[player.uid][key] = isHit ? 'hit' : 'miss';
      const totalHits = Object.values(g.shots[player.uid]).filter((v) => v === 'hit').length;

      if (totalHits >= oppFleet.totalCells) {
        player.score += 1;
        g.roundStatus = 'round_end';
        g.roundWinnerUid = player.uid;
        g.lastActionText = `${player.displayName} afundou toda a frota inimiga!`;
        this.afterRoundResolved(room);
        return;
      }

      if (isHit) {
        g.lastActionText = `${player.displayName} ACERTOU em (${r + 1},${c + 1})! Joga novamente.`;
      } else {
        g.turnUid = opponent.uid;
        g.lastActionText = `${player.displayName} atirou na água (${r + 1},${c + 1}).`;
      }
      this.broadcastRoom(room);
    }
  }

  // --- 5. LIGUE 4 ---
  private actConnect4(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.turnUid !== player.uid) return;
    const col = Number(payload.col);
    if (!Number.isInteger(col) || col < 0 || col >= 7) return;

    const board: Array<Array<string | null>> = g.board;
    let targetRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (board[r][col] === null) {
        targetRow = r;
        break;
      }
    }
    if (targetRow === -1) return;

    board[targetRow][col] = player.uid;

    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let winCells: Array<[number, number]> = [];
    for (const [dr, dc] of dirs) {
      const line: Array<[number, number]> = [[targetRow, col]];
      for (const sign of [1, -1]) {
        let nr = targetRow + dr * sign;
        let nc = col + dc * sign;
        while (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr][nc] === player.uid) {
          line.push([nr, nc]);
          nr += dr * sign;
          nc += dc * sign;
        }
      }
      if (line.length >= 4) {
        winCells = line;
        break;
      }
    }

    if (winCells.length >= 4) {
      g.winningCells = winCells;
      player.score += 1;
      g.roundStatus = 'round_end';
      g.roundWinnerUid = player.uid;
      this.afterRoundResolved(room);
      return;
    }

    if (board[0].every((cell) => cell !== null)) {
      g.roundStatus = 'round_end';
      g.roundWinnerUid = null;
      this.afterRoundResolved(room);
      return;
    }

    g.turnUid = opponent.uid;
    this.broadcastRoom(room);
  }

  // --- 6. QUIZ MULTIPLAYER ---
  private actQuiz(room: RoomState, player: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.answers[player.uid]) return;
    const optionIdx = Number(payload.optionIdx);
    if (!Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx > 3) return;

    g.answers[player.uid] = {
      optionIdx,
      elapsedMs: Math.max(100, Date.now() - g.startedAt),
    };

    if (room.players.every((p) => Boolean(g.answers[p.uid]))) {
      this.resolveQuizRound(room);
    } else {
      this.broadcastRoom(room);
    }
  }

  private resolveQuizRound(room: RoomState) {
    const g = room.gameData;
    if (!g || g.roundStatus !== 'active' || room.status !== 'playing') return;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    const breakdown: Record<string, { correct: boolean; points: number; elapsedMs: number | null }> = {};
    const roundPoints: Record<string, number> = {};

    for (const p of room.players) {
      const ans = g.answers[p.uid];
      if (ans && ans.optionIdx === g.correctIndex) {
        const speedBonus = Math.max(10, Math.round((18_000 - Math.min(18_000, ans.elapsedMs)) / 360));
        const pts = 100 + speedBonus;
        roundPoints[p.uid] = pts;
        p.score += pts;
        breakdown[p.uid] = { correct: true, points: pts, elapsedMs: ans.elapsedMs };
      } else {
        roundPoints[p.uid] = 0;
        breakdown[p.uid] = { correct: false, points: 0, elapsedMs: ans?.elapsedMs ?? null };
      }
    }

    const [p0, p1] = room.players;
    g.roundStatus = 'round_end';
    g.roundBreakdown = breakdown;
    g.roundWinnerUid =
      roundPoints[p0.uid] === roundPoints[p1.uid]
        ? null
        : roundPoints[p0.uid] > roundPoints[p1.uid]
          ? p0.uid
          : p1.uid;
    this.afterRoundResolved(room);
  }

  // --- 7. PEDRA, PAPEL E TESOURA ---
  private actRps(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.choices[player.uid]) return;
    const choice = String(payload.choice);
    if (!['rock', 'paper', 'scissors'].includes(choice)) return;
    g.choices[player.uid] = choice;

    if (!g.choices[opponent.uid]) {
      this.broadcastRoom(room);
      return;
    }

    const c0 = g.choices[player.uid];
    const c1 = g.choices[opponent.uid];
    g.roundStatus = 'round_end';

    if (c0 === c1) {
      g.roundWinnerUid = null;
      g.lastActionText = 'Empate na rodada!';
    } else if (
      (c0 === 'rock' && c1 === 'scissors') ||
      (c0 === 'paper' && c1 === 'rock') ||
      (c0 === 'scissors' && c1 === 'paper')
    ) {
      player.score += 1;
      g.roundWinnerUid = player.uid;
      g.lastActionText = `${player.displayName} venceu a rodada!`;
    } else {
      opponent.score += 1;
      g.roundWinnerUid = opponent.uid;
      g.lastActionText = `${opponent.displayName} venceu a rodada!`;
    }
    this.afterRoundResolved(room);
  }

  // --- 8. JOGO DA VELHA ONLINE ---
  private actTicTacToe(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.turnUid !== player.uid) return;
    const idx = Number(payload.index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 8 || g.board[idx] !== null) return;

    const symbol = g.symbols[player.uid];
    g.board[idx] = symbol;

    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    const winLine = lines.find(([a, b, c]) => g.board[a] && g.board[a] === g.board[b] && g.board[a] === g.board[c]);

    if (winLine) {
      g.winLine = winLine;
      player.score += 1;
      g.roundStatus = 'round_end';
      g.roundWinnerUid = player.uid;
      this.afterRoundResolved(room);
      return;
    }

    if (g.board.every((cell: string | null) => cell !== null)) {
      g.roundStatus = 'round_end';
      g.roundWinnerUid = null;
      this.afterRoundResolved(room);
      return;
    }

    g.turnUid = opponent.uid;
    this.broadcastRoom(room);
  }

  // --- 9. ADIVINHE O NÚMERO ---
  private actGuessNumber(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.turnUid !== player.uid) return;
    const guess = Number(payload.guess);
    if (!Number.isInteger(guess) || guess < 1 || guess > 100) return;

    if (guess === g.target) {
      g.history.push({ uid: player.uid, name: player.displayName, guess, hint: 'ACERTOU!' });
      player.score += 1;
      g.roundStatus = 'round_end';
      g.roundWinnerUid = player.uid;
      this.afterRoundResolved(room);
      return;
    }

    const hint = guess < g.target ? 'É MAIOR ↑' : 'É MENOR ↓';
    if (guess < g.target) g.minBound = Math.max(g.minBound, guess + 1);
    if (guess > g.target) g.maxBound = Math.min(g.maxBound, guess - 1);
    g.history.push({ uid: player.uid, name: player.displayName, guess, hint });
    g.turnUid = opponent.uid;
    this.broadcastRoom(room);
  }

  // --- 10. JOGO DA MEMÓRIA MULTIPLAYER ---
  private actMemory(room: RoomState, player: ServerPlayer, opponent: ServerPlayer, payload: any) {
    const g = room.gameData!;
    if (g.turnUid !== player.uid || g.locked) return;
    const idx = Number(payload.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 16) return;
    if (g.matched[idx] || g.tempFlipped.includes(idx)) return;

    g.tempFlipped.push(idx);
    if (g.tempFlipped.length < 2) {
      this.broadcastRoom(room);
      return;
    }

    const [i1, i2] = g.tempFlipped;
    if (g.cards[i1] === g.cards[i2]) {
      g.matched[i1] = true;
      g.matched[i2] = true;
      g.tempFlipped = [];
      g.pairScores[player.uid] = (g.pairScores[player.uid] || 0) + 1;
      player.score += 1;

      if (g.matched.every(Boolean)) {
        g.roundStatus = 'round_end';
        const p0Pairs = g.pairScores[player.uid] || 0;
        const p1Pairs = g.pairScores[opponent.uid] || 0;
        g.roundWinnerUid = p0Pairs === p1Pairs ? null : p0Pairs > p1Pairs ? player.uid : opponent.uid;
        this.afterRoundResolved(room);
        return;
      }
      this.broadcastRoom(room);
    } else {
      g.locked = true;
      this.broadcastRoom(room);
      room.roundTimer = setTimeout(() => {
        if (room.status === 'playing' && room.gameData) {
          room.gameData.tempFlipped = [];
          room.gameData.locked = false;
          room.gameData.turnUid = opponent.uid;
          this.broadcastRoom(room);
        }
      }, 950);
    }
  }

  // --- 11. TESTE DE REFLEXO ---
  private actReflex(room: RoomState, player: ServerPlayer, opponent: ServerPlayer) {
    const g = room.gameData!;
    if (g.phase === 'waiting') {
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
      g.phase = 'resolved';
      g.falseStartUid = player.uid;
      opponent.score += 1;
      g.roundStatus = 'round_end';
      g.roundWinnerUid = opponent.uid;
      this.afterRoundResolved(room);
      return;
    }

    if (g.phase === 'go' && g.reactions[player.uid] === undefined) {
      g.reactions[player.uid] = Math.max(10, Date.now() - Number(g.goAt || Date.now()));
      if (room.players.every((p) => g.reactions[p.uid] !== undefined)) {
        this.resolveReflexTimeout(room);
      } else {
        this.broadcastRoom(room);
      }
    }
  }

  private resolveReflexTimeout(room: RoomState) {
    const g = room.gameData;
    if (!g || g.roundStatus !== 'active' || room.status !== 'playing') return;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    g.phase = 'resolved';
    const [p0, p1] = room.players;
    const r0 = g.reactions[p0.uid] ?? 9999;
    const r1 = g.reactions[p1.uid] ?? 9999;

    g.roundStatus = 'round_end';
    if (r0 === r1) {
      g.roundWinnerUid = null;
    } else if (r0 < r1) {
      p0.score += 1;
      g.roundWinnerUid = p0.uid;
    } else {
      p1.score += 1;
      g.roundWinnerUid = p1.uid;
    }
    this.afterRoundResolved(room);
  }
}
