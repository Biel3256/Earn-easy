import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  Lock,
  Medal,
  RefreshCw,
  Search,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import { LeaderboardEntry } from '../types/earneasy';
import { formatBRL, formatPoints } from '../utils/pix';
import { ProfileAvatar } from './PlayerProfile';

interface GlobalRankingProps {
  onGoToGames: () => void;
  onGoToWallet: () => void;
  onInspectPlayer?: (player: LeaderboardEntry, rank: number | null) => void;
}

export const GlobalRanking: React.FC<GlobalRankingProps> = ({
  onGoToGames,
  onGoToWallet,
  onInspectPlayer,
}) => {
  const { firebaseUser, authReady, userAccount, signInWithGoogle } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('');
  const [retrySeed, setRetrySeed] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [directMatch, setDirectMatch] = useState<LeaderboardEntry | null>(null);
  const [showTop25, setShowTop25] = useState(false);

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
      limit(100)
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
          });

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

  // Direct lookup if user pastes an exact UID not present in top 100
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!firebaseUser || !/^[a-zA-Z0-9_-]{15,128}$/.test(trimmed)) {
      setDirectMatch(null);
      return;
    }
    if (entries.some((e) => e.uid.toLowerCase() === trimmed.toLowerCase())) {
      setDirectMatch(null);
      return;
    }

    let cancelled = false;
    getDoc(doc(db, 'leaderboard', trimmed))
      .then((snap) => {
        if (cancelled) return;
        if (snap.exists() && snap.data().status === 'active') {
          setDirectMatch(snap.data() as LeaderboardEntry);
        } else {
          setDirectMatch(null);
        }
      })
      .catch(() => {
        if (!cancelled) setDirectMatch(null);
      });

    return () => {
      cancelled = true;
    };
  }, [searchTerm, entries, firebaseUser]);

  const top10Entries = useMemo(() => entries.slice(0, 10), [entries]);
  const topLeader = entries[0] || null;
  const totalTop10Cents = useMemo(
    () => top10Entries.reduce((sum, item) => sum + item.brlBalanceCents, 0),
    [top10Entries]
  );

  const myPositionIndex = useMemo(() => {
    if (!firebaseUser) return -1;
    return entries.findIndex((item) => item.uid === firebaseUser.uid);
  }, [entries, firebaseUser]);

  const tenthPlaceCents = entries.length >= 10 ? entries[9].brlBalanceCents : 0;
  const centsToEnterTop10 = useMemo(() => {
    if (!userAccount || (myPositionIndex >= 0 && myPositionIndex < 10) || entries.length < 10) return 0;
    return Math.max(10, tenthPlaceCents - userAccount.brlBalanceCents + 10);
  }, [userAccount, myPositionIndex, entries.length, tenthPlaceCents]);

  const trimmedSearch = searchTerm.trim().toLowerCase();

  const displayedRows = useMemo(() => {
    if (!trimmedSearch) {
      const cap = showTop25 ? 25 : 10;
      return entries.slice(0, cap).map((player, idx) => ({
        player,
        rank: idx + 1,
      }));
    }

    const filtered: Array<{ player: LeaderboardEntry; rank: number | null }> = [];
    entries.forEach((player, idx) => {
      const matchesName = player.displayName.toLowerCase().includes(trimmedSearch);
      const matchesUid = player.uid.toLowerCase().includes(trimmedSearch);
      if (matchesName || matchesUid) {
        filtered.push({ player, rank: idx + 1 });
      }
    });

    if (directMatch && !filtered.some((r) => r.player.uid === directMatch.uid)) {
      filtered.push({ player: directMatch, rank: null });
    }

    return filtered;
  }, [entries, trimmedSearch, showTop25, directMatch]);

  if (authReady && !firebaseUser) {
    return (
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200 dark:border-zinc-800 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-4">
        <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-zinc-50 text-balance">
          Ranking Global em Tempo Real
        </h2>
        <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
          Entre com sua conta Google para visualizar os líderes, pesquisar jogadores por nome ou ID e inspecionar estatísticas.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-2xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-extrabold tracking-tight text-slate-900 dark:text-zinc-50 text-balance">
            Ranking Global
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
            <span>Toque em qualquer jogador para ver estatísticas completas</span>
            {lastSyncedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {lastSyncedAt}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onGoToGames}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Jogar e Subir
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onGoToWallet}
            className="px-4 py-2.5 text-xs font-semibold bg-white/90 dark:bg-zinc-900/90 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 rounded-2xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Converter Moedas
          </button>
        </div>
      </div>

      {/* Single-Elevation Summary Strip */}
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-zinc-800 shadow-sm">
        <button
          type="button"
          disabled={!topLeader || !onInspectPlayer}
          onClick={() => topLeader && onInspectPlayer?.(topLeader, 1)}
          className="p-5 text-left space-y-1 hover:bg-slate-50/70 dark:hover:bg-zinc-950/40 transition-colors rounded-t-3xl sm:rounded-l-3xl sm:rounded-tr-none cursor-pointer disabled:cursor-default"
        >
          <div className="text-xs text-slate-500 dark:text-zinc-400">Líder do Ranking</div>
          <div className="text-base font-display font-bold text-slate-900 dark:text-zinc-50 truncate">
            {loading ? 'Carregando...' : topLeader ? topLeader.displayName : 'Sem líder ainda'}
          </div>
          <div className="text-sm font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
            {topLeader ? formatBRL(topLeader.brlBalanceCents) : 'R$ 0,00'}
          </div>
        </button>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Saldo Somado (Top 10)</div>
          <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-zinc-50 pt-0.5">
            {loading ? '---' : formatBRL(totalTop10Cents)}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400">
            {entries.length} {entries.length === 1 ? 'jogador ativo' : 'jogadores ativos'}
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-zinc-400">Sua Posição Atual</div>
          <div className="text-2xl font-mono tabular-nums font-bold text-slate-900 dark:text-zinc-50 pt-0.5">
            {myPositionIndex >= 0 ? `#${myPositionIndex + 1}` : 'Fora do Top 100'}
          </div>
          <div className="text-xs text-slate-500 dark:text-zinc-400 font-mono tabular-nums">
            {userAccount
              ? myPositionIndex >= 0 && myPositionIndex < 10
                ? `Saldo: ${formatBRL(userAccount.brlBalanceCents)}`
                : entries.length >= 10
                  ? `Faltam ${formatBRL(centsToEnterTop10)} para o #10`
                  : `Saldo atual: ${formatBRL(userAccount.brlBalanceCents)}`
              : 'Conecte sua conta'}
          </div>
        </div>
      </div>

      {/* Search Bar & Scope Toggle */}
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar jogador por nome ou colar ID..."
            className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!trimmedSearch && entries.length > 10 && (
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowTop25(false)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                !showTop25
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              Top 10
            </button>
            <button
              type="button"
              onClick={() => setShowTop25(true)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                showTop25
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              Top 25
            </button>
          </div>
        )}
      </div>

      {/* Main Leaderboard Surface */}
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        {errorMsg ? (
          <div className="p-10 text-center space-y-4">
            <AlertCircle className="w-7 h-7 text-red-500 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{errorMsg}</p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Verifique sua conexão e tente sincronizar novamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRetrySeed((s) => s + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
          </div>
        ) : loading ? (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800" aria-busy="true" aria-label="Carregando ranking global">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-7 h-4 rounded bg-slate-100 dark:bg-zinc-800" />
                  <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800" />
                  <div className="space-y-1.5">
                    <div className="w-32 h-3.5 rounded bg-slate-100 dark:bg-zinc-800" />
                    <div className="w-20 h-2.5 rounded bg-slate-100 dark:bg-zinc-800/70" />
                  </div>
                </div>
                <div className="w-20 h-4 rounded bg-slate-100 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : displayedRows.length === 0 ? (
          <div className="p-10 text-center space-y-4">
            <Trophy className="w-8 h-8 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-zinc-100">
                {trimmedSearch
                  ? `Nenhum jogador encontrado para "${searchTerm.trim()}"`
                  : 'Nenhum jogador no ranking ainda'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
                {trimmedSearch
                  ? 'Tente buscar por outro nome ou cole o ID exato do jogador.'
                  : 'Jogue uma partida, acumule moedas e faça sua conversão diária para inaugurar a tabela dos maiores saldos.'}
              </p>
            </div>
            {trimmedSearch ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-zinc-800 text-white rounded-xl cursor-pointer"
              >
                Limpar Busca
              </button>
            ) : (
              <button
                type="button"
                onClick={onGoToGames}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors cursor-pointer"
              >
                Explorar Jogos
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-xs font-medium text-slate-500 dark:text-zinc-400">
                  <th className="py-3.5 pl-5 pr-3 w-20">Posição</th>
                  <th className="py-3.5 px-3">Jogador</th>
                  <th className="py-3.5 px-3 text-right hidden sm:table-cell">Partidas</th>
                  <th className="py-3.5 px-3 text-right hidden md:table-cell">Moedas</th>
                  <th className="py-3.5 px-3 text-right">Saldo em R$</th>
                  <th className="py-3.5 pl-2 pr-5 text-right w-24">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {displayedRows.map(({ player, rank }) => {
                  const isMe = firebaseUser?.uid === player.uid;
                  return (
                    <tr
                      key={player.uid}
                      onClick={() => onInspectPlayer?.(player, rank)}
                      className={`transition-colors cursor-pointer ${
                        isMe
                          ? 'bg-emerald-50/75 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/45'
                          : 'hover:bg-slate-50 dark:hover:bg-zinc-950/60'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-3 font-mono tabular-nums font-semibold whitespace-nowrap">
                        {rank === 1 ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <Trophy className="w-4 h-4 shrink-0" />
                            #01
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-zinc-300">
                            <Medal className="w-4 h-4 shrink-0" />
                            #02
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-orange-400">
                            <Medal className="w-4 h-4 shrink-0" />
                            #03
                          </span>
                        ) : rank !== null ? (
                          <span className="text-slate-400 dark:text-zinc-500">
                            #{String(rank).padStart(2, '0')}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <ProfileAvatar
                            name={player.displayName}
                            photoURL={player.photoURL}
                            sizeClass="w-9 h-9"
                            textSizeClass="text-xs"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-zinc-100 truncate">
                              {player.displayName}
                              {isMe && (
                                <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  · Você
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-zinc-400 sm:hidden font-mono tabular-nums">
                              {player.gamesPlayed} {player.gamesPlayed === 1 ? 'partida' : 'partidas'} · {formatPoints(player.pointsBalance)} pts
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-zinc-300 hidden sm:table-cell">
                        {player.gamesPlayed.toLocaleString('pt-BR')}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-zinc-300 hidden md:table-cell">
                        {formatPoints(player.pointsBalance)}
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatBRL(player.brlBalanceCents)}
                      </td>

                      <td className="py-3.5 pl-2 pr-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectPlayer?.(player, rank);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-slate-700 dark:text-zinc-200 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Ver</span>
                        </button>
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
