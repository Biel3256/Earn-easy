import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Dices,
  Flame,
  Gift,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STREAK_REWARD_CENTS, STREAK_TARGET_DAYS } from '../types/earneasy';
import { formatBRL, formatPoints, getTodayUtcDate, getUtcDateDaysAgo } from '../utils/pix';

function formatDayShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

export const DailyCheckinCard: React.FC = () => {
  const { firebaseUser, userAccount, myCheckins, signInWithGoogle, claimDailyCheckin } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err' | 'warn'; msg: string } | null>(null);

  const today = getTodayUtcDate();
  const yesterday = getUtcDateDaysAgo(1);

  const byDate = useMemo(
    () => new Map(myCheckins.map((c) => [c.checkinDate, c])),
    [myCheckins]
  );

  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const daysAgo = 6 - i;
      const dateStr = getUtcDateDaysAgo(daysAgo);
      const record = byDate.get(dateStr) || null;
      return {
        dateStr,
        label: daysAgo === 0 ? 'Hoje' : formatDayShort(dateStr),
        isToday: daysAgo === 0,
        record,
      };
    });
  }, [byDate]);

  const todayClaim = byDate.get(today) || null;
  const yesterdayClaim = byDate.get(yesterday) || null;

  const weekTotal = useMemo(
    () => last7Days.reduce((sum, day) => sum + (day.record?.pointsAwarded || 0), 0),
    [last7Days]
  );

  const claimedDaysCount = useMemo(
    () => last7Days.filter((day) => day.record !== null).length,
    [last7Days]
  );

  const weekPct = Math.min(100, Math.round((weekTotal / 1200) * 100));

  // Consecutive 30-day streak calculation synced with Firestore rules
  const streakStatus = useMemo(() => {
    const countConsecutiveBackwards = (startDaysAgo: number): number => {
      let count = 0;
      for (let i = startDaysAgo; i < startDaysAgo + STREAK_TARGET_DAYS; i++) {
        if (byDate.has(getUtcDateDaysAgo(i))) {
          count += 1;
        } else {
          break;
        }
      }
      return count;
    };

    const earnedBonuses = myCheckins.filter(
      (c) => (c.brlBonusCents || 0) >= STREAK_REWARD_CENTS || c.streakDay === STREAK_TARGET_DAYS
    ).length;

    if (todayClaim) {
      const currentDay =
        typeof todayClaim.streakDay === 'number'
          ? todayClaim.streakDay
          : countConsecutiveBackwards(0);
      return {
        activeStreak: Math.min(STREAK_TARGET_DAYS, Math.max(1, currentDay)),
        lostStreak: false,
        completedToday: currentDay >= STREAK_TARGET_DAYS,
        completedYesterday: false,
        earnedBonuses,
      };
    }

    if (yesterdayClaim) {
      const prevDay =
        typeof yesterdayClaim.streakDay === 'number'
          ? yesterdayClaim.streakDay
          : countConsecutiveBackwards(1);
      if (prevDay >= STREAK_TARGET_DAYS) {
        return {
          activeStreak: 0,
          lostStreak: false,
          completedToday: false,
          completedYesterday: true,
          earnedBonuses,
        };
      }
      return {
        activeStreak: Math.max(1, prevDay),
        lostStreak: false,
        completedToday: false,
        completedYesterday: false,
        earnedBonuses,
      };
    }

    const hadPastCheckin = myCheckins.some((c) => c.checkinDate < yesterday);
    return {
      activeStreak: 0,
      lostStreak: hadPastCheckin,
      completedToday: false,
      completedYesterday: false,
      earnedBonuses,
    };
  }, [byDate, myCheckins, todayClaim, yesterdayClaim, yesterday]);

  const streakPct = Math.min(
    100,
    Math.round((streakStatus.activeStreak / STREAK_TARGET_DAYS) * 100)
  );
  const daysRemaining = Math.max(0, STREAK_TARGET_DAYS - streakStatus.activeStreak);

  const handleClaim = async () => {
    if (!firebaseUser) {
      await signInWithGoogle();
      return;
    }
    setFeedback(null);
    setClaiming(true);
    try {
      const res = await claimDailyCheckin();
      if (res.brlBonusCents > 0) {
        setFeedback({
          type: 'ok',
          msg: `Meta de 30 dias seguidos alcançada! Você recebeu +${formatPoints(res.pointsAwarded)} pts e o prêmio especial de ${formatBRL(res.brlBonusCents)} direto no seu saldo Pix!`,
        });
      } else if (res.streakBroken) {
        setFeedback({
          type: 'warn',
          msg: `Check-in coletado (+${formatPoints(res.pointsAwarded)} pts). Como você perdeu um dia, sua sequência de 30 dias foi reiniciada no Dia 1/${STREAK_TARGET_DAYS}.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          msg: `Sorteio concluído: +${formatPoints(res.pointsAwarded)} pts! Semana: ${formatPoints(res.weekTotal)} pts · Sequência: Dia ${res.streakDay}/${STREAK_TARGET_DAYS} para ganhar ${formatBRL(STREAK_REWARD_CENTS)}.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Não foi possível coletar o check-in diário.',
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-6 transition-colors">
      {/* Top Bar: Weekly Random Check-in + Claim CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">
              Check-in Diário Aleatório
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Colete todo dia entre 143 e 172 pts (1.000–1.200 pts/semana) e mantenha 30 dias seguidos para ganhar {formatBRL(STREAK_REWARD_CENTS)}.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">Semana (7 dias)</div>
            <div className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatPoints(weekTotal)} pts
            </div>
          </div>

          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming || Boolean(firebaseUser && (todayClaim || userAccount?.status !== 'active'))}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Dices className="w-4 h-4" />
            {!firebaseUser
              ? 'Entrar e Coletar'
              : claiming
                ? 'Sorteando...'
                : todayClaim
                  ? `Coletado (+${todayClaim.pointsAwarded} pts)`
                  : 'Coletar Check-in de Hoje'}
          </button>
        </div>
      </div>

      {/* 7-day Check-in Strip */}
      <div className="grid grid-cols-7 gap-2">
        {last7Days.map((day) => {
          const collected = day.record !== null;
          return (
            <div
              key={day.dateStr}
              className={`rounded-lg border p-2.5 text-center transition-colors ${
                collected
                  ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-800/80'
                  : day.isToday
                    ? 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-700'
                    : 'bg-slate-50/70 dark:bg-zinc-950/70 border-slate-200 dark:border-zinc-800'
              }`}
            >
              <div
                className={`text-[11px] font-medium ${
                  day.isToday
                    ? 'text-slate-900 dark:text-zinc-100 font-semibold'
                    : 'text-slate-500 dark:text-zinc-400'
                }`}
              >
                {day.label}
              </div>
              <div
                className={`text-xs font-mono font-bold tabular-nums mt-1 ${
                  collected
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : day.isToday
                      ? 'text-slate-700 dark:text-zinc-300'
                      : 'text-slate-400 dark:text-zinc-600'
                }`}
              >
                {collected ? `+${day.record!.pointsAwarded}` : day.isToday ? 'Livre' : '---'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly Progress Line */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
          <span>{claimedDaysCount} de 7 dias coletados nesta janela</span>
          <span className="font-mono tabular-nums">Meta semanal: 1.000 – 1.200 pts</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
            style={{ width: `${weekPct}%` }}
          />
        </div>
      </div>

      {/* 30-Day Consecutive Streak Reward Section */}
      <div className="border-t border-slate-100 dark:border-zinc-800 pt-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Flame className="w-4 h-4 text-amber-500 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
                Desafio 30 Dias Seguidos · Prêmio de {formatBRL(STREAK_REWARD_CENTS)}
              </h3>
              {streakStatus.earnedBonuses > 0 && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  · {streakStatus.earnedBonuses}x concluído
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Faça check-in por 30 dias consecutivos (UTC) para receber {formatBRL(STREAK_REWARD_CENTS)} direto na carteira. Se perder 1 dia, a sequência zera.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Sequência Atual</div>
              <div className="text-base font-mono font-bold text-slate-900 dark:text-zinc-50 tabular-nums">
                {streakStatus.activeStreak} / {STREAK_TARGET_DAYS} dias
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <Gift className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Streak Loss / Urgency Status Notice */}
        {firebaseUser && streakStatus.lostStreak && (
          <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Sequência perdida: você não realizou o check-in ontem, então a contagem voltou para 0 dias. Colete hoje para recomeçar do Dia 1 rumo aos {formatBRL(STREAK_REWARD_CENTS)}.
            </span>
          </div>
        )}

        {firebaseUser && !todayClaim && yesterdayClaim && !streakStatus.completedYesterday && (
          <div className="p-3 rounded-lg border bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 flex items-center justify-between gap-2">
            <span>
              Dia {streakStatus.activeStreak} ativo · Colete hoje antes de 00:00 UTC para não perder a sequência.
            </span>
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
              Faltam {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
            </span>
          </div>
        )}

        {firebaseUser && streakStatus.completedYesterday && !todayClaim && (
          <div className="p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/80 text-xs text-emerald-800 dark:text-emerald-300">
            Você completou o ciclo de 30 dias ontem! Faça o check-in hoje para iniciar um novo ciclo de {formatBRL(STREAK_REWARD_CENTS)}.
          </div>
        )}

        {/* 30-Day Sequential Grid */}
        <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
          {Array.from({ length: STREAK_TARGET_DAYS }, (_, idx) => {
            const dayNum = idx + 1;
            const isCompleted = dayNum <= streakStatus.activeStreak;
            const isNextToday = !todayClaim && dayNum === streakStatus.activeStreak + 1;
            const isFinalReward = dayNum === STREAK_TARGET_DAYS;

            return (
              <div
                key={dayNum}
                title={
                  isFinalReward
                    ? `Dia 30 — Prêmio de ${formatBRL(STREAK_REWARD_CENTS)}`
                    : `Dia ${dayNum} de ${STREAK_TARGET_DAYS}`
                }
                className={`h-9 rounded-md border flex flex-col items-center justify-center font-mono text-[11px] tabular-nums transition-colors ${
                  isCompleted
                    ? 'bg-emerald-600 dark:bg-emerald-500 border-emerald-600 dark:border-emerald-500 text-white font-bold'
                    : isNextToday
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-semibold'
                      : isFinalReward
                        ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-500'
                }`}
              >
                {isFinalReward ? (
                  <span className="leading-none">R$10</span>
                ) : (
                  <span className="leading-none">{dayNum}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 30-Day Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
            <span>
              {streakStatus.completedToday
                ? 'Ciclo de 30 dias concluído hoje (+R$ 10,00 creditados)'
                : daysRemaining === STREAK_TARGET_DAYS
                  ? 'Comece hoje sua sequência de 30 dias sem falhas'
                  : `Faltam ${daysRemaining} ${daysRemaining === 1 ? 'dia consecutivo' : 'dias consecutivos'} para o bônus`}
            </span>
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {streakPct}% · {formatBRL(STREAK_REWARD_CENTS)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
              style={{ width: `${streakPct}%` }}
            />
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : feedback.type === 'warn'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : feedback.type === 'warn' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}
    </section>
  );
};
