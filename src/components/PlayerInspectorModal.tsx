import React, { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gamepad2,
  MessageCircle,
  Trophy,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { LeaderboardEntry } from '../types/earneasy';
import { calculatePlayerLevel } from '../utils/levels';
import { extractReadableError, formatBRL, formatPoints } from '../utils/pix';
import { ProfileAvatar } from './PlayerProfile';

interface PlayerInspectorModalProps {
  player: LeaderboardEntry | null;
  rank?: number | null;
  onClose: () => void;
  onGoToFriendsChat?: (uid: string) => void;
  onEditMyProfile?: () => void;
}

const pairId = (a: string, b: string) => [a, b].sort().join('__');

export const PlayerInspectorModal: React.FC<PlayerInspectorModalProps> = ({
  player,
  rank,
  onClose,
  onGoToFriendsChat,
  onEditMyProfile,
}) => {
  const { firebaseUser, userAccount } = useAuth();
  const myUid = firebaseUser?.uid || '';
  const myName = (userAccount?.displayName || firebaseUser?.displayName || 'Jogador').slice(0, 80);

  const [copiedId, setCopiedId] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [relation, setRelation] = useState<'loading' | 'self' | 'friend' | 'pending_sent' | 'pending_received' | 'none'>('loading');
  const [sendingReq, setSendingReq] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!player) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player, onClose]);

  useEffect(() => {
    if (!player) return;
    setCopiedId(false);
    setFeedback(null);

    if (!myUid) {
      setRelation('none');
      setIsOnline(false);
      return;
    }

    let cancelled = false;
    setIsOnline(false);

    if (player.uid === myUid) {
      setRelation('self');
      setIsOnline(true);
      return;
    }

    setRelation('loading');

    const loadContext = async () => {
      try {
        const pid = pairId(myUid, player.uid);
        const [presSnap, friendSnap, reqSnap] = await Promise.all([
          getDoc(doc(db, 'socialPresence', player.uid)).catch(() => null),
          getDoc(doc(db, 'friendships', pid)).catch(() => null),
          getDoc(doc(db, 'friendRequests', pid)).catch(() => null),
        ]);

        if (cancelled) return;

        if (presSnap && presSnap.exists()) {
          const lastSeen = presSnap.data().lastSeen;
          if (lastSeen && typeof lastSeen.toMillis === 'function') {
            setIsOnline(Date.now() - lastSeen.toMillis() < 90_000);
          }
        }

        if (friendSnap && friendSnap.exists()) {
          setRelation('friend');
          return;
        }

        if (reqSnap && reqSnap.exists()) {
          const data = reqSnap.data();
          if (data.status === 'pending') {
            setRelation(data.senderUid === myUid ? 'pending_sent' : 'pending_received');
            return;
          }
          if (data.status === 'accepted') {
            setRelation('friend');
            return;
          }
        }

        setRelation('none');
      } catch {
        if (!cancelled) setRelation('none');
      }
    };

    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [player, myUid]);

  if (!player) return null;

  const totalCareerPoints =
    typeof player.lifetimePoints === 'number' && Number.isFinite(player.lifetimePoints)
      ? Math.max(player.lifetimePoints, player.pointsBalance)
      : player.pointsBalance;
  const levelInfo = calculatePlayerLevel(totalCareerPoints, player.gamesPlayed);
  const avgPointsPerGame =
    player.gamesPlayed > 0 ? Math.round(totalCareerPoints / player.gamesPlayed) : 0;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(player.uid);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleAddFriend = async () => {
    if (!myUid || !player.uid || sendingReq) return;
    if (userAccount?.status !== 'active') {
      setFeedback({ type: 'err', text: 'Sua conta precisa estar ativa para enviar solicitações.' });
      return;
    }

    setSendingReq(true);
    setFeedback(null);
    try {
      const requestId = pairId(myUid, player.uid);
      const requestRef = doc(db, 'friendRequests', requestId);
      const existingSnap = await getDoc(requestRef);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        if (existingData.status === 'rejected' && existingData.senderUid === myUid) {
          await updateDoc(requestRef, {
            status: 'pending',
            createdAt: serverTimestamp(),
            respondedAt: null,
          });
        } else {
          setFeedback({ type: 'err', text: 'Já existe uma solicitação ou amizade ativa com este jogador.' });
          return;
        }
      } else {
        await setDoc(requestRef, {
          senderUid: myUid,
          recipientUid: player.uid,
          senderName: myName,
          recipientName: (player.displayName || 'Jogador').slice(0, 80),
          participantUids: [myUid, player.uid],
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
      setRelation('pending_sent');
      setFeedback({ type: 'ok', text: `Solicitação de amizade enviada para ${player.displayName}!` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableError(err, 'Não foi possível enviar a solicitação agora.'),
      });
    } finally {
      setSendingReq(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Estatísticas de ${player.displayName}`}
    >
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 border-t sm:border border-slate-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Mobile Sheet Grab Handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700" />
        </div>

        {/* Hero Header */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/70 text-white px-6 py-5 border-b border-white/10">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar inspetor de jogador"
            className="absolute top-4 right-4 min-w-[40px] min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-4 pr-10">
            <div className="relative shrink-0">
              <ProfileAvatar
                name={player.displayName}
                photoURL={player.photoURL}
                sizeClass="w-16 h-16 sm:w-20 sm:h-20"
                textSizeClass="text-xl"
              />
              {typeof rank === 'number' && rank > 0 && (
                <span className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-mono font-extrabold shadow">
                  #{rank}
                </span>
              )}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-display font-extrabold text-white break-words">
                  {player.displayName}
                </h2>
                {player.uid === myUid && (
                  <span className="text-[11px] font-semibold text-lime-300">· Você</span>
                )}
              </div>

              <div className="text-xs text-lime-300 font-medium flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  Nível {levelInfo.level} · {levelInfo.title}
                </span>
                <span aria-hidden="true">·</span>
                <span className={isOnline ? 'text-lime-300' : 'text-slate-400'}>
                  {isOnline ? 'Online agora' : 'Offline'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <code className="text-[11px] font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded-lg break-all">
                  ID: {player.uid}
                </code>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-lime-300 hover:text-lime-200 cursor-pointer shrink-0"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedId ? 'Copiado' : 'Copiar ID'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Body Stats */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Level Progress */}
          <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                Experiência do Jogador
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatPoints(levelInfo.xp)} XP ({levelInfo.progressPct}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
                style={{ width: `${levelInfo.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
              <span>Nível {levelInfo.level}: {levelInfo.title}</span>
              <span>
                {levelInfo.isMaxLevel
                  ? 'Nível Máximo'
                  : `Próximo: ${levelInfo.nextTitle}`}
              </span>
            </div>
          </div>

          {/* 4-Card Public Stat Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Saldo em R$</div>
              <div className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {formatBRL(player.brlBalanceCents)}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">Moedas Atuais</div>
              <div className="text-lg font-mono font-extrabold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatPoints(player.pointsBalance)}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1">
                <Gamepad2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Partidas Jogadas
              </div>
              <div className="text-lg font-mono font-extrabold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {player.gamesPlayed.toLocaleString('pt-BR')}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                Média por Partida
              </div>
              <div className="text-lg font-mono font-extrabold text-slate-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatPoints(avgPointsPerGame)} pts
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-1 text-slate-500 dark:text-zinc-400">
            <span>Pontos totais acumulados</span>
            <span className="font-mono font-bold text-slate-800 dark:text-zinc-200 tabular-nums">
              {formatPoints(totalCareerPoints)} pts
            </span>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {relation === 'self' ? (
              onEditMyProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditMyProfile();
                  }}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  Editar Meu Perfil e Foto
                </button>
              )
            ) : relation === 'friend' ? (
              onGoToFriendsChat && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToFriendsChat(player.uid);
                  }}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  Conversar no Privado
                </button>
              )
            ) : relation === 'pending_sent' ? (
              <div className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold rounded-2xl">
                <Clock className="w-4 h-4" />
                Solicitação de amizade enviada
              </div>
            ) : relation === 'pending_received' ? (
              onGoToFriendsChat && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToFriendsChat(player.uid);
                  }}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs sm:text-sm font-bold rounded-2xl transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Responder Solicitação em Amigos
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={sendingReq || relation === 'loading'}
                onClick={handleAddFriend}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-2xl transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                {relation === 'loading'
                  ? 'Verificando...'
                  : sendingReq
                    ? 'Enviando convite...'
                    : 'Adicionar Amigo'}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
