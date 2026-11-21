// Anti-profanity username moderation for PT-BR and EN (triggers immediate account ban)

const EXACT_TOKEN_PROFANITIES = new Set([
  'porra', 'poha', 'porr', 'puta', 'puto', 'putinha', 'putao', 'putaria', 'puta que pariu',
  'merda', 'bosta', 'cu', 'cuzao', 'cuzinho', 'cuzona', 'fdp', 'pqp', 'vsf', 'tnc', 'vtnc',
  'krl', 'kct', 'cacete', 'rola', 'rolinha', 'pinto', 'pintao', 'pau', 'xota', 'xoxota',
  'viado', 'viadinho', 'bicha', 'boiola', 'corno', 'corninho', 'otario', 'otaria', 'babaca',
  'piranha', 'vadia', 'vagabundo', 'vagabunda', 'rapariga', 'quenga', 'foda', 'foder', 'foda-se',
  'fodase', 'fudido', 'fodido', 'fudida', 'fodida', 'gozar', 'gozo', 'esporro', 'esporra',
  'cagado', 'cagar', 'peido', 'boceta', 'pica', 'piroca', 'xereca', 'chereca', 'grelo',
  'cabaco', 'retardado', 'retardada', 'imbecil', 'desgraca', 'desgracado', 'desgracada',
  'fuck', 'fucker', 'fucking', 'shit', 'shitty', 'bitch', 'bitches', 'asshole', 'dick',
  'cock', 'pussy', 'cunt', 'whore', 'slut', 'bastard', 'fag', 'faggot', 'retard', 'nazi',
  'hitler', 'nigga', 'nigger',
]);

const UNAMBIGUOUS_SUBSTRINGS = [
  'caralho',
  'karalho',
  'buceta',
  'boceta',
  'xereca',
  'chereca',
  'arrombado',
  'arrombada',
  'piroca',
  'filhodaputa',
  'filhadaputa',
  'fdputa',
  'punheta',
  'siririca',
  'boquete',
  'chupapau',
  'desgraca',
  'motherfucker',
  'asshole',
  'faggot',
  'nigger',
  'nigga',
  'prostituta',
  'putaquepariu',
  'vaatomarnocu',
  'tomarnocu',
  'vaiprocaralho',
  'enfianocu',
];

function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function mapLeetspeak(input: string): string {
  return input
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i');
}

function collapseRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/g, '$1$1').replace(/([a-z])\1+/g, (m, ch: string) => {
    // Keep double letters only where needed or collapse triple+ to single for matching
    return m.length >= 3 ? ch : m;
  });
}

function collapseAllDoubles(input: string): string {
  return input.replace(/([a-z])\1+/g, '$1');
}

export function checkUsernameProfanity(username: string): {
  blocked: boolean;
  matchedTerm?: string;
} {
  const lowered = stripAccents(username.toLowerCase().trim());
  const leet = mapLeetspeak(lowered);

  const rawTokens = lowered.split(/[^a-z0-9]+/).filter(Boolean);
  const leetTokens = leet.split(/[^a-z]+/).filter(Boolean);
  const spacedCollapsedTokens = lowered.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

  const candidateTokens = new Set<string>();
  for (const t of [...rawTokens, ...leetTokens, ...spacedCollapsedTokens]) {
    candidateTokens.add(t);
    candidateTokens.add(collapseRepeats(t));
    candidateTokens.add(collapseAllDoubles(t));
  }

  // Also check if spaced letters spell a profanity (e.g., "f d p" or "p o r r a")
  const compact = collapseAllDoubles(leet.replace(/[^a-z]/g, ''));
  const compactRaw = collapseAllDoubles(lowered.replace(/[^a-z]/g, ''));

  if (EXACT_TOKEN_PROFANITIES.has(compact) || EXACT_TOKEN_PROFANITIES.has(compactRaw)) {
    return { blocked: true, matchedTerm: compact || compactRaw };
  }

  for (const token of candidateTokens) {
    if (EXACT_TOKEN_PROFANITIES.has(token)) {
      return { blocked: true, matchedTerm: token };
    }
  }

  for (const root of UNAMBIGUOUS_SUBSTRINGS) {
    const cleanRoot = collapseAllDoubles(root);
    if (
      compact.includes(root) ||
      compact.includes(cleanRoot) ||
      compactRaw.includes(root) ||
      compactRaw.includes(cleanRoot)
    ) {
      return { blocked: true, matchedTerm: root };
    }
  }

  return { blocked: false };
}

export function validateUsernameInput(raw: string): {
  valid: boolean;
  clean: string;
  error?: string;
} {
  const clean = raw.trim().replace(/\s+/g, ' ').slice(0, 32);
  if (clean.length < 3) {
    return {
      valid: false,
      clean,
      error: 'O nome de usuário deve ter pelo menos 3 caracteres.',
    };
  }
  if (!/^[a-zA-Z0-9À-ÿ _.\-]+$/.test(clean)) {
    return {
      valid: false,
      clean,
      error: 'Use apenas letras, números, espaços, ponto, hífen ou sublinhado.',
    };
  }
  return { valid: true, clean };
}

export function checkTextProfanity(message: string): {
  blocked: boolean;
  matchedTerm?: string;
} {
  if (!message || !message.trim()) return { blocked: false };
  const direct = checkUsernameProfanity(message);
  if (direct.blocked) return direct;

  const words = message.trim().split(/\s+/);
  for (const w of words) {
    const res = checkUsernameProfanity(w);
    if (res.blocked) return res;
  }
  return { blocked: false };
}

