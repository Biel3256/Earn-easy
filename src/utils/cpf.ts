import type { VerificationDocumentType } from '../types/earneasy';

export const VERIFICATION_DOCUMENT_LABELS: Record<VerificationDocumentType, string> = {
  rg: 'RG (Identidade)',
  cnh: 'CNH (Carteira de Motorista)',
  passaporte: 'Passaporte',
  outro: 'Outro Documento Oficial',
};

export function onlyDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function formatCpfMask(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function isValidCPF(rawCpf: string): boolean {
  const digits = onlyDigits(rawCpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === Number(digits[10]);
}

export function maskCpfForAdminDisplay(cpf: string): string {
  return formatCpfMask(cpf);
}

export function formatBirthDateBr(birthDateStr?: string): string {
  if (!birthDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) return 'Não informada';
  const [y, m, d] = birthDateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function isValidBirthDateStr(birthDateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateStr)) return false;
  const [yStr, mStr, dStr] = birthDateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(y) || y < 1900 || y > currentYear) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d &&
    check.getTime() <= Date.now()
  );
}
