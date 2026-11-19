import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  Dices,
  Flame,
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
          msg: `30 dias seguidos! +${formatPoints(res.pointsAwarded)} moedas e ${formatBRL(res.brlBonusCents)} creditados no seu saldo Pix!`,
        });
      } else if (res.streakBroken) {
        setFeedback({
          type: 'warn',
          msg: `Check-in coletado (+${formatPoints(res.pointsAwarded)} moedas). Sequência reiniciada no Dia 1/${STREAK_TARGET_DAYS}.`,
        });
      } else {
        setFeedback({
          type: 'ok',
          msg: `+${formatPoints(res.pointsAwarded)} moedas coletadas! Sequência: Dia ${res.streakDay}/${STREAK_TARGET_DAYS}.`,
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
    <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 space-y-5 h-full flex flex-col justify-between">
      <div className="space-y-5">
        {/* Header + Claim Button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CalendarCheck2 className="w-4 h-4" />
              Check-in Diário (1.000–1.200/sem)
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">
              Semana: <span className="font-mono tabular-nums">{formatPoints(weekTotal)}</span> moedas
            </h3>
          </div>

          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming || Boolean(firebaseUser && (todayClaim || userAccount?.status !== 'active'))}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Dices className="w-3.5 h-3.5" />
            {!firebaseUser
              ? 'Entrar e Coletar'
              : claiming
                ? 'Sorteando...'
                : todayClaim
                  ? `Coletado (+${todayClaim.pointsAwarded})`
                  : 'Coletar Hoje'}
          </button>
        </div>

        {/* Clean 7-day Strip */}
        <div className="grid grid-cols-7 gap-1.5">
          {last7Days.map((day) => {
            const collected = day.record !== null;
            return (
              <div
                key={day.dateStr}
                className={`rounded-xl border py-2 px-1 text-center ${
                  collected
                    ? 'bg-emerald-50 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/80'
                    : day.isToday
                      ? 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-700'
                      : 'bg-slate-50/50 dark:bg-zinc-950/50 border-slate-200/80 dark:border-zinc-800'
                }`}
              >
                <div
                  className={`text-[10px] font-medium ${
                    day.isToday
                      ? 'text-slate-900 dark:text-zinc-100 font-semibold'
                      : 'text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  {day.label}
                </div>
                <div
                  className={`text-[11px] font-mono font-bold tabular-nums mt-0.5 ${
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

        {/* Clean 30-Day Streak Progress (No 30-cell clutter) */}
        <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-zinc-100">
              <Flame className="w-4 h-4 text-amber-500 shrink-0" />
              30 Dias Seguidos = {formatBRL(STREAK_REWARD_CENTS)}
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {streakStatus.activeStreak}/{STREAK_TARGET_DAYS} dias
            </span>
          </div>

          <div className="w-full h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${streakPct}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            {streakStatus.completedToday
              ? `Meta concluída hoje! ${formatBRL(STREAK_REWARD_CENTS)} adicionados ao seu saldo Pix.`
              : firebaseUser && streakStatus.lostStreak
                ? 'Sequência reiniciada por falta de check-in ontem. Colete hoje para começar do Dia 1.'
                : `Colete diariamente sem falhar (faltam ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'} para ganhar ${formatBRL(STREAK_REWARD_CENTS)}).`}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
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
