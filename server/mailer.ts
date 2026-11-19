import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export interface EmailDispatchPayload {
  recipientEmail: string;
  eventType?: string;
  subject: string;
  summary: string;
  referenceId?: string;
  amountBrl?: string;
  pixKey?: string;
  inviterName?: string;
  inviteLink?: string;
  inviteCode?: string;
  invitedDisplayName?: string;
  bonusPoints?: number;
  commissionPct?: number;
  customMessage?: string;
}

export interface SmtpStatusInfo {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  from: string;
  userMasked: string;
  missingVars: string[];
  appUrl: string;
}

export interface EmailSendResult {
  deliveryStatus: 'sent_smtp' | 'logged_in_app' | 'failed';
  smtpConfigured: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  message?: string;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cachedSignature = '';
let cachedTransporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

function readSmtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const portRaw = Number(process.env.SMTP_PORT || 587);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const from = (process.env.SMTP_FROM || '').trim() || (user ? `Earn Easy <${user}>` : 'Earn Easy <no-reply@earneasy.app>');
  const rawAppUrl = (process.env.APP_URL || '').trim();
  const appUrl =
    rawAppUrl && rawAppUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(rawAppUrl)
      ? rawAppUrl.replace(/\/+$/, '')
      : '';

  const missingVars: string[] = [];
  if (!host) missingVars.push('SMTP_HOST');
  if (!user) missingVars.push('SMTP_USER');
  if (!pass) missingVars.push('SMTP_PASS');

  const secure = port === 465 || process.env.SMTP_SECURE === 'true';

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    appUrl,
    missingVars,
    configured: missingVars.length === 0,
  };
}

function maskEmailUser(value: string): string {
  if (!value) return '';
  const atIndex = value.indexOf('@');
  if (atIndex <= 2) return `${value.slice(0, 1)}***${atIndex >= 0 ? value.slice(atIndex) : ''}`;
  return `${value.slice(0, 2)}***${value.slice(atIndex)}`;
}

export function getSmtpStatus(): SmtpStatusInfo {
  const cfg = readSmtpConfig();
  return {
    configured: cfg.configured,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    from: cfg.from,
    userMasked: maskEmailUser(cfg.user),
    missingVars: cfg.missingVars,
    appUrl: cfg.appUrl,
  };
}

export function getOrCreateSmtpTransporter(): Transporter<SMTPTransport.SentMessageInfo> | null {
  const cfg = readSmtpConfig();
  if (!cfg.configured) {
    cachedTransporter = null;
    cachedSignature = '';
    return null;
  }

  const signature = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}|${cfg.pass}`;
  if (cachedTransporter && cachedSignature === signature) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    },
  });
  cachedSignature = signature;
  return cachedTransporter;
}

export async function verifySmtpConnection(): Promise<{
  configured: boolean;
  verified: boolean;
  error?: string;
}> {
  const transporter = getOrCreateSmtpTransporter();
  if (!transporter) {
    return {
      configured: false,
      verified: false,
      error: 'Variáveis SMTP_HOST, SMTP_USER ou SMTP_PASS não preenchidas no ambiente.',
    };
  }

  try {
    await transporter.verify();
    return { configured: true, verified: true };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      error: err instanceof Error ? err.message : 'Falha ao autenticar no servidor SMTP.',
    };
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length >= 3 && trimmed.length <= 160 && EMAIL_REGEX.test(trimmed);
}

function getEventPresentation(eventType: string): {
  headerSubtitle: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  eventLabel: string;
} {
  switch (eventType) {
    case 'withdrawal_requested':
      return {
        headerSubtitle: 'Notificação Automática de Saque Pix',
        badgeText: 'Saque em Análise',
        badgeBg: '#fef3c7',
        badgeColor: '#92400e',
        eventLabel: 'Solicitação de Saque Pix',
      };
    case 'withdrawal_approved':
      return {
        headerSubtitle: 'Notificação Automática de Saque Pix',
        badgeText: 'Saque Aprovado',
        badgeBg: '#e0f2fe',
        badgeColor: '#075985',
        eventLabel: 'Saque Pix Aprovado',
      };
    case 'withdrawal_paid':
      return {
        headerSubtitle: 'Comprovante Automático de Pagamento Pix',
        badgeText: 'Pix Pago',
        badgeBg: '#d1fae5',
        badgeColor: '#065f46',
        eventLabel: 'Pagamento Pix Concluído',
      };
    case 'withdrawal_rejected':
      return {
        headerSubtitle: 'Notificação Automática de Saque Pix',
        badgeText: 'Recusado e Estornado',
        badgeBg: '#fee2e2',
        badgeColor: '#991b1b',
        eventLabel: 'Saque Recusado (Saldo Estornado)',
      };
    case 'invite_sent':
      return {
        headerSubtitle: 'Convite Oficial Earn Easy',
        badgeText: 'Convite Especial',
        badgeBg: '#d1fae5',
        badgeColor: '#065f46',
        eventLabel: 'Convite para Jogar e Ganhar',
      };
    case 'referral_welcome':
      return {
        headerSubtitle: 'Programa de Convites & Indicações',
        badgeText: 'Convite Vinculado',
        badgeBg: '#d1fae5',
        badgeColor: '#065f46',
        eventLabel: 'Cadastro por Link de Convite',
      };
    case 'referral_bonus_credited':
      return {
        headerSubtitle: 'Programa de Convites & Indicações',
        badgeText: '+500 Pontos Creditados',
        badgeBg: '#d1fae5',
        badgeColor: '#065f46',
        eventLabel: 'Bônus de Indicação (+12% Contínuo)',
      };
    case 'conversion_confirmed':
      return {
        headerSubtitle: 'Confirmação de Transação Financeira',
        badgeText: 'Conversão Confirmada',
        badgeBg: '#d1fae5',
        badgeColor: '#065f46',
        eventLabel: 'Conversão Diária de Pontos',
      };
    case 'streak_bonus_credited':
      return {
        headerSubtitle: 'Recompensa de Fidelidade',
        badgeText: 'Bônus de Sequência',
        badgeBg: '#fef3c7',
        badgeColor: '#92400e',
        eventLabel: 'Bônus Check-in 30 Dias',
      };
    default:
      return {
        headerSubtitle: 'Notificação Automática Earn Easy',
        badgeText: 'Notificação',
        badgeBg: '#f1f5f9',
        badgeColor: '#334155',
        eventLabel: eventType || 'notificação',
      };
  }
}

function buildEmailContent(payload: EmailDispatchPayload): { html: string; text: string } {
  const cfg = readSmtpConfig();
  const eventType = String(payload.eventType || 'transacao');
  const presentation = getEventPresentation(eventType);

  const safeSubject = escapeHtml(payload.subject);
  const safeSummary = escapeHtml(payload.summary);
  const safeRef = escapeHtml(payload.referenceId || '-');
  const safeAmount = payload.amountBrl ? escapeHtml(payload.amountBrl) : '';
  const safePixKey = payload.pixKey ? escapeHtml(payload.pixKey) : '';
  const safeInviterName = payload.inviterName ? escapeHtml(payload.inviterName) : '';
  const safeInvitedName = payload.invitedDisplayName ? escapeHtml(payload.invitedDisplayName) : '';
  const safeInviteCode = payload.inviteCode ? escapeHtml(payload.inviteCode) : '';
  const safeCustomMsg = payload.customMessage ? escapeHtml(payload.customMessage) : '';

  const fallbackInviteLink =
    cfg.appUrl && payload.inviteCode
      ? `${cfg.appUrl}/?ref=${encodeURIComponent(payload.inviteCode)}`
      : cfg.appUrl;

  const rawInviteLink =
    payload.inviteLink && /^https?:\/\//i.test(payload.inviteLink)
      ? payload.inviteLink
      : fallbackInviteLink;
  const safeInviteLink = rawInviteLink ? escapeHtml(rawInviteLink) : '';

  const isInviteEmail =
    eventType === 'invite_sent' ||
    eventType === 'referral_welcome' ||
    eventType === 'referral_bonus_credited';

  const bonusLabel =
    typeof payload.bonusPoints === 'number' && payload.bonusPoints > 0
      ? `+${payload.bonusPoints.toLocaleString('pt-BR')} pontos`
      : '';
  const commissionLabel =
    typeof payload.commissionPct === 'number' && payload.commissionPct > 0
      ? `${payload.commissionPct}% de comissão contínua`
      : '';

  const inviteCalloutHtml = isInviteEmail
    ? `
      <div style="margin: 18px 0; padding: 16px; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0;">
        ${safeInviterName ? `<p style="margin: 0 0 8px; font-size: 13px; color: #065f46;"><strong>Convidado por:</strong> ${safeInviterName}</p>` : ''}
        ${safeInvitedName ? `<p style="margin: 0 0 8px; font-size: 13px; color: #065f46;"><strong>Amigo cadastrado:</strong> ${safeInvitedName}</p>` : ''}
        ${safeCustomMsg ? `<p style="margin: 0 0 10px; font-size: 13px; font-style: italic; color: #047857;">"${safeCustomMsg}"</p>` : ''}
        ${
          bonusLabel || commissionLabel
            ? `<p style="margin: 0 0 10px; font-size: 13px; color: #064e3b;"><strong>Benefícios:</strong> ${escapeHtml(
                [bonusLabel, commissionLabel].filter(Boolean).join(' · ')
              )}</p>`
            : ''
        }
        ${
          safeInviteCode
            ? `<p style="margin: 0 0 12px; font-size: 12px; color: #065f46;">Código de convite: <code style="background: #ffffff; padding: 3px 7px; border-radius: 6px; border: 1px solid #a7f3d0; font-family: monospace; font-weight: 700;">${safeInviteCode}</code></p>`
            : ''
        }
        ${
          safeInviteLink
            ? `<a href="${safeInviteLink}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 8px;">${
                eventType === 'invite_sent' ? 'Aceitar Convite e Começar a Jogar' : 'Abrir Plataforma Earn Easy'
              }</a>`
            : ''
        }
      </div>
    `
    : '';

  const html = `
    <div style="font-family: 'DM Sans', Arial, Helvetica, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; background: #ffffff;">
      <div style="background: #09090b; color: #ffffff; padding: 22px 24px;">
        <div style="display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${presentation.badgeBg}; color: ${presentation.badgeColor}; margin-bottom: 10px;">
          ${escapeHtml(presentation.badgeText)}
        </div>
        <h1 style="margin: 0; font-size: 19px; letter-spacing: -0.02em; color: #ffffff;">Earn Easy</h1>
        <p style="margin: 4px 0 0; font-size: 12px; color: #a1a1aa;">${escapeHtml(presentation.headerSubtitle)}</p>
      </div>
      <div style="padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px; font-size: 17px; color: #0f172a;">${safeSubject}</h2>
        <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.65; color: #334155;">${safeSummary}</p>
        ${inviteCalloutHtml}
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
          <tr>
            <td style="padding: 10px 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Evento</td>
            <td style="padding: 10px 12px; font-weight: 600; text-align: right; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${escapeHtml(presentation.eventLabel)}</td>
          </tr>
          ${
            safeAmount
              ? `<tr><td style="padding: 10px 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Valor</td><td style="padding: 10px 12px; font-weight: 700; color: #059669; text-align: right; border-bottom: 1px solid #e2e8f0;">${safeAmount}</td></tr>`
              : ''
          }
          ${
            safePixKey
              ? `<tr><td style="padding: 10px 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Chave Pix</td><td style="padding: 10px 12px; font-family: monospace; text-align: right; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${safePixKey}</td></tr>`
              : ''
          }
          <tr>
            <td style="padding: 10px 12px; color: #64748b;">Referência</td>
            <td style="padding: 10px 12px; font-family: monospace; text-align: right; color: #0f172a;">${safeRef}</td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
          E-mail transacional automático enviado pelo sistema de pagamentos e indicações do Earn Easy.
        </p>
      </div>
    </div>
  `;

  const textLines = [
    `[Earn Easy] ${payload.subject}`,
    '',
    payload.summary,
    payload.customMessage ? `Mensagem: "${payload.customMessage}"` : '',
    payload.amountBrl ? `Valor: ${payload.amountBrl}` : '',
    payload.pixKey ? `Chave Pix: ${payload.pixKey}` : '',
    payload.inviteCode ? `Código de convite: ${payload.inviteCode}` : '',
    rawInviteLink ? `Link de convite: ${rawInviteLink}` : '',
    `Evento: ${presentation.eventLabel}`,
    `Referência: ${payload.referenceId || '-'}`,
  ].filter(Boolean);

  return {
    html,
    text: textLines.join('\n'),
  };
}

export async function sendTransactionalEmail(
  payload: EmailDispatchPayload
): Promise<EmailSendResult> {
  const recipient = String(payload.recipientEmail || '').trim();
  if (!isValidEmail(recipient)) {
    return {
      deliveryStatus: 'failed',
      smtpConfigured: getSmtpStatus().configured,
      error: 'Endereço de e-mail do destinatário inválido.',
    };
  }

  const cfg = readSmtpConfig();
  const transporter = getOrCreateSmtpTransporter();

  if (!transporter) {
    return {
      deliveryStatus: 'logged_in_app',
      smtpConfigured: false,
      message:
        'SMTP não configurado no ambiente (.env). Notificação registrada no histórico da plataforma.',
    };
  }

  const { html, text } = buildEmailContent(payload);

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: recipient,
      subject: `[Earn Easy] ${String(payload.subject).slice(0, 140)}`,
      text,
      html,
    });

    return {
      deliveryStatus: 'sent_smtp',
      smtpConfigured: true,
      messageId: info.messageId,
      accepted: info.accepted.map(String),
      rejected: info.rejected.map(String),
    };
  } catch (err) {
    return {
      deliveryStatus: 'failed',
      smtpConfigured: true,
      error: err instanceof Error ? err.message : 'Erro ao enviar e-mail via SMTP.',
    };
  }
}

export async function sendSmtpTestEmail(recipientEmail: string): Promise<EmailSendResult> {
  const verification = await verifySmtpConnection();
  if (!verification.configured) {
    return {
      deliveryStatus: 'logged_in_app',
      smtpConfigured: false,
      error: verification.error,
    };
  }
  if (!verification.verified) {
    return {
      deliveryStatus: 'failed',
      smtpConfigured: true,
      error: verification.error || 'Falha ao verificar servidor SMTP.',
    };
  }

  return sendTransactionalEmail({
    recipientEmail,
    eventType: 'withdrawal_paid',
    subject: 'Teste de Integração SMTP (Nodemailer)',
    summary:
      'Sua integração SMTP com o Nodemailer está funcionando corretamente para envios automáticos de saques Pix e convites no Earn Easy.',
    referenceId: `smtp_test_${Date.now()}`,
  });
}
