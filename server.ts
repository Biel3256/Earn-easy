import express from 'express';
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Earn Easy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
