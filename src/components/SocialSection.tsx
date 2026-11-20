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
  Clock,
  Copy,
  Eye,
  MessageCircle,
  Search,
  Send,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { LeaderboardEntry } from '../types/earneasy';
import { extractReadableError } from '../utils/pix';
import { ProfileAvatar } from './PlayerProfile';

type PublicProfile = LeaderboardEntry;

type SocialMessage = {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  createdAt?: { toDate?: () => Date };
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

function formatChatTime(ts?: { toDate?: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  try {
    return ts.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
    return () => window.clearInterval(timer);
  }, [uid]);

  return null;
}

interface SocialSectionProps {
  initialSelectedUid?: string | null;
  onInspectPlayer?: (player: LeaderboardEntry, rank: number | null) => void;
}

export function SocialSection({ initialSelectedUid, onInspectPlayer }: SocialSectionProps = {}) {
  const { firebaseUser, userAccount } = useAuth();
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
  const [globalMessages, setGlobalMessages] = useState<SocialMessage[]>([]);
  const [privateDraft, setPrivateDraft] = useState('');
  const [globalDraft, setGlobalDraft] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [, refreshPresenceClock] = useState(0);
  const [tab, setTab] = useState<'friends' | 'global'>('friends');

  const privateEndRef = useRef<HTMLDivElement | null>(null);
  const globalEndRef = useRef<HTMLDivElement | null>(null);

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
    const globalQuery = query(collection(db, 'globalMessages'), orderBy('createdAt', 'desc'), limit(60));
    return onSnapshot(
      globalQuery,
      (snap) => {
        setGlobalMessages(
          snap.docs.map((item) => ({ id: item.id, ...item.data() } as SocialMessage)).reverse()
        );
      },
      () => setError('Não foi possível carregar o chat global.')
    );
  }, []);

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

  useEffect(() => {
    if (tab === 'global') {
      globalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [globalMessages.length, tab]);

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
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível enviar a solicitação agora.'));
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
      setNotice(
        accept
          ? `${request.senderName} adicionado à sua lista de amigos!`
          : `Solicitação de ${request.senderName} recusada.`
      );
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível responder à solicitação.'));
    } finally {
      setBusy(false);
    }
  };

  const sendGlobal = async () => {
    const text = safeText(globalDraft);
    if (!uid || !text || busy) return;
    if (userAccount?.status !== 'active') {
      setError('Sua conta precisa estar ativa para enviar mensagens no chat global.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await addDoc(collection(db, 'globalMessages'), {
        senderUid: uid,
        senderName: myName,
        text,
        createdAt: serverTimestamp(),
      });
      setGlobalDraft('');
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível enviar a mensagem no chat global.'));
    } finally {
      setBusy(false);
    }
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

  const isOnline = (profileUid: string) =>
    Boolean(presence[profileUid] && Date.now() - presence[profileUid] < 90_000);

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
            <MessageCircle className="w-3.5 h-3.5" />
            Chat Global
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
                    <ProfileAvatar
                      name={profile.displayName}
                      photoURL={profile.photoURL || ''}
                      sizeClass="w-9 h-9"
                      textSizeClass="text-xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                        {profile.displayName}
                      </p>
                      <p className="truncate text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        {profile.uid} · {isOnline(profile.uid) ? 'Online agora' : 'Offline'}
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
              <h2 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                Meus Amigos ({friends.length})
              </h2>

              {friends.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Use a busca acima para adicionar alguém e conversar no privado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {friends.map((friend) => {
                    const active = selectedFriend?.uid === friend.uid;
                    const friendOnline = isOnline(friend.uid);
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
                          <ProfileAvatar
                            name={friend.displayName}
                            photoURL={friend.photoURL || ''}
                            sizeClass="w-8 h-8"
                            textSizeClass="text-[11px]"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold">{friend.displayName}</div>
                            <div
                              className={`text-[11px] ${
                                friendOnline
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : 'text-slate-400 dark:text-zinc-500'
                              }`}
                            >
                              {friendOnline ? 'Online' : 'Offline'}
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
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
                  {selectedFriend ? `Conversa com ${selectedFriend.displayName}` : 'Chat Privado'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {selectedFriend
                    ? isOnline(selectedFriend.uid)
                      ? 'Online agora'
                      : 'Offline no momento'
                    : 'Selecione um amigo na lista ao lado para conversar'}
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
                          <span className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                            {mine ? 'Você' : message.senderName}
                            {timeLabel ? ` · ${timeLabel}` : ''}
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
        <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-slate-200/90 dark:border-zinc-800 rounded-3xl p-5 flex min-h-[440px] max-h-[580px] flex-col shadow-sm">
          <div className="pb-3 border-b border-slate-100 dark:border-zinc-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
              Chat Global da Comunidade
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Converse com outros jogadores ativos do Earn Easy em tempo real.
            </p>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto py-4 pr-1">
            {globalMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-zinc-400">
                Nenhuma mensagem ainda. Seja o primeiro a dar um oi!
              </div>
            ) : (
              globalMessages.map((message) => {
                const mine = message.senderUid === uid;
                const timeLabel = formatChatTime(message.createdAt);
                return (
                  <div
                    key={message.id}
                    className={`rounded-xl px-3.5 py-2.5 text-sm border ${
                      mine
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-900/60'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200/80 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        {message.senderName}
                      </span>
                      {timeLabel && (
                        <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                          {timeLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-800 dark:text-zinc-200 break-words">{message.text}</p>
                  </div>
                );
              })
            )}
            <div ref={globalEndRef} />
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
            <input
              type="text"
              value={globalDraft}
              maxLength={500}
              onChange={(event) => setGlobalDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && sendGlobal()}
              placeholder="Escreva uma mensagem para a comunidade..."
              className="flex-1 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={sendGlobal}
              disabled={busy || !globalDraft.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
