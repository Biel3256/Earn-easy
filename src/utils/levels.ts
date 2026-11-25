import { GameSession } from '../types/earneasy';

export interface PlayerLevelTier {
  level: number;
  title: string;
  minXp: number;
  rewardPoints: number;
  perk: string;
}

export const PLAYER_LEVELS: PlayerLevelTier[] = [
  {
    level: 1,
    title: 'Iniciante',
    minXp: 0,
    rewardPoints: 0,
    perk: 'Acesso completo aos 5 jogos e carteira Pix',
  },
  {
    level: 2,
    title: 'Estrategista',
    minXp: 1000,
    rewardPoints: 200,
    perk: 'Recompensa de +200 pontos ao atingir 1.000 XP',
  },
  {
    level: 3,
    title: 'Competidor',
    minXp: 3000,
    rewardPoints: 400,
    perk: 'Recompensa de +400 pontos ao atingir 3.000 XP',
  },
  {
    level: 4,
    title: 'Especialista',
    minXp: 7000,
    rewardPoints: 800,
    perk: 'Recompensa de +800 pontos ao atingir 7.000 XP',
  },
  {
    level: 5,
    title: 'Veterano',
    minXp: 15000,
    rewardPoints: 1500,
    perk: 'Recompensa de +1.500 pontos ao atingir 15.000 XP',
  },
  {
    level: 6,
    title: 'Grão-Mestre',
    minXp: 30000,
    rewardPoints: 3000,
    perk: 'Patamar máximo · Recompensa de +3.000 pontos',
  },
];

export interface PlayerLevelProgress {
  level: number;
  title: string;
  xp: number;
  currentFloorXp: number;
  nextLevelXp: number | null;
  nextTitle: string | null;
  xpRemaining: number;
  progressPct: number;
  isMaxLevel: boolean;
}

export interface GamesXpBreakdown {
  verifiedGames: number;
  verifiedScorePoints: number;
  matchBonusXp: number;
  totalGameXp: number;
}

export function calculateGamesXp(sessions: GameSession[]): GamesXpBreakdown {
  let verifiedGames = 0;
  let verifiedScorePoints = 0;
  for (const s of sessions) {
    if (s.verificationStatus === 'verified') {
      verifiedGames += 1;
      verifiedScorePoints += Math.max(0, Math.round(s.scoreEarned));
    }
  }
  const matchBonusXp = verifiedGames * 25;
  return {
    verifiedGames,
    verifiedScorePoints,
    matchBonusXp,
    totalGameXp: verifiedScorePoints + matchBonusXp,
  };
}

export function calculatePlayerLevel(
  lifetimePoints: number,
  gamesPlayed: number
): PlayerLevelProgress {
  const safePoints = Math.max(0, Math.round(lifetimePoints));
  const safeGames = Math.max(0, Math.round(gamesPlayed));
  const xp = safePoints + safeGames * 25;

  let currentTier = PLAYER_LEVELS[0];
  let nextTier: PlayerLevelTier | null = PLAYER_LEVELS[1];

  for (let i = 0; i < PLAYER_LEVELS.length; i++) {
    if (xp >= PLAYER_LEVELS[i].minXp) {
      currentTier = PLAYER_LEVELS[i];
      nextTier = PLAYER_LEVELS[i + 1] ?? null;
    }
  }

  if (!nextTier) {
    return {
      level: currentTier.level,
      title: currentTier.title,
      xp,
      currentFloorXp: currentTier.minXp,
      nextLevelXp: null,
      nextTitle: null,
      xpRemaining: 0,
      progressPct: 100,
      isMaxLevel: true,
    };
  }

  const span = nextTier.minXp - currentTier.minXp;
  const gainedInTier = xp - currentTier.minXp;
  const progressPct = Math.max(0, Math.min(100, Math.round((gainedInTier / span) * 100)));

  return {
    level: currentTier.level,
    title: currentTier.title,
    xp,
    currentFloorXp: currentTier.minXp,
    nextLevelXp: nextTier.minXp,
    nextTitle: nextTier.title,
    xpRemaining: Math.max(0, nextTier.minXp - xp),
    progressPct,
    isMaxLevel: false,
  };
}
