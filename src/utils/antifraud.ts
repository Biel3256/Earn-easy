import { GameCategory } from '../types/earneasy';

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getDeviceFingerprint(): Promise<string> {
  const raw = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${window.screen.width}x${window.screen.height}`,
    String(navigator.hardwareConcurrency || 2),
  ].join('|');
  const hash = await sha256Hex(raw);
  return hash.slice(0, 32);
}

export function generateId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${Date.now()}_${rand}`;
}

export interface AntiFraudSessionResult {
  verificationStatus: 'verified' | 'flagged' | 'rejected';
  fraudReason: string;
  riskDelta: number;
  verifiedScore: number;
  integrityHash: string;
}

export async function verifyGameSessionWithServer(params: {
  userId: string;
  gameCategory: GameCategory;
  scoreEarned: number;
  durationMs: number;
  movesCount: number;
}): Promise<AntiFraudSessionResult> {
  const nonce = crypto.randomUUID().slice(0, 12);
  try {
    const res = await fetch('/api/antifraud/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, nonce }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      throw new Error('Static host mode');
    }
    return await res.json();
  } catch {
    const fallbackHash = await sha256Hex(`${params.userId}|${params.gameCategory}|${params.scoreEarned}|${params.durationMs}|${nonce}`);
    const clampedScore = Math.max(0, Math.min(500, Math.round(params.scoreEarned)));
    const isTooFast = params.durationMs < 3500;
    const isNoMoves = params.movesCount < 1;
    return {
      verificationStatus: isNoMoves ? 'rejected' : isTooFast ? 'flagged' : 'verified',
      fraudReason: isNoMoves
        ? 'Nenhuma jogada válida registrada.'
        : isTooFast
          ? 'Duração mínima não atingida.'
          : '',
      riskDelta: isNoMoves ? 40 : isTooFast ? 20 : 0,
      verifiedScore: isNoMoves ? 0 : clampedScore,
      integrityHash: fallbackHash,
    };
  }
}

export interface HumanChallenge {
  question: string;
  answer: number;
}

export function createHumanChallenge(): HumanChallenge {
  const a = Math.floor(Math.random() * 14) + 6;
  const b = Math.floor(Math.random() * 9) + 2;
  const ops = ['+', '-'] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  if (op === '+') {
    return { question: `Quanto é ${a} + ${b}?`, answer: a + b };
  }
  return { question: `Quanto é ${a} - ${b}?`, answer: a - b };
}

let audioCtx: AudioContext | null = null;

export function playTone(freq: number, duration = 0.08, type: OscillatorType = 'sine', enabled = true) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // Ignore audio context restriction errors
  }
}
