import {
  DEFAULT_WITHDRAWAL_SETTINGS,
  SupportTopic,
  UserAccount,
  WithdrawalSettings,
} from '../types/earneasy';
import { formatBRL, formatPoints } from './pix';

export interface BielQuickQuestion {
  id: string;
  topic: SupportTopic;
  label: string;
  questionText: string;
}

export const BIEL_TOPIC_LABELS: Record<SupportTopic, string> = {
  checkin: 'Check-in Diário',
  pix: 'Saque Pix & Saldo',
  invites: 'Convites & Códigos',
  games: 'Pontuação nos Jogos',
  account: 'Conta & Revisão',
  other: 'Outro Assunto',
};

export const BIEL_QUICK_QUESTIONS: BielQuickQuestion[] = [
  {
    id: 'q_checkin',
    topic: 'checkin',
    label: 'Erro ou dúvida no Check-in',
    questionText: 'Estou com dúvida ou erro ao tentar fazer meu Check-in Diário.',
  },
  {
    id: 'q_pix',
    topic: 'pix',
    label: 'Saque Pix pendente / mínimo',
    questionText: 'Quero saber como funciona o saque Pix ou ver o status do meu pedido.',
  },
  {
    id: 'q_code',
    topic: 'invites',
    label: 'Código promocional / Correio',
    questionText: 'Preciso de ajuda para resgatar um código promocional ou usar convites.',
  },
  {
    id: 'q_games',
    topic: 'games',
    label: 'Pontos nos jogos / fases',
    questionText: 'Quero entender como funcionam as fases e a pontuação nos jogos.',
  },
  {
    id: 'q_account',
    topic: 'account',
    label: 'Conta em revisão / erro técnico',
    questionText: 'Minha conta está com algum bloqueio, revisão ou erro técnico.',
  },
  {
    id: 'q_human',
    topic: 'other',
    label: 'Falar direto com o ADM',
    questionText: 'Quero conversar diretamente com um administrador humano no suporte.',
  },
];

export interface BielReplyResult {
  reply: string;
  readyForHuman: boolean;
  detectedTopic: SupportTopic;
}

export function buildBielClientReply(params: {
  userMessage: string;
  selectedTopic: SupportTopic | null;
  userDisplayName: string;
  userAccount: UserAccount | null;
  withdrawalSettings: WithdrawalSettings;
  isFirstWithdrawalEligible: boolean;
  userTurnCount: number;
}): BielReplyResult {
  const {
    userMessage,
    selectedTopic,
    userDisplayName,
    userAccount,
    withdrawalSettings,
    isFirstWithdrawalEligible,
    userTurnCount,
  } = params;

  const settings = withdrawalSettings || DEFAULT_WITHDRAWAL_SETTINGS;
  const activeMinCents = isFirstWithdrawalEligible
    ? settings.firstWithdrawalMinCents
    : settings.standardWithdrawalMinCents;

  const pts = userAccount?.pointsBalance ?? 0;
  const brlCents = userAccount?.brlBalanceCents ?? 0;
  const status = userAccount?.status || 'active';
  const name = userDisplayName || 'Jogador';

  const normalized = `${selectedTopic || ''} ${userMessage}`.toLowerCase();

  let detectedTopic: SupportTopic = selectedTopic || 'other';
  if (/(check[- ]?in|chk|sequ[eê]ncia|30 dias|coletar)/.test(normalized)) {
    detectedTopic = 'checkin';
  } else if (/(pix|saque|sacar|dinheiro|reais|cpf|chave|valor m[ií]nimo)/.test(normalized)) {
    detectedTopic = 'pix';
  } else if (/(convite|c[oó]digo|amig|indica|promo|correio|resgatar)/.test(normalized)) {
    detectedTopic = 'invites';
  } else if (/(jogo|ponto|moeda|convers|converter|velha|dot|matem|mem[oó]ria|ca[cç]a|reflex|carta|fase)/.test(normalized)) {
    detectedTopic = 'games';
  } else if (/(conta|ban|suspens|revis[aã]o|bloque|erro|bug)/.test(normalized)) {
    detectedTopic = 'account';
  }

  const asksHuman = /(especialista|humano|atendente|adm|admin|pessoa|suporte real|falar com)/.test(
    normalized
  );

  if (asksHuman) {
    return {
      detectedTopic,
      readyForHuman: true,
      reply: `Perfeito, ${name}! Já organizei suas perguntas e o resumo da sua conta. Clique no botão "Enviar para Administrador (Suporte ao Vivo)" logo abaixo para abrir o chat direto no Painel Administrativo.`,
    };
  }

  switch (detectedTopic) {
    case 'checkin':
      return {
        detectedTopic,
        readyForHuman: true,
        reply: `Sobre o Check-in Diário: você pode coletar 1 vez por dia (horário UTC — vira às 21h de Brasília), ganhando de 120 a 200 moedas por dia e um bônus de R$ 10,00 aos 30 dias seguidos. Se algum dia deu falha, clique abaixo para enviar seu atendimento direto ao Administrador.`,
      };
    case 'pix':
      return {
        detectedTopic,
        readyForHuman: true,
        reply: `Seu saldo convertido hoje é ${formatBRL(brlCents)} e seu saque mínimo vigente é ${formatBRL(activeMinCents)} (${isFirstWithdrawalEligible ? '1º saque promocional' : 'saque padrão'}). Todo pedido passa por análise no Painel ADM antes do pagamento. Se precisar verificar algum saque, envie o chamado para o Administrador abaixo!`,
      };
    case 'invites':
      return {
        detectedTopic,
        readyForHuman: true,
        reply: `Na aba Convidar você compartilha seu link (+500 moedas no cadastro de amigos + 12% dos ganhos deles) e resgata códigos promocionais da Caixa de Correio. Caso algum código não tenha funcionado ou queira falar com a equipe, clique abaixo para chamar o Administrador.`,
      };
    case 'games':
      return {
        detectedTopic,
        readyForHuman: true,
        reply: `Você tem ${formatPoints(pts)} pontos acumulados! Cada partida verificada aumenta sua Fase naquele jogo e soma XP + moedas (1.000 pts = R$ 0,10 na Carteira, 1x por dia UTC). Precisa revisar alguma partida específica? Envie seu chamado ao Administrador logo abaixo.`,
      };
    case 'account':
      return {
        detectedTopic,
        readyForHuman: true,
        reply: `Sua conta está atualmente com status "${status}" e risco ${userAccount?.riskScore ?? 0}/100. Se você encontrou algum erro ou precisa de revisão manual pelo ADM, clique no botão abaixo para abrir o atendimento ao vivo agora mesmo.`,
      };
    default:
      return {
        detectedTopic,
        readyForHuman: userTurnCount >= 1,
        reply: `Oi, ${name}! Sou o Biel, assistente de triagem rápida do Earn Easy. Escolha uma das perguntas rápidas acima ou descreva em uma frase o que precisa, e já libero o envio direto para o Administrador responder no chat ao vivo.`,
      };
  }
}
