import express from 'express';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  getSmtpStatus,
  sendSmtpTestEmail,
  sendTransactionalEmail,
  verifySmtpConnection,
} from './server/mailer';
import { MultiplayerEngine } from './server/multiplayerEngine';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SIGNING_SECRET = process.env.ENTERPRISE_API_KEY || crypto.randomBytes(32).toString('hex');

interface RegisteredApiKey {
  integrationId: string;
  name: string;
  keyHash: string;
  active: boolean;
}

interface LedgerSnapshot {
  syncedAt: string;
  totalUsers: number;
  totalPointsCirculating: number;
  totalBrlLiabilityCents: number;
  totalPaidWithdrawalsCents: number;
  pendingWithdrawalsCount: number;
  payouts: Array<{
    withdrawalId: string;
    userId: string;
    userDisplayName: string;
    amountCents: number;
    amountBrl: string;
    pixKeyType: string;
    status: string;
    requestedDate: string;
    pixTransactionId: string;
  }>;
}

const registeredApiKeys = new Map<string, RegisteredApiKey>();
let latestLedgerSnapshot: LedgerSnapshot = {
  syncedAt: new Date().toISOString(),
  totalUsers: 0,
  totalPointsCirculating: 0,
  totalBrlLiabilityCents: 0,
  totalPaidWithdrawalsCents: 0,
  pendingWithdrawalsCount: 0,
  payouts: [],
};

const CATEGORY_BOUNDS: Record<string, { minDurationMs: number; maxScore: number; maxPtsPerSec: number }> = {
  tic_tac_toe: { minDurationMs: 3500, maxScore: 250, maxPtsPerSec: 45 },
  dot_link: { minDurationMs: 5000, maxScore: 400, maxPtsPerSec: 40 },
  word_search: { minDurationMs: 6000, maxScore: 450, maxPtsPerSec: 35 },
  math_sprint: { minDurationMs: 8000, maxScore: 450, maxPtsPerSec: 30 },
  memory_match: { minDurationMs: 6000, maxScore: 400, maxPtsPerSec: 35 },
  quick_reflex: { minDurationMs: 5000, maxScore: 400, maxPtsPerSec: 45 },
  high_low_cards: { minDurationMs: 5000, maxScore: 380, maxPtsPerSec: 40 },
  block_britz: { minDurationMs: 5000, maxScore: 450, maxPtsPerSec: 35 },
  domino_solo: { minDurationMs: 6000, maxScore: 350, maxPtsPerSec: 35 },
  stop_solo: { minDurationMs: 6000, maxScore: 360, maxPtsPerSec: 35 },
  draw_guess_solo: { minDurationMs: 6000, maxScore: 360, maxPtsPerSec: 35 },
  battleship_solo: { minDurationMs: 6000, maxScore: 380, maxPtsPerSec: 35 },
  connect4_solo: { minDurationMs: 5000, maxScore: 320, maxPtsPerSec: 40 },
  quiz_solo: { minDurationMs: 6000, maxScore: 360, maxPtsPerSec: 35 },
  rps_solo: { minDurationMs: 5000, maxScore: 280, maxPtsPerSec: 45 },
  guess_number_solo: { minDurationMs: 4000, maxScore: 300, maxPtsPerSec: 45 },
};

function validateEnterpriseApiKey(req: express.Request): boolean {
  const providedKey = req.header('x-api-key');
  if (!providedKey) return false;
  if (process.env.ENTERPRISE_API_KEY && providedKey === process.env.ENTERPRISE_API_KEY) {
    return true;
  }
  const hash = crypto.createHash('sha256').update(providedKey).digest('hex');
  for (const entry of registeredApiKeys.values()) {
    if (entry.active && entry.keyHash === hash) {
      return true;
    }
  }
  return false;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const multiplayerEngine = new MultiplayerEngine(SIGNING_SECRET);

  // 1. Anti-Fraud Game Session Verification
  app.post('/api/antifraud/verify-session', (req, res) => {
    const { userId, gameCategory, scoreEarned, durationMs, movesCount, nonce } = req.body ?? {};
    const bounds = CATEGORY_BOUNDS[String(gameCategory)];

    if (!userId || !bounds || typeof scoreEarned !== 'number' || typeof durationMs !== 'number' || typeof movesCount !== 'number') {
      res.status(400).json({ error: 'Payload de sessão inválido para verificação antifraude.' });
      return;
    }

    let verificationStatus: 'verified' | 'flagged' | 'rejected' = 'verified';
    let fraudReason = '';
    let riskDelta = 0;

    const clampedScore = Math.max(0, Math.min(500, Math.round(scoreEarned)));
    const seconds = Math.max(1, durationMs / 1000);
    const ptsPerSec = clampedScore / seconds;

    if (durationMs < bounds.minDurationMs) {
      verificationStatus = 'flagged';
      fraudReason = `Duração abaixo do mínimo esperado (${Math.round(durationMs)}ms < ${bounds.minDurationMs}ms).`;
      riskDelta = 22;
    } else if (clampedScore > bounds.maxScore) {
      verificationStatus = 'flagged';
      fraudReason = `Pontuação acima do teto da categoria (${clampedScore} > ${bounds.maxScore}).`;
      riskDelta = 30;
    } else if (ptsPerSec > bounds.maxPtsPerSec && clampedScore > 100) {
      verificationStatus = 'flagged';
      fraudReason = `Velocidade de pontuação anômala (${ptsPerSec.toFixed(1)} pts/s).`;
      riskDelta = 25;
    } else if (movesCount < 1) {
      verificationStatus = 'rejected';
      fraudReason = 'Nenhuma jogada válida registrada.';
      riskDelta = 40;
    }

    const payloadToSign = `${userId}|${gameCategory}|${clampedScore}|${durationMs}|${movesCount}|${nonce || ''}`;
    const integrityHash = crypto.createHmac('sha256', SIGNING_SECRET).update(payloadToSign).digest('hex');

    res.json({
      verificationStatus,
      fraudReason,
      riskDelta,
      verifiedScore: verificationStatus === 'rejected' ? 0 : clampedScore,
      integrityHash,
      verifiedAt: new Date().toISOString(),
    });
  });

  // 2. Transactional Email Notification Dispatcher (Nodemailer SMTP)
  app.get('/api/notifications/smtp-status', async (req, res) => {
    const status = getSmtpStatus();
    if (req.query.verify === 'true') {
      const verification = await verifySmtpConnection();
      res.json({
        ...status,
        verified: verification.verified,
        verificationError: verification.error || null,
      });
      return;
    }
    res.json(status);
  });

  app.post('/api/notifications/email', async (req, res) => {
    const {
      recipientEmail,
      eventType,
      subject,
      summary,
      referenceId,
      amountBrl,
      pixKey,
      inviterName,
      inviteLink,
      inviteCode,
      invitedDisplayName,
      bonusPoints,
      commissionPct,
      customMessage,
    } = req.body ?? {};

    if (!recipientEmail || !subject || !summary) {
      res.status(400).json({ error: 'Campos obrigatórios de e-mail ausentes.' });
      return;
    }

    const result = await sendTransactionalEmail({
      recipientEmail: String(recipientEmail),
      eventType: eventType ? String(eventType) : undefined,
      subject: String(subject),
      summary: String(summary),
      referenceId: referenceId ? String(referenceId) : undefined,
      amountBrl: amountBrl ? String(amountBrl) : undefined,
      pixKey: pixKey ? String(pixKey) : undefined,
      inviterName: inviterName ? String(inviterName) : undefined,
      inviteLink: inviteLink ? String(inviteLink) : undefined,
      inviteCode: inviteCode ? String(inviteCode) : undefined,
      invitedDisplayName: invitedDisplayName ? String(invitedDisplayName) : undefined,
      bonusPoints: typeof bonusPoints === 'number' ? bonusPoints : undefined,
      commissionPct: typeof commissionPct === 'number' ? commissionPct : undefined,
      customMessage: customMessage ? String(customMessage) : undefined,
    });

    if (result.deliveryStatus === 'failed') {
      res.status(result.smtpConfigured ? 502 : 400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/notifications/test', async (req, res) => {
    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    if (!recipientEmail) {
      res.status(400).json({ error: 'Informe um e-mail destinatário para o teste SMTP.' });
      return;
    }
    const result = await sendSmtpTestEmail(recipientEmail);
    if (result.deliveryStatus === 'failed') {
      res.status(502).json(result);
      return;
    }
    res.json(result);
  });

  // 3. Enterprise Financial API v1 (ERP / BI / Accounting Integration)
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      service: 'Earn Easy Enterprise Financial API',
      version: 'v1',
      status: 'operational',
      smtpEnabled: getSmtpStatus().configured,
      registeredIntegrations: registeredApiKeys.size,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/v1/keys/sync', (req, res) => {
    const { integrationId, name, keyHash, active } = req.body ?? {};
    if (!integrationId || !keyHash) {
      res.status(400).json({ error: 'integrationId e keyHash são obrigatórios.' });
      return;
    }
    registeredApiKeys.set(String(integrationId), {
      integrationId: String(integrationId),
      name: String(name || 'Integração ERP'),
      keyHash: String(keyHash),
      active: Boolean(active),
    });
    res.json({ synced: true, totalKeys: registeredApiKeys.size });
  });

  app.post('/api/v1/ledger/sync', (req, res) => {
    const snapshot = req.body;
    if (!snapshot || typeof snapshot.totalUsers !== 'number') {
      res.status(400).json({ error: 'Snapshot financeiro inválido.' });
      return;
    }
    latestLedgerSnapshot = {
      ...snapshot,
      syncedAt: new Date().toISOString(),
    };
    res.json({ synced: true, syncedAt: latestLedgerSnapshot.syncedAt });
  });

  app.get('/api/v1/ledger', (req, res) => {
    if (!validateEnterpriseApiKey(req)) {
      res.status(401).json({
        error: 'Não autorizado. Envie um cabeçalho x-api-key válido configurado no Painel Administrativo.',
      });
      return;
    }
    res.json({
      currency: 'BRL',
      conversionRate: { points: 1000, brlCents: 10 },
      minimumWithdrawalCents: 500,
      snapshot: latestLedgerSnapshot,
    });
  });

  app.get('/api/v1/payouts', (req, res) => {
    if (!validateEnterpriseApiKey(req)) {
      res.status(401).json({
        error: 'Não autorizado. Cabeçalho x-api-key inválido ou ausente.',
      });
      return;
    }
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
    const payouts = statusFilter === 'all'
      ? latestLedgerSnapshot.payouts
      : latestLedgerSnapshot.payouts.filter((p) => p.status === statusFilter);

    res.json({
      count: payouts.length,
      syncedAt: latestLedgerSnapshot.syncedAt,
      payouts,
    });
  });

  app.post('/api/v1/webhooks/dispatch', async (req, res) => {
    const { endpointUrl, event, payload } = req.body ?? {};
    if (!endpointUrl || typeof endpointUrl !== 'string' || !/^https?:\/\//i.test(endpointUrl)) {
      res.status(400).json({ error: 'URL de webhook inválida. Use http:// ou https://.' });
      return;
    }

    const bodyJson = JSON.stringify({
      source: 'earn-easy',
      event: event || 'financial.ledger.ping',
      timestamp: new Date().toISOString(),
      data: payload ?? latestLedgerSnapshot,
    });

    const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(bodyJson).digest('hex');
    const started = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EarnEasy-Signature': signature,
        },
        body: bodyJson,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - started;
      res.json({
        delivered: response.ok,
        statusCode: response.status,
        latencyMs,
        signaturePrefix: signature.slice(0, 12),
      });
    } catch (err) {
      res.status(502).json({
        delivered: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : 'Falha de rede ao conectar ao webhook.',
      });
    }
  });

  // 4. Server UTC Clock Sync (prevents client clock skew on daily check-ins & daily conversions)
  app.get('/api/time', (_req, res) => {
    const nowMs = Date.now();
    const utcDate = new Date(nowMs).toISOString().slice(0, 10);
    const yesterdayUtcDate = new Date(nowMs - 86_400_000).toISOString().slice(0, 10);
    res.json({ nowMs, utcDate, yesterdayUtcDate });
  });

  // 5. Biel AI Support Assistant (Triage + FAQ before Human Specialist Handoff)
  app.post('/api/support/biel', async (req, res) => {
    const {
      messages,
      selectedTopic,
      userDisplayName,
      userStats,
    } = req.body ?? {};

    const cleanMessages: Array<{ role: 'user' | 'biel'; text: string }> = Array.isArray(messages)
      ? messages
          .filter(
            (m): m is { role: 'user' | 'biel'; text: string } =>
              Boolean(m) &&
              (m.role === 'user' || m.role === 'biel') &&
              typeof m.text === 'string' &&
              m.text.trim().length > 0
          )
          .slice(-12)
          .map((m) => ({ role: m.role, text: m.text.trim().slice(0, 800) }))
      : [];

    const lastUserMessage = [...cleanMessages].reverse().find((m) => m.role === 'user')?.text || '';
    const topicStr = typeof selectedTopic === 'string' ? selectedTopic.trim() : '';
    const playerName = typeof userDisplayName === 'string' && userDisplayName.trim()
      ? userDisplayName.trim().slice(0, 60)
      : 'Jogador';

    const pointsBalance = Number(userStats?.pointsBalance ?? 0);
    const brlBalanceCents = Number(userStats?.brlBalanceCents ?? 0);
    const accountStatus = String(userStats?.status || 'active');
    const firstWithdrawalUsed = Boolean(userStats?.firstWithdrawalUsed);
    const minPixFirstCents = Number(userStats?.firstWithdrawalMinCents ?? 10);
    const minPixStandardCents = Number(userStats?.standardWithdrawalMinCents ?? 500);
    const activeMinCents = firstWithdrawalUsed ? minPixStandardCents : minPixFirstCents;

    const lower = `${topicStr} ${lastUserMessage}`.toLowerCase();
    const userTurnCount = cleanMessages.filter((m) => m.role === 'user').length;
    const asksForHuman = /(especialista|humano|atendente|pessoa|suporte real|admin|falar com algu[eé]m)/.test(lower);

    const buildDeterministicReply = (): { reply: string; readyForHuman: boolean } => {
      if (asksForHuman) {
        return {
          reply: `Entendido, ${playerName}! Já organizei seu contexto aqui. Clique em "Falar com Especialista Humano" logo abaixo para enviar sua conversa para a fila do suporte e um atendente vai aceitar seu chamado em tempo real.`,
          readyForHuman: true,
        };
      }
      if (/(check[- ]?in|chk|sequ[eê]ncia|30 dias)/.test(lower)) {
        return {
          reply: `Sobre o Check-in Diário: ele libera 1 coleta por dia pelo horário UTC (vira às 21h no horário de Brasília), dando de 120 a 200 moedas por dia e R$ 10,00 no Pix ao completar 30 dias seguidos. Se apareceu algum erro ao clicar em "Coletar Hoje", me diga qual mensagem apareceu ou clique em "Falar com Especialista Humano" se o erro continuar.`,
          readyForHuman: userTurnCount >= 2,
        };
      }
      if (/(pix|saque|sacar|dinheiro|reais|cpf|chave)/.test(lower)) {
        return {
          reply: `Seu saldo Pix atual é R$ ${(brlBalanceCents / 100).toFixed(2).replace('.', ',')} e o mínimo vigente para você agora é R$ ${(activeMinCents / 100).toFixed(2).replace('.', ',')}. Saques ficam pendentes até análise antifraude e liquidação no painel admin. Você está com dúvida sobre um saque específico ou erro na chave Pix?`,
          readyForHuman: userTurnCount >= 2,
        };
      }
      if (/(convite|c[oó]digo|amig|indica|promo|correio)/.test(lower)) {
        return {
          reply: `No menu Convites & Códigos você copia seu link/código de indicação (+500 moedas no cadastro do amigo + 12% sobre pontos que ele ganhar) e resgata códigos promocionais da Caixa de Correio. E na aba Amigos você pode buscar jogadores pelo nome ou ID e conversar no privado! Ficou alguma dúvida ou quer falar com um especialista?`,
          readyForHuman: userTurnCount >= 2,
        };
      }
      if (/(jogo|ponto|moeda|convers|converter|velha|dot|matem|mem[oó]ria|ca[cç]a)/.test(lower)) {
        return {
          reply: `Você tem ${pointsBalance.toLocaleString('pt-BR')} moedas acumuladas. Cada 1.000 moedas valem R$ 0,10 na Carteira Pix (1 conversão por dia UTC). Se alguma partida não creditou ou foi sinalizada pelo antifraude, me conta qual jogo foi para eu encaminhar ao especialista.`,
          readyForHuman: userTurnCount >= 2,
        };
      }
      if (/(conta|ban|suspens|revis[aã]o|bloque)/.test(lower)) {
        return {
          reply: `O status atual da sua conta é "${accountStatus}". Se houver qualquer revisão antifraude, bloqueio de saque ou erro técnico que você precise analisar manualmente, recomendo clicar em "Falar com Especialista Humano" abaixo para nossa equipe verificar sua conta diretamente.`,
          readyForHuman: true,
        };
      }
      return {
        reply: `Oi, ${playerName}! Sou o Biel, assistente virtual do Earn Easy. Para agilizar antes de te passar para um especialista humano: seu caso envolve Check-in Diário, Saque Pix, Convites/Códigos ou Pontos nos Jogos? Me conte em poucas palavras o que aconteceu.`,
        readyForHuman: userTurnCount >= 2,
      };
    };

    const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const conversationLines = cleanMessages
          .map((m) => `${m.role === 'user' ? playerName : 'Biel'}: ${m.text}`)
          .join('\n');

        const promptText = [
          topicStr ? `Tópico selecionado pelo usuário: ${topicStr}` : '',
          `Resumo da conta do usuário (${playerName}): ${pointsBalance} moedas, saldo Pix R$ ${(brlBalanceCents / 100).toFixed(2)}, status=${accountStatus}, primeiroSaqueUsado=${firstWithdrawalUsed}, mínimoSaqueAtual=R$ ${(activeMinCents / 100).toFixed(2)}.`,
          conversationLines ? `Histórico recente:\n${conversationLines}` : 'O usuário acabou de abrir o chat de suporte.',
        ]
          .filter(Boolean)
          .join('\n\n');

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: promptText,
          config: {
            systemInstruction:
              'Você é Biel, o assistente virtual de suporte do aplicativo Earn Easy em português do Brasil (pt-BR). ' +
              'Seja simpático, claro, direto e conciso (máximo 3 frases curtas). ' +
              'Regras reais do Earn Easy: 1.000 pontos = R$ 0,10; limite de 1 conversão diária (horário UTC); ' +
              'Check-in Diário dá 120 a 200 pontos por dia (1x por dia UTC) e R$ 10,00 de bônus aos 30 dias seguidos; ' +
              '1º saque Pix tem mínimo configurado pelo admin (padrão R$ 0,10) e demais saques conforme mínimo configurado; ' +
              'Convites dão +500 pontos + 12% de comissão; há aba Amigos para adicionar jogadores e conversar. ' +
              'Faça perguntas objetivas de triagem para entender o problema ou responda à dúvida. ' +
              'Quando o usuário já tiver explicado o problema (após 2 mensagens ou quando pedir atendente/especialista ou envolver erro técnico/ban/saque pendente), ' +
              'oriente-o claramente a clicar no botão "Falar com Especialista Humano" para entrar na fila do painel administrativo. ' +
              'Nunca invente pagamentos já feitos nem prometa prazos exatos de Pix.',
          },
        });

        const text = response.text?.trim();
        if (text) {
          res.json({
            reply: text.slice(0, 800),
            readyForHuman: userTurnCount >= 2 || asksForHuman || /(erro|bug|pendente|ban|suspens|não caiu|nao caiu)/.test(lower),
            poweredBy: 'gemini',
          });
          return;
        }
      } catch (err) {
        console.warn('Gemini Biel fallback activated:', err instanceof Error ? err.message : err);
      }
    }

    const fallback = buildDeterministicReply();
    res.json({
      reply: fallback.reply,
      readyForHuman: fallback.readyForHuman,
      poweredBy: 'assistant',
    });
  });

  // 6. Multiplayer Server Settlement Verification
  app.post('/api/multiplayer/verify-settlement', (req, res) => {
    const result = multiplayerEngine.verifySettlement(req.body ?? {});
    if (!result.valid) {
      res.status(400).json({ valid: false, error: result.reason || 'Liquidação multiplayer inválida.' });
      return;
    }
    res.json({ valid: true, settlement: result.settlement });
  });

  // 7. In-App Casino Games (Double & Mines — Points or Earn Easy BRL Wallet, Zero Real Money)
  type CasinoCurrency = 'points' | 'brl';
  type DoubleColor = 'red' | 'black' | 'white';

  interface ActiveMinesState {
    sessionId: string;
    userId: string;
    currency: CasinoCurrency;
    stakeAmount: number;
    minesCount: number;
    minesSet: Set<number>;
    revealedSafe: number[];
    createdAt: number;
  }

  const activeMinesGames = new Map<string, ActiveMinesState>();

  const validateCasinoStake = (currency: unknown, rawStake: unknown): { ok: true; currency: CasinoCurrency; stakeAmount: number } | { ok: false; error: string } => {
    const curr = currency === 'brl' ? 'brl' : currency === 'points' ? 'points' : null;
    if (!curr) {
      return { ok: false, error: 'Moeda de aposta inválida (use points ou brl).' };
    }
    const stake = Math.floor(Number(rawStake));
    if (!Number.isFinite(stake)) {
      return { ok: false, error: 'Valor de aposta inválido.' };
    }
    if (curr === 'points' && (stake < 10 || stake > 10000)) {
      return { ok: false, error: 'Aposta em pontos deve ficar entre 10 e 10.000 pontos.' };
    }
    if (curr === 'brl' && (stake < 1 || stake > 5000)) {
      return { ok: false, error: 'Aposta na carteira deve ficar entre R$ 0,01 e R$ 50,00.' };
    }
    return { ok: true, currency: curr, stakeAmount: stake };
  };

  const computeMinesMultiplier = (minesCount: number, safeCount: number): number => {
    if (safeCount <= 0) return 1;
    let factor = 0.97;
    for (let i = 0; i < safeCount; i += 1) {
      const remainingTiles = 25 - i;
      const remainingSafe = 25 - minesCount - i;
      if (remainingSafe <= 0) break;
      factor *= remainingTiles / remainingSafe;
    }
    return Math.min(50, Math.max(1.01, Math.floor(factor * 100) / 100));
  };

  const getDoubleSlotColor = (slot: number): DoubleColor => {
    if (slot === 0) return 'white';
    if (slot >= 1 && slot <= 7) return 'red';
    return 'black';
  };

  app.post('/api/casino/double/roll', (req, res) => {
    const { userId, currency, stakeAmount, choice } = req.body ?? {};
    const cleanUid = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUid) {
      res.status(400).json({ error: 'Usuário não identificado.' });
      return;
    }
    const stakeCheck = validateCasinoStake(currency, stakeAmount);
    if (!stakeCheck.ok) {
      res.status(400).json({ error: stakeCheck.error });
      return;
    }
    const cleanChoice: DoubleColor | null =
      choice === 'red' || choice === 'black' || choice === 'white' ? choice : null;
    if (!cleanChoice) {
      res.status(400).json({ error: 'Escolha inválida no Double (vermelho, preto ou branco).' });
      return;
    }

    const slot = crypto.randomInt(0, 15);
    const winningColor = getDoubleSlotColor(slot);
    const won = winningColor === cleanChoice;
    const multiplier = won ? (winningColor === 'white' ? 14 : 2) : 0;
    const payoutAmount = won ? stakeCheck.stakeAmount * multiplier : 0;
    const sessionId = `dbl_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const integrityHash = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${sessionId}|${cleanUid}|double|${stakeCheck.currency}|${stakeCheck.stakeAmount}|${slot}|${payoutAmount}`)
      .digest('hex');

    res.json({
      sessionId,
      slot,
      winningColor,
      choice: cleanChoice,
      won,
      multiplier,
      currency: stakeCheck.currency,
      stakeAmount: stakeCheck.stakeAmount,
      payoutAmount,
      netDelta: payoutAmount - stakeCheck.stakeAmount,
      integrityHash,
    });
  });

  app.post('/api/casino/mines/deal', (req, res) => {
    const { userId, currency, stakeAmount, minesCount, sessionId: providedSessionId } = req.body ?? {};
    const cleanUid = typeof userId === 'string' ? userId.trim() : '';
    if (!cleanUid) {
      res.status(400).json({ error: 'Usuário não identificado.' });
      return;
    }
    const stakeCheck = validateCasinoStake(currency, stakeAmount);
    if (!stakeCheck.ok) {
      res.status(400).json({ error: stakeCheck.error });
      return;
    }
    const mines = Math.floor(Number(minesCount));
    if (!Number.isInteger(mines) || mines < 1 || mines > 24) {
      res.status(400).json({ error: 'Quantidade de minas deve ser entre 1 e 24.' });
      return;
    }

    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, game] of activeMinesGames.entries()) {
      if (game.createdAt < cutoff || (game.userId === cleanUid && game.revealedSafe.length === 0)) {
        activeMinesGames.delete(id);
      }
    }

    const deck = Array.from({ length: 25 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const minesList = deck.slice(0, mines).sort((a, b) => a - b);
    const sessionId =
      typeof providedSessionId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(providedSessionId)
        ? providedSessionId
        : `mns_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

    const integrityHash = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${sessionId}|${cleanUid}|mines|${stakeCheck.currency}|${stakeCheck.stakeAmount}|${minesList.join(',')}`)
      .digest('hex');

    activeMinesGames.set(sessionId, {
      sessionId,
      userId: cleanUid,
      currency: stakeCheck.currency,
      stakeAmount: stakeCheck.stakeAmount,
      minesCount: mines,
      minesSet: new Set(minesList),
      revealedSafe: [],
      createdAt: Date.now(),
    });

    res.json({
      sessionId,
      minesCount: mines,
      currency: stakeCheck.currency,
      stakeAmount: stakeCheck.stakeAmount,
      nextMultiplier: computeMinesMultiplier(mines, 1),
      integrityHash,
    });
  });

  app.post('/api/casino/mines/reveal', (req, res) => {
    const { sessionId, userId, tileIndex } = req.body ?? {};
    const game = typeof sessionId === 'string' ? activeMinesGames.get(sessionId) : undefined;
    if (!game || game.userId !== String(userId || '').trim()) {
      res.status(404).json({ error: 'Partida de Mines não encontrada ou já encerrada.' });
      return;
    }
    const idx = Math.floor(Number(tileIndex));
    if (!Number.isInteger(idx) || idx < 0 || idx >= 25) {
      res.status(400).json({ error: 'Casa inválida.' });
      return;
    }
    if (game.revealedSafe.includes(idx)) {
      const currentMultiplier = computeMinesMultiplier(game.minesCount, game.revealedSafe.length);
      res.json({
        busted: false,
        tileIndex: idx,
        revealedSafe: game.revealedSafe,
        currentMultiplier,
        currentPayoutAmount: Math.floor(game.stakeAmount * currentMultiplier),
        nextMultiplier: computeMinesMultiplier(game.minesCount, game.revealedSafe.length + 1),
        allSafeCleared: game.revealedSafe.length >= 25 - game.minesCount,
      });
      return;
    }

    if (game.minesSet.has(idx)) {
      const minePositions = Array.from(game.minesSet).sort((a, b) => a - b);
      activeMinesGames.delete(game.sessionId);
      const integrityHash = crypto
        .createHmac('sha256', SIGNING_SECRET)
        .update(`${game.sessionId}|${game.userId}|mines|lost|0`)
        .digest('hex');
      res.json({
        busted: true,
        tileIndex: idx,
        revealedSafe: game.revealedSafe,
        minePositions,
        currentMultiplier: 0,
        payoutAmount: 0,
        integrityHash,
      });
      return;
    }

    game.revealedSafe.push(idx);
    const safeCount = game.revealedSafe.length;
    const currentMultiplier = computeMinesMultiplier(game.minesCount, safeCount);
    const currentPayoutAmount = Math.min(game.stakeAmount * 50, Math.floor(game.stakeAmount * currentMultiplier));
    const allSafeCleared = safeCount >= 25 - game.minesCount;

    if (allSafeCleared) {
      const minePositions = Array.from(game.minesSet).sort((a, b) => a - b);
      activeMinesGames.delete(game.sessionId);
      const integrityHash = crypto
        .createHmac('sha256', SIGNING_SECRET)
        .update(`${game.sessionId}|${game.userId}|mines|won|${currentPayoutAmount}`)
        .digest('hex');
      res.json({
        busted: false,
        tileIndex: idx,
        revealedSafe: game.revealedSafe,
        minePositions,
        currentMultiplier,
        currentPayoutAmount,
        payoutAmount: currentPayoutAmount,
        nextMultiplier: currentMultiplier,
        allSafeCleared: true,
        integrityHash,
      });
      return;
    }

    res.json({
      busted: false,
      tileIndex: idx,
      revealedSafe: game.revealedSafe,
      currentMultiplier,
      currentPayoutAmount,
      nextMultiplier: computeMinesMultiplier(game.minesCount, safeCount + 1),
      allSafeCleared: false,
    });
  });

  app.post('/api/casino/mines/cashout', (req, res) => {
    const { sessionId, userId } = req.body ?? {};
    const game = typeof sessionId === 'string' ? activeMinesGames.get(sessionId) : undefined;
    if (!game || game.userId !== String(userId || '').trim()) {
      res.status(404).json({ error: 'Partida de Mines não encontrada ou já finalizada.' });
      return;
    }
    if (game.revealedSafe.length < 1) {
      res.status(400).json({ error: 'Abra pelo menos 1 casa segura antes de retirar.' });
      return;
    }

    const currentMultiplier = computeMinesMultiplier(game.minesCount, game.revealedSafe.length);
    const payoutAmount = Math.min(game.stakeAmount * 50, Math.floor(game.stakeAmount * currentMultiplier));
    const minePositions = Array.from(game.minesSet).sort((a, b) => a - b);
    activeMinesGames.delete(game.sessionId);

    const integrityHash = crypto
      .createHmac('sha256', SIGNING_SECRET)
      .update(`${game.sessionId}|${game.userId}|mines|won|${payoutAmount}`)
      .digest('hex');

    res.json({
      sessionId: game.sessionId,
      multiplier: currentMultiplier,
      payoutAmount,
      revealedSafeCount: game.revealedSafe.length,
      minePositions,
      integrityHash,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  multiplayerEngine.attachToServer(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Earn Easy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
