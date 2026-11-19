import { PixKeyType } from '../types/earneasy';

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
  return new Date().toISOString().slice(0, 10);
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
