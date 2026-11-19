import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
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
