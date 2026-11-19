import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { AlertCircle, ArrowRight, Lock, Medal, RefreshCw, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import { LeaderboardEntry } from '../types/earneasy';
import { resolveAvatarSrc } from '../utils/avatars';
import { formatBRL, formatPoints } from '../utils/pix';

interface GlobalRankingProps {
  onGoToGames: () => void;
  onGoToWallet: () => void;
}

const PlayerAvatar: React.FC<{ name: string; photoURL: string }> = ({ name, photoURL }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedSrc = resolveAvatarSrc(photoURL);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'J';

  if (!resolvedSrc || imgFailed) {
    return (
      <div
        aria-hidden="true"
        className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center text-xs font-semibold shrink-0"
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={`Foto de ${name}`}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className="w-9 h-9 rounded-full object-cover border border-slate-700 bg-slate-800 shrink-0"
    />
  );
};

export const GlobalRanking: React.FC<GlobalRankingProps> = ({
  onGoToGames,
  onGoToWallet,
}) => {
  const { firebaseUser, authReady, userAccount, signInWithGoogle } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [retrySeed, setRetrySeed] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    if (!firebaseUser) {
      setEntries([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const leaderboardQuery = query(
      collection(db, 'leaderboard'),
      where('brlBalanceCents', '>=', 0),
      orderBy('brlBalanceCents', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      leaderboardQuery,
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
          .slice(0, 10);

        setEntries(list);
        setLoading(false);
        setErrorMsg(null);
        setLastSyncedAt(
          new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      },
      (err) => {
        console.error(
          'Firestore Error: ',
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            operationType: 'list',
            path: 'leaderboard',
            userId: auth.currentUser?.uid || null,
          })
        );
        setLoading(false);
        setErrorMsg('Não foi possível sincronizar o ranking em tempo real agora.');
      }
    );

    return () => unsubscribe();
  }, [authReady, firebaseUser, retrySeed]);

  const topLeader = entries[0] || null;
  const totalTop10Cents = useMemo(
    () => entries.reduce((sum, item) => sum + item.brlBalanceCents, 0),
    [entries]
  );

  const myPositionIndex = useMemo(() => {
    if (!firebaseUser) return -1;
    return entries.findIndex((item) => item.uid === firebaseUser.uid);
  }, [entries, firebaseUser]);

  const tenthPlaceCents = entries.length >= 10 ? entries[9].brlBalanceCents : 0;
  const centsToEnterTop10 = useMemo(() => {
    if (!userAccount || myPositionIndex >= 0 || entries.length < 10) return 0;
    return Math.max(10, tenthPlaceCents - userAccount.brlBalanceCents + 10);
  }, [userAccount, myPositionIndex, entries.length, tenthPlaceCents]);

  if (authReady && !firebaseUser) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center max-w-lg mx-auto space-y-4 text-slate-100">
        <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-emerald-400" />
        </div>
        <h2 className="text-xl font-display font-bold text-slate-50 text-balance">
          Ranking Global em Tempo Real
        </h2>
        <p className="text-sm text-slate-300 tracking-[0.01em] leading-relaxed">
          Entre com sua conta Google para visualizar os 10 jogadores com maior saldo em reais na plataforma e acompanhar sua posição ao vivo.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-6 text-slate-100">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-50 text-balance">
            Ranking Global — Top 10 Saldos
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tracking-[0.01em]">
            <span>Modo noturno</span>
            <span aria-hidden="true">·</span>
            <span>Sincronização ao vivo via Firestore</span>
            {lastSyncedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-300">
                  Atualizado às {lastSyncedAt}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToGames}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Jogar e Subir
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onGoToWallet}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Converter Pontos
          </button>
        </div>
      </div>

      {/* Single-Elevation Summary Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400 tracking-[0.01em]">Líder do Ranking</div>
          <div className="text-base font-display font-semibold text-slate-50 truncate">
            {loading ? 'Carregando...' : topLeader ? topLeader.displayName : 'Sem líder ainda'}
          </div>
          <div className="text-sm font-mono tabular-nums font-bold text-emerald-400">
            {topLeader ? formatBRL(topLeader.brlBalanceCents) : 'R$ 0,00'}
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400 tracking-[0.01em]">Saldo Somado (Top 10)</div>
          <div className="text-2xl font-mono tabular-nums font-bold text-slate-50 pt-0.5">
            {loading ? '---' : formatBRL(totalTop10Cents)}
          </div>
          <div className="text-xs text-slate-400">
            {entries.length} {entries.length === 1 ? 'jogador ativo' : 'jogadores ativos'} listados
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-400 tracking-[0.01em]">Sua Posição Atual</div>
          <div className="text-2xl font-mono tabular-nums font-bold text-slate-50 pt-0.5">
            {myPositionIndex >= 0 ? `#${myPositionIndex + 1}` : 'Fora do Top 10'}
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {userAccount
              ? myPositionIndex >= 0
                ? `Saldo: ${formatBRL(userAccount.brlBalanceCents)}`
                : entries.length >= 10
                  ? `Faltam ${formatBRL(centsToEnterTop10)} para o #10`
                  : `Saldo atual: ${formatBRL(userAccount.brlBalanceCents)}`
              : 'Conecte sua conta'}
          </div>
        </div>
      </div>

      {/* Main Top 10 Leaderboard Surface */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {errorMsg ? (
          <div className="p-10 text-center space-y-4">
            <AlertCircle className="w-7 h-7 text-red-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-100">{errorMsg}</p>
              <p className="text-xs text-slate-400">
                Verifique sua conexão com o Firestore e tente sincronizar novamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRetrySeed((s) => s + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
          </div>
        ) : loading ? (
          <div className="divide-y divide-slate-800/80" aria-busy="true" aria-label="Carregando ranking global">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-7 h-4 rounded bg-slate-800" />
                  <div className="w-9 h-9 rounded-full bg-slate-800" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-3.5 rounded bg-slate-800" />
                    <div className="w-20 h-2.5 rounded bg-slate-800/70" />
                  </div>
                </div>
                <div className="w-20 h-4 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center space-y-4">
            <Trophy className="w-8 h-8 text-amber-400 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-base font-display font-semibold text-slate-100">
                Nenhum jogador no ranking ainda
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Jogue uma partida, acumule pontos e faça sua conversão diária para inaugurar a tabela dos maiores saldos.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToGames}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors cursor-pointer"
            >
              Explorar Jogos
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                  <th className="py-3.5 pl-5 pr-3 w-20">Posição</th>
                  <th className="py-3.5 px-3">Jogador</th>
                  <th className="py-3.5 px-3 text-right hidden sm:table-cell">Partidas</th>
                  <th className="py-3.5 px-3 text-right">Pontos</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">Saldo em R$</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {entries.map((player, index) => {
                  const rank = index + 1;
                  const isMe = firebaseUser?.uid === player.uid;
                  return (
                    <tr
                      key={player.uid}
                      className={`transition-colors ${
                        isMe ? 'bg-emerald-950/30 hover:bg-emerald-950/40' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-3 font-mono tabular-nums font-semibold whitespace-nowrap">
                        {rank === 1 ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-300">
                            <Trophy className="w-4 h-4 shrink-0" />
                            #01
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-200">
                            <Medal className="w-4 h-4 shrink-0" />
                            #02
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center gap-1.5 text-orange-300">
                            <Medal className="w-4 h-4 shrink-0" />
                            #03
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            #{String(rank).padStart(2, '0')}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar name={player.displayName} photoURL={player.photoURL} />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100 truncate tracking-[0.01em]">
                              {player.displayName}
                              {isMe && (
                                <span className="ml-2 text-xs font-normal text-emerald-400">
                                  · Você
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 sm:hidden font-mono tabular-nums">
                              {player.gamesPlayed} {player.gamesPlayed === 1 ? 'partida' : 'partidas'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300 hidden sm:table-cell">
                        {player.gamesPlayed.toLocaleString('pt-BR')}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {formatPoints(player.pointsBalance)}
                      </td>

                      <td className="py-3.5 pl-3 pr-5 text-right font-mono tabular-nums font-bold text-emerald-400 whitespace-nowrap">
                        {formatBRL(player.brlBalanceCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
