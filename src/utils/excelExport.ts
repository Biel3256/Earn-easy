import * as XLSX from 'xlsx';
import {
  FraudEvent,
  GAME_LABELS,
  GameSession,
  PixWithdrawal,
  PointConversion,
} from '../types/earneasy';
import { formatBRL } from './pix';

export interface ExportReportPayload {
  periodLabel: string;
  categoryLabel: string;
  sessions: GameSession[];
  conversions: PointConversion[];
  withdrawals: PixWithdrawal[];
  fraudLogs: FraudEvent[];
}

export function exportReportToExcel(data: ExportReportPayload) {
  const wb = XLSX.utils.book_new();

  const totalPoints = data.sessions.reduce((acc, s) => acc + s.scoreEarned, 0);
  const totalConvertedPts = data.conversions.reduce((acc, c) => acc + c.pointsConverted, 0);
  const totalConvertedCents = data.conversions.reduce((acc, c) => acc + c.brlCentsCredited, 0);
  const totalPaidCents = data.withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((acc, w) => acc + w.amountCents, 0);
  const totalPendingCents = data.withdrawals
    .filter((w) => w.status === 'pending' || w.status === 'approved')
    .reduce((acc, w) => acc + w.amountCents, 0);

  const summaryRows = [
    { Indicador: 'Período Analisado', Valor: data.periodLabel },
    { Indicador: 'Categoria Filtrada', Valor: data.categoryLabel },
    { Indicador: 'Data de Exportação', Valor: new Date().toLocaleString('pt-BR') },
    { Indicador: 'Total de Partidas', Valor: data.sessions.length },
    { Indicador: 'Pontos Gerados no Período', Valor: totalPoints },
    { Indicador: 'Pontos Convertidos', Valor: totalConvertedPts },
    { Indicador: 'Crédito Gerado em Reais', Valor: formatBRL(totalConvertedCents) },
    { Indicador: 'Saques Pix Pagos', Valor: formatBRL(totalPaidCents) },
    { Indicador: 'Saques Pix em Análise/Pendentes', Valor: formatBRL(totalPendingCents) },
    { Indicador: 'Ocorrências Antifraude', Valor: data.fraudLogs.length },
  ];

  const sessionsRows = data.sessions.map((s) => ({
    'ID Sessão': s.sessionId,
    'ID Usuário': s.userId,
    'Categoria': GAME_LABELS[s.gameCategory] || s.gameCategory,
    'Pontuação': s.scoreEarned,
    'Duração (s)': Number((s.durationMs / 1000).toFixed(1)),
    'Jogadas': s.movesCount,
    'Status Antifraude': s.verificationStatus,
    'Motivo Alerta': s.fraudReason || '-',
    'Data': s.playedDate,
    'Hash Integridade': s.integrityHash.slice(0, 18),
  }));

  const conversionsRows = data.conversions.map((c) => ({
    'ID Conversão': c.conversionId,
    'ID Usuário': c.userId,
    'Pontos Convertidos': c.pointsConverted,
    'Valor Creditado (R$)': formatBRL(c.brlCentsCredited),
    'Data Conversão': c.conversionDate,
    'Captcha Verificado': c.captchaVerified ? 'Sim' : 'Não',
  }));

  const withdrawalsRows = data.withdrawals.map((w) => ({
    'ID Saque': w.withdrawalId,
    'Usuário': w.userDisplayName,
    'ID Usuário': w.userId,
    'Valor (R$)': formatBRL(w.amountCents),
    'Tipo Chave Pix': w.pixKeyType.toUpperCase(),
    'Chave Pix': w.pixKey,
    'Status': w.status,
    'ID Transação Pix': w.pixTransactionId || '-',
    'Observação Admin': w.adminNote || '-',
    'Data Solicitação': w.requestedDate,
  }));

  const fraudRows = data.fraudLogs.map((f) => ({
    'ID Evento': f.logId,
    'ID Usuário': f.userId,
    'Tipo': f.eventType,
    'Severidade': f.severity,
    'Detalhes': f.details,
    'Resolvido': f.resolved ? 'Sim' : 'Não',
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumo Executivo');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sessionsRows.length ? sessionsRows : [{ Info: 'Sem partidas no filtro selecionado' }]),
    'Partidas'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(conversionsRows.length ? conversionsRows : [{ Info: 'Sem conversões no filtro selecionado' }]),
    'Conversões Diárias'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(withdrawalsRows.length ? withdrawalsRows : [{ Info: 'Sem saques Pix no filtro selecionado' }]),
    'Saques Pix'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(fraudRows.length ? fraudRows : [{ Info: 'Sem alertas antifraude no período' }]),
    'Auditoria Antifraude'
  );

  const fileName = `EarnEasy_Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportSessionsToCsv(sessions: GameSession[], withdrawals: PixWithdrawal[]) {
  const lines: string[] = [
    'Tipo,ID,Usuario,Categoria_ou_Pix,Valor_ou_Pontos,Status,Data',
    ...sessions.map(
      (s) =>
        `Partida,${s.sessionId},${s.userId},${GAME_LABELS[s.gameCategory]},${s.scoreEarned} pts,${s.verificationStatus},${s.playedDate}`
    ),
    ...withdrawals.map(
      (w) =>
        `SaquePix,${w.withdrawalId},${w.userId},${w.pixKeyType}:${w.pixKey},${(w.amountCents / 100).toFixed(2)},${w.status},${w.requestedDate}`
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `EarnEasy_Dados_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
