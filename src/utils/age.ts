import { MIN_VERIFIED_AGE } from '../types/earneasy';

export function calculateAgeFromBirthDate(birthDateStr: string, now: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) return null;
  const [yStr, mStr, dStr] = birthDateStr.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  let age = todayY - year;
  if (todayM < month || (todayM === month && todayD < day)) {
    age -= 1;
  }
  return age;
}

export function validateBirthDateInput(raw: string): {
  valid: boolean;
  isAdult: boolean;
  age: number | null;
  clean: string;
  error?: string;
} {
  const clean = raw.trim();
  const age = calculateAgeFromBirthDate(clean);
  if (age === null || age < 0 || age > 120) {
    return {
      valid: false,
      isAdult: false,
      age: null,
      clean,
      error: 'Informe uma data de nascimento válida (DD/MM/AAAA).',
    };
  }
  if (age < MIN_VERIFIED_AGE) {
    return {
      valid: true,
      isAdult: false,
      age,
      clean,
      error: `Acesso permitido somente para maiores de ${MIN_VERIFIED_AGE} anos (sua idade calculada: ${age} anos).`,
    };
  }
  return {
    valid: true,
    isAdult: true,
    age,
    clean,
  };
}

export function formatBirthDateBr(birthDateStr?: string): string {
  if (!birthDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) return 'Não informada';
  const [y, m, d] = birthDateStr.split('-');
  return `${d}/${m}/${y}`;
}
