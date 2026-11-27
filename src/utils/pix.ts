import { PixKeyType } from '../types/earneasy';

let serverClockOffsetMs = 0;
let lastClockSyncMs = 0;
let inflightClockSync: Promise<number> | null = null;

export function getServerNowMs(): number {
  return Date.now() + serverClockOffsetMs;
}

export async function syncServerUtcClock(force = false): Promise<number> {
  if (typeof window === 'undefined') return serverClockOffsetMs;
  const now = Date.now();
  if (!force && lastClockSyncMs > 0 && now - lastClockSyncMs < 60_000) {
    return serverClockOffsetMs;
  }
  if (inflightClockSync) {
    return inflightClockSync;
  }

  inflightClockSync = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2000);
    try {
      const started = Date.now();
      const res = await fetch('/api/time', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) return serverClockOffsetMs;
      const data = (await res.json()) as { nowMs?: number };
      if (typeof data.nowMs === 'number' && Number.isFinite(data.nowMs)) {
        const finished = Date.now();
        const midpoint = started + Math.round((finished - started) / 2);
        serverClockOffsetMs = data.nowMs - midpoint;
        lastClockSyncMs = finished;
      }
    } catch {
      // Fallback to local UTC clock if offline or timeout
    } finally {
      window.clearTimeout(timeout);
      inflightClockSync = null;
    }
    return serverClockOffsetMs;
  })();

  return inflightClockSync;
}

export function formatBRL(cents: number): string {
  const value = (cents || 0) / 100;
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatPoints(points: number): string {
  return (points || 0).toLocaleString('pt-BR');
}

export function getTodayUtcDate(): string {
  return new Date(getServerNowMs()).toISOString().slice(0, 10);
}

export function getUtcDateDaysAgo(daysAgo: number): string {
  const d = new Date(getServerNowMs());
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function mapFriendlyFirebaseMessage(rawMsg: string): string {
  const lower = rawMsg.toLowerCase();
  if (lower.includes('failed-precondition') || lower.includes('requires an index')) {
    return 'Sincronizando índice de consulta no servidor. Recarregue a página em alguns segundos.';
  }
  if (lower.includes('unauthenticated') || lower.includes('auth/')) {
    return 'Sua sessão expirou. Faça login novamente com o Google para continuar.';
  }
  if (lower.includes('missing or insufficient permissions') || lower.includes('permission-denied')) {
    return 'Operação recusada pela validação de segurança. Recarregue a página ou tente novamente.';
  }
  if (lower.includes('network') || lower.includes('unavailable') || lower.includes('offline')) {
    return 'Conexão instável com o servidor. Verifique sua internet e tente novamente.';
  }
  return rawMsg;
}

export function extractReadableError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  if (!raw) return fallback;

  if (raw.startsWith('{') && raw.includes('"error"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) {
        return mapFriendlyFirebaseMessage(parsed.error);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  return mapFriendlyFirebaseMessage(raw);
}

export function isValidCPF(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  if (rem !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  rem = (sum * 10) % 11;
  if (rem === 10) rem = 0;
  return rem === Number(digits[10]);
}

export function validatePixKey(type: PixKeyType, rawValue: string): { valid: boolean; normalized: string; message?: string } {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, normalized: '', message: 'Informe a chave Pix.' };
  }

  switch (type) {
    case 'cpf': {
      const digits = value.replace(/\D/g, '');
      if (!isValidCPF(digits)) {
        return { valid: false, normalized: value, message: 'CPF inválido. Verifique os 11 dígitos.' };
      }
      const formatted = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      return { valid: true, normalized: formatted };
    }
    case 'email': {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!emailOk) {
        return { valid: false, normalized: value, message: 'E-mail inválido para chave Pix.' };
      }
      return { valid: true, normalized: value.toLowerCase() };
    }
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      const clean = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
      if (clean.length !== 10 && clean.length !== 11) {
        return { valid: false, normalized: value, message: 'Telefone deve incluir DDD + número (10 ou 11 dígitos).' };
      }
      return { valid: true, normalized: `+55${clean}` };
    }
    case 'random': {
      const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      if (!uuidOk) {
        return { valid: false, normalized: value, message: 'Chave aleatória deve estar no formato UUID (ex: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' };
      }
      return { valid: true, normalized: value.toLowerCase() };
    }
  }
}

export function timestampToMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    const maybe = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybe.toMillis === 'function') {
      return maybe.toMillis();
    }
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000 + Math.floor((maybe.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
}

export function formatScheduleRemaining(targetMs: number, nowMs: number = getServerNowMs()): string {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return 'Liberado agora';
  const totalSec = Math.ceil(diffMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.ceil(diffMs / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function formatScheduleTime(targetMs: number): string {
  if (!targetMs) return '';
  return new Date(targetMs).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
