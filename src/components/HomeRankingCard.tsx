import React, { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { ArrowRight, ChevronRight, Medal, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { LeaderboardEntry } from '../types/earneasy';
import { formatBRL, formatPoints } from '../utils/pix';
import { ProfileAvatar } from './PlayerProfile';
import { VerifiedBadge } from './VerifiedBadge';

interface HomeRankingCardProps {
  onViewFullRanking: () => void;
  onInspectPlayer?: (player: LeaderboardEntry, rank: number) => void;
}

export const HomeRankingCard: React.FC<HomeRankingCardProps> = ({
  onViewFullRanking,
  onInspectPlayer,
}) => {
  const { firebaseUser } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'leaderboard'),
      where('brlBalanceCents', '>=', 0),
      orderBy('brlBalanceCents', 'desc'),
      limit(10)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => d.data() as LeaderboardEntry)
          .filter((item) => item.status === 'active')
          .sort((a, b) => {
            if (b.brlBalanceCents !== a.brlBalanceCents) {
              return b.brlBalanceCents - a.brlBalanceCents;
            }
            if (b.pointsBalance !== a.pointsBalance) {
              return b.pointsBalance - a.pointsBalance;
            }
            return b.gamesPlayed - a.gamesPlayed;
          })
          .slice(0, 5);

        setEntries(list);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => unsub();
  }, [firebaseUser]);

  const myRankIdx = firebaseUser
    ? entries.findIndex((item) => item.uid === firebaseUser.uid)
    : -1;

  return (
    <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-6 flex flex-col justify-between h-full shadow-sm shadow-slate-900/5">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 dark:text-zinc-50">
                Ranking Top 5
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {myRankIdx >= 0
                  ? `Sua posição: #${myRankIdx + 1} · Toque para inspecionar`
                  : 'Toque no jogador para ver estatísticas'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onViewFullRanking}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer shrink-0 whitespace-nowrap"
          >
            Ver tudo
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/60"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-3.5 rounded bg-slate-200 dark:bg-zinc-800" />
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-800" />
                  <div className="w-24 h-3.5 rounded bg-slate-200 dark:bg-zinc-800" />
                </div>
                <div className="w-14 h-3.5 rounded bg-slate-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-zinc-400">
            Nenhum jogador no ranking ainda. Jogue para estrear o Top 5!
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((player, index) => {
              const rank = index + 1;
              const isMe = firebaseUser?.uid === player.uid;
              return (
                <button
                  key={player.uid}
                  type="button"
                  onClick={() => onInspectPlayer?.(player, rank)}
                  className={`w-full text-left flex items-center justify-between gap-2.5 py-2.5 px-3 rounded-2xl transition-all cursor-pointer active:scale-[0.99] ${
                    isMe
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/70 hover:bg-emerald-100/80 dark:hover:bg-emerald-950/60'
                      : 'hover:bg-slate-50 dark:hover:bg-zinc-950/80 border border-transparent hover:border-slate-200/70 dark:hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 text-xs font-mono font-bold tabular-nums shrink-0 flex items-center justify-center">
                      {rank === 1 ? (
                        <Trophy className="w-4 h-4 text-amber-500" />
                      ) : rank === 2 ? (
                        <Medal className="w-4 h-4 text-slate-400" />
                      ) : rank === 3 ? (
                        <Medal className="w-4 h-4 text-amber-700 dark:text-orange-400" />
                      ) : (
                        <span className="text-slate-400 dark:text-zinc-500">#{rank}</span>
                      )}
                    </span>

                    <ProfileAvatar
                      name={player.displayName}
                      photoURL={player.photoURL}
                      sizeClass="w-8 h-8"
                      textSizeClass="text-[11px]"
                    />

                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1 min-w-0">
                        <span className="truncate">{player.displayName}</span>
                        <VerifiedBadge
                          tier={player.verifiedBadge}
                          legacyVerified={player.identityVerified}
                          size="xs"
                        />
                        {isMe && (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                            · Você
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                        {formatPoints(player.pointsBalance)} moedas · {player.gamesPlayed} partidas
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatBRL(player.brlBalanceCents)}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
