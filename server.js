// server.ts
import express from "express";
import http from "http";
import crypto2 from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// server/mailer.ts
import nodemailer from "nodemailer";
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var cachedSignature = "";
var cachedTransporter = null;
function readSmtpConfig() {
  const host = (process.env.SMTP_HOST || "").trim();
  const portRaw = Number(process.env.SMTP_PORT || 587);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const from = (process.env.SMTP_FROM || "").trim() || (user ? `Earn Easy <${user}>` : "Earn Easy <no-reply@earneasy.app>");
  const rawAppUrl = (process.env.APP_URL || "").trim();
  const appUrl = rawAppUrl && rawAppUrl !== "MY_APP_URL" && /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl.replace(/\/+$/, "") : "";
  const missingVars = [];
  if (!host) missingVars.push("SMTP_HOST");
  if (!user) missingVars.push("SMTP_USER");
  if (!pass) missingVars.push("SMTP_PASS");
  const secure = port === 465 || process.env.SMTP_SECURE === "true";
  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    appUrl,
    missingVars,
    configured: missingVars.length === 0
  };
}
function maskEmailUser(value) {
  if (!value) return "";
  const atIndex = value.indexOf("@");
  if (atIndex <= 2) return `${value.slice(0, 1)}***${atIndex >= 0 ? value.slice(atIndex) : ""}`;
  return `${value.slice(0, 2)}***${value.slice(atIndex)}`;
}
function getSmtpStatus() {
  const cfg = readSmtpConfig();
  return {
    configured: cfg.configured,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    from: cfg.from,
    userMasked: maskEmailUser(cfg.user),
    missingVars: cfg.missingVars,
    appUrl: cfg.appUrl
  };
}
function getOrCreateSmtpTransporter() {
  const cfg = readSmtpConfig();
  if (!cfg.configured) {
    cachedTransporter = null;
    cachedSignature = "";
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
    connectionTimeout: 1e4,
    greetingTimeout: 1e4,
    socketTimeout: 15e3,
    auth: {
      user: cfg.user,
      pass: cfg.pass
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false"
    }
  });
  cachedSignature = signature;
  return cachedTransporter;
}
async function verifySmtpConnection() {
  const transporter = getOrCreateSmtpTransporter();
  if (!transporter) {
    return {
      configured: false,
      verified: false,
      error: "Vari\xE1veis SMTP_HOST, SMTP_USER ou SMTP_PASS n\xE3o preenchidas no ambiente."
    };
  }
  try {
    await transporter.verify();
    return { configured: true, verified: true };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      error: err instanceof Error ? err.message : "Falha ao autenticar no servidor SMTP."
    };
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function isValidEmail(email) {
  const trimmed = email.trim();
  return trimmed.length >= 3 && trimmed.length <= 160 && EMAIL_REGEX.test(trimmed);
}
function getEventPresentation(eventType) {
  switch (eventType) {
    case "withdrawal_requested":
      return {
        headerSubtitle: "Notifica\xE7\xE3o Autom\xE1tica de Saque Pix",
        badgeText: "Saque em An\xE1lise",
        badgeBg: "#fef3c7",
        badgeColor: "#92400e",
        eventLabel: "Solicita\xE7\xE3o de Saque Pix"
      };
    case "withdrawal_approved":
      return {
        headerSubtitle: "Notifica\xE7\xE3o Autom\xE1tica de Saque Pix",
        badgeText: "Saque Aprovado",
        badgeBg: "#e0f2fe",
        badgeColor: "#075985",
        eventLabel: "Saque Pix Aprovado"
      };
    case "withdrawal_paid":
      return {
        headerSubtitle: "Comprovante Autom\xE1tico de Pagamento Pix",
        badgeText: "Pix Pago",
        badgeBg: "#d1fae5",
        badgeColor: "#065f46",
        eventLabel: "Pagamento Pix Conclu\xEDdo"
      };
    case "withdrawal_rejected":
      return {
        headerSubtitle: "Notifica\xE7\xE3o Autom\xE1tica de Saque Pix",
        badgeText: "Recusado e Estornado",
        badgeBg: "#fee2e2",
        badgeColor: "#991b1b",
        eventLabel: "Saque Recusado (Saldo Estornado)"
      };
    case "invite_sent":
      return {
        headerSubtitle: "Convite Oficial Earn Easy",
        badgeText: "Convite Especial",
        badgeBg: "#d1fae5",
        badgeColor: "#065f46",
        eventLabel: "Convite para Jogar e Ganhar"
      };
    case "referral_welcome":
      return {
        headerSubtitle: "Programa de Convites & Indica\xE7\xF5es",
        badgeText: "Convite Vinculado",
        badgeBg: "#d1fae5",
        badgeColor: "#065f46",
        eventLabel: "Cadastro por Link de Convite"
      };
    case "referral_bonus_credited":
      return {
        headerSubtitle: "Programa de Convites & Indica\xE7\xF5es",
        badgeText: "+500 Pontos Creditados",
        badgeBg: "#d1fae5",
        badgeColor: "#065f46",
        eventLabel: "B\xF4nus de Indica\xE7\xE3o (+12% Cont\xEDnuo)"
      };
    case "conversion_confirmed":
      return {
        headerSubtitle: "Confirma\xE7\xE3o de Transa\xE7\xE3o Financeira",
        badgeText: "Convers\xE3o Confirmada",
        badgeBg: "#d1fae5",
        badgeColor: "#065f46",
        eventLabel: "Convers\xE3o Di\xE1ria de Pontos"
      };
    case "streak_bonus_credited":
      return {
        headerSubtitle: "Recompensa de Fidelidade",
        badgeText: "B\xF4nus de Sequ\xEAncia",
        badgeBg: "#fef3c7",
        badgeColor: "#92400e",
        eventLabel: "B\xF4nus Check-in 30 Dias"
      };
    default:
      return {
        headerSubtitle: "Notifica\xE7\xE3o Autom\xE1tica Earn Easy",
        badgeText: "Notifica\xE7\xE3o",
        badgeBg: "#f1f5f9",
        badgeColor: "#334155",
        eventLabel: eventType || "notifica\xE7\xE3o"
      };
  }
}
function buildEmailContent(payload) {
  const cfg = readSmtpConfig();
  const eventType = String(payload.eventType || "transacao");
  const presentation = getEventPresentation(eventType);
  const safeSubject = escapeHtml(payload.subject);
  const safeSummary = escapeHtml(payload.summary);
  const safeRef = escapeHtml(payload.referenceId || "-");
  const safeAmount = payload.amountBrl ? escapeHtml(payload.amountBrl) : "";
  const safePixKey = payload.pixKey ? escapeHtml(payload.pixKey) : "";
  const safeInviterName = payload.inviterName ? escapeHtml(payload.inviterName) : "";
  const safeInvitedName = payload.invitedDisplayName ? escapeHtml(payload.invitedDisplayName) : "";
  const safeInviteCode = payload.inviteCode ? escapeHtml(payload.inviteCode) : "";
  const safeCustomMsg = payload.customMessage ? escapeHtml(payload.customMessage) : "";
  const fallbackInviteLink = cfg.appUrl && payload.inviteCode ? `${cfg.appUrl}/?ref=${encodeURIComponent(payload.inviteCode)}` : cfg.appUrl;
  const rawInviteLink = payload.inviteLink && /^https?:\/\//i.test(payload.inviteLink) ? payload.inviteLink : fallbackInviteLink;
  const safeInviteLink = rawInviteLink ? escapeHtml(rawInviteLink) : "";
  const isInviteEmail = eventType === "invite_sent" || eventType === "referral_welcome" || eventType === "referral_bonus_credited";
  const bonusLabel = typeof payload.bonusPoints === "number" && payload.bonusPoints > 0 ? `+${payload.bonusPoints.toLocaleString("pt-BR")} pontos` : "";
  const commissionLabel = typeof payload.commissionPct === "number" && payload.commissionPct > 0 ? `${payload.commissionPct}% de comiss\xE3o cont\xEDnua` : "";
  const inviteCalloutHtml = isInviteEmail ? `
      <div style="margin: 18px 0; padding: 16px; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0;">
        ${safeInviterName ? `<p style="margin: 0 0 8px; font-size: 13px; color: #065f46;"><strong>Convidado por:</strong> ${safeInviterName}</p>` : ""}
        ${safeInvitedName ? `<p style="margin: 0 0 8px; font-size: 13px; color: #065f46;"><strong>Amigo cadastrado:</strong> ${safeInvitedName}</p>` : ""}
        ${safeCustomMsg ? `<p style="margin: 0 0 10px; font-size: 13px; font-style: italic; color: #047857;">"${safeCustomMsg}"</p>` : ""}
        ${bonusLabel || commissionLabel ? `<p style="margin: 0 0 10px; font-size: 13px; color: #064e3b;"><strong>Benef\xEDcios:</strong> ${escapeHtml(
    [bonusLabel, commissionLabel].filter(Boolean).join(" \xB7 ")
  )}</p>` : ""}
        ${safeInviteCode ? `<p style="margin: 0 0 12px; font-size: 12px; color: #065f46;">C\xF3digo de convite: <code style="background: #ffffff; padding: 3px 7px; border-radius: 6px; border: 1px solid #a7f3d0; font-family: monospace; font-weight: 700;">${safeInviteCode}</code></p>` : ""}
        ${safeInviteLink ? `<a href="${safeInviteLink}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 8px;">${eventType === "invite_sent" ? "Aceitar Convite e Come\xE7ar a Jogar" : "Abrir Plataforma Earn Easy"}</a>` : ""}
      </div>
    ` : "";
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
          ${safeAmount ? `<tr><td style="padding: 10px 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Valor</td><td style="padding: 10px 12px; font-weight: 700; color: #059669; text-align: right; border-bottom: 1px solid #e2e8f0;">${safeAmount}</td></tr>` : ""}
          ${safePixKey ? `<tr><td style="padding: 10px 12px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Chave Pix</td><td style="padding: 10px 12px; font-family: monospace; text-align: right; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${safePixKey}</td></tr>` : ""}
          <tr>
            <td style="padding: 10px 12px; color: #64748b;">Refer\xEAncia</td>
            <td style="padding: 10px 12px; font-family: monospace; text-align: right; color: #0f172a;">${safeRef}</td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
          E-mail transacional autom\xE1tico enviado pelo sistema de pagamentos e indica\xE7\xF5es do Earn Easy.
        </p>
      </div>
    </div>
  `;
  const textLines = [
    `[Earn Easy] ${payload.subject}`,
    "",
    payload.summary,
    payload.customMessage ? `Mensagem: "${payload.customMessage}"` : "",
    payload.amountBrl ? `Valor: ${payload.amountBrl}` : "",
    payload.pixKey ? `Chave Pix: ${payload.pixKey}` : "",
    payload.inviteCode ? `C\xF3digo de convite: ${payload.inviteCode}` : "",
    rawInviteLink ? `Link de convite: ${rawInviteLink}` : "",
    `Evento: ${presentation.eventLabel}`,
    `Refer\xEAncia: ${payload.referenceId || "-"}`
  ].filter(Boolean);
  return {
    html,
    text: textLines.join("\n")
  };
}
async function sendTransactionalEmail(payload) {
  const recipient = String(payload.recipientEmail || "").trim();
  if (!isValidEmail(recipient)) {
    return {
      deliveryStatus: "failed",
      smtpConfigured: getSmtpStatus().configured,
      error: "Endere\xE7o de e-mail do destinat\xE1rio inv\xE1lido."
    };
  }
  const cfg = readSmtpConfig();
  const transporter = getOrCreateSmtpTransporter();
  if (!transporter) {
    return {
      deliveryStatus: "logged_in_app",
      smtpConfigured: false,
      message: "SMTP n\xE3o configurado no ambiente (.env). Notifica\xE7\xE3o registrada no hist\xF3rico da plataforma."
    };
  }
  const { html, text } = buildEmailContent(payload);
  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: recipient,
      subject: `[Earn Easy] ${String(payload.subject).slice(0, 140)}`,
      text,
      html
    });
    return {
      deliveryStatus: "sent_smtp",
      smtpConfigured: true,
      messageId: info.messageId,
      accepted: info.accepted.map(String),
      rejected: info.rejected.map(String)
    };
  } catch (err) {
    return {
      deliveryStatus: "failed",
      smtpConfigured: true,
      error: err instanceof Error ? err.message : "Erro ao enviar e-mail via SMTP."
    };
  }
}
async function sendSmtpTestEmail(recipientEmail) {
  const verification = await verifySmtpConnection();
  if (!verification.configured) {
    return {
      deliveryStatus: "logged_in_app",
      smtpConfigured: false,
      error: verification.error
    };
  }
  if (!verification.verified) {
    return {
      deliveryStatus: "failed",
      smtpConfigured: true,
      error: verification.error || "Falha ao verificar servidor SMTP."
    };
  }
  return sendTransactionalEmail({
    recipientEmail,
    eventType: "withdrawal_paid",
    subject: "Teste de Integra\xE7\xE3o SMTP (Nodemailer)",
    summary: "Sua integra\xE7\xE3o SMTP com o Nodemailer est\xE1 funcionando corretamente para envios autom\xE1ticos de saques Pix e convites no Earn Easy.",
    referenceId: `smtp_test_${Date.now()}`
  });
}

// server/multiplayerEngine.ts
import crypto from "crypto";
import { WebSocket, WebSocketServer } from "ws";
var VALID_GAMES = /* @__PURE__ */ new Set([
  "domino",
  "stop",
  "draw_guess",
  "battleship",
  "connect4",
  "quiz",
  "rps",
  "tictactoe_mp",
  "guess_number",
  "memory_mp",
  "reflex_mp"
]);
var STOP_LETTERS = "ABCDEFGHIJLMNOPQRSTUVXZ".split("");
var STOP_CATEGORIES = ["Nome", "Animal", "Fruta", "Cidade/Pa\xEDs", "Objeto", "Cor"];
var DRAW_WORDS = [
  "ABACAXI",
  "FOGUETE",
  "BICICLETA",
  "ELEFANTE",
  "VIOLAO",
  "MONTANHA",
  "CASTELO",
  "CACHORRO",
  "BORBOLETA",
  "SOL",
  "COROA",
  "DIAMANTE",
  "GUITARRA",
  "AVIAO",
  "TARTARUGA",
  "PIZZA",
  "SORVETE",
  "RELOGIO",
  "LIVRO",
  "CHAVE",
  "BARCO",
  "VULCAO",
  "CORACAO",
  "ROBO",
  "DRAGAO",
  "ESTRELA",
  "FUTEBOL",
  "COMPUTADOR",
  "GIRAFA",
  "MORANGO",
  "ESCORREGADOR",
  "CACTO",
  "FOGUEIRA",
  "PIRAMIDE",
  "HELICOPTERO",
  "SUBMARINO",
  "CAMERA",
  "TROFEU",
  "LAMPADA",
  "BALAO",
  "ANCHORA",
  "FAROL",
  "PINGUIM",
  "BALEIA",
  "MICROFONE",
  "TESOURA",
  "CHAPEUS",
  "CARRO"
];
var QUIZ_BANK = [
  { q: "Qual \xE9 o maior planeta do Sistema Solar?", opts: ["Saturno", "J\xFApiter", "Netuno", "Urano"], ans: 1, cat: "Ci\xEAncias" },
  { q: 'Qual elemento qu\xEDmico tem s\xEDmbolo "Au"?', opts: ["Prata", "Alum\xEDnio", "Ouro", "Cobre"], ans: 2, cat: "Ci\xEAncias" },
  { q: "Em qual pa\xEDs ficam as pir\xE2mides de Giz\xE9?", opts: ["M\xE9xico", "Egito", "Peru", "Marrocos"], ans: 1, cat: "Geografia" },
  { q: "Quantos lados tem um hex\xE1gono?", opts: ["5", "6", "7", "8"], ans: 1, cat: "Matem\xE1tica" },
  { q: "Qual \xE9 a capital da Austr\xE1lia?", opts: ["Sydney", "Melbourne", "Camberra", "Perth"], ans: 2, cat: "Geografia" },
  { q: "Quanto \xE9 15 \xD7 12?", opts: ["160", "170", "180", "190"], ans: 2, cat: "Matem\xE1tica" },
  { q: "Qual oceano banha o litoral brasileiro?", opts: ["\xCDndico", "Pac\xEDfico", "Atl\xE2ntico", "\xC1rtico"], ans: 2, cat: "Geografia" },
  { q: "Qual animal \xE9 s\xEDmbolo da nota de R$ 200?", opts: ["On\xE7a-pintada", "Lobo-guar\xE1", "Arara-azul", "Gar\xE7a"], ans: 1, cat: "Brasil" },
  { q: 'Quem pintou a obra "Mona Lisa"?', opts: ["Michelangelo", "Leonardo da Vinci", "Van Gogh", "Picasso"], ans: 1, cat: "Artes" },
  { q: "Quantos minutos existem em 3 horas e meia?", opts: ["190", "200", "210", "220"], ans: 2, cat: "Matem\xE1tica" },
  { q: "Qual g\xE1s as plantas absorvem na fotoss\xEDntese?", opts: ["Oxig\xEAnio", "Nitrog\xEAnio", "G\xE1s Carb\xF4nico", "H\xE9lio"], ans: 2, cat: "Biologia" },
  { q: "Qual \xE9 o menor n\xFAmero primo par?", opts: ["0", "2", "4", "6"], ans: 1, cat: "Matem\xE1tica" },
  { q: "Em que ano o homem pisou na Lua pela primeira vez?", opts: ["1965", "1969", "1972", "1959"], ans: 1, cat: "Hist\xF3ria" },
  { q: "Qual \xE9 o idioma oficial da \xC1ustria?", opts: ["Austr\xEDaco", "Ingl\xEAs", "Alem\xE3o", "Franc\xEAs"], ans: 2, cat: "Geografia" },
  { q: "Quantas pe\xE7as tem um jogo tradicional de domin\xF3?", opts: ["24", "28", "32", "36"], ans: 1, cat: "Jogos" },
  { q: "Qual vitamina \xE9 produzida com aux\xEDlio da luz solar?", opts: ["Vitamina A", "Vitamina C", "Vitamina D", "Vitamina K"], ans: 2, cat: "Biologia" },
  { q: "Qual \xE9 o rio mais extenso do Brasil?", opts: ["S\xE3o Francisco", "Paran\xE1", "Amazonas", "Tocantins"], ans: 2, cat: "Brasil" },
  { q: "Quanto \xE9 2 elevado \xE0 6\xAA pot\xEAncia (2\u2076)?", opts: ["32", "48", "64", "128"], ans: 2, cat: "Matem\xE1tica" },
  { q: "Qual pa\xEDs venceu mais Copas do Mundo de Futebol masculino?", opts: ["Alemanha", "It\xE1lia", "Argentina", "Brasil"], ans: 3, cat: "Esportes" },
  { q: "Qual \xE9 o menor estado brasileiro em territ\xF3rio?", opts: ["Alagoas", "Sergipe", "Esp\xEDrito Santo", "Para\xEDba"], ans: 1, cat: "Brasil" },
  { q: "Em inform\xE1tica, quantos bits formam 1 byte?", opts: ["4", "8", "16", "32"], ans: 1, cat: "Tecnologia" },
  { q: "Qual planeta \xE9 conhecido como Planeta Vermelho?", opts: ["V\xEAnus", "Marte", "Merc\xFArio", "Urano"], ans: 1, cat: "Ci\xEAncias" },
  { q: 'Quem escreveu "Dom Casmurro"?', opts: ["Jos\xE9 de Alencar", "Machado de Assis", "Clarice Lispector", "Jorge Amado"], ans: 1, cat: "Cultura" },
  { q: "Qual \xE9 a capital do Canad\xE1?", opts: ["Toronto", "Vancouver", "Ottawa", "Montreal"], ans: 2, cat: "Geografia" },
  { q: "Qual \xF3rg\xE3o do corpo humano bombeia o sangue?", opts: ["Pulm\xE3o", "F\xEDgado", "Cora\xE7\xE3o", "Rim"], ans: 2, cat: "Biologia" },
  { q: "Quantos graus tem a soma dos \xE2ngulos internos de um tri\xE2ngulo?", opts: ["90\xB0", "180\xB0", "270\xB0", "360\xB0"], ans: 1, cat: "Matem\xE1tica" },
  { q: "Qual \xE9 a moeda oficial do Jap\xE3o?", opts: ["Won", "Yuan", "Iene", "D\xF3lar"], ans: 2, cat: "Atualidades" },
  { q: "Qual instrumento mede a temperatura?", opts: ["Bar\xF4metro", "Term\xF4metro", "Anem\xF4metro", "Higr\xF4metro"], ans: 1, cat: "Ci\xEAncias" },
  { q: "Qual destes \xE9 um animal mam\xEDfero aqu\xE1tico?", opts: ["Tubar\xE3o", "Baleia", "Polvo", "Cavalo-marinho"], ans: 1, cat: "Biologia" },
  { q: "Em qual continente fica o deserto do Saara?", opts: ["\xC1sia", "\xC1frica", "Am\xE9rica", "Oceania"], ans: 1, cat: "Geografia" },
  { q: "Qual \xE9 a raiz quadrada de 196?", opts: ["12", "13", "14", "16"], ans: 2, cat: "Matem\xE1tica" },
  { q: "Qual empresa desenvolveu o sistema operacional Android?", opts: ["Apple", "Microsoft", "Google", "Nokia"], ans: 2, cat: "Tecnologia" },
  { q: "Qual \xE9 a maior floresta tropical do mundo?", opts: ["Congo", "Taiga", "Amaz\xF4nica", "Mata Atl\xE2ntica"], ans: 2, cat: "Brasil" },
  { q: "Quantos jogadores cada time tem em campo no futebol?", opts: ["9", "10", "11", "12"], ans: 2, cat: "Esportes" },
  { q: "Qual metal \xE9 l\xEDquido em temperatura ambiente?", opts: ["Ferro", "Merc\xFArio", "Chumbo", "Zinco"], ans: 1, cat: "Ci\xEAncias" },
  { q: "Em que ano foi proclamada a Rep\xFAblica no Brasil?", opts: ["1822", "1888", "1889", "1930"], ans: 2, cat: "Hist\xF3ria" },
  { q: "Qual sigla representa a mem\xF3ria vol\xE1til de acesso r\xE1pido do computador?", opts: ["SSD", "RAM", "BIOS", "GPU"], ans: 1, cat: "Tecnologia" },
  { q: "Qual \xE9 a montanha mais alta da Terra acima do n\xEDvel do mar?", opts: ["K2", "Aconc\xE1gua", "Monte Everest", "Kilimanjaro"], ans: 2, cat: "Geografia" },
  { q: "Quanto \xE9 25% de 240?", opts: ["48", "50", "60", "72"], ans: 2, cat: "Matem\xE1tica" },
  { q: "Qual pintor cortou parte da pr\xF3pria orelha?", opts: ["Claude Monet", "Pablo Picasso", "Vincent van Gogh", "Salvador Dal\xED"], ans: 2, cat: "Artes" },
  { q: "Qual planeta possui os an\xE9is mais vis\xEDveis do Sistema Solar?", opts: ["J\xFApiter", "Saturno", "Netuno", "Marte"], ans: 1, cat: "Ci\xEAncias" },
  { q: "Qual \xE9 a capital do estado do Paran\xE1?", opts: ["Londrina", "Maring\xE1", "Curitiba", "Cascavel"], ans: 2, cat: "Brasil" },
  { q: "Quantas casas tem um tabuleiro de xadrez?", opts: ["48", "56", "64", "72"], ans: 2, cat: "Jogos" },
  { q: "Qual protocolo criptografado exibe o cadeado de seguran\xE7a nos sites?", opts: ["HTTP", "FTP", "HTTPS", "SMTP"], ans: 2, cat: "Tecnologia" },
  { q: "Qual vitamina est\xE1 presente em alta concentra\xE7\xE3o na laranja e acerola?", opts: ["Vitamina B12", "Vitamina C", "Vitamina E", "Vitamina K"], ans: 1, cat: "Biologia" },
  { q: "Qual \xE9 o \xFAnico sat\xE9lite natural da Terra?", opts: ["Tit\xE3", "Fobos", "Lua", "Europa"], ans: 2, cat: "Ci\xEAncias" },
  { q: "Quantos dias tem um ano bissexto?", opts: ["364", "365", "366", "367"], ans: 2, cat: "Atualidades" },
  { q: 'Qual esporte utiliza termos como "strike" e "spare"?', opts: ["Beisebol", "Boliche", "T\xEAnis", "Golfe"], ans: 1, cat: "Esportes" },
  { q: "Qual pa\xEDs tem formato aproximado de uma bota no mapa?", opts: ["Gr\xE9cia", "It\xE1lia", "Portugal", "Turquia"], ans: 1, cat: "Geografia" },
  { q: "Quanto \xE9 7 \xD7 8 + 14?", opts: ["64", "68", "70", "72"], ans: 2, cat: "Matem\xE1tica" },
  { q: "Qual inven\xE7\xE3o \xE9 atribu\xEDda a Johannes Gutenberg no s\xE9culo XV?", opts: ["Tel\xE9grafo", "Imprensa de tipos m\xF3veis", "Motor a vapor", "Telesc\xF3pio"], ans: 1, cat: "Hist\xF3ria" },
  { q: "Qual bioma brasileiro \xE9 famoso por suas arauc\xE1rias e clima subtropical?", opts: ["Caatinga", "Pantanal", "Pampa", "Mata de Arauc\xE1rias"], ans: 3, cat: "Brasil" },
  { q: "Qual \xE9 a velocidade aproximada da luz no v\xE1cuo?", opts: ["30 mil km/s", "150 mil km/s", "300 mil km/s", "1 milh\xE3o km/s"], ans: 2, cat: "Ci\xEAncias" },
  { q: "Qual pa\xEDs sediou os Jogos Ol\xEDmpicos de 2016?", opts: ["Reino Unido", "Jap\xE3o", "Brasil", "Fran\xE7a"], ans: 2, cat: "Esportes" },
  { q: "Quantos v\xE9rtices tem um cubo?", opts: ["6", "8", "10", "12"], ans: 1, cat: "Matem\xE1tica" },
  { q: "Qual tecnologia de pagamentos instant\xE2neos do Brasil funciona 24 horas por dia?", opts: ["TED", "DOC", "Pix", "Cheque"], ans: 2, cat: "Brasil" }
];
var MEMORY_ICONS = ["\u26A1", "\u{1F48E}", "\u{1F525}", "\u{1F340}", "\u{1F3AF}", "\u{1F680}", "\u{1F451}", "\u{1F3AE}"];
var BATTLESHIP_SIZE = 7;
var BATTLESHIP_FLEET_LENGTHS = [4, 3, 2, 2];
function normalizeWord(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}
function generateRoomCode(existing) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const code = `EE-${suffix}`;
    if (!existing.has(code)) return code;
  }
  return `EE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
var MultiplayerEngine = class {
  constructor(signingSecret) {
    this.rooms = /* @__PURE__ */ new Map();
    this.socketToRoom = /* @__PURE__ */ new Map();
    this.allSockets = /* @__PURE__ */ new Set();
    this.lastGlobalPostByUid = /* @__PURE__ */ new Map();
    this.issuedSettlements = /* @__PURE__ */ new Map();
    this.signingSecret = signingSecret;
  }
  verifySettlement(payload) {
    if (!payload.matchId || !payload.settlementProof) {
      return { valid: false, reason: "Comprovante de partida ausente." };
    }
    const stored = this.issuedSettlements.get(payload.matchId);
    if (!stored) {
      const expected = this.computeSettlementProof({
        matchId: String(payload.matchId),
        roomCode: String(payload.roomCode || ""),
        gameId: String(payload.gameId || ""),
        winnerUid: String(payload.winnerUid || ""),
        loserUid: String(payload.loserUid || ""),
        stakePoints: Number(payload.stakePoints || 0),
        isDraw: Boolean(payload.isDraw),
        settledAt: String(payload.settledAt || "")
      });
      if (expected !== payload.settlementProof) {
        return { valid: false, reason: "Assinatura de partida multiplayer inv\xE1lida." };
      }
      return { valid: true, settlement: payload };
    }
    if (stored.settlementProof !== payload.settlementProof) {
      return { valid: false, reason: "Assinatura divergente do servidor." };
    }
    return { valid: true, settlement: stored };
  }
  computeSettlementProof(data) {
    const raw = `${data.matchId}|${data.roomCode}|${data.gameId}|${data.winnerUid}|${data.loserUid}|${data.stakePoints}|${data.isDraw}|${data.settledAt}`;
    return crypto.createHmac("sha256", this.signingSecret).update(raw).digest("hex");
  }
  attachToServer(server) {
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      const host = request.headers.host || "localhost";
      let pathname = "";
      try {
        pathname = new URL(request.url || "/", `http://${host}`).pathname;
      } catch {
        pathname = "";
      }
      if (pathname !== "/ws/multiplayer") {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
    wss.on("connection", (ws) => {
      this.allSockets.add(ws);
      this.sendDirectory(ws);
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(ws, msg);
        } catch {
          this.sendError(ws, "Mensagem WebSocket inv\xE1lida.");
        }
      });
      ws.on("close", () => {
        this.allSockets.delete(ws);
        this.handleDisconnect(ws);
      });
    });
  }
  send(ws, type, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
  }
  sendError(ws, message) {
    this.send(ws, "error", { message });
  }
  getDirectoryPayload() {
    const publicRooms = [];
    const globalInvites = [];
    for (const room of this.rooms.values()) {
      if (room.status !== "lobby") continue;
      if (room.players.length !== 1) continue;
      const host = room.players[0];
      if (!host || !host.connected) continue;
      const summary = {
        roomCode: room.roomCode,
        hostUid: host.uid,
        hostDisplayName: host.displayName,
        hostPhotoURL: host.photoURL,
        gameId: room.gameId,
        totalRounds: room.totalRounds,
        stakePoints: room.stakePoints,
        visibility: room.visibility,
        postedToGlobal: room.postedToGlobal,
        playerCount: room.players.length,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt
      };
      if (room.visibility === "public") {
        publicRooms.push(summary);
      }
      if (room.postedToGlobal) {
        globalInvites.push(summary);
      }
    }
    publicRooms.sort((a, b) => b.createdAt - a.createdAt);
    globalInvites.sort((a, b) => b.createdAt - a.createdAt);
    return { publicRooms, globalInvites };
  }
  sendDirectory(ws) {
    this.send(ws, "rooms:directory", this.getDirectoryPayload());
  }
  broadcastDirectory() {
    const payload = this.getDirectoryPayload();
    for (const sock of this.allSockets) {
      if (sock.readyState === WebSocket.OPEN) {
        this.send(sock, "rooms:directory", payload);
      }
    }
  }
  broadcastRoom(room) {
    room.updatedAt = Date.now();
    for (const player of room.players) {
      if (player.ws && player.ws.readyState === WebSocket.OPEN) {
        this.send(player.ws, "room:state", this.serializeRoomFor(room, player.uid));
      }
    }
  }
  serializeRoomFor(room, viewerUid) {
    return {
      roomCode: room.roomCode,
      hostUid: room.hostUid,
      gameId: room.gameId,
      totalRounds: room.totalRounds,
      currentRound: room.currentRound,
      status: room.status,
      visibility: room.visibility,
      postedToGlobal: room.postedToGlobal,
      stakePoints: room.stakePoints,
      proposedCounterPoints: room.proposedCounterPoints,
      counterProposedByUid: room.counterProposedByUid,
      stakeStatus: room.stakeStatus,
      players: room.players.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        photoURL: p.photoURL,
        pointsBalance: p.pointsBalance,
        connected: p.connected,
        isHost: p.isHost,
        acceptedRules: p.acceptedRules,
        score: p.score
      })),
      gameState: room.gameData ? this.sanitizeGameStateFor(room, viewerUid) : null,
      settlement: room.settlement,
      updatedAt: room.updatedAt
    };
  }
  sanitizeGameStateFor(room, viewerUid) {
    const g = room.gameData;
    if (!g) return null;
    if (room.gameId === "domino") {
      const handsCount = {};
      for (const p of room.players) {
        handsCount[p.uid] = (g.hands[p.uid] || []).length;
      }
      return {
        board: g.board,
        leftEnd: g.leftEnd,
        rightEnd: g.rightEnd,
        turnUid: g.turnUid,
        boneyardCount: (g.boneyard || []).length,
        myHand: g.hands[viewerUid] || [],
        handsCount,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        lastActionText: g.lastActionText
      };
    }
    if (room.gameId === "stop") {
      return {
        letter: g.letter,
        categories: g.categories,
        endsAt: g.endsAt,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        submittedUids: Object.keys(g.submissions || {}),
        myAnswers: g.submissions?.[viewerUid] || null,
        reveal: g.roundStatus === "round_end" ? g.reveal : null
      };
    }
    if (room.gameId === "draw_guess") {
      const isDrawer = g.drawerUid === viewerUid;
      return {
        drawerUid: g.drawerUid,
        wordHint: g.word.replace(/[A-Z0-9]/g, "_ "),
        wordLength: g.word.length,
        secretWord: isDrawer || g.roundStatus === "round_end" ? g.word : null,
        strokes: g.strokes || [],
        guesses: g.guesses || [],
        endsAt: g.endsAt,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid
      };
    }
    if (room.gameId === "battleship") {
      const opponent = room.players.find((p) => p.uid !== viewerUid);
      const myFleet = g.fleets?.[viewerUid] || null;
      const oppUid = opponent?.uid || "";
      const oppFleet = g.fleets?.[oppUid] || null;
      const myShotsOnOpp = g.shots?.[viewerUid] || {};
      const oppShotsOnMe = oppUid ? g.shots?.[oppUid] || {} : {};
      const myFleetPlaced = Boolean(myFleet);
      const oppFleetPlaced = Boolean(oppFleet);
      return {
        size: BATTLESHIP_SIZE,
        fleetLengths: BATTLESHIP_FLEET_LENGTHS,
        phase: g.phase,
        turnUid: g.turnUid,
        myFleet,
        myFleetPlaced,
        oppFleetPlaced,
        myShotsOnOpp,
        oppShotsOnMe,
        myHitsRemaining: oppFleet ? Math.max(0, oppFleet.totalCells - Object.values(myShotsOnOpp).filter((v) => v === "hit").length) : 11,
        oppHitsRemaining: myFleet ? Math.max(0, myFleet.totalCells - Object.values(oppShotsOnMe).filter((v) => v === "hit").length) : 11,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        lastActionText: g.lastActionText
      };
    }
    if (room.gameId === "quiz") {
      return {
        questionIndex: g.questionIndex,
        questionCategory: g.questionCategory || "Geral",
        question: g.questionText,
        options: g.options,
        endsAt: g.endsAt,
        answeredUids: Object.keys(g.answers || {}),
        myAnswer: g.answers?.[viewerUid] ?? null,
        correctIndex: g.roundStatus === "round_end" ? g.correctIndex : null,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        roundBreakdown: g.roundStatus === "round_end" ? g.roundBreakdown : null
      };
    }
    if (room.gameId === "rps") {
      const reveal = g.roundStatus === "round_end";
      return {
        chosenUids: Object.keys(g.choices || {}),
        myChoice: g.choices?.[viewerUid] || null,
        choices: reveal ? g.choices : null,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        lastActionText: g.lastActionText
      };
    }
    if (room.gameId === "guess_number") {
      return {
        turnUid: g.turnUid,
        history: g.history || [],
        minBound: g.minBound,
        maxBound: g.maxBound,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid,
        revealedTarget: g.roundStatus === "round_end" ? g.target : null
      };
    }
    if (room.gameId === "memory_mp") {
      const revealedIndices = new Set(g.tempFlipped || []);
      const visibleBoard = g.cards.map(
        (card, idx) => g.matched[idx] || revealedIndices.has(idx) ? card : null
      );
      return {
        cards: visibleBoard,
        matched: g.matched,
        tempFlipped: g.tempFlipped || [],
        turnUid: g.turnUid,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid
      };
    }
    if (room.gameId === "reflex_mp") {
      return {
        phase: g.phase,
        goAt: g.goAt,
        reactions: g.reactions || {},
        falseStartUid: g.falseStartUid || null,
        roundStatus: g.roundStatus,
        roundWinnerUid: g.roundWinnerUid
      };
    }
    return { ...g };
  }
  handleDisconnect(ws) {
    const info = this.socketToRoom.get(ws);
    if (!info) return;
    this.socketToRoom.delete(ws);
    const room = this.rooms.get(info.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.uid === info.uid);
    if (!player) return;
    if (player.ws === ws) {
      player.ws = null;
      player.connected = false;
    }
    if (room.players.every((p) => !p.connected)) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      if (room.status === "lobby") {
        this.rooms.delete(room.roomCode);
      }
      this.broadcastDirectory();
      return;
    }
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  handleMessage(ws, msg) {
    const { type, payload = {} } = msg || {};
    switch (type) {
      case "room:list_public":
        this.sendDirectory(ws);
        break;
      case "room:create":
        this.createRoom(ws, payload);
        break;
      case "room:join":
        this.joinRoom(ws, payload);
        break;
      case "room:leave":
        this.leaveRoom(ws);
        break;
      case "room:update_balance":
        this.updateBalance(ws, payload);
        break;
      case "room:config":
        this.updateConfig(ws, payload);
        break;
      case "room:publish_global":
        this.publishToGlobal(ws, payload);
        break;
      case "room:stake_accept":
        this.acceptStake(ws);
        break;
      case "room:stake_counter":
        this.counterStake(ws, payload);
        break;
      case "room:stake_respond":
        this.respondCounterStake(ws, payload);
        break;
      case "room:start":
        this.startMatch(ws);
        break;
      case "room:rematch":
        this.resetToLobby(ws);
        break;
      case "room:forfeit":
        this.forfeitMatch(ws);
        break;
      case "game:action":
        this.handleGameAction(ws, payload);
        break;
      case "game:next_round":
        this.handleNextRoundRequest(ws);
        break;
      default:
        this.sendError(ws, "Evento desconhecido.");
    }
  }
  detachSocketFromCurrentRoom(ws) {
    const prev = this.socketToRoom.get(ws);
    if (!prev) return;
    const prevRoom = this.rooms.get(prev.roomCode);
    if (prevRoom) {
      if (prevRoom.status === "lobby") {
        prevRoom.players = prevRoom.players.filter((item) => item.uid !== prev.uid);
        if (prevRoom.players.length === 0) {
          if (prevRoom.roundTimer) clearTimeout(prevRoom.roundTimer);
          this.rooms.delete(prevRoom.roomCode);
        } else {
          if (prevRoom.hostUid === prev.uid) {
            prevRoom.hostUid = prevRoom.players[0].uid;
            prevRoom.players[0].isHost = true;
          }
          prevRoom.players.forEach((p) => {
            p.acceptedRules = p.isHost;
          });
          prevRoom.stakeStatus = "pending_opponent";
          prevRoom.proposedCounterPoints = null;
          this.broadcastRoom(prevRoom);
        }
      } else {
        const p = prevRoom.players.find((item) => item.uid === prev.uid);
        if (p) {
          p.ws = null;
          p.connected = false;
        }
        this.broadcastRoom(prevRoom);
      }
      this.broadcastDirectory();
    }
    this.socketToRoom.delete(ws);
  }
  createRoom(ws, payload) {
    const uid = String(payload.uid || "").trim();
    const displayName = String(payload.displayName || "Jogador").trim().slice(0, 60);
    const photoURL = String(payload.photoURL || "").slice(0, 6e4);
    const pointsBalance = Math.max(0, Math.floor(Number(payload.pointsBalance || 0)));
    const gameId = String(payload.gameId || "domino");
    const totalRounds = [1, 3, 5, 7].includes(Number(payload.totalRounds)) ? Number(payload.totalRounds) : 3;
    const stakePoints = Math.max(0, Math.min(5e4, Math.floor(Number(payload.stakePoints || 0))));
    const postToGlobal = Boolean(payload.postToGlobal);
    const visibility = postToGlobal ? "public" : payload.visibility === "public" ? "public" : "private";
    if (!uid) {
      this.sendError(ws, "Fa\xE7a login para criar uma sala.");
      return;
    }
    if (!VALID_GAMES.has(gameId)) {
      this.sendError(ws, "Jogo inv\xE1lido selecionado.");
      return;
    }
    if (stakePoints > pointsBalance) {
      this.sendError(ws, "Voc\xEA n\xE3o tem pontos suficientes para apostar essa quantia.");
      return;
    }
    if (postToGlobal) {
      const lastPost = this.lastGlobalPostByUid.get(uid) || 0;
      if (Date.now() - lastPost < 3e3) {
        this.sendError(ws, "Aguarde alguns segundos antes de enviar outra partida no Chat Global.");
        return;
      }
      this.lastGlobalPostByUid.set(uid, Date.now());
    }
    this.detachSocketFromCurrentRoom(ws);
    const now = Date.now();
    const roomCode = generateRoomCode(this.rooms);
    const room = {
      roomCode,
      hostUid: uid,
      gameId,
      totalRounds,
      currentRound: 0,
      status: "lobby",
      visibility,
      postedToGlobal: postToGlobal,
      stakePoints,
      proposedCounterPoints: null,
      counterProposedByUid: null,
      stakeStatus: "pending_opponent",
      players: [
        {
          uid,
          displayName: displayName || "Jogador",
          photoURL,
          pointsBalance,
          connected: true,
          isHost: true,
          acceptedRules: true,
          score: 0,
          ws
        }
      ],
      gameData: null,
      roundTimer: null,
      settlement: null,
      usedQuizIndices: /* @__PURE__ */ new Set(),
      usedDrawWords: /* @__PURE__ */ new Set(),
      usedStopLetters: /* @__PURE__ */ new Set(),
      createdAt: now,
      updatedAt: now
    };
    this.rooms.set(roomCode, room);
    this.socketToRoom.set(ws, { roomCode, uid });
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  joinRoom(ws, payload) {
    const roomCode = String(payload.roomCode || "").trim().toUpperCase();
    const uid = String(payload.uid || "").trim();
    const displayName = String(payload.displayName || "Jogador").trim().slice(0, 60);
    const photoURL = String(payload.photoURL || "").slice(0, 6e4);
    const pointsBalance = Math.max(0, Math.floor(Number(payload.pointsBalance || 0)));
    if (!uid || !roomCode) {
      this.sendError(ws, "Informe seu usu\xE1rio e o c\xF3digo da sala.");
      return;
    }
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.sendError(ws, "Sala n\xE3o encontrada ou j\xE1 encerrada.");
      return;
    }
    this.detachSocketFromCurrentRoom(ws);
    const existing = room.players.find((p) => p.uid === uid);
    if (existing) {
      existing.displayName = displayName || existing.displayName;
      existing.photoURL = photoURL || existing.photoURL;
      existing.pointsBalance = pointsBalance;
      existing.connected = true;
      existing.ws = ws;
      this.socketToRoom.set(ws, { roomCode, uid });
      this.broadcastRoom(room);
      return;
    }
    if (room.status !== "lobby") {
      this.sendError(ws, "Esta partida j\xE1 est\xE1 em andamento.");
      return;
    }
    if (room.players.length >= 2) {
      this.sendError(ws, "Esta sala j\xE1 est\xE1 cheia (2/2 jogadores).");
      return;
    }
    room.players.push({
      uid,
      displayName: displayName || "Amigo",
      photoURL,
      pointsBalance,
      connected: true,
      isHost: false,
      acceptedRules: false,
      score: 0,
      ws
    });
    room.stakeStatus = "pending_opponent";
    room.proposedCounterPoints = null;
    room.counterProposedByUid = null;
    room.postedToGlobal = false;
    this.socketToRoom.set(ws, { roomCode, uid });
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  leaveRoom(ws) {
    const info = this.socketToRoom.get(ws);
    if (!info) return;
    this.socketToRoom.delete(ws);
    const room = this.rooms.get(info.roomCode);
    if (!room) return;
    if (room.status === "playing") {
      const opponent = room.players.find((p) => p.uid !== info.uid);
      room.players = room.players.filter((p) => p.uid !== info.uid);
      if (opponent) {
        this.finalizeMatchWithWinner(room, opponent.uid, false);
      } else {
        if (room.roundTimer) clearTimeout(room.roundTimer);
        this.rooms.delete(room.roomCode);
      }
      this.send(ws, "room:left", { roomCode: info.roomCode });
      this.broadcastDirectory();
      return;
    }
    room.players = room.players.filter((p) => p.uid !== info.uid);
    if (room.players.length === 0) {
      if (room.roundTimer) clearTimeout(room.roundTimer);
      this.rooms.delete(room.roomCode);
    } else {
      if (room.hostUid === info.uid) {
        room.hostUid = room.players[0].uid;
        room.players[0].isHost = true;
      }
      room.players.forEach((p) => {
        p.acceptedRules = p.isHost;
      });
      room.stakeStatus = "pending_opponent";
      room.proposedCounterPoints = null;
      this.broadcastRoom(room);
    }
    this.send(ws, "room:left", { roomCode: info.roomCode });
    this.broadcastDirectory();
  }
  getSocketContext(ws) {
    const info = this.socketToRoom.get(ws);
    if (!info) return null;
    const room = this.rooms.get(info.roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.uid === info.uid);
    if (!player) return null;
    return { room, player };
  }
  updateBalance(ws, payload) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const nextBalance = Math.max(0, Math.floor(Number(payload.pointsBalance || 0)));
    ctx.player.pointsBalance = nextBalance;
    this.broadcastRoom(ctx.room);
  }
  updateConfig(ws, payload) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "lobby") return;
    if (!player.isHost) {
      this.sendError(ws, "Apenas o criador da sala pode alterar jogo, rodadas ou aposta.");
      return;
    }
    if (payload.gameId && VALID_GAMES.has(payload.gameId)) {
      room.gameId = payload.gameId;
    }
    if ([1, 3, 5, 7].includes(Number(payload.totalRounds))) {
      room.totalRounds = Number(payload.totalRounds);
    }
    if (payload.visibility === "public" || payload.visibility === "private") {
      room.visibility = payload.visibility;
      if (room.visibility === "private") {
        room.postedToGlobal = false;
      }
    }
    if (payload.stakePoints !== void 0) {
      const nextStake = Math.max(0, Math.min(5e4, Math.floor(Number(payload.stakePoints))));
      if (nextStake > player.pointsBalance) {
        this.sendError(ws, "Aposte no m\xE1ximo o saldo dispon\xEDvel na sua conta.");
        return;
      }
      room.stakePoints = nextStake;
    }
    room.proposedCounterPoints = null;
    room.counterProposedByUid = null;
    room.stakeStatus = "pending_opponent";
    room.players.forEach((p) => {
      p.acceptedRules = p.isHost;
    });
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  publishToGlobal(ws, payload) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "lobby") {
      this.sendError(ws, "Apenas salas aguardando no lobby podem ser publicadas no Chat Global.");
      return;
    }
    if (!player.isHost) {
      this.sendError(ws, "Apenas o anfitri\xE3o pode publicar ou remover a partida do Chat Global.");
      return;
    }
    const publish = Boolean(payload.publish);
    if (publish) {
      if (room.players.length >= 2) {
        this.sendError(ws, "Sua sala j\xE1 tem um advers\xE1rio.");
        return;
      }
      const lastPost = this.lastGlobalPostByUid.get(player.uid) || 0;
      if (!room.postedToGlobal && Date.now() - lastPost < 3e3) {
        this.sendError(ws, "Aguarde alguns segundos antes de enviar outra partida no Chat Global.");
        return;
      }
      this.lastGlobalPostByUid.set(player.uid, Date.now());
      room.visibility = "public";
      room.postedToGlobal = true;
    } else {
      room.postedToGlobal = false;
    }
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  acceptStake(ws) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "lobby") return;
    if (room.stakePoints > player.pointsBalance) {
      this.sendError(ws, "Seu saldo atual \xE9 menor que o valor combinado para a partida.");
      return;
    }
    player.acceptedRules = true;
    const allAccepted = room.players.length === 2 && room.players.every((p) => p.acceptedRules);
    room.stakeStatus = allAccepted ? "agreed" : "pending_opponent";
    this.broadcastRoom(room);
  }
  counterStake(ws, payload) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "lobby") return;
    if (player.isHost) {
      this.sendError(ws, "Como criador, altere diretamente a aposta na configura\xE7\xE3o.");
      return;
    }
    const counter = Math.max(0, Math.min(5e4, Math.floor(Number(payload.counterPoints))));
    if (counter > player.pointsBalance) {
      this.sendError(ws, "Voc\xEA n\xE3o possui pontos suficientes para essa contraproposta.");
      return;
    }
    room.proposedCounterPoints = counter;
    room.counterProposedByUid = player.uid;
    room.stakeStatus = "counter_proposed";
    room.players.forEach((p) => {
      p.acceptedRules = p.uid === player.uid;
    });
    this.broadcastRoom(room);
  }
  respondCounterStake(ws, payload) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "lobby" || !player.isHost) return;
    if (room.stakeStatus !== "counter_proposed" || room.proposedCounterPoints === null) return;
    const accept = Boolean(payload.accept);
    if (accept) {
      const counter = room.proposedCounterPoints;
      if (counter > player.pointsBalance) {
        this.sendError(ws, "Seu saldo atual \xE9 insuficiente para aceitar essa contraproposta.");
        return;
      }
      room.stakePoints = counter;
      room.proposedCounterPoints = null;
      room.counterProposedByUid = null;
      room.stakeStatus = "agreed";
      room.players.forEach((p) => {
        p.acceptedRules = true;
      });
    } else {
      room.proposedCounterPoints = null;
      room.counterProposedByUid = null;
      room.stakeStatus = "rejected";
      room.players.forEach((p) => {
        p.acceptedRules = p.isHost;
      });
    }
    this.broadcastRoom(room);
  }
  startMatch(ws) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (!player.isHost) {
      this.sendError(ws, "Apenas o anfitri\xE3o da sala pode iniciar a partida.");
      return;
    }
    if (room.players.length < 2) {
      this.sendError(ws, "Aguarde um amigo entrar na sala pelo c\xF3digo antes de iniciar.");
      return;
    }
    if (room.players.some((p) => !p.connected)) {
      this.sendError(ws, "Todos os jogadores precisam estar conectados para iniciar.");
      return;
    }
    if (room.stakeStatus !== "agreed" || room.players.some((p) => !p.acceptedRules)) {
      this.sendError(ws, "O advers\xE1rio precisa aceitar as regras e os pontos da partida antes de come\xE7ar.");
      return;
    }
    for (const p of room.players) {
      if (p.pointsBalance < room.stakePoints) {
        this.sendError(ws, `${p.displayName} n\xE3o possui saldo suficiente (${room.stakePoints} pts) para esta partida.`);
        return;
      }
    }
    room.status = "playing";
    room.postedToGlobal = false;
    room.currentRound = 1;
    room.settlement = null;
    room.players.forEach((p) => {
      p.score = 0;
    });
    this.initRound(room);
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  resetToLobby(ws) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room } = ctx;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.status = "lobby";
    room.postedToGlobal = false;
    room.currentRound = 0;
    room.gameData = null;
    room.settlement = null;
    room.stakeStatus = "pending_opponent";
    room.proposedCounterPoints = null;
    room.counterProposedByUid = null;
    room.players.forEach((p) => {
      p.score = 0;
      p.acceptedRules = p.isHost;
    });
    this.broadcastRoom(room);
    this.broadcastDirectory();
  }
  forfeitMatch(ws) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "playing") return;
    const opponent = room.players.find((p) => p.uid !== player.uid);
    if (!opponent) return;
    this.finalizeMatchWithWinner(room, opponent.uid, false);
  }
  initRound(room) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    const p0 = room.players[0];
    const p1 = room.players[1];
    const starterIdx = (room.currentRound - 1) % 2;
    const starterUid = room.players[starterIdx]?.uid || p0.uid;
    switch (room.gameId) {
      case "domino": {
        const tiles = [];
        for (let a = 0; a <= 6; a++) {
          for (let b = a; b <= 6; b++) tiles.push([a, b]);
        }
        const deck = shuffleArray(tiles);
        const hand0 = deck.slice(0, 7);
        const hand1 = deck.slice(7, 14);
        const boneyard = deck.slice(14);
        room.gameData = {
          hands: { [p0.uid]: hand0, [p1.uid]: hand1 },
          boneyard,
          board: [],
          leftEnd: null,
          rightEnd: null,
          turnUid: starterUid,
          consecutivePasses: 0,
          roundStatus: "active",
          roundWinnerUid: null,
          lastActionText: "Rodada iniciada! Escolha uma pe\xE7a para jogar na mesa."
        };
        break;
      }
      case "stop": {
        let availableLetters = STOP_LETTERS.filter((l) => !room.usedStopLetters.has(l));
        if (availableLetters.length === 0) {
          room.usedStopLetters.clear();
          availableLetters = [...STOP_LETTERS];
        }
        const letter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
        room.usedStopLetters.add(letter);
        const endsAt = Date.now() + 6e4;
        room.gameData = {
          letter,
          categories: STOP_CATEGORIES,
          endsAt,
          submissions: {},
          roundStatus: "active",
          roundWinnerUid: null,
          reveal: null
        };
        room.roundTimer = setTimeout(() => {
          this.resolveStopRound(room);
        }, 60500);
        break;
      }
      case "draw_guess": {
        const drawerUid = starterUid;
        let availableWords = DRAW_WORDS.filter((w) => !room.usedDrawWords.has(w));
        if (availableWords.length === 0) {
          room.usedDrawWords.clear();
          availableWords = [...DRAW_WORDS];
        }
        const word = availableWords[Math.floor(Math.random() * availableWords.length)];
        room.usedDrawWords.add(word);
        const endsAt = Date.now() + 7e4;
        room.gameData = {
          drawerUid,
          word,
          strokes: [],
          guesses: [],
          endsAt,
          roundStatus: "active",
          roundWinnerUid: null
        };
        room.roundTimer = setTimeout(() => {
          if (room.status === "playing" && room.gameData?.roundStatus === "active") {
            room.gameData.roundStatus = "round_end";
            room.gameData.roundWinnerUid = null;
            this.afterRoundResolved(room);
          }
        }, 70500);
        break;
      }
      case "battleship": {
        room.gameData = {
          phase: "placing",
          turnUid: starterUid,
          fleets: {},
          shots: {},
          roundStatus: "active",
          roundWinnerUid: null,
          lastActionText: "Posicione sua frota e clique em Confirmar Frota!"
        };
        break;
      }
      case "connect4": {
        room.gameData = {
          board: Array.from({ length: 6 }, () => Array(7).fill(null)),
          turnUid: starterUid,
          colors: { [p0.uid]: "lime", [p1.uid]: "sky" },
          winningCells: [],
          roundStatus: "active",
          roundWinnerUid: null
        };
        break;
      }
      case "quiz": {
        let unusedIndices = QUIZ_BANK.map((_, i) => i).filter((i) => !room.usedQuizIndices.has(i));
        if (unusedIndices.length === 0) {
          room.usedQuizIndices.clear();
          unusedIndices = QUIZ_BANK.map((_, i) => i);
        }
        const pickedIndex = unusedIndices[Math.floor(Math.random() * unusedIndices.length)];
        room.usedQuizIndices.add(pickedIndex);
        const item = QUIZ_BANK[pickedIndex];
        const endsAt = Date.now() + 18e3;
        room.gameData = {
          questionIndex: room.currentRound,
          questionCategory: item.cat,
          questionText: item.q,
          options: item.opts,
          correctIndex: item.ans,
          startedAt: Date.now(),
          endsAt,
          answers: {},
          roundStatus: "active",
          roundWinnerUid: null,
          roundBreakdown: null
        };
        room.roundTimer = setTimeout(() => {
          this.resolveQuizRound(room);
        }, 18500);
        break;
      }
      case "rps": {
        room.gameData = {
          choices: {},
          roundStatus: "active",
          roundWinnerUid: null,
          lastActionText: "Escolha Pedra, Papel ou Tesoura em segredo!"
        };
        break;
      }
      case "tictactoe_mp": {
        room.gameData = {
          board: Array(9).fill(null),
          turnUid: starterUid,
          symbols: { [p0.uid]: "X", [p1.uid]: "O" },
          winLine: null,
          roundStatus: "active",
          roundWinnerUid: null
        };
        break;
      }
      case "guess_number": {
        room.gameData = {
          target: 1 + Math.floor(Math.random() * 100),
          minBound: 1,
          maxBound: 100,
          turnUid: starterUid,
          history: [],
          roundStatus: "active",
          roundWinnerUid: null
        };
        break;
      }
      case "memory_mp": {
        const cards = shuffleArray([...MEMORY_ICONS, ...MEMORY_ICONS]);
        room.gameData = {
          cards,
          matched: Array(16).fill(false),
          tempFlipped: [],
          locked: false,
          turnUid: starterUid,
          pairScores: { [p0.uid]: 0, [p1.uid]: 0 },
          roundStatus: "active",
          roundWinnerUid: null
        };
        break;
      }
      case "reflex_mp": {
        const waitMs = 1800 + Math.floor(Math.random() * 2400);
        room.gameData = {
          phase: "waiting",
          goAt: null,
          reactions: {},
          falseStartUid: null,
          roundStatus: "active",
          roundWinnerUid: null
        };
        room.roundTimer = setTimeout(() => {
          if (room.status === "playing" && room.gameData?.phase === "waiting") {
            room.gameData.phase = "go";
            room.gameData.goAt = Date.now();
            this.broadcastRoom(room);
            room.roundTimer = setTimeout(() => {
              this.resolveReflexTimeout(room);
            }, 4e3);
          }
        }, waitMs);
        break;
      }
    }
  }
  afterRoundResolved(room) {
    const isLastRound = room.currentRound >= room.totalRounds;
    if (isLastRound) {
      const [p0, p1] = room.players;
      if (p0.score === p1.score) {
        this.finalizeMatchWithWinner(room, "", true);
      } else {
        const winner = p0.score > p1.score ? p0 : p1;
        this.finalizeMatchWithWinner(room, winner.uid, false);
      }
      return;
    }
    this.broadcastRoom(room);
  }
  finalizeMatchWithWinner(room, winnerUid, isDraw) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.status = "finished";
    const loserUid = !isDraw && winnerUid ? room.players.find((p) => p.uid !== winnerUid)?.uid || "" : "";
    const scoresByUid = {};
    room.players.forEach((p) => {
      scoresByUid[p.uid] = p.score;
    });
    const matchId = `mp_${room.roomCode.replace(/[^A-Z0-9]/g, "")}_${Date.now()}`;
    const settledAt = (/* @__PURE__ */ new Date()).toISOString();
    const settlementProof = this.computeSettlementProof({
      matchId,
      roomCode: room.roomCode,
      gameId: room.gameId,
      winnerUid,
      loserUid,
      stakePoints: room.stakePoints,
      isDraw,
      settledAt
    });
    const settlement = {
      matchId,
      roomCode: room.roomCode,
      gameId: room.gameId,
      participantUids: room.players.map((p) => p.uid),
      winnerUid,
      loserUid,
      isDraw,
      stakePoints: room.stakePoints,
      scoresByUid,
      settlementProof,
      settledAt
    };
    room.settlement = settlement;
    this.issuedSettlements.set(matchId, settlement);
    this.broadcastRoom(room);
  }
  handleNextRoundRequest(ws) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room } = ctx;
    if (room.status !== "playing" || !room.gameData) return;
    if (room.gameData.roundStatus !== "round_end") return;
    if (room.currentRound >= room.totalRounds) return;
    room.currentRound += 1;
    this.initRound(room);
    this.broadcastRoom(room);
  }
  handleGameAction(ws, payload) {
    const ctx = this.getSocketContext(ws);
    if (!ctx) return;
    const { room, player } = ctx;
    if (room.status !== "playing" || !room.gameData) return;
    const g = room.gameData;
    if (g.roundStatus !== "active") return;
    const opponent = room.players.find((p) => p.uid !== player.uid);
    if (!opponent) return;
    switch (room.gameId) {
      case "domino":
        this.actDomino(room, player, opponent, payload);
        break;
      case "stop":
        this.actStop(room, player, payload);
        break;
      case "draw_guess":
        this.actDrawGuess(room, player, opponent, payload);
        break;
      case "battleship":
        this.actBattleship(room, player, opponent, payload);
        break;
      case "connect4":
        this.actConnect4(room, player, opponent, payload);
        break;
      case "quiz":
        this.actQuiz(room, player, payload);
        break;
      case "rps":
        this.actRps(room, player, opponent, payload);
        break;
      case "tictactoe_mp":
        this.actTicTacToe(room, player, opponent, payload);
        break;
      case "guess_number":
        this.actGuessNumber(room, player, opponent, payload);
        break;
      case "memory_mp":
        this.actMemory(room, player, opponent, payload);
        break;
      case "reflex_mp":
        this.actReflex(room, player, opponent);
        break;
    }
  }
  // --- 1. DOMINÓ ONLINE ---
  actDomino(room, player, opponent, payload) {
    const g = room.gameData;
    if (g.turnUid !== player.uid) return;
    const hand = g.hands[player.uid];
    if (payload.action === "play") {
      const tileIdx = Number(payload.tileIndex);
      const side = payload.side === "left" ? "left" : "right";
      const tile = hand[tileIdx];
      if (!tile) return;
      if (g.board.length === 0) {
        g.board.push(tile);
        g.leftEnd = tile[0];
        g.rightEnd = tile[1];
      } else if (side === "left") {
        if (tile[1] === g.leftEnd) {
          g.board.unshift([tile[0], tile[1]]);
          g.leftEnd = tile[0];
        } else if (tile[0] === g.leftEnd) {
          g.board.unshift([tile[1], tile[0]]);
          g.leftEnd = tile[1];
        } else {
          this.sendError(player.ws, "Esta pe\xE7a n\xE3o encaixa na ponta esquerda.");
          return;
        }
      } else {
        if (tile[0] === g.rightEnd) {
          g.board.push([tile[0], tile[1]]);
          g.rightEnd = tile[1];
        } else if (tile[1] === g.rightEnd) {
          g.board.push([tile[1], tile[0]]);
          g.rightEnd = tile[0];
        } else {
          this.sendError(player.ws, "Esta pe\xE7a n\xE3o encaixa na ponta direita.");
          return;
        }
      }
      hand.splice(tileIdx, 1);
      g.consecutivePasses = 0;
      g.lastActionText = `${player.displayName} jogou [${tile[0]}|${tile[1]}].`;
      if (hand.length === 0) {
        player.score += 1;
        g.roundStatus = "round_end";
        g.roundWinnerUid = player.uid;
        g.lastActionText = `${player.displayName} bateu o Domin\xF3!`;
        this.afterRoundResolved(room);
        return;
      }
      g.turnUid = opponent.uid;
      this.broadcastRoom(room);
      return;
    }
    if (payload.action === "draw") {
      if (g.boneyard.length === 0) {
        this.sendError(player.ws, "Monte vazio! Passe a vez se n\xE3o tiver jogada.");
        return;
      }
      const drawn = g.boneyard.pop();
      hand.push(drawn);
      g.lastActionText = `${player.displayName} comprou 1 pe\xE7a do monte.`;
      this.broadcastRoom(room);
      return;
    }
    if (payload.action === "pass") {
      const canPlayAny = g.board.length === 0 || hand.some(
        ([a, b]) => a === g.leftEnd || b === g.leftEnd || a === g.rightEnd || b === g.rightEnd
      );
      if (canPlayAny) {
        this.sendError(player.ws, "Voc\xEA ainda tem pe\xE7a v\xE1lida na m\xE3o!");
        return;
      }
      if (g.boneyard.length > 0) {
        this.sendError(player.ws, "Compre do monte antes de passar a vez!");
        return;
      }
      g.consecutivePasses += 1;
      g.lastActionText = `${player.displayName} passou a vez.`;
      if (g.consecutivePasses >= 2) {
        const myPips = hand.reduce((s, [a, b]) => s + a + b, 0);
        const oppPips = g.hands[opponent.uid].reduce(
          (s, [a, b]) => s + a + b,
          0
        );
        g.roundStatus = "round_end";
        if (myPips < oppPips) {
          player.score += 1;
          g.roundWinnerUid = player.uid;
          g.lastActionText = `Jogo trancado! ${player.displayName} venceu nos pontos (${myPips} vs ${oppPips}).`;
        } else if (oppPips < myPips) {
          opponent.score += 1;
          g.roundWinnerUid = opponent.uid;
          g.lastActionText = `Jogo trancado! ${opponent.displayName} venceu nos pontos (${oppPips} vs ${myPips}).`;
        } else {
          g.roundWinnerUid = null;
          g.lastActionText = `Jogo trancado em empate (${myPips} pontos cada).`;
        }
        this.afterRoundResolved(room);
        return;
      }
      g.turnUid = opponent.uid;
      this.broadcastRoom(room);
    }
  }
  // --- 2. STOP ONLINE ---
  actStop(room, player, payload) {
    const g = room.gameData;
    const rawAnswers = payload.answers || {};
    const clean = {};
    for (const cat of STOP_CATEGORIES) {
      clean[cat] = String(rawAnswers[cat] || "").trim().slice(0, 32);
    }
    g.submissions[player.uid] = clean;
    const triggerStop = Boolean(payload.callStop);
    const filledCount = Object.values(clean).filter((v) => v.length >= 2).length;
    const bothSubmitted = room.players.every((p) => Boolean(g.submissions[p.uid]));
    if (triggerStop && filledCount >= 4 || bothSubmitted) {
      this.resolveStopRound(room);
    } else {
      this.broadcastRoom(room);
    }
  }
  resolveStopRound(room) {
    const g = room.gameData;
    if (!g || g.roundStatus !== "active" || room.status !== "playing") return;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    const [p0, p1] = room.players;
    const a0 = g.submissions[p0.uid] || {};
    const a1 = g.submissions[p1.uid] || {};
    const letter = g.letter;
    let pts0 = 0;
    let pts1 = 0;
    const breakdown = {};
    for (const cat of STOP_CATEGORIES) {
      const w0 = normalizeWord(a0[cat] || "");
      const w1 = normalizeWord(a1[cat] || "");
      const v0 = w0.length >= 2 && w0.startsWith(letter);
      const v1 = w1.length >= 2 && w1.startsWith(letter);
      let s0 = 0;
      let s1 = 0;
      if (v0 && v1 && w0 === w1) {
        s0 = 5;
        s1 = 5;
      } else {
        if (v0) s0 = 10;
        if (v1) s1 = 10;
      }
      pts0 += s0;
      pts1 += s1;
      breakdown[cat] = {
        p0Word: a0[cat] || "\u2014",
        p0Pts: s0,
        p1Word: a1[cat] || "\u2014",
        p1Pts: s1
      };
    }
    g.roundStatus = "round_end";
    if (pts0 > pts1) {
      p0.score += 1;
      g.roundWinnerUid = p0.uid;
    } else if (pts1 > pts0) {
      p1.score += 1;
      g.roundWinnerUid = p1.uid;
    } else {
      g.roundWinnerUid = null;
    }
    g.reveal = { pts0, pts1, breakdown };
    this.afterRoundResolved(room);
  }
  // --- 3. DESENHE E ADIVINHE ---
  actDrawGuess(room, player, opponent, payload) {
    const g = room.gameData;
    if (payload.action === "stroke" && player.uid === g.drawerUid) {
      const stroke = payload.stroke;
      if (stroke && Array.isArray(stroke.points) && stroke.points.length > 0) {
        g.strokes.push({
          points: stroke.points.slice(0, 200),
          color: String(stroke.color || "#a3e635").slice(0, 20),
          size: Math.max(2, Math.min(20, Number(stroke.size || 4)))
        });
        if (g.strokes.length > 250) g.strokes.shift();
        this.broadcastRoom(room);
      }
      return;
    }
    if (payload.action === "clear" && player.uid === g.drawerUid) {
      g.strokes = [];
      this.broadcastRoom(room);
      return;
    }
    if (payload.action === "guess" && player.uid !== g.drawerUid) {
      const rawGuess = String(payload.text || "").trim().slice(0, 60);
      if (!rawGuess) return;
      const correct = normalizeWord(rawGuess) === normalizeWord(g.word);
      g.guesses.push({
        uid: player.uid,
        name: player.displayName,
        text: rawGuess,
        correct
      });
      if (correct) {
        if (room.roundTimer) {
          clearTimeout(room.roundTimer);
          room.roundTimer = null;
        }
        player.score += 2;
        opponent.score += 1;
        g.roundStatus = "round_end";
        g.roundWinnerUid = player.uid;
        this.afterRoundResolved(room);
      } else {
        this.broadcastRoom(room);
      }
    }
  }
  // --- 4. BATALHA NAVAL ---
  actBattleship(room, player, opponent, payload) {
    const g = room.gameData;
    if (payload.action === "place_fleet" && g.phase === "placing") {
      const ships = payload.ships;
      if (!Array.isArray(ships) || ships.length !== BATTLESHIP_FLEET_LENGTHS.length) {
        this.sendError(player.ws, "Frota inv\xE1lida. Posicione todos os 4 navios.");
        return;
      }
      const seen = /* @__PURE__ */ new Set();
      let totalCells = 0;
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!Array.isArray(ship) || ship.length !== BATTLESHIP_FLEET_LENGTHS[i]) {
          this.sendError(player.ws, "Tamanho de navio inv\xE1lido.");
          return;
        }
        for (const cell of ship) {
          if (cell.r < 0 || cell.r >= BATTLESHIP_SIZE || cell.c < 0 || cell.c >= BATTLESHIP_SIZE) {
            this.sendError(player.ws, "Navio fora do tabuleiro.");
            return;
          }
          const key = `${cell.r}_${cell.c}`;
          if (seen.has(key)) {
            this.sendError(player.ws, "Navios n\xE3o podem se sobrepor.");
            return;
          }
          seen.add(key);
          totalCells += 1;
        }
      }
      g.fleets[player.uid] = { ships, totalCells };
      if (g.fleets[opponent.uid]) {
        g.phase = "battle";
        g.lastActionText = "Frotas prontas! Hora do combate!";
      } else {
        g.lastActionText = `${player.displayName} posicionou a frota. Aguardando advers\xE1rio...`;
      }
      this.broadcastRoom(room);
      return;
    }
    if (payload.action === "shoot" && g.phase === "battle") {
      if (g.turnUid !== player.uid) return;
      const r = Number(payload.r);
      const c = Number(payload.c);
      if (r < 0 || r >= BATTLESHIP_SIZE || c < 0 || c >= BATTLESHIP_SIZE) return;
      const key = `${r}_${c}`;
      g.shots[player.uid] = g.shots[player.uid] || {};
      if (g.shots[player.uid][key]) return;
      const oppFleet = g.fleets[opponent.uid];
      const isHit = oppFleet.ships.some(
        (ship) => ship.some((cell) => cell.r === r && cell.c === c)
      );
      g.shots[player.uid][key] = isHit ? "hit" : "miss";
      const totalHits = Object.values(g.shots[player.uid]).filter((v) => v === "hit").length;
      if (totalHits >= oppFleet.totalCells) {
        player.score += 1;
        g.roundStatus = "round_end";
        g.roundWinnerUid = player.uid;
        g.lastActionText = `${player.displayName} afundou toda a frota inimiga!`;
        this.afterRoundResolved(room);
        return;
      }
      if (isHit) {
        g.lastActionText = `${player.displayName} ACERTOU em (${r + 1},${c + 1})! Joga novamente.`;
      } else {
        g.turnUid = opponent.uid;
        g.lastActionText = `${player.displayName} atirou na \xE1gua (${r + 1},${c + 1}).`;
      }
      this.broadcastRoom(room);
    }
  }
  // --- 5. LIGUE 4 ---
  actConnect4(room, player, opponent, payload) {
    const g = room.gameData;
    if (g.turnUid !== player.uid) return;
    const col = Number(payload.col);
    if (!Number.isInteger(col) || col < 0 || col >= 7) return;
    const board = g.board;
    let targetRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (board[r][col] === null) {
        targetRow = r;
        break;
      }
    }
    if (targetRow === -1) return;
    board[targetRow][col] = player.uid;
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];
    let winCells = [];
    for (const [dr, dc] of dirs) {
      const line = [[targetRow, col]];
      for (const sign of [1, -1]) {
        let nr = targetRow + dr * sign;
        let nc = col + dc * sign;
        while (nr >= 0 && nr < 6 && nc >= 0 && nc < 7 && board[nr][nc] === player.uid) {
          line.push([nr, nc]);
          nr += dr * sign;
          nc += dc * sign;
        }
      }
      if (line.length >= 4) {
        winCells = line;
        break;
      }
    }
    if (winCells.length >= 4) {
      g.winningCells = winCells;
      player.score += 1;
      g.roundStatus = "round_end";
      g.roundWinnerUid = player.uid;
      this.afterRoundResolved(room);
      return;
    }
    if (board[0].every((cell) => cell !== null)) {
      g.roundStatus = "round_end";
      g.roundWinnerUid = null;
      this.afterRoundResolved(room);
      return;
    }
    g.turnUid = opponent.uid;
    this.broadcastRoom(room);
  }
  // --- 6. QUIZ MULTIPLAYER ---
  actQuiz(room, player, payload) {
    const g = room.gameData;
    if (g.answers[player.uid]) return;
    const optionIdx = Number(payload.optionIdx);
    if (!Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx > 3) return;
    g.answers[player.uid] = {
      optionIdx,
      elapsedMs: Math.max(100, Date.now() - g.startedAt)
    };
    if (room.players.every((p) => Boolean(g.answers[p.uid]))) {
      this.resolveQuizRound(room);
    } else {
      this.broadcastRoom(room);
    }
  }
  resolveQuizRound(room) {
    const g = room.gameData;
    if (!g || g.roundStatus !== "active" || room.status !== "playing") return;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    const breakdown = {};
    const roundPoints = {};
    for (const p of room.players) {
      const ans = g.answers[p.uid];
      if (ans && ans.optionIdx === g.correctIndex) {
        const speedBonus = Math.max(10, Math.round((18e3 - Math.min(18e3, ans.elapsedMs)) / 360));
        const pts = 100 + speedBonus;
        roundPoints[p.uid] = pts;
        p.score += pts;
        breakdown[p.uid] = { correct: true, points: pts, elapsedMs: ans.elapsedMs };
      } else {
        roundPoints[p.uid] = 0;
        breakdown[p.uid] = { correct: false, points: 0, elapsedMs: ans?.elapsedMs ?? null };
      }
    }
    const [p0, p1] = room.players;
    g.roundStatus = "round_end";
    g.roundBreakdown = breakdown;
    g.roundWinnerUid = roundPoints[p0.uid] === roundPoints[p1.uid] ? null : roundPoints[p0.uid] > roundPoints[p1.uid] ? p0.uid : p1.uid;
    this.afterRoundResolved(room);
  }
  // --- 7. PEDRA, PAPEL E TESOURA ---
  actRps(room, player, opponent, payload) {
    const g = room.gameData;
    if (g.choices[player.uid]) return;
    const choice = String(payload.choice);
    if (!["rock", "paper", "scissors"].includes(choice)) return;
    g.choices[player.uid] = choice;
    if (!g.choices[opponent.uid]) {
      this.broadcastRoom(room);
      return;
    }
    const c0 = g.choices[player.uid];
    const c1 = g.choices[opponent.uid];
    g.roundStatus = "round_end";
    if (c0 === c1) {
      g.roundWinnerUid = null;
      g.lastActionText = "Empate na rodada!";
    } else if (c0 === "rock" && c1 === "scissors" || c0 === "paper" && c1 === "rock" || c0 === "scissors" && c1 === "paper") {
      player.score += 1;
      g.roundWinnerUid = player.uid;
      g.lastActionText = `${player.displayName} venceu a rodada!`;
    } else {
      opponent.score += 1;
      g.roundWinnerUid = opponent.uid;
      g.lastActionText = `${opponent.displayName} venceu a rodada!`;
    }
    this.afterRoundResolved(room);
  }
  // --- 8. JOGO DA VELHA ONLINE ---
  actTicTacToe(room, player, opponent, payload) {
    const g = room.gameData;
    if (g.turnUid !== player.uid) return;
    const idx = Number(payload.index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 8 || g.board[idx] !== null) return;
    const symbol = g.symbols[player.uid];
    g.board[idx] = symbol;
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6]
    ];
    const winLine = lines.find(([a, b, c]) => g.board[a] && g.board[a] === g.board[b] && g.board[a] === g.board[c]);
    if (winLine) {
      g.winLine = winLine;
      player.score += 1;
      g.roundStatus = "round_end";
      g.roundWinnerUid = player.uid;
      this.afterRoundResolved(room);
      return;
    }
    if (g.board.every((cell) => cell !== null)) {
      g.roundStatus = "round_end";
      g.roundWinnerUid = null;
      this.afterRoundResolved(room);
      return;
    }
    g.turnUid = opponent.uid;
    this.broadcastRoom(room);
  }
  // --- 9. ADIVINHE O NÚMERO ---
  actGuessNumber(room, player, opponent, payload) {
    const g = room.gameData;
    if (g.turnUid !== player.uid) return;
    const guess = Number(payload.guess);
    if (!Number.isInteger(guess) || guess < 1 || guess > 100) return;
    if (guess === g.target) {
      g.history.push({ uid: player.uid, name: player.displayName, guess, hint: "ACERTOU!" });
      player.score += 1;
      g.roundStatus = "round_end";
      g.roundWinnerUid = player.uid;
      this.afterRoundResolved(room);
      return;
    }
    const hint = guess < g.target ? "\xC9 MAIOR \u2191" : "\xC9 MENOR \u2193";
    if (guess < g.target) g.minBound = Math.max(g.minBound, guess + 1);
    if (guess > g.target) g.maxBound = Math.min(g.maxBound, guess - 1);
    g.history.push({ uid: player.uid, name: player.displayName, guess, hint });
    g.turnUid = opponent.uid;
    this.broadcastRoom(room);
  }
  // --- 10. JOGO DA MEMÓRIA MULTIPLAYER ---
  actMemory(room, player, opponent, payload) {
    const g = room.gameData;
    if (g.turnUid !== player.uid || g.locked) return;
    const idx = Number(payload.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= 16) return;
    if (g.matched[idx] || g.tempFlipped.includes(idx)) return;
    g.tempFlipped.push(idx);
    if (g.tempFlipped.length < 2) {
      this.broadcastRoom(room);
      return;
    }
    const [i1, i2] = g.tempFlipped;
    if (g.cards[i1] === g.cards[i2]) {
      g.matched[i1] = true;
      g.matched[i2] = true;
      g.tempFlipped = [];
      g.pairScores[player.uid] = (g.pairScores[player.uid] || 0) + 1;
      player.score += 1;
      if (g.matched.every(Boolean)) {
        g.roundStatus = "round_end";
        const p0Pairs = g.pairScores[player.uid] || 0;
        const p1Pairs = g.pairScores[opponent.uid] || 0;
        g.roundWinnerUid = p0Pairs === p1Pairs ? null : p0Pairs > p1Pairs ? player.uid : opponent.uid;
        this.afterRoundResolved(room);
        return;
      }
      this.broadcastRoom(room);
    } else {
      g.locked = true;
      this.broadcastRoom(room);
      room.roundTimer = setTimeout(() => {
        if (room.status === "playing" && room.gameData) {
          room.gameData.tempFlipped = [];
          room.gameData.locked = false;
          room.gameData.turnUid = opponent.uid;
          this.broadcastRoom(room);
        }
      }, 950);
    }
  }
  // --- 11. TESTE DE REFLEXO ---
  actReflex(room, player, opponent) {
    const g = room.gameData;
    if (g.phase === "waiting") {
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
      g.phase = "resolved";
      g.falseStartUid = player.uid;
      opponent.score += 1;
      g.roundStatus = "round_end";
      g.roundWinnerUid = opponent.uid;
      this.afterRoundResolved(room);
      return;
    }
    if (g.phase === "go" && g.reactions[player.uid] === void 0) {
      g.reactions[player.uid] = Math.max(10, Date.now() - Number(g.goAt || Date.now()));
      if (room.players.every((p) => g.reactions[p.uid] !== void 0)) {
        this.resolveReflexTimeout(room);
      } else {
        this.broadcastRoom(room);
      }
    }
  }
  resolveReflexTimeout(room) {
    const g = room.gameData;
    if (!g || g.roundStatus !== "active" || room.status !== "playing") return;
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    g.phase = "resolved";
    const [p0, p1] = room.players;
    const r0 = g.reactions[p0.uid] ?? 9999;
    const r1 = g.reactions[p1.uid] ?? 9999;
    g.roundStatus = "round_end";
    if (r0 === r1) {
      g.roundWinnerUid = null;
    } else if (r0 < r1) {
      p0.score += 1;
      g.roundWinnerUid = p0.uid;
    } else {
      p1.score += 1;
      g.roundWinnerUid = p1.uid;
    }
    this.afterRoundResolved(room);
  }
};

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT || 3e3);
var SIGNING_SECRET = process.env.ENTERPRISE_API_KEY || crypto2.randomBytes(32).toString("hex");
var registeredApiKeys = /* @__PURE__ */ new Map();
var latestLedgerSnapshot = {
  syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
  totalUsers: 0,
  totalPointsCirculating: 0,
  totalBrlLiabilityCents: 0,
  totalPaidWithdrawalsCents: 0,
  pendingWithdrawalsCount: 0,
  payouts: []
};
var CATEGORY_BOUNDS = {
  tic_tac_toe: { minDurationMs: 3500, maxScore: 250, maxPtsPerSec: 45 },
  dot_link: { minDurationMs: 5e3, maxScore: 400, maxPtsPerSec: 40 },
  word_search: { minDurationMs: 6e3, maxScore: 450, maxPtsPerSec: 35 },
  math_sprint: { minDurationMs: 8e3, maxScore: 450, maxPtsPerSec: 30 },
  memory_match: { minDurationMs: 6e3, maxScore: 400, maxPtsPerSec: 35 },
  quick_reflex: { minDurationMs: 5e3, maxScore: 400, maxPtsPerSec: 45 },
  high_low_cards: { minDurationMs: 5e3, maxScore: 380, maxPtsPerSec: 40 },
  block_britz: { minDurationMs: 5e3, maxScore: 450, maxPtsPerSec: 35 },
  domino_solo: { minDurationMs: 6e3, maxScore: 350, maxPtsPerSec: 35 },
  stop_solo: { minDurationMs: 6e3, maxScore: 360, maxPtsPerSec: 35 },
  draw_guess_solo: { minDurationMs: 6e3, maxScore: 360, maxPtsPerSec: 35 },
  battleship_solo: { minDurationMs: 6e3, maxScore: 380, maxPtsPerSec: 35 },
  connect4_solo: { minDurationMs: 5e3, maxScore: 320, maxPtsPerSec: 40 },
  quiz_solo: { minDurationMs: 6e3, maxScore: 360, maxPtsPerSec: 35 },
  rps_solo: { minDurationMs: 5e3, maxScore: 280, maxPtsPerSec: 45 },
  guess_number_solo: { minDurationMs: 4e3, maxScore: 300, maxPtsPerSec: 45 }
};
function validateEnterpriseApiKey(req) {
  const providedKey = req.header("x-api-key");
  if (!providedKey) return false;
  if (process.env.ENTERPRISE_API_KEY && providedKey === process.env.ENTERPRISE_API_KEY) {
    return true;
  }
  const hash = crypto2.createHash("sha256").update(providedKey).digest("hex");
  for (const entry of registeredApiKeys.values()) {
    if (entry.active && entry.keyHash === hash) {
      return true;
    }
  }
  return false;
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const multiplayerEngine = new MultiplayerEngine(SIGNING_SECRET);
  app.post("/api/antifraud/verify-session", (req, res) => {
    const { userId, gameCategory, scoreEarned, durationMs, movesCount, nonce } = req.body ?? {};
    const bounds = CATEGORY_BOUNDS[String(gameCategory)];
    if (!userId || !bounds || typeof scoreEarned !== "number" || typeof durationMs !== "number" || typeof movesCount !== "number") {
      res.status(400).json({ error: "Payload de sess\xE3o inv\xE1lido para verifica\xE7\xE3o antifraude." });
      return;
    }
    let verificationStatus = "verified";
    let fraudReason = "";
    let riskDelta = 0;
    const clampedScore = Math.max(0, Math.min(500, Math.round(scoreEarned)));
    const seconds = Math.max(1, durationMs / 1e3);
    const ptsPerSec = clampedScore / seconds;
    if (durationMs < bounds.minDurationMs) {
      verificationStatus = "flagged";
      fraudReason = `Dura\xE7\xE3o abaixo do m\xEDnimo esperado (${Math.round(durationMs)}ms < ${bounds.minDurationMs}ms).`;
      riskDelta = 22;
    } else if (clampedScore > bounds.maxScore) {
      verificationStatus = "flagged";
      fraudReason = `Pontua\xE7\xE3o acima do teto da categoria (${clampedScore} > ${bounds.maxScore}).`;
      riskDelta = 30;
    } else if (ptsPerSec > bounds.maxPtsPerSec && clampedScore > 100) {
      verificationStatus = "flagged";
      fraudReason = `Velocidade de pontua\xE7\xE3o an\xF4mala (${ptsPerSec.toFixed(1)} pts/s).`;
      riskDelta = 25;
    } else if (movesCount < 1) {
      verificationStatus = "rejected";
      fraudReason = "Nenhuma jogada v\xE1lida registrada.";
      riskDelta = 40;
    }
    const payloadToSign = `${userId}|${gameCategory}|${clampedScore}|${durationMs}|${movesCount}|${nonce || ""}`;
    const integrityHash = crypto2.createHmac("sha256", SIGNING_SECRET).update(payloadToSign).digest("hex");
    res.json({
      verificationStatus,
      fraudReason,
      riskDelta,
      verifiedScore: verificationStatus === "rejected" ? 0 : clampedScore,
      integrityHash,
      verifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/notifications/smtp-status", async (req, res) => {
    const status = getSmtpStatus();
    if (req.query.verify === "true") {
      const verification = await verifySmtpConnection();
      res.json({
        ...status,
        verified: verification.verified,
        verificationError: verification.error || null
      });
      return;
    }
    res.json(status);
  });
  app.post("/api/notifications/email", async (req, res) => {
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
      customMessage
    } = req.body ?? {};
    if (!recipientEmail || !subject || !summary) {
      res.status(400).json({ error: "Campos obrigat\xF3rios de e-mail ausentes." });
      return;
    }
    const result = await sendTransactionalEmail({
      recipientEmail: String(recipientEmail),
      eventType: eventType ? String(eventType) : void 0,
      subject: String(subject),
      summary: String(summary),
      referenceId: referenceId ? String(referenceId) : void 0,
      amountBrl: amountBrl ? String(amountBrl) : void 0,
      pixKey: pixKey ? String(pixKey) : void 0,
      inviterName: inviterName ? String(inviterName) : void 0,
      inviteLink: inviteLink ? String(inviteLink) : void 0,
      inviteCode: inviteCode ? String(inviteCode) : void 0,
      invitedDisplayName: invitedDisplayName ? String(invitedDisplayName) : void 0,
      bonusPoints: typeof bonusPoints === "number" ? bonusPoints : void 0,
      commissionPct: typeof commissionPct === "number" ? commissionPct : void 0,
      customMessage: customMessage ? String(customMessage) : void 0
    });
    if (result.deliveryStatus === "failed") {
      res.status(result.smtpConfigured ? 502 : 400).json(result);
      return;
    }
    res.json(result);
  });
  app.post("/api/notifications/test", async (req, res) => {
    const recipientEmail = String(req.body?.recipientEmail || "").trim();
    if (!recipientEmail) {
      res.status(400).json({ error: "Informe um e-mail destinat\xE1rio para o teste SMTP." });
      return;
    }
    const result = await sendSmtpTestEmail(recipientEmail);
    if (result.deliveryStatus === "failed") {
      res.status(502).json(result);
      return;
    }
    res.json(result);
  });
  app.get("/api/v1/health", (_req, res) => {
    res.json({
      service: "Earn Easy Enterprise Financial API",
      version: "v1",
      status: "operational",
      smtpEnabled: getSmtpStatus().configured,
      registeredIntegrations: registeredApiKeys.size,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/v1/keys/sync", (req, res) => {
    const { integrationId, name, keyHash, active } = req.body ?? {};
    if (!integrationId || !keyHash) {
      res.status(400).json({ error: "integrationId e keyHash s\xE3o obrigat\xF3rios." });
      return;
    }
    registeredApiKeys.set(String(integrationId), {
      integrationId: String(integrationId),
      name: String(name || "Integra\xE7\xE3o ERP"),
      keyHash: String(keyHash),
      active: Boolean(active)
    });
    res.json({ synced: true, totalKeys: registeredApiKeys.size });
  });
  app.post("/api/v1/ledger/sync", (req, res) => {
    const snapshot = req.body;
    if (!snapshot || typeof snapshot.totalUsers !== "number") {
      res.status(400).json({ error: "Snapshot financeiro inv\xE1lido." });
      return;
    }
    latestLedgerSnapshot = {
      ...snapshot,
      syncedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json({ synced: true, syncedAt: latestLedgerSnapshot.syncedAt });
  });
  app.get("/api/v1/ledger", (req, res) => {
    if (!validateEnterpriseApiKey(req)) {
      res.status(401).json({
        error: "N\xE3o autorizado. Envie um cabe\xE7alho x-api-key v\xE1lido configurado no Painel Administrativo."
      });
      return;
    }
    res.json({
      currency: "BRL",
      conversionRate: { points: 1e3, brlCents: 10 },
      minimumWithdrawalCents: 500,
      snapshot: latestLedgerSnapshot
    });
  });
  app.get("/api/v1/payouts", (req, res) => {
    if (!validateEnterpriseApiKey(req)) {
      res.status(401).json({
        error: "N\xE3o autorizado. Cabe\xE7alho x-api-key inv\xE1lido ou ausente."
      });
      return;
    }
    const statusFilter = typeof req.query.status === "string" ? req.query.status : "all";
    const payouts = statusFilter === "all" ? latestLedgerSnapshot.payouts : latestLedgerSnapshot.payouts.filter((p) => p.status === statusFilter);
    res.json({
      count: payouts.length,
      syncedAt: latestLedgerSnapshot.syncedAt,
      payouts
    });
  });
  app.post("/api/v1/webhooks/dispatch", async (req, res) => {
    const { endpointUrl, event, payload } = req.body ?? {};
    if (!endpointUrl || typeof endpointUrl !== "string" || !/^https?:\/\//i.test(endpointUrl)) {
      res.status(400).json({ error: "URL de webhook inv\xE1lida. Use http:// ou https://." });
      return;
    }
    const bodyJson = JSON.stringify({
      source: "earn-easy",
      event: event || "financial.ledger.ping",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      data: payload ?? latestLedgerSnapshot
    });
    const signature = crypto2.createHmac("sha256", SIGNING_SECRET).update(bodyJson).digest("hex");
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8e3);
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-EarnEasy-Signature": signature
        },
        body: bodyJson,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - started;
      res.json({
        delivered: response.ok,
        statusCode: response.status,
        latencyMs,
        signaturePrefix: signature.slice(0, 12)
      });
    } catch (err) {
      res.status(502).json({
        delivered: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : "Falha de rede ao conectar ao webhook."
      });
    }
  });
  app.get("/api/time", (_req, res) => {
    const nowMs = Date.now();
    const utcDate = new Date(nowMs).toISOString().slice(0, 10);
    const yesterdayUtcDate = new Date(nowMs - 864e5).toISOString().slice(0, 10);
    res.json({ nowMs, utcDate, yesterdayUtcDate });
  });
  app.post("/api/support/biel", async (req, res) => {
    const {
      messages,
      selectedTopic,
      userDisplayName,
      userStats
    } = req.body ?? {};
    const cleanMessages = Array.isArray(messages) ? messages.filter(
      (m) => Boolean(m) && (m.role === "user" || m.role === "biel") && typeof m.text === "string" && m.text.trim().length > 0
    ).slice(-12).map((m) => ({ role: m.role, text: m.text.trim().slice(0, 800) })) : [];
    const lastUserMessage = [...cleanMessages].reverse().find((m) => m.role === "user")?.text || "";
    const topicStr = typeof selectedTopic === "string" ? selectedTopic.trim() : "";
    const playerName = typeof userDisplayName === "string" && userDisplayName.trim() ? userDisplayName.trim().slice(0, 60) : "Jogador";
    const pointsBalance = Number(userStats?.pointsBalance ?? 0);
    const brlBalanceCents = Number(userStats?.brlBalanceCents ?? 0);
    const accountStatus = String(userStats?.status || "active");
    const firstWithdrawalUsed = Boolean(userStats?.firstWithdrawalUsed);
    const minPixFirstCents = Number(userStats?.firstWithdrawalMinCents ?? 10);
    const minPixStandardCents = Number(userStats?.standardWithdrawalMinCents ?? 500);
    const activeMinCents = firstWithdrawalUsed ? minPixStandardCents : minPixFirstCents;
    const lower = `${topicStr} ${lastUserMessage}`.toLowerCase();
    const userTurnCount = cleanMessages.filter((m) => m.role === "user").length;
    const asksForHuman = /(especialista|humano|atendente|pessoa|suporte real|admin|falar com algu[eé]m)/.test(lower);
    const buildDeterministicReply = () => {
      if (asksForHuman) {
        return {
          reply: `Entendido, ${playerName}! J\xE1 organizei seu contexto aqui. Clique em "Falar com Especialista Humano" logo abaixo para enviar sua conversa para a fila do suporte e um atendente vai aceitar seu chamado em tempo real.`,
          readyForHuman: true
        };
      }
      if (/(check[- ]?in|chk|sequ[eê]ncia|30 dias)/.test(lower)) {
        return {
          reply: `Sobre o Check-in Di\xE1rio: ele libera 1 coleta por dia pelo hor\xE1rio UTC (vira \xE0s 21h no hor\xE1rio de Bras\xEDlia), dando de 120 a 200 moedas por dia e R$ 10,00 no Pix ao completar 30 dias seguidos. Se apareceu algum erro ao clicar em "Coletar Hoje", me diga qual mensagem apareceu ou clique em "Falar com Especialista Humano" se o erro continuar.`,
          readyForHuman: userTurnCount >= 2
        };
      }
      if (/(pix|saque|sacar|dinheiro|reais|cpf|chave)/.test(lower)) {
        return {
          reply: `Seu saldo Pix atual \xE9 R$ ${(brlBalanceCents / 100).toFixed(2).replace(".", ",")} e o m\xEDnimo vigente para voc\xEA agora \xE9 R$ ${(activeMinCents / 100).toFixed(2).replace(".", ",")}. Saques ficam pendentes at\xE9 an\xE1lise antifraude e liquida\xE7\xE3o no painel admin. Voc\xEA est\xE1 com d\xFAvida sobre um saque espec\xEDfico ou erro na chave Pix?`,
          readyForHuman: userTurnCount >= 2
        };
      }
      if (/(convite|c[oó]digo|amig|indica|promo|correio)/.test(lower)) {
        return {
          reply: `No menu Convites & C\xF3digos voc\xEA copia seu link/c\xF3digo de indica\xE7\xE3o (+500 moedas no cadastro do amigo + 12% sobre pontos que ele ganhar) e resgata c\xF3digos promocionais da Caixa de Correio. E na aba Amigos voc\xEA pode buscar jogadores pelo nome ou ID e conversar no privado! Ficou alguma d\xFAvida ou quer falar com um especialista?`,
          readyForHuman: userTurnCount >= 2
        };
      }
      if (/(jogo|ponto|moeda|convers|converter|velha|dot|matem|mem[oó]ria|ca[cç]a)/.test(lower)) {
        return {
          reply: `Voc\xEA tem ${pointsBalance.toLocaleString("pt-BR")} moedas acumuladas. Cada 1.000 moedas valem R$ 0,10 na Carteira Pix (1 convers\xE3o por dia UTC). Se alguma partida n\xE3o creditou ou foi sinalizada pelo antifraude, me conta qual jogo foi para eu encaminhar ao especialista.`,
          readyForHuman: userTurnCount >= 2
        };
      }
      if (/(conta|ban|suspens|revis[aã]o|bloque)/.test(lower)) {
        return {
          reply: `O status atual da sua conta \xE9 "${accountStatus}". Se houver qualquer revis\xE3o antifraude, bloqueio de saque ou erro t\xE9cnico que voc\xEA precise analisar manualmente, recomendo clicar em "Falar com Especialista Humano" abaixo para nossa equipe verificar sua conta diretamente.`,
          readyForHuman: true
        };
      }
      return {
        reply: `Oi, ${playerName}! Sou o Biel, assistente virtual do Earn Easy. Para agilizar antes de te passar para um especialista humano: seu caso envolve Check-in Di\xE1rio, Saque Pix, Convites/C\xF3digos ou Pontos nos Jogos? Me conte em poucas palavras o que aconteceu.`,
        readyForHuman: userTurnCount >= 2
      };
    };
    const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const conversationLines = cleanMessages.map((m) => `${m.role === "user" ? playerName : "Biel"}: ${m.text}`).join("\n");
        const promptText = [
          topicStr ? `T\xF3pico selecionado pelo usu\xE1rio: ${topicStr}` : "",
          `Resumo da conta do usu\xE1rio (${playerName}): ${pointsBalance} moedas, saldo Pix R$ ${(brlBalanceCents / 100).toFixed(2)}, status=${accountStatus}, primeiroSaqueUsado=${firstWithdrawalUsed}, m\xEDnimoSaqueAtual=R$ ${(activeMinCents / 100).toFixed(2)}.`,
          conversationLines ? `Hist\xF3rico recente:
${conversationLines}` : "O usu\xE1rio acabou de abrir o chat de suporte."
        ].filter(Boolean).join("\n\n");
        const response = await ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: promptText,
          config: {
            systemInstruction: 'Voc\xEA \xE9 Biel, o assistente virtual de suporte do aplicativo Earn Easy em portugu\xEAs do Brasil (pt-BR). Seja simp\xE1tico, claro, direto e conciso (m\xE1ximo 3 frases curtas). Regras reais do Earn Easy: 1.000 pontos = R$ 0,10; limite de 1 convers\xE3o di\xE1ria (hor\xE1rio UTC); Check-in Di\xE1rio d\xE1 120 a 200 pontos por dia (1x por dia UTC) e R$ 10,00 de b\xF4nus aos 30 dias seguidos; 1\xBA saque Pix tem m\xEDnimo configurado pelo admin (padr\xE3o R$ 0,10) e demais saques conforme m\xEDnimo configurado; Convites d\xE3o +500 pontos + 12% de comiss\xE3o; h\xE1 aba Amigos para adicionar jogadores e conversar. Fa\xE7a perguntas objetivas de triagem para entender o problema ou responda \xE0 d\xFAvida. Quando o usu\xE1rio j\xE1 tiver explicado o problema (ap\xF3s 2 mensagens ou quando pedir atendente/especialista ou envolver erro t\xE9cnico/ban/saque pendente), oriente-o claramente a clicar no bot\xE3o "Falar com Especialista Humano" para entrar na fila do painel administrativo. Nunca invente pagamentos j\xE1 feitos nem prometa prazos exatos de Pix.'
          }
        });
        const text = response.text?.trim();
        if (text) {
          res.json({
            reply: text.slice(0, 800),
            readyForHuman: userTurnCount >= 2 || asksForHuman || /(erro|bug|pendente|ban|suspens|não caiu|nao caiu)/.test(lower),
            poweredBy: "gemini"
          });
          return;
        }
      } catch (err) {
        console.warn("Gemini Biel fallback activated:", err instanceof Error ? err.message : err);
      }
    }
    const fallback = buildDeterministicReply();
    res.json({
      reply: fallback.reply,
      readyForHuman: fallback.readyForHuman,
      poweredBy: "assistant"
    });
  });
  app.post("/api/multiplayer/verify-settlement", (req, res) => {
    const result = multiplayerEngine.verifySettlement(req.body ?? {});
    if (!result.valid) {
      res.status(400).json({ valid: false, error: result.reason || "Liquida\xE7\xE3o multiplayer inv\xE1lida." });
      return;
    }
    res.json({ valid: true, settlement: result.settlement });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const httpServer = http.createServer(app);
  multiplayerEngine.attachToServer(httpServer);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Earn Easy server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
