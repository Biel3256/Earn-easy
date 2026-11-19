import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Download, FileSpreadsheet, Filter, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  FraudEvent,
  GAME_LABELS,
  GameCategory,
  GameSession,
  PixWithdrawal,
  PointConversion,
} from '../types/earneasy';
import { exportReportToExcel, exportSessionsToCsv } from '../utils/excelExport';
import { formatBRL, formatPoints, getTodayUtcDate } from '../utils/pix';

type PeriodPreset = 'today' | '7d' | '30d' | 'custom';
type OperationFilter = 'all' | 'sessions' | 'conversions' | 'withdrawals';

function shiftDays(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const DashboardSection: React.FC = () => {
  const {
    firebaseUser,
    isAdmin,
    mySessions,
    myConversions,
    myWithdrawals,
    myFraudLogs,
    signInWithGoogle,
  } = useAuth();

  const [scope, setScope] = useState<'personal' | 'global'>('personal');
  const [period, setPeriod] = useState<PeriodPreset>('30d');
  const [customStart, setCustomStart] = useState(() => shiftDays(30));
  const [customEnd, setCustomEnd] = useState(() => getTodayUtcDate());
  const [categoryFilter, setCategoryFilter] = useState<'all' | GameCategory>('all');
  const [operationFilter, setOperationFilter] = useState<OperationFilter>('all');

  const [globalSessions, setGlobalSessions] = useState<GameSession[]>([]);
  const [globalConversions, setGlobalConversions] = useState<PointConversion[]>([]);
  const [globalWithdrawals, setGlobalWithdrawals] = useState<PixWithdrawal[]>([]);
  const [globalFraudLogs, setGlobalFraudLogs] = useState<FraudEvent[]>([]);

  useEffect(() => {
    if (!firebaseUser || !isAdmin || scope !== 'global') return;

    const u1 = onSnapshot(
      query(collection(db, 'gameSessions'), orderBy('createdAt', 'desc')),
      (snap) => setGlobalSessions(snap.docs.map((d) => d.data() as GameSession)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'gameSessions')
    );
    const u2 = onSnapshot(
      query(collection(db, 'conversions'), orderBy('createdAt', 'desc')),
      (snap) => setGlobalConversions(snap.docs.map((d) => d.data() as PointConversion)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversions')
    );
    const u3 = onSnapshot(
      query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc')),
      (snap) => setGlobalWithdrawals(snap.docs.map((d) => d.data() as PixWithdrawal)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawals')
    );
    const u4 = onSnapshot(
      query(collection(db, 'fraudLogs'), orderBy('createdAt', 'desc')),
      (snap) => setGlobalFraudLogs(snap.docs.map((d) => d.data() as FraudEvent)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'fraudLogs')
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [firebaseUser, isAdmin, scope]);

  const dateRange = useMemo(() => {
    const today = getTodayUtcDate();
    if (period === 'today') return { start: today, end: today, label: 'Hoje' };
    if (period === '7d') return { start: shiftDays(6), end: today, label: 'Últimos 7 dias' };
    if (period === '30d') return { start: shiftDays(29), end: today, label: 'Últimos 30 dias' };
    return { start: customStart, end: customEnd, label: `${customStart} até ${customEnd}` };
  }, [period, customStart, customEnd]);

  const sourceSessions = scope === 'global' && isAdmin ? globalSessions : mySessions;
  const sourceConversions = scope === 'global' && isAdmin ? globalConversions : myConversions;
  const sourceWithdrawals = scope === 'global' && isAdmin ? globalWithdrawals : myWithdrawals;
  const sourceFraud = scope === 'global' && isAdmin ? globalFraudLogs : myFraudLogs;

  const filteredSessions = useMemo(() => {
    return sourceSessions.filter((s) => {
      const inRange = s.playedDate >= dateRange.start && s.playedDate <= dateRange.end;
      const inCat = categoryFilter === 'all' || s.gameCategory === categoryFilter;
      return inRange && inCat;
    });
  }, [sourceSessions, dateRange, categoryFilter]);

  const filteredConversions = useMemo(() => {
    return sourceConversions.filter(
      (c) => c.conversionDate >= dateRange.start && c.conversionDate <= dateRange.end
    );
  }, [sourceConversions, dateRange]);

  const filteredWithdrawals = useMemo(() => {
    return sourceWithdrawals.filter(
      (w) => w.requestedDate >= dateRange.start && w.requestedDate <= dateRange.end
    );
  }, [sourceWithdrawals, dateRange]);

  const kpis = useMemo(() => {
    const points = filteredSessions.reduce((acc, s) => acc + s.scoreEarned, 0);
    const verifiedCount = filteredSessions.filter((s) => s.verificationStatus === 'verified').length;
    const integrityRate = filteredSessions.length
      ? Math.round((verifiedCount / filteredSessions.length) * 100)
      : 100;
    const convertedCents = filteredConversions.reduce((acc, c) => acc + c.brlCentsCredited, 0);
    const withdrawnCents = filteredWithdrawals
      .filter((w) => w.status === 'paid' || w.status === 'pending' || w.status === 'approved')
      .reduce((acc, w) => acc + w.amountCents, 0);
    return { points, integrityRate, convertedCents, withdrawnCents };
  }, [filteredSessions, filteredConversions, filteredWithdrawals]);

  const dailySeries = useMemo(() => {
    const map = new Map<string, { date: string; points: number; convertedCents: number }>();
    filteredSessions.forEach((s) => {
      const curr = map.get(s.playedDate) || { date: s.playedDate, points: 0, convertedCents: 0 };
      curr.points += s.scoreEarned;
      map.set(s.playedDate, curr);
    });
    filteredConversions.forEach((c) => {
      const curr = map.get(c.conversionDate) || { date: c.conversionDate, points: 0, convertedCents: 0 };
      curr.convertedCents += c.brlCentsCredited;
      map.set(c.conversionDate, curr);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [filteredSessions, filteredConversions]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<GameCategory, { points: number; matches: number }> = {
      tic_tac_toe: { points: 0, matches: 0 },
      dot_link: { points: 0, matches: 0 },
      word_search: { points: 0, matches: 0 },
      math_sprint: { points: 0, matches: 0 },
      memory_match: { points: 0, matches: 0 },
    };
    filteredSessions.forEach((s) => {
      if (counts[s.gameCategory]) {
        counts[s.gameCategory].points += s.scoreEarned;
        counts[s.gameCategory].matches += 1;
      }
    });
    const maxPts = Math.max(1, ...Object.values(counts).map((v) => v.points));
    return (Object.keys(GAME_LABELS) as GameCategory[]).map((key) => ({
      key,
      label: GAME_LABELS[key],
      points: counts[key].points,
      matches: counts[key].matches,
      pct: Math.round((counts[key].points / maxPts) * 100),
    }));
  }, [filteredSessions]);

  if (!firebaseUser) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Dashboard Analítico & Exportação</h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Entre com sua conta Google para visualizar gráficos detalhados por período, categorias de jogos e exportar relatórios em Excel.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  const maxDailyPts = Math.max(100, ...dailySeries.map((d) => d.points));

  return (
    <div className="space-y-6">
      {/* Header + Export Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Dashboard Estratégico</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Análise granular por período, categoria de jogo e fluxo financeiro Pix
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-900 border border-transparent dark:border-zinc-800 rounded-lg">
              <button
                type="button"
                onClick={() => setScope('personal')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === 'personal'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                Minha Conta
              </button>
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scope === 'global'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
              >
                Visão Global (Admin)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              exportReportToExcel({
                periodLabel: dateRange.label,
                categoryLabel: categoryFilter === 'all' ? 'Todas' : GAME_LABELS[categoryFilter],
                sessions: filteredSessions,
                conversions: filteredConversions,
                withdrawals: filteredWithdrawals,
                fraudLogs: sourceFraud,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel (.xlsx)
          </button>

          <button
            type="button"
            onClick={() => exportSessionsToCsv(filteredSessions, filteredWithdrawals)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <Filter className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
          Filtros:
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-lg">
          {(
            [
              { id: 'today', label: 'Hoje' },
              { id: '7d', label: '7 dias' },
              { id: '30d', label: '30 dias' },
              { id: 'custom', label: 'Personalizado' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                period === item.id
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-md font-mono"
            />
            <span className="text-slate-400 dark:text-zinc-500">até</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 rounded-md font-mono"
            />
          </div>
        )}

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | GameCategory)}
          className="px-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg font-medium text-slate-700 dark:text-zinc-200"
        >
          <option value="all">Todas as Categorias</option>
          {(Object.keys(GAME_LABELS) as GameCategory[]).map((cat) => (
            <option key={cat} value={cat}>
              {GAME_LABELS[cat]}
            </option>
          ))}
        </select>

        <select
          value={operationFilter}
          onChange={(e) => setOperationFilter(e.target.value as OperationFilter)}
          className="px-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg font-medium text-slate-700 dark:text-zinc-200"
        >
          <option value="all">Todas as Operações</option>
          <option value="sessions">Somente Partidas</option>
          <option value="conversions">Somente Conversões</option>
          <option value="withdrawals">Somente Saques Pix</option>
        </select>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Pontos no Período</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-1">
            {formatPoints(kpis.points)}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">{filteredSessions.length} partidas</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Valor Convertido</div>
          <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {formatBRL(kpis.convertedCents)}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">{filteredConversions.length} conversões</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Volume de Saques Pix</div>
          <div className="text-2xl font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums mt-1">
            {formatBRL(kpis.withdrawnCents)}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1 tabular-nums">{filteredWithdrawals.length} solicitações</div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Integridade Antifraude</div>
          <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {kpis.integrityRate}%
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Partidas aprovadas
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50">Evolução Diária de Pontuação</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Últimos dias ativos dentro do filtro ({dateRange.label})</p>
            </div>
          </div>

          {dailySeries.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-slate-500 dark:text-zinc-400 border border-dashed border-slate-200 dark:border-zinc-800 rounded-lg">
              Sem dados de partidas no período selecionado.
            </div>
          ) : (
            <div className="h-52 flex items-end gap-2 pt-4">
              {dailySeries.map((day) => {
                const heightPct = Math.max(8, Math.round((day.points / maxDailyPts) * 100));
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 min-w-0 group">
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-zinc-400 opacity-80 group-hover:opacity-100">
                      {day.points}
                    </span>
                    <div className="w-full max-w-[36px] bg-slate-100 dark:bg-zinc-800 rounded-t-md h-36 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-slate-900 dark:bg-emerald-500 group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 transition-colors rounded-t-md"
                        style={{ height: `${heightPct}%` }}
                        title={`${day.date}: ${day.points} pts · ${formatBRL(day.convertedCents)} convertidos`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 truncate w-full text-center">
                      {day.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50 mb-1">Desempenho por Categoria</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-5">Pontuação distribuída entre os jogos</p>

          <div className="space-y-4">
            {categoryBreakdown.map((item) => (
              <div key={item.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 dark:text-zinc-200">{item.label}</span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-zinc-400">
                    {formatPoints(item.points)} pts · {item.matches}x
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${item.points > 0 ? Math.max(4, item.pct) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Granular Filtered Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50 mb-4">Registros Filtrados</h3>

        {(operationFilter === 'all' || operationFilter === 'sessions') && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Categoria</th>
                  <th className="py-2 font-medium text-right">Pontos</th>
                  <th className="py-2 font-medium text-right">Duração</th>
                  <th className="py-2 font-medium text-right">Verificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredSessions.slice(0, 15).map((s) => (
                  <tr key={s.sessionId} className="h-10 hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                    <td className="py-2 font-mono tabular-nums text-slate-700 dark:text-zinc-300">{s.playedDate}</td>
                    <td className="py-2 font-medium text-slate-900 dark:text-zinc-100">{GAME_LABELS[s.gameCategory]}</td>
                    <td className="py-2 font-mono tabular-nums text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      +{s.scoreEarned}
                    </td>
                    <td className="py-2 font-mono tabular-nums text-right text-slate-600 dark:text-zinc-400">
                      {(s.durationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={`font-medium ${
                          s.verificationStatus === 'verified'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {s.verificationStatus === 'verified' ? 'Verificado' : 'Sinalizado'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-zinc-400">
                      Nenhuma partida encontrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {operationFilter === 'conversions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">ID Conversão</th>
                  <th className="py-2 font-medium text-right">Pontos</th>
                  <th className="py-2 font-medium text-right">Valor Creditado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredConversions.slice(0, 15).map((c) => (
                  <tr key={c.conversionId} className="h-10">
                    <td className="py-2 font-mono tabular-nums text-slate-700 dark:text-zinc-300">{c.conversionDate}</td>
                    <td className="py-2 font-mono text-slate-600 dark:text-zinc-400">{c.conversionId}</td>
                    <td className="py-2 font-mono tabular-nums text-right text-slate-900 dark:text-zinc-100">{formatPoints(c.pointsConverted)}</td>
                    <td className="py-2 font-mono tabular-nums text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(c.brlCentsCredited)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {operationFilter === 'withdrawals' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Usuário</th>
                  <th className="py-2 font-medium">Chave Pix</th>
                  <th className="py-2 font-medium text-right">Valor</th>
                  <th className="py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredWithdrawals.slice(0, 15).map((w) => (
                  <tr key={w.withdrawalId} className="h-10">
                    <td className="py-2 font-mono tabular-nums text-slate-700 dark:text-zinc-300">{w.requestedDate}</td>
                    <td className="py-2 font-medium text-slate-900 dark:text-zinc-100">{w.userDisplayName}</td>
                    <td className="py-2 font-mono text-slate-600 dark:text-zinc-400">{w.pixKey}</td>
                    <td className="py-2 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-zinc-100">{formatBRL(w.amountCents)}</td>
                    <td className="py-2 text-right font-medium text-slate-700 dark:text-zinc-300">{w.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
