export type GameCategory =
  | 'tic_tac_toe'
  | 'dot_link'
  | 'word_search'
  | 'math_sprint'
  | 'memory_match'
  | 'quick_reflex'
  | 'high_low_cards'
  | 'block_britz'
  | 'domino_solo'
  | 'stop_solo'
  | 'draw_guess_solo'
  | 'battleship_solo'
  | 'connect4_solo'
  | 'quiz_solo'
  | 'rps_solo'
  | 'guess_number_solo';

export type AccountStatus = 'active' | 'suspended' | 'flagged';
export type PixKeyType = 'cpf' | 'email' | 'phone' | 'random';
export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type VerifiedBadgeTier = 'none' | 'blue' | 'owner';
export type VerificationStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type VerificationDocumentType = 'rg' | 'cnh' | 'passaporte' | 'outro';

export interface UserAccount {
  uid: string;
  displayName: string;
  photoURL: string;
  pointsBalance: number;
  lifetimePoints: number;
  brlBalanceCents: number;
  totalWithdrawnCents: number;
  lastConversionDate: string;
  status: AccountStatus;
  riskScore: number;
  gamesPlayed: number;
  banReason?: string;
  banExplanation?: string;
  bannedBy?: string;
  suspensionUntil?: unknown;
  lastPromoCode?: string;
  lastMpMatchId?: string;
  lastCasinoSessionId?: string;
  firstWithdrawalUsed?: boolean;
  identityVerified?: boolean;
  verifiedBadge?: VerifiedBadgeTier;
  verificationStatus?: VerificationStatus;
  verificationNote?: string;
  verifiedAt?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface VerificationRequest {
  uid: string;
  displayName: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  documentType: VerificationDocumentType;
  documentNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string;
  reviewedBy: string;
  submittedAt: unknown;
  reviewedAt: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  defaultPixKeyType: 'none' | PixKeyType;
  defaultPixKey: string;
  deviceFingerprint: string;
  updatedAt: unknown;
}

export interface GameSession {
  sessionId: string;
  userId: string;
  gameCategory: GameCategory;
  scoreEarned: number;
  durationMs: number;
  movesCount: number;
  integrityHash: string;
  verificationStatus: 'verified' | 'flagged' | 'rejected';
  fraudReason: string;
  playedDate: string;
  createdAt: unknown;
}

export interface PointConversion {
  conversionId: string;
  userId: string;
  pointsConverted: number;
  brlCentsCredited: number;
  conversionDate: string;
  captchaVerified: boolean;
  integrityToken: string;
  createdAt: unknown;
}

export interface PixWithdrawal {
  withdrawalId: string;
  userId: string;
  userDisplayName: string;
  amountCents: number;
  pixKeyType: PixKeyType;
  pixKey: string;
  status: WithdrawalStatus;
  fraudCheckPassed: boolean;
  adminNote: string;
  pixTransactionId: string;
  requestedDate: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface FraudEvent {
  logId: string;
  userId: string;
  eventType:
    | 'speed_anomaly'
    | 'score_cap_exceeded'
    | 'double_conversion_attempt'
    | 'bot_challenge_failed'
    | 'suspicious_withdrawal'
    | 'manual_flag'
    | 'profanity_username_ban'
    | 'admin_ban';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  resolved: boolean;
  createdAt: unknown;
}

export interface EmailNotification {
  notificationId: string;
  userId: string;
  recipientEmail: string;
  eventType:
    | 'conversion_confirmed'
    | 'withdrawal_requested'
    | 'withdrawal_approved'
    | 'withdrawal_paid'
    | 'withdrawal_rejected'
    | 'streak_bonus_credited'
    | 'invite_sent'
    | 'referral_welcome'
    | 'referral_bonus_credited';
  subject: string;
  summary: string;
  deliveryStatus: 'sent_smtp' | 'logged_in_app' | 'failed';
  referenceId: string;
  createdAt: unknown;
}

export interface EnterpriseIntegration {
  integrationId: string;
  name: string;
  providerType: 'erp_webhook' | 'accounting_api' | 'pix_gateway' | 'bi_export';
  endpointUrl: string;
  apiKeyPrefix: string;
  apiKeyHash: string;
  active: boolean;
  lastTriggeredAt: string;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string;
  brlBalanceCents: number;
  pointsBalance: number;
  lifetimePoints?: number;
  gamesPlayed: number;
  status: AccountStatus;
  identityVerified?: boolean;
  verifiedBadge?: VerifiedBadgeTier;
  updatedAt: unknown;
}

export interface DailyCheckin {
  checkinId: string;
  userId: string;
  checkinDate: string;
  pointsAwarded: number;
  weekTotalAfter: number;
  streakDay?: number;
  brlBonusCents?: number;
  createdAt: unknown;
}

export interface LevelReward {
  rewardId: string;
  userId: string;
  level: number;
  rewardPoints: number;
  xpAtClaim: number;
  createdAt: unknown;
}

export interface Referral {
  referralId: string;
  referrerUid: string;
  invitedUid: string;
  invitedDisplayName: string;
  signupBonusPoints: number;
  commissionRatePct: number;
  totalCommissionPointsEarned: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PromoCode {
  code: string;
  title: string;
  pointsValue: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  publicEvent: boolean;
  publishDelayMinutes?: number;
  publishAt?: unknown;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PromoRedemption {
  redemptionId: string;
  code: string;
  userId: string;
  pointsAwarded: number;
  createdAt: unknown;
}

export interface MailboxMessage {
  messageId: string;
  title: string;
  body: string;
  category: 'promo_event' | 'system_notice';
  promoCode: string;
  pointsValue: number;
  publishAt: unknown;
  active: boolean;
  createdBy: string;
  createdAt: unknown;
}

export interface WithdrawalSettings {
  settingId: 'withdrawal';
  firstWithdrawalMinCents: number;
  standardWithdrawalMinCents: number;
  quickAmountsCents: number[];
  updatedBy: string;
  updatedAt: unknown;
}

export type WithdrawalAttemptStatus =
  | 'submitted_pending'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'blocked_min_amount'
  | 'blocked_insufficient_balance'
  | 'blocked_invalid_pix'
  | 'blocked_captcha'
  | 'blocked_account_status'
  | 'failed_transaction';

export interface WithdrawalAttemptLog {
  attemptId: string;
  userId: string;
  userDisplayName: string;
  withdrawalId: string;
  amountCents: number;
  pixKeyType: 'none' | PixKeyType;
  pixKey: string;
  status: WithdrawalAttemptStatus;
  details: string;
  deviceFingerprint: string;
  actorUid: string;
  createdAt: unknown;
}

export const GAME_LABELS: Record<GameCategory, string> = {
  tic_tac_toe: 'Jogo da Velha',
  dot_link: 'Dot Link',
  word_search: 'Caça-Palavras',
  math_sprint: 'Desafio Matemático',
  memory_match: 'Memória de Cartas',
  quick_reflex: 'Reflexo Rápido',
  high_low_cards: 'Maior ou Menor',
  block_britz: 'Block Britz',
  domino_solo: 'Dominó',
  stop_solo: 'Stop',
  draw_guess_solo: 'Desenhe e Adivinhe',
  battleship_solo: 'Batalha Naval',
  connect4_solo: 'Ligue 4',
  quiz_solo: 'Quiz',
  rps_solo: 'Pedra, Papel e Tesoura',
  guess_number_solo: 'Adivinhe o Número',
};

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

export const MULTIPLAYER_GAME_LABELS: Record<MultiplayerGameId, string> = {
  domino: 'Dominó Online',
  stop: 'Stop Online',
  draw_guess: 'Desenhe e Adivinhe',
  battleship: 'Batalha Naval',
  connect4: 'Ligue 4',
  quiz: 'Quiz Multiplayer',
  rps: 'Pedra, Papel e Tesoura',
  tictactoe_mp: 'Jogo da Velha Online',
  guess_number: 'Adivinhe o Número',
  memory_mp: 'Jogo da Memória Multiplayer',
  reflex_mp: 'Teste de Reflexo',
};

export type RoomStakeStatus = 'agreed' | 'pending_opponent' | 'counter_proposed' | 'rejected';
export type RoomVisibility = 'private' | 'public';

export interface MultiplayerPlayerInfo {
  uid: string;
  displayName: string;
  photoURL: string;
  pointsBalance: number;
  connected: boolean;
  isHost: boolean;
  acceptedRules: boolean;
  score: number;
  verified?: boolean;
  verifiedBadge?: VerifiedBadgeTier;
}

export interface GlobalMatchListing {
  roomCode: string;
  hostUid: string;
  hostName: string;
  hostPhotoURL: string;
  hostVerified: boolean;
  hostVerifiedBadge?: VerifiedBadgeTier;
  gameId: MultiplayerGameId;
  totalRounds: number;
  stakePoints: number;
  createdAt: number;
}

export type CasinoGameId = 'double' | 'mines';
export type CasinoCurrency = 'points' | 'brl';

export interface CasinoSession {
  sessionId: string;
  userId: string;
  gameType: CasinoGameId;
  currency: CasinoCurrency;
  stakeAmount: number;
  payoutAmount: number;
  multiplier: number;
  status: 'active' | 'won' | 'lost';
  details: string;
  integrityHash: string;
  createdAt: unknown;
  settledAt: unknown | null;
}

export interface MultiplayerSettlementPayload {
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

export interface MultiplayerMatchRecord {
  matchId: string;
  roomCode: string;
  gameId: MultiplayerGameId;
  participantUids: string[];
  winnerUid: string;
  loserUid: string;
  stakePoints: number;
  settledByUid: string;
  integrityHash: string;
  createdAt: unknown;
}

export interface MultiplayerRoomSnapshot {
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
  players: MultiplayerPlayerInfo[];
  gameState: Record<string, unknown> | null;
  settlement: MultiplayerSettlementPayload | null;
  updatedAt: number;
}

export interface MaintenanceSettings {
  settingId: 'maintenance';
  enabled: boolean;
  title: string;
  message: string;
  estimatedReturn: string;
  updatedBy: string;
  updatedAt: unknown;
}

export const DEFAULT_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  settingId: 'maintenance',
  enabled: false,
  title: 'Plataforma em Manutenção Programada',
  message:
    'Estamos atualizando nossos servidores, jogos e sistema de recompensas Pix para deixar sua experiência ainda mais rápida e segura.',
  estimatedReturn: 'Voltamos em alguns instantes',
  updatedBy: 'system',
  updatedAt: null,
};

export type SupportTicketStatus = 'waiting_human' | 'active_human' | 'closed';

export type SupportTopic =
  | 'checkin'
  | 'pix'
  | 'invites'
  | 'games'
  | 'account'
  | 'other';

export interface SupportTicket {
  ticketId: string;
  userId: string;
  userDisplayName: string;
  topic: SupportTopic;
  subject: string;
  bielSummary: string;
  status: SupportTicketStatus;
  assignedAdminUid: string;
  assignedAdminName: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface SupportMessage {
  messageId: string;
  ticketId: string;
  senderUid: string;
  senderName: string;
  senderRole: 'user' | 'biel' | 'admin';
  text: string;
  createdAt: unknown;
}

export interface AdminRoleRecord {
  uid: string;
  email: string;
  grantedBy: string;
  createdAt: unknown;
}

export type SocialMessageType = 'text' | 'image' | 'audio';

export const ADMIN_BOOTSTRAP_EMAIL = 'riel6359@gmail.com';
export const PRIMARY_OWNER_UID = 'H93H113NSHg0K3ircdUTe7fY0Gt1';

export function isOwnerIdentity(email?: string | null, uid?: string | null): boolean {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  return cleanEmail === ADMIN_BOOTSTRAP_EMAIL || cleanUid === PRIMARY_OWNER_UID;
}

export const POINTS_PER_TEN_CENTS = 1000;
export const CENTS_PER_BLOCK = 10;
export const FIRST_PIX_WITHDRAWAL_MIN_CENTS = 10;
export const MIN_PIX_WITHDRAWAL_CENTS = 500;
export const MIN_CONFIGURABLE_WITHDRAWAL_CENTS = 1;
export const MAX_CONFIGURABLE_WITHDRAWAL_CENTS = 2000;
export const DEFAULT_WITHDRAWAL_QUICK_AMOUNTS_CENTS = [10, 50, 100, 200, 500, 1000, 2000];
export const DEFAULT_WITHDRAWAL_SETTINGS: WithdrawalSettings = {
  settingId: 'withdrawal',
  firstWithdrawalMinCents: FIRST_PIX_WITHDRAWAL_MIN_CENTS,
  standardWithdrawalMinCents: MIN_PIX_WITHDRAWAL_CENTS,
  quickAmountsCents: DEFAULT_WITHDRAWAL_QUICK_AMOUNTS_CENTS,
  updatedBy: 'system',
  updatedAt: null,
};
export const STREAK_TARGET_DAYS = 30;
export const STREAK_REWARD_CENTS = 1000;
export const REFERRAL_SIGNUP_BONUS_POINTS = 500;
export const REFERRAL_COMMISSION_RATE = 0.12;
export const MAX_PROMO_CODE_POINTS = 100000;
