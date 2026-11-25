import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Check,
  CheckCheck,
  Clock,
  Copy,
  DoorOpen,
  Eye,
  Gamepad2,
  Globe,
  Lock,
  Megaphone,
  Search,
  Send,
  ShieldAlert,
  Swords,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useMultiplayer } from '../context/MultiplayerContext';
import { useToast } from '../context/ToastContext';
import {
  LeaderboardEntry,
  MULTIPLAYER_GAME_LABELS,
  MultiplayerGameId,
} from '../types/earneasy';
import { extractReadableError, formatPoints } from '../utils/pix';
import { ProfileAvatar } from './PlayerProfile';
import { MULTIPLAYER_CATALOG } from './multiplayer/multiplayerCatalog';

type PublicProfile = LeaderboardEntry;

type SocialMessage = {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt?: { toDate?: () => Date };
  readAt?: { toDate?: () => Date; toMillis?: () => number } | null;
  readBy?: string;
};

type FriendRequest = {
  id: string;
  senderUid: string;
  recipientUid: string;
  senderName: string;
  recipientName: string;
  status: string;
};

const safeText = (value: string) => value.trim().slice(0, 500);
const friendshipId = (a: string, b: string) => [a, b].sort().join('__');

function formatChatTime(ts?: { toDate?: () => Date } | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  try {
    return ts.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatLastSeenStatus(lastSeenMs?: number): { label: string; isOnlineNow: boolean } {
  if (!lastSeenMs) {
    return { label: 'Offline · Sem atividade recente', isOnlineNow: false };
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));
  if (diffSec < 90) {
    return { label: 'Online agora', isOnlineNow: true };
  }
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return { label: `Offline · Visto por último há ${mins} min`, isOnlineNow: false };
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return { label: `Offline · Visto por último há ${hrs} h`, isOnlineNow: false };
  }
  const days = Math.floor(diffSec / 86400);
  return { label: `Offline · Visto por último há ${days} d`, isOnlineNow: false };
}

export function SocialPresence() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid || '';

  useEffect(() => {
    if (!uid) return;
    const presenceRef = doc(db, 'socialPresence', uid);
    const beat = () =>
      setDoc(presenceRef, { uid, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    beat();
    const timer = window.setInterval(beat, 45_000);
    const handleFocus = () => beat();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') beat();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [uid]);

  return null;
}

interface SocialSectionProps {
  initialSelectedUid?: string | null;
  onInspectPlayer?: (player: LeaderboardEntry, rank: number | null) => void;
  onNavigatePlayFriends?: () => void;
}

export function SocialSection({
  initialSelectedUid,
  onInspectPlayer,
  onNavigatePlayFriends,
}: SocialSectionProps = {}) {
  const { firebaseUser, userAccount } = useAuth();
  const {
    wsConnected,
    room,
    globalInvites,
    createRoom,
    joinRoom,
    leaveRoom,
    publishToGlobal,
  } = useMultiplayer();
  const { showToast } = useToast();
  const uid = firebaseUser?.uid || '';
  const myName = (userAccount?.displayName || firebaseUser?.displayName || 'Jogador').slice(0, 80);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [presence, setPresence] = useState<Record<string, number>>({});
  const [selectedFriend, setSelectedFriend] = useState<PublicProfile | null>(null);
  const [privateMessages, setPrivateMessages] = useState<SocialMessage[]>([]);
  const [privateDraft, setPrivateDraft] = useState('');
  const [globalGameId, setGlobalGameId] = useState<MultiplayerGameId>('domino');
  const [globalRounds, setGlobalRounds] = useState<number>(3);
  const [globalStake, setGlobalStake] = useState<string>('100');
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [, refreshPresenceClock] = useState(0);
  const [tab, setTab] = useState<'friends' | 'global'>('friends');

  const privateEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!uid) return;
    const reqQuery = query(
      collection(db, 'friendRequests'),
      where('participantUids', 'array-contains', uid),
      limit(100)
    );
    return onSnapshot(
      reqQuery,
      (snap) => {
        setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() } as FriendRequest)));
      },
      () => setError('Não foi possível carregar as solicitações de amizade.')
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setPresence({});
      return;
    }
    return onSnapshot(
      collection(db, 'socialPresence'),
      (snap) => {
        const next: Record<string, number> = {};
        snap.docs.forEach((item) => {
          const lastSeen = item.data().lastSeen;
          if (lastSeen && typeof lastSeen.toMillis === 'function') {
            next[item.id] = lastSeen.toMillis();
          }
        });
        setPresence(next);
      },
      () => {}
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const friendQuery = query(
      collection(db, 'friendships'),
      where('memberUids', 'array-contains', uid),
      limit(100)
    );
    return onSnapshot(
      friendQuery,
      async (snap) => {
        const profiles = await Promise.all(
          snap.docs.map(async (item) => {
            const otherUid = (item.data().memberUids as string[]).find((member) => member !== uid);
            if (!otherUid) return null;
            try {
              const profileSnap = await getDoc(doc(db, 'leaderboard', otherUid));
              if (!profileSnap.exists()) {
                return {
                  uid: otherUid,
                  displayName: 'Jogador Earn Easy',
                  photoURL: '',
                  brlBalanceCents: 0,
                  pointsBalance: 0,
                  gamesPlayed: 0,
                  status: 'active',
                } as PublicProfile;
              }
              return profileSnap.data() as PublicProfile;
            } catch {
              return {
                uid: otherUid,
                displayName: 'Jogador Earn Easy',
                photoURL: '',
                brlBalanceCents: 0,
                pointsBalance: 0,
                gamesPlayed: 0,
                status: 'active',
              } as PublicProfile;
            }
          })
        );
        setFriends(profiles.filter((profile): profile is PublicProfile => Boolean(profile)));
      },
      () => setError('Não foi possível carregar sua lista de amigos.')
    );
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedFriend) {
      setPrivateMessages([]);
      return;
    }
    const chatId = friendshipId(uid, selectedFriend.uid);
    const messagesQuery = query(
      collection(db, 'friendships', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(
      messagesQuery,
      (snap) => {
        setPrivateMessages(snap.docs.map((item) => ({ id: item.id, ...item.data() } as SocialMessage)));
      },
      () => setError('Não foi possível carregar a conversa privada.')
    );
  }, [uid, selectedFriend?.uid]);

  useEffect(() => {
    privateEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [privateMessages.length, selectedFriend?.uid]);

  // Mark incoming private messages as read with serverTimestamp when chat is open
  useEffect(() => {
    if (!uid || !selectedFriend || tab !== 'friends' || privateMessages.length === 0) return;
    const unreadIncoming = privateMessages.filter(
      (msg) => msg.senderUid !== uid && !msg.readAt
    );
    if (unreadIncoming.length === 0) return;

    const chatId = friendshipId(uid, selectedFriend.uid);
    const batch = writeBatch(db);
    unreadIncoming.slice(0, 30).forEach((msg) => {
      batch.update(doc(db, 'friendships', chatId, 'messages', msg.id), {
        readAt: serverTimestamp(),
        readBy: uid,
      });
    });
    batch.commit().catch(() => {});
  }, [uid, selectedFriend?.uid, tab, privateMessages]);

  useEffect(() => {
    const timer = window.setInterval(() => refreshPresenceClock((value) => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!initialSelectedUid) return;
    setTab('friends');
    const matched = friends.find((f) => f.uid === initialSelectedUid);
    if (matched) {
      setSelectedFriend(matched);
    }
  }, [initialSelectedUid, friends]);

  const handleCopyMyId = async () => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const pendingIncoming = useMemo(
    () => requests.filter((item) => item.recipientUid === uid && item.status === 'pending'),
    [requests, uid]
  );

  const pendingOutgoing = useMemo(
    () => requests.filter((item) => item.senderUid === uid && item.status === 'pending'),
    [requests, uid]
  );

  const searchUsers = async () => {
    if (!uid) return;
    const term = searchText.trim();
    if (term.length < 2) {
      setError('Digite pelo menos 2 caracteres para buscar um jogador.');
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setError('');
    setNotice('');
    setSearchResults([]);

    try {
      const results: PublicProfile[] = [];
      const seenUids = new Set<string>();

      if (/^[a-zA-Z0-9_-]{15,128}$/.test(term) && term !== uid) {
        const directSnap = await getDoc(doc(db, 'leaderboard', term));
        if (directSnap.exists() && directSnap.data().status === 'active') {
          const data = directSnap.data() as PublicProfile;
          results.push(data);
          seenUids.add(data.uid);
        }
      }

      const activeQuery = query(
        collection(db, 'leaderboard'),
        where('status', '==', 'active'),
        limit(100)
      );
      const snap = await getDocs(activeQuery);
      const lowerTerm = term.toLowerCase();

      snap.docs.forEach((item) => {
        const profile = item.data() as PublicProfile;
        if (profile.uid === uid || seenUids.has(profile.uid)) return;
        const matchesName = profile.displayName?.toLowerCase().includes(lowerTerm);
        const matchesUid = profile.uid.toLowerCase().includes(lowerTerm);
        if (matchesName || matchesUid) {
          results.push(profile);
          seenUids.add(profile.uid);
        }
      });

      setSearchResults(results.slice(0, 20));
    } catch (err) {
      setError(extractReadableError(err, 'Falha na busca. Tente novamente em instantes.'));
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (profile: PublicProfile) => {
    if (!uid || !profile.uid || busy) return;
    if (userAccount?.status !== 'active') {
      setError('Sua conta precisa estar ativa para enviar solicitações de amizade.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const requestId = friendshipId(uid, profile.uid);
      const requestRef = doc(db, 'friendRequests', requestId);
      const existingRequest = await getDoc(requestRef);
      if (existingRequest.exists()) {
        const existingData = existingRequest.data();
        if (existingData.status !== 'rejected' || existingData.senderUid !== uid) {
          setError('Já existe uma solicitação pendente ou amizade ativa com este jogador.');
          return;
        }
        await updateDoc(requestRef, {
          status: 'pending',
          createdAt: serverTimestamp(),
          respondedAt: null,
        });
      } else {
        await setDoc(requestRef, {
          senderUid: uid,
          recipientUid: profile.uid,
          senderName: myName,
          recipientName: (profile.displayName || 'Jogador').slice(0, 80),
          participantUids: [uid, profile.uid],
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
      setNotice(`Solicitação de amizade enviada para ${profile.displayName}.`);
      showToast({
        type: 'success',
        title: 'Convite de amizade enviado',
        message: `Solicitação enviada para ${profile.displayName}.`,
      });
    } catch (err) {
      const msg = extractReadableError(err, 'Não foi possível enviar a solicitação agora.');
      setError(msg);
      showToast({ type: 'error', title: 'Erro na solicitação', message: msg });
    } finally {
      setBusy(false);
    }
  };

  const respondRequest = async (request: FriendRequest, accept: boolean) => {
    if (!uid || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'friendRequests', request.id), {
        status: accept ? 'accepted' : 'rejected',
        respondedAt: serverTimestamp(),
      });
      if (accept) {
        batch.set(doc(db, 'friendships', friendshipId(request.senderUid, request.recipientUid)), {
          memberUids: [request.senderUid, request.recipientUid].sort(),
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      const msg = accept
        ? `${request.senderName} adicionado à sua lista de amigos!`
        : `Solicitação de ${request.senderName} recusada.`;
      setNotice(msg);
      showToast({
        type: accept ? 'success' : 'info',
        title: accept ? 'Novo amigo adicionado' : 'Solicitação recusada',
        message: msg,
      });
    } catch (err) {
      const msg = extractReadableError(err, 'Não foi possível responder à solicitação.');
      setError(msg);
      showToast({ type: 'error', title: 'Erro ao responder', message: msg });
    } finally {
      setBusy(false);
    }
  };

  const handlePublishGlobalMatch = () => {
    if (!uid || !userAccount) return;
    if (userAccount.status !== 'active') {
      setError('Sua conta precisa estar ativa para enviar partidas no Chat Global.');
      return;
    }
    const stake = Math.max(0, Math.floor(Number(globalStake || 0)));
    if (stake > userAccount.pointsBalance) {
      setError('Seu saldo de pontos é menor que a aposta escolhida para esta partida.');
      return;
    }
    setError('');
    createRoom({
      gameId: globalGameId,
      totalRounds: globalRounds,
      stakePoints: stake,
      visibility: 'public',
      postToGlobal: true,
    });
    showToast({
      type: 'success',
      title: 'Partida enviada no Global!',
      message: 'Quando um adversário aceitar, o convite sumirá do chat e a sala abrirá.',
    });
  };

  const handleAcceptGlobalMatch = (roomCode: string) => {
    if (!uid || !userAccount) return;
    if (userAccount.status !== 'active') {
      setError('Sua conta precisa estar ativa para aceitar partidas.');
      return;
    }
    joinRoom(roomCode);
    onNavigatePlayFriends?.();
  };

  const sendPrivate = async () => {
    const text = safeText(privateDraft);
    if (!uid || !selectedFriend || !text || busy) return;
    if (userAccount?.status !== 'active') {
      setError('Sua conta precisa estar ativa para enviar mensagens.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const chatId = friendshipId(uid, selectedFriend.uid);
      await addDoc(collection(db, 'friendships', chatId, 'messages'), {
        senderUid: uid,
        senderName: myName,
        text,
        createdAt: serverTimestamp(),
      });
      setPrivateDraft('');
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível enviar a mensagem privada.'));
    } finally {
      setBusy(false);
    }
  };

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const aLast = presence[a.uid] || 0;
      const bLast = presence[b.uid] || 0;
      const aOnline = formatLastSeenStatus(aLast).isOnlineNow;
      const bOnline = formatLastSeenStatus(bLast).isOnlineNow;
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      if (bLast !== aLast) return bLast - aLast;
      return (a.displayName || '').localeCompare(b.displayName || '', 'pt-BR');
    });
  }, [friends, presence]);

  const onlineFriendsCount = useMemo(
    () => friends.filter((f) => formatLastSeenStatus(presence[f.uid]).isOnlineNow).length,
    [friends, presence]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight">
            Amigos & Comunidade
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            Encontre outros jogadores do Earn Easy, adicione amigos e converse no chat privado ou global.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setTab('friends')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'friends'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Amigos ({friends.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('global')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === 'global'
                ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            Chat Global ({globalInvites.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="underline cursor-pointer shrink-0">
            Fechar
          </button>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="underline cursor-pointer shrink-0">
            Fechar
          </button>
        </div>
      )}

      {/* Busca para adicionar amigos */}
      <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Adicionar Novos Amigos
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Busque pelo nome exibido no ranking ou cole o ID do usuário.
            </p>
          </div>
          {uid && (
            <button
              type="button"
              onClick={handleCopyMyId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[11px] font-mono text-slate-700 dark:text-zinc-300 hover:border-emerald-400 transition-colors self-start sm:self-auto cursor-pointer"
            >
              {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-600" />}
              <span className="truncate max-w-[180px]">
                {copiedId ? 'Seu ID copiado!' : `Meu ID: ${uid}`}
              </span>
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && searchUsers()}
            placeholder="Digite o nome do jogador ou o ID..."
            className="flex-1 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={searchUsers}
            disabled={searching}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {hasSearched && searchResults.length === 0 && !searching && (
          <p className="text-xs text-slate-500 dark:text-zinc-400 pt-1">
            Nenhum jogador ativo encontrado para "{searchText.trim()}".
          </p>
        )}

        {searchResults.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-zinc-800 border-t border-slate-100 dark:border-zinc-800 pt-2">
            {searchResults.map((profile) => {
              const alreadyFriend = friends.some((friend) => friend.uid === profile.uid);
              const pendingReq = requests.find(
                (request) =>
                  request.status === 'pending' &&
                  (request.senderUid === profile.uid || request.recipientUid === profile.uid)
              );

              return (
                <div
                  key={profile.uid}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onInspectPlayer?.(profile, null)}
                    className="flex items-center gap-3 min-w-0 text-left hover:opacity-85 transition-opacity cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <ProfileAvatar
                        name={profile.displayName}
                        photoURL={profile.photoURL || ''}
                        sizeClass="w-9 h-9"
                        textSizeClass="text-xs"
                      />
                      <span
                        title={formatLastSeenStatus(presence[profile.uid]).label}
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                          formatLastSeenStatus(presence[profile.uid]).isOnlineNow
                            ? 'bg-emerald-400'
                            : 'bg-zinc-400 dark:bg-zinc-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                        {profile.displayName}
                      </p>
                      <p className="truncate text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {profile.uid} ·{' '}
                        <span
                          className={
                            formatLastSeenStatus(presence[profile.uid]).isOnlineNow
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : ''
                          }
                        >
                          {formatLastSeenStatus(presence[profile.uid]).label}
                        </span>
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {onInspectPlayer && (
                      <button
                        type="button"
                        onClick={() => onInspectPlayer(profile, null)}
                        title="Ver estatísticas"
                        className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {alreadyFriend ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        <UserCheck className="w-3.5 h-3.5" />
                        Amigos
                      </span>
                    ) : pendingReq ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5" />
                        {pendingReq.senderUid === uid ? 'Enviada' : 'Pendente'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sendRequest(profile)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Adicionar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {tab === 'friends' ? (
        <div className="grid gap-5 lg:grid-cols-[310px_1fr] items-stretch">
          {/* Coluna Esquerda: Solicitações & Amigos */}
          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 space-y-5 shadow-sm">
            <div className="space-y-2.5">
              <h2 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                Solicitações Recebidas ({pendingIncoming.length})
              </h2>

              {pendingIncoming.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Nenhuma solicitação pendente no momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingIncoming.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-zinc-800 last:border-b-0"
                    >
                      <span className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-200">
                        {request.senderName}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Aceitar"
                          disabled={busy}
                          onClick={() => respondRequest(request, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Aceitar
                        </button>
                        <button
                          type="button"
                          title="Recusar"
                          disabled={busy}
                          onClick={() => respondRequest(request, false)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingOutgoing.length > 0 && (
                <div className="pt-2 space-y-1">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                    Enviadas ({pendingOutgoing.length})
                  </div>
                  {pendingOutgoing.map((req) => (
                    <div
                      key={req.id}
                      className="text-xs text-slate-600 dark:text-zinc-400 flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{req.recipientName}</span>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">
                        Pendente
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                  Meus Amigos ({friends.length})
                </h2>
                {friends.length > 0 && (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {onlineFriendsCount} online
                  </span>
                )}
              </div>

              {friends.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Use a busca acima para adicionar alguém e conversar no privado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {sortedFriends.map((friend) => {
                    const active = selectedFriend?.uid === friend.uid;
                    const friendStatus = formatLastSeenStatus(presence[friend.uid]);
                    return (
                      <button
                        key={friend.uid}
                        type="button"
                        onClick={() => setSelectedFriend(friend)}
                        className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
                          active
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                            : 'border border-transparent hover:bg-slate-50 dark:hover:bg-zinc-800/70 text-slate-800 dark:text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <ProfileAvatar
                              name={friend.displayName}
                              photoURL={friend.photoURL || ''}
                              sizeClass="w-8 h-8"
                              textSizeClass="text-[11px]"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                                friendStatus.isOnlineNow
                                  ? 'bg-emerald-400'
                                  : 'bg-zinc-400 dark:bg-zinc-600'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold">{friend.displayName}</div>
                            <div
                              className={`text-[11px] truncate ${
                                friendStatus.isOnlineNow
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'text-slate-400 dark:text-zinc-500'
                              }`}
                            >
                              {friendStatus.label}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Chat Privado */}
          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 flex min-h-[420px] max-h-[560px] flex-col shadow-sm">
            <div className="pb-3 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50 truncate">
                  {selectedFriend ? `Conversa com ${selectedFriend.displayName}` : 'Chat Privado'}
                </h2>
                <p
                  className={`text-[11px] flex items-center gap-1.5 ${
                    selectedFriend && formatLastSeenStatus(presence[selectedFriend.uid]).isOnlineNow
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  {selectedFriend && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        formatLastSeenStatus(presence[selectedFriend.uid]).isOnlineNow
                          ? 'bg-emerald-400'
                          : 'bg-zinc-400 dark:bg-zinc-600'
                      }`}
                    />
                  )}
                  <span className="truncate">
                    {selectedFriend
                      ? formatLastSeenStatus(presence[selectedFriend.uid]).label
                      : 'Selecione um amigo na lista ao lado para conversar'}
                  </span>
                </p>
              </div>
              {selectedFriend && onInspectPlayer && (
                <button
                  type="button"
                  onClick={() => onInspectPlayer(selectedFriend, null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:border-emerald-400 cursor-pointer shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Estatísticas
                </button>
              )}
            </div>

            {selectedFriend ? (
              <>
                <div className="flex-1 space-y-2.5 overflow-y-auto py-4 pr-1">
                  {privateMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-zinc-400">
                      Nenhuma mensagem ainda. Diga oi para {selectedFriend.displayName}!
                    </div>
                  ) : (
                    privateMessages.map((message) => {
                      const mine = message.senderUid === uid;
                      const timeLabel = formatChatTime(message.createdAt);
                      const readLabel = formatChatTime(message.readAt);
                      return (
                        <div
                          key={message.id}
                          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${
                              mine
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100'
                            }`}
                          >
                            <p className="leading-relaxed break-words">{message.text}</p>
                          </div>
                          <span className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500 font-mono inline-flex items-center gap-1">
                            <span>
                              {mine ? 'Você' : message.senderName}
                              {timeLabel ? ` · ${timeLabel}` : ''}
                            </span>
                            {mine && (
                              <span
                                className={`inline-flex items-center gap-0.5 ml-1 ${
                                  message.readAt
                                    ? 'text-emerald-600 dark:text-lime-400 font-semibold'
                                    : 'text-slate-400 dark:text-zinc-500'
                                }`}
                              >
                                {message.readAt ? (
                                  <>
                                    <CheckCheck className="w-3 h-3" />
                                    {readLabel ? `Visualizado às ${readLabel}` : 'Visualizado'}
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3 h-3" />
                                    Enviada
                                  </>
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={privateEndRef} />
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
                  <input
                    type="text"
                    value={privateDraft}
                    maxLength={500}
                    onChange={(event) => setPrivateDraft(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && sendPrivate()}
                    placeholder={`Mensagem para ${selectedFriend.displayName}...`}
                    className="flex-1 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={sendPrivate}
                    disabled={busy || !privateDraft.trim()}
                    aria-label="Enviar mensagem privada"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    Enviar
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-slate-500 dark:text-zinc-400 px-4">
                <Users className="w-8 h-8 opacity-40" />
                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                  Selecione um amigo para abrir a conversa
                </p>
                <p className="text-xs max-w-sm">
                  As mensagens privadas ficam protegidas apenas entre você e seu amigo confirmado.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 flex min-h-[500px] flex-col shadow-sm space-y-4">
          <div className="pb-3 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50 flex items-center gap-2">
                <Swords className="w-4 h-4 text-emerald-600 dark:text-lime-400" />
                Chat Global — Partidas Públicas
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Digitação livre bloqueada. Envie partidas públicas para desafiar outros jogadores ou aceite um desafio aberto.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-zinc-800 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                <Lock className="w-3 h-3 text-amber-500" />
                Sem chat de texto
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                  wsConnected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                }`}
              >
                {wsConnected ? 'Ao vivo' : 'Conectando...'}
              </span>
            </div>
          </div>

          {/* Aviso fixado com regras rígidas contra falar o que quiser */}
          <div className="rounded-2xl border border-amber-300/80 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/25 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-extrabold mb-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              AVISO FIXADO — REGRAS DO CHAT GLOBAL (SOMENTE PARTIDAS)
            </div>
            <p className="text-xs text-slate-800 dark:text-zinc-200 leading-relaxed mb-2">
              Aqui é o Biel, dono e administrador do Earn Easy. Para impedir que qualquer pessoa fale o que quiser, ofenda jogadores ou faça spam, o Chat Global funciona exclusivamente por convites de partida:
            </p>
            <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
              <li><strong>Digitação bloqueada:</strong> Não é permitido digitar mensagens de texto neste chat. Apenas partidas públicas podem ser enviadas.</li>
              <li><strong>Proibido falar o que quiser ou burlar regras:</strong> É proibido usar nomes de usuário ofensivos, divulgar links no perfil ou criar salas repetidas para flood/spam.</li>
              <li><strong>Remoção automática:</strong> Assim que um adversário clicar em <strong>Aceitar Partida</strong>, o convite desaparece automaticamente do Chat Global para todo mundo.</li>
              <li><strong>Jogo limpo e respeito:</strong> Respeite o valor de pontos combinado e jogue honestamente (sistema antifraude ativo).</li>
              <li><strong>Punições severas:</strong> Quem tentar burlar as regras ou abusar do sistema receberá advertência, suspensão ou banimento definitivo.</li>
            </ol>
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 mt-2">
              Use apenas os botões abaixo para enviar ou aceitar partidas em tempo real.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              Biel — Dono e administrador do Earn Easy
            </p>
          </div>

          {/* Feed ao vivo de partidas publicadas no Global */}
          <div className="flex-1 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {globalInvites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 py-10 px-4 text-center space-y-1.5 text-slate-500 dark:text-zinc-400">
                <Gamepad2 className="w-7 h-7 mx-auto opacity-45" />
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Nenhuma partida aguardando adversário no Chat Global agora.
                </p>
                <p className="text-[11px]">
                  Envie uma partida logo abaixo! Ela aparecerá aqui e sumirá assim que alguém aceitar.
                </p>
              </div>
            ) : (
              globalInvites.map((invite) => {
                const isMine = invite.hostUid === uid;
                const notEnoughBalance = (userAccount?.pointsBalance || 0) < invite.stakePoints;
                return (
                  <div
                    key={invite.roomCode}
                    className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isMine
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProfileAvatar
                        name={invite.hostDisplayName}
                        photoURL={invite.hostPhotoURL}
                        sizeClass="w-10 h-10"
                        textSizeClass="text-xs"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-zinc-100 truncate">
                            {invite.hostDisplayName} {isMine ? '(Você)' : ''}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-lime-400 text-[10px] font-bold">
                            <Globe className="w-3 h-3" />
                            Sala Pública
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-zinc-300">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {MULTIPLAYER_GAME_LABELS[invite.gameId] || invite.gameId}
                          </span>
                          <span>·</span>
                          <span>{invite.totalRounds} rodada(s)</span>
                          <span>·</span>
                          <span className="font-mono font-extrabold text-emerald-700 dark:text-lime-400">
                            {invite.stakePoints === 0
                              ? 'Amistoso (0 pts)'
                              : `Valendo ${formatPoints(invite.stakePoints)} pts`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isMine ? (
                        <>
                          {onNavigatePlayFriends && (
                            <button
                              type="button"
                              onClick={onNavigatePlayFriends}
                              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                            >
                              <DoorOpen className="w-3.5 h-3.5" />
                              Ir para Sala
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (room && room.roomCode === invite.roomCode) {
                                leaveRoom();
                              } else {
                                publishToGlobal(false);
                              }
                            }}
                            className="min-h-[38px] px-3 py-2 rounded-xl border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={notEnoughBalance}
                          onClick={() => handleAcceptGlobalMatch(invite.roomCode)}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Swords className="w-4 h-4" />
                          {notEnoughBalance
                            ? `Precisa de ${formatPoints(invite.stakePoints)} pts`
                            : 'Aceitar Partida'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Área inferior bloqueada para texto — apenas envio estruturado de partidas */}
          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-3">
            <div className="rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 px-3.5 py-2.5 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-300">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Campo de texto desativado no Chat Global. Use o painel abaixo apenas para enviar uma partida:
              </span>
            </div>

            {room && room.status === 'lobby' && room.hostUid === uid && room.players.length < 2 ? (
              <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/25 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs">
                  <p className="font-extrabold text-slate-900 dark:text-white">
                    Você já tem uma sala aberta ({room.roomCode} · {MULTIPLAYER_GAME_LABELS[room.gameId]})
                  </p>
                  <p className="text-slate-600 dark:text-zinc-300">
                    {room.postedToGlobal
                      ? 'Sua partida já está no Chat Global aguardando um adversário aceitar.'
                      : 'Publique sua sala atual no Chat Global com 1 clique.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {onNavigatePlayFriends && (
                    <button
                      type="button"
                      onClick={onNavigatePlayFriends}
                      className="min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-800 dark:text-zinc-200 cursor-pointer"
                    >
                      Abrir Sala
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => publishToGlobal(!room.postedToGlobal)}
                    className={`min-h-[38px] px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
                      room.postedToGlobal
                        ? 'bg-amber-500/20 border border-amber-400/50 text-amber-500'
                        : 'bg-lime-400 hover:bg-lime-300 text-slate-950'
                    }`}
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    {room.postedToGlobal ? 'Remover do Global' : 'Enviar Minha Sala ao Global'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Jogo</span>
                  <select
                    value={globalGameId}
                    onChange={(e) => setGlobalGameId(e.target.value as MultiplayerGameId)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-bold text-slate-900 dark:text-zinc-100"
                  >
                    {MULTIPLAYER_CATALOG.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">Rodadas</span>
                  <select
                    value={globalRounds}
                    onChange={(e) => setGlobalRounds(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-bold text-slate-900 dark:text-zinc-100"
                  >
                    {[1, 3, 5, 7].map((r) => (
                      <option key={r} value={r}>
                        {r} {r === 1 ? 'rodada' : 'rodadas'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                    Valendo (pts)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={userAccount?.pointsBalance || 0}
                    value={globalStake}
                    onChange={(e) => setGlobalStake(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono font-bold text-emerald-700 dark:text-lime-400"
                  />
                </label>

                <button
                  type="button"
                  disabled={!wsConnected || (room !== null && room.status === 'playing')}
                  onClick={handlePublishGlobalMatch}
                  className="h-10 px-4 rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                >
                  <Megaphone className="w-4 h-4" />
                  Enviar Partida Global
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
