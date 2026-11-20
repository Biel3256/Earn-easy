import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { MessageCircle, Search, Send, Users, UserPlus, Check, X, Circle } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

type PublicProfile = { uid: string; displayName: string; photoURL?: string; status?: string };
type SocialMessage = { id: string; senderUid: string; senderName: string; text: string; createdAt?: { toDate?: () => Date } };
type FriendRequest = { id: string; senderUid: string; recipientUid: string; senderName: string; recipientName: string; status: string };

const safeText = (value: string) => value.trim().slice(0, 500);
const friendshipId = (a: string, b: string) => [a, b].sort().join('__');

export function SocialSection() {
  const { firebaseUser, userAccount } = useAuth();
  const uid = firebaseUser?.uid || '';
  const myName = userAccount?.displayName || firebaseUser?.displayName || 'Jogador';
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<PublicProfile[]>([]);\n  const [presence, setPresence] = useState<Record<string, number>>({});
  const [selectedFriend, setSelectedFriend] = useState<PublicProfile | null>(null);
  const [privateMessages, setPrivateMessages] = useState<SocialMessage[]>([]);
  const [globalMessages, setGlobalMessages] = useState<SocialMessage[]>([]);
  const [privateDraft, setPrivateDraft] = useState('');
  const [globalDraft, setGlobalDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'friends' | 'global'>('friends');

  useEffect(() => {
    if (!uid) return;
    const presenceRef = doc(db, 'socialPresence', uid);
    const beat = () => setDoc(presenceRef, { uid, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    beat();
    const timer = window.setInterval(beat, 45000);
    return () => window.clearInterval(timer);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const reqQuery = query(collection(db, 'friendRequests'), where('participantUids', 'array-contains', uid), limit(100));
    return onSnapshot(reqQuery, (snap) => {
      setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() } as FriendRequest)));
    }, () => setError('Não foi possível carregar as solicitações de amizade.'));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const friendQuery = query(collection(db, 'friendships'), where('memberUids', 'array-contains', uid), limit(100));
    return onSnapshot(friendQuery, async (snap) => {
      const profiles = await Promise.all(snap.docs.map(async (item) => {
        const otherUid = (item.data().memberUids as string[]).find((member) => member !== uid);
        if (!otherUid) return null;
        const profileSnap = await getDoc(doc(db, 'leaderboard', otherUid));
        if (!profileSnap.exists()) return { uid: otherUid, displayName: 'Usuário' } as PublicProfile;
        return profileSnap.data() as PublicProfile;
      }));
      setFriends(profiles.filter((profile): profile is PublicProfile => Boolean(profile)));
    }, () => setError('Não foi possível carregar seus amigos.'));
  }, [uid]);

  useEffect(() => {
    const globalQuery = query(collection(db, 'globalMessages'), orderBy('createdAt', 'desc'), limit(60));
    return onSnapshot(globalQuery, (snap) => {
      setGlobalMessages(snap.docs.map((item) => ({ id: item.id, ...item.data() } as SocialMessage)).reverse());
    }, () => setError('Não foi possível carregar o chat global.'));
  }, []);

  useEffect(() => {
    if (!uid || !selectedFriend) { setPrivateMessages([]); return; }
    const chatId = friendshipId(uid, selectedFriend.uid);
    const messagesQuery = query(collection(db, 'friendships', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
    return onSnapshot(messagesQuery, (snap) => {
      setPrivateMessages(snap.docs.map((item) => ({ id: item.id, ...item.data() } as SocialMessage)));
    }, () => setError('Não foi possível carregar a conversa privada.'));
  }, [uid, selectedFriend?.uid]);

  const pendingIncoming = useMemo(() => requests.filter((item) => item.recipientUid === uid && item.status === 'pending'), [requests, uid]);
  const sentRequests = useMemo(() => requests.filter((item) => item.senderUid === uid && item.status === 'pending'), [requests, uid]);

  const searchUsers = async () => {
    if (!uid) return;
    const term = searchText.trim();
    if (term.length < 2) { setError('Digite pelo menos 2 caracteres para buscar.'); return; }
    setSearching(true); setError(''); setSearchResults([]);
    try {
      if (/^[a-zA-Z0-9_-]{15,128}$/.test(term)) {
        const profile = await getDoc(doc(db, 'leaderboard', term));
        if (profile.exists() && term !== uid && profile.data().status === 'active') {
          setSearchResults([profile.data() as PublicProfile]);
        }
      } else {
        const peopleQuery = query(
          collection(db, 'leaderboard'),
          where('brlBalanceCents', '>=', 0),
          where('displayName', '>=', term),
          where('displayName', '<=', term + '\uf8ff'),
          orderBy('displayName'),
          limit(20),
        );
        const snap = await getDocs(peopleQuery);
        setSearchResults(snap.docs.map((item) => item.data() as PublicProfile).filter((profile) => profile.uid !== uid && profile.status === 'active'));
      }
    } catch {
      setError('Falha na busca. Tente novamente em instantes.');
    } finally { setSearching(false); }
  };

  const sendRequest = async (profile: PublicProfile) => {
    if (!uid || !profile.uid || busy) return;
    setBusy(true); setError('');
    try {
      const requestId = friendshipId(uid, profile.uid);
      await setDoc(doc(db, 'friendRequests', requestId), {
        senderUid: uid, recipientUid: profile.uid, senderName: myName,
        recipientName: profile.displayName, participantUids: [uid, profile.uid],
        status: 'pending', createdAt: serverTimestamp(),
      });
    } catch { setError('Não foi possível enviar. Talvez já exista uma solicitação.'); }
    finally { setBusy(false); }
  };

  const respondRequest = async (request: FriendRequest, accept: boolean) => {
    if (!uid || busy) return;
    setBusy(true); setError('');
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
    } catch { setError('Não foi possível responder à solicitação.'); }
    finally { setBusy(false); }
  };

  const sendGlobal = async () => {
    const text = safeText(globalDraft);
    if (!uid || !text || busy) return;
    setBusy(true); setError('');
    try {
      await addDoc(collection(db, 'globalMessages'), { senderUid: uid, senderName: myName, text, createdAt: serverTimestamp() });
      setGlobalDraft('');
    } catch { setError('Não foi possível enviar a mensagem global.'); }
    finally { setBusy(false); }
  };

  const sendPrivate = async () => {
    const text = safeText(privateDraft);
    if (!uid || !selectedFriend || !text || busy) return;
    setBusy(true); setError('');
    try {
      const chatId = friendshipId(uid, selectedFriend.uid);
      await addDoc(collection(db, 'friendships', chatId, 'messages'), { senderUid: uid, senderName: myName, text, createdAt: serverTimestamp() });
      setPrivateDraft('');
    } catch { setError('Não foi possível enviar a mensagem privada.'); }
    finally { setBusy(false); }
  };

  const online = (profileUid: string) => Boolean(presence[profileUid] && Date.now() - presence[profileUid] < 90000);
  const card = 'rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900';
  const field = 'w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500';
  const button = 'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50';

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Comunidade Earn Easy</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Adicione amigos, converse no privado ou participe do chat global.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      <div className={card + ' p-4 space-y-3'}>
        <h2 className="flex items-center gap-2 font-bold"><Search className="h-4 w-4" /> Encontrar pessoas</h2>
        <div className="flex gap-2">
          <input className={field} value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && searchUsers()} placeholder="Nome do perfil ou ID do usuário" />
          <button className={button} onClick={searchUsers} disabled={searching}><Search className="h-4 w-4" />{searching ? 'Buscando' : 'Buscar'}</button>
        </div>
        {searchResults.map((profile) => (
          <div key={profile.uid} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-zinc-800">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{profile.displayName}</p><p className="truncate text-xs text-slate-500">{profile.uid}</p></div>
            <button className={button} onClick={() => sendRequest(profile)} disabled={busy || friends.some((friend) => friend.uid === profile.uid) || sentRequests.some((request) => request.recipientUid === profile.uid)}><UserPlus className="h-4 w-4" /> Adicionar</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button className={tab === 'friends' ? button : 'rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-zinc-700'} onClick={() => setTab('friends')}><Users className="inline h-4 w-4 mr-1" /> Amigos e privado</button>
        <button className={tab === 'global' ? button : 'rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-zinc-700'} onClick={() => setTab('global')}><MessageCircle className="inline h-4 w-4 mr-1" /> Chat global</button>
      </div>
      {tab === 'friends' ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className={card + ' p-4 space-y-3'}>
            <h2 className="font-bold">Solicitações recebidas ({pendingIncoming.length})</h2>
            {pendingIncoming.map((request) => <div key={request.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{request.senderName}</span><span className="flex gap-1"><button title="Aceitar" className="rounded-md bg-emerald-600 p-2 text-white" onClick={() => respondRequest(request, true)}><Check className="h-4 w-4" /></button><button title="Recusar" className="rounded-md bg-red-600 p-2 text-white" onClick={() => respondRequest(request, false)}><X className="h-4 w-4" /></button></span></div>)}
            {pendingIncoming.length === 0 && <p className="text-xs text-slate-500">Nenhuma solicitação pendente.</p>}
            <h2 className="border-t border-slate-200 pt-3 font-bold dark:border-zinc-800">Meus amigos ({friends.length})</h2>
            {friends.map((friend) => <button key={friend.uid} onClick={() => setSelectedFriend(friend)} className={'w-full rounded-lg p-2 text-left text-sm ' + (selectedFriend?.uid === friend.uid ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'hover:bg-slate-50 dark:hover:bg-zinc-800')}><span className="flex items-center gap-2"><Circle className={"h-2.5 w-2.5 " + (online(friend.uid) ? "fill-emerald-500 text-emerald-500" : "fill-slate-400 text-slate-400")} />{friend.displayName}<span className="ml-auto text-[10px] text-slate-500">{online(friend.uid) ? "online" : "offline"}</span></span></button>)}
            {friends.length === 0 && <p className="text-xs text-slate-500">Adicione alguém para começar uma conversa.</p>}
          </div>
          <div className={card + ' flex min-h-[360px] flex-col p-4'}>
            <h2 className="mb-3 font-bold">{selectedFriend ? 'Conversa com ' + selectedFriend.displayName : 'Chat privado'}</h2>
            {selectedFriend ? <>
              <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-zinc-950">
                {privateMessages.map((message) => <div key={message.id} className={'max-w-[85%] rounded-xl p-2 text-sm ' + (message.senderUid === uid ? 'ml-auto bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-white' : 'bg-white dark:bg-zinc-800')}><p className="mb-1 text-[10px] font-bold opacity-60">{message.senderName}</p>{message.text}</div>)}
                {privateMessages.length === 0 && <p className="text-center text-xs text-slate-500">Diga oi para seu amigo!</p>}
              </div>
              <div className="mt-3 flex gap-2"><input className={field} value={privateDraft} maxLength={500} onChange={(event) => setPrivateDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendPrivate()} placeholder="Escreva uma mensagem..." /><button className={button} onClick={sendPrivate} disabled={busy}><Send className="h-4 w-4" /></button></div>
            </> : <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Selecione um amigo para abrir o chat.</div>}
          </div>
        </div>
      ) : (
        <div className={card + ' flex min-h-[420px] flex-col p-4'}>
          <h2 className="mb-3 font-bold">Chat global</h2>
          <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-zinc-950">
            {globalMessages.map((message) => <div key={message.id} className="rounded-lg bg-white p-2 text-sm dark:bg-zinc-800"><p className="mb-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">{message.senderName}</p>{message.text}</div>)}
          </div>
          <div className="mt-3 flex gap-2"><input className={field} value={globalDraft} maxLength={500} onChange={(event) => setGlobalDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendGlobal()} placeholder="Mensagem para todos..." /><button className={button} onClick={sendGlobal} disabled={busy}><Send className="h-4 w-4" /></button></div>
        </div>
      )}
    </section>
  );
}
