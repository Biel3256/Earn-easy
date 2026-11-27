import { serverTimestamp, Timestamp } from 'firebase/firestore';

export const ALLOWED_USER_ACCOUNT_KEYS = new Set([
  'uid',
  'displayName',
  'photoURL',
  'pointsBalance',
  'lifetimePoints',
  'brlBalanceCents',
  'totalWithdrawnCents',
  'lastConversionDate',
  'status',
  'riskScore',
  'gamesPlayed',
  'banReason',
  'banExplanation',
  'bannedBy',
  'suspensionUntil',
  'lastPromoCode',
  'firstWithdrawalUsed',
  'lastMpMatchId',
  'lastCasinoSessionId',
  'verified',
  'createdAt',
  'updatedAt',
]);

export const REQUIRED_USER_ACCOUNT_KEYS = [
  'uid',
  'displayName',
  'photoURL',
  'pointsBalance',
  'lifetimePoints',
  'brlBalanceCents',
  'totalWithdrawnCents',
  'lastConversionDate',
  'status',
  'riskScore',
  'gamesPlayed',
  'createdAt',
  'updatedAt',
];

export function isFirestoreTimestamp(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  if (val instanceof Timestamp) return true;
  const maybe = val as { toMillis?: unknown; seconds?: unknown };
  return typeof maybe.toMillis === 'function';
}

export function normalizeFirestoreTimestamp(val: unknown): Timestamp | null {
  if (val instanceof Timestamp) return val;
  if (val && typeof val === 'object') {
    const maybe = val as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybe.toMillis === 'function') {
      return Timestamp.fromMillis(maybe.toMillis());
    }
    if (typeof maybe.seconds === 'number' && Number.isFinite(maybe.seconds)) {
      const ms = maybe.seconds * 1000 + Math.floor((Number(maybe.nanoseconds) || 0) / 1_000_000);
      return Timestamp.fromMillis(ms);
    }
  }
  return null;
}

export function safeDisplayNameForSchema(rawName: unknown, fallbackName?: string | null): string {
  const base =
    typeof rawName === 'string' && rawName.trim().length > 0
      ? rawName.trim()
      : typeof fallbackName === 'string' && fallbackName.trim().length > 0
        ? fallbackName.trim()
        : 'Jogador';
  return base.slice(0, 80);
}

export function safePhotoUrlForSchema(rawPhoto: unknown): string {
  if (typeof rawPhoto !== 'string') return '';
  const trimmed = rawPhoto.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) {
    return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed) &&
      trimmed.length <= 60000
      ? trimmed
      : '';
  }
  return trimmed.slice(0, 1000);
}

export function toNonNegativeInt(val: unknown): number {
  const num = Number(val ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function needsUserAccountSchemaRepair(
  raw: Record<string, unknown>,
  expectedUid?: string
): boolean {
  for (const reqKey of REQUIRED_USER_ACCOUNT_KEYS) {
    if (!(reqKey in raw) || raw[reqKey] === undefined || raw[reqKey] === null) {
      return true;
    }
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_USER_ACCOUNT_KEYS.has(key)) {
      return true;
    }
  }
  if (expectedUid && raw.uid !== expectedUid) return true;
  if (typeof raw.uid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.uid)) return true;
  if (typeof raw.displayName !== 'string' || raw.displayName.length < 1 || raw.displayName.length > 80) {
    return true;
  }
  if (typeof raw.photoURL !== 'string' || raw.photoURL !== safePhotoUrlForSchema(raw.photoURL)) {
    return true;
  }
  const numKeys = [
    'pointsBalance',
    'lifetimePoints',
    'brlBalanceCents',
    'totalWithdrawnCents',
    'riskScore',
    'gamesPlayed',
  ];
  for (const nk of numKeys) {
    if (typeof raw[nk] !== 'number' || !Number.isFinite(raw[nk] as number) || (raw[nk] as number) < 0) {
      return true;
    }
  }
  if ((raw.riskScore as number) > 100) return true;
  if (
    typeof raw.lastConversionDate !== 'string' ||
    (raw.lastConversionDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(raw.lastConversionDate))
  ) {
    return true;
  }
  if (raw.status !== 'active' && raw.status !== 'suspended' && raw.status !== 'flagged') {
    return true;
  }
  if (!isFirestoreTimestamp(raw.createdAt) || !isFirestoreTimestamp(raw.updatedAt)) {
    return true;
  }
  if (
    'suspensionUntil' in raw &&
    raw.suspensionUntil !== null &&
    !isFirestoreTimestamp(raw.suspensionUntil)
  ) {
    return true;
  }
  if ('verified' in raw && typeof raw.verified !== 'boolean') {
    return true;
  }
  if (
    'lastPromoCode' in raw &&
    (typeof raw.lastPromoCode !== 'string' || !/^[A-Z0-9_-]{3,40}$/.test(raw.lastPromoCode))
  ) {
    return true;
  }
  if (
    'lastMpMatchId' in raw &&
    (typeof raw.lastMpMatchId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.lastMpMatchId))
  ) {
    return true;
  }
  if (
    'lastCasinoSessionId' in raw &&
    (typeof raw.lastCasinoSessionId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.lastCasinoSessionId))
  ) {
    return true;
  }
  return false;
}

export function buildRepairedUserAccountPayload(
  raw: Record<string, unknown>,
  uid: string,
  fallbackDisplayName?: string | null,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const validCreatedAt = normalizeFirestoreTimestamp(raw.createdAt);
  const payload: Record<string, unknown> = {
    uid,
    displayName: safeDisplayNameForSchema(raw.displayName, fallbackDisplayName),
    photoURL: safePhotoUrlForSchema(raw.photoURL),
    pointsBalance: toNonNegativeInt(raw.pointsBalance),
    lifetimePoints: toNonNegativeInt(raw.lifetimePoints),
    brlBalanceCents: toNonNegativeInt(raw.brlBalanceCents),
    totalWithdrawnCents: toNonNegativeInt(raw.totalWithdrawnCents),
    lastConversionDate:
      typeof raw.lastConversionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastConversionDate)
        ? raw.lastConversionDate
        : '',
    status:
      raw.status === 'active' || raw.status === 'suspended' || raw.status === 'flagged'
        ? raw.status
        : 'active',
    riskScore: Math.min(100, toNonNegativeInt(raw.riskScore)),
    gamesPlayed: toNonNegativeInt(raw.gamesPlayed),
    createdAt: validCreatedAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (typeof raw.banReason === 'string' && raw.banReason.length <= 120) {
    payload.banReason = raw.banReason;
  }
  if (typeof raw.banExplanation === 'string' && raw.banExplanation.length <= 400) {
    payload.banExplanation = raw.banExplanation;
  }
  if (typeof raw.bannedBy === 'string' && raw.bannedBy.length <= 160) {
    payload.bannedBy = raw.bannedBy;
  }
  if ('suspensionUntil' in raw) {
    if (raw.suspensionUntil === null) {
      payload.suspensionUntil = null;
    } else {
      const normalizedSusp = normalizeFirestoreTimestamp(raw.suspensionUntil);
      if (normalizedSusp) {
        payload.suspensionUntil = normalizedSusp;
      }
    }
  }
  if (typeof raw.lastPromoCode === 'string' && /^[A-Z0-9_-]{3,40}$/.test(raw.lastPromoCode)) {
    payload.lastPromoCode = raw.lastPromoCode;
  }
  if (typeof raw.firstWithdrawalUsed === 'boolean') {
    payload.firstWithdrawalUsed = raw.firstWithdrawalUsed;
  }
  if (typeof raw.lastMpMatchId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.lastMpMatchId)) {
    payload.lastMpMatchId = raw.lastMpMatchId;
  }
  if (
    typeof raw.lastCasinoSessionId === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(raw.lastCasinoSessionId)
  ) {
    payload.lastCasinoSessionId = raw.lastCasinoSessionId;
  }
  if (typeof raw.verified === 'boolean') {
    payload.verified = raw.verified;
  }

  return {
    ...payload,
    ...overrides,
    updatedAt: serverTimestamp(),
  };
}

export function buildCleanLeaderboardPayload(
  raw: Record<string, unknown>,
  uid: string,
  fallbackDisplayName?: string | null,
  overrides: {
    brlBalanceCents?: number;
    pointsBalance?: number;
    lifetimePoints?: number;
    gamesPlayed?: number;
    status?: 'active' | 'suspended' | 'flagged';
    verified?: boolean;
  } = {}
): Record<string, unknown> {
  const status =
    overrides.status ??
    (raw.status === 'active' || raw.status === 'suspended' || raw.status === 'flagged'
      ? raw.status
      : 'active');

  return {
    uid,
    displayName: safeDisplayNameForSchema(raw.displayName, fallbackDisplayName),
    photoURL: safePhotoUrlForSchema(raw.photoURL),
    brlBalanceCents: overrides.brlBalanceCents ?? toNonNegativeInt(raw.brlBalanceCents),
    pointsBalance: overrides.pointsBalance ?? toNonNegativeInt(raw.pointsBalance),
    lifetimePoints: overrides.lifetimePoints ?? toNonNegativeInt(raw.lifetimePoints),
    gamesPlayed: overrides.gamesPlayed ?? toNonNegativeInt(raw.gamesPlayed),
    status,
    verified: overrides.verified ?? Boolean(raw.verified),
    updatedAt: serverTimestamp(),
  };
}
