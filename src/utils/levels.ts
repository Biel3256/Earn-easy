export interface PlayerLevelTier {
  level: number;
  title: string;
  minXp: number;
  perk: string;
}

export const PLAYER_LEVELS: PlayerLevelTier[] = [
  { level: 1, title: 'Iniciante', minXp: 0, perk: 'Acesso completo aos 5 jogos e carteira Pix' },
  { level: 2, title: 'Estrategista', minXp: 1000, perk: 'Desbloqueado ao atingir 1.000 XP acumulados' },
  { level: 3, title: 'Competidor', minXp: 3000, perk: 'Consistência diária nas rodadas de pontuação' },
  { level: 4, title: 'Especialista', minXp: 7000, perk: 'Domínio nos desafios de raciocínio e agilidade' },
  { level: 5, title: 'Veterano', minXp: 15000, perk: 'Histórico avançado de partidas verificadas' },
  { level: 6, title: 'Grão-Mestre', minXp: 30000, perk: 'Patamar máximo da plataforma Earn Easy' },
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
