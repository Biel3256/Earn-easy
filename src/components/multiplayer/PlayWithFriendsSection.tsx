import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Crown,
  DoorOpen,
  Flag,
  Gamepad2,
  Globe,
  Handshake,
  History,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Swords,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMultiplayer } from '../../context/MultiplayerContext';
import { useToast } from '../../context/ToastContext';
import {
  MULTIPLAYER_GAME_LABELS,
  MultiplayerGameId,
  RoomVisibility,
} from '../../types/earneasy';
import { formatPoints } from '../../utils/pix';
import { ProfileAvatar } from '../PlayerProfile';
import { MultiplayerGameBoards } from './MultiplayerGameBoards';
import { MULTIPLAYER_CATALOG } from './multiplayerCatalog';

const ROUND_OPTIONS = [1, 3, 5, 7];
const STAKE_PRESETS = [0, 50, 100, 250, 500, 1000];

export const PlayWithFriendsSection: React.FC = React.memo(() => {
  const { userAccount, myMultiplayerMatches } = useAuth();
  const {
    wsConnected,
    room,
    publicRooms,
    settlingMatchId,
    settledSummary,
    clearSettledSummary,
    sendWs,
    createRoom,
    joinRoom,
    leaveRoom,
    publishToGlobal,
  } = useMultiplayer();
  const { showToast } = useToast();

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [selectedCreateGame, setSelectedCreateGame] = useState<MultiplayerGameId>('domino');
  const [createRounds, setCreateRounds] = useState<number>(3);
  const [createStake, setCreateStake] = useState<string>('100');
  const [createVisibility, setCreateVisibility] = useState<RoomVisibility>('public');
  const [alsoPostGlobal, setAlsoPostGlobal] = useState<boolean>(true);
  const [publicFilterGame, setPublicFilterGame] = useState<string>('all');
  const [counterStakeInput, setCounterStakeInput] = useState<string>('');
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);

  const myPlayer = useMemo(() => {
    if (!room || !userAccount) return null;
    return room.players.find((p) => p.uid === userAccount.uid) || null;
  }, [room, userAccount]);

  const filteredPublicRooms = useMemo(() => {
    if (publicFilterGame === 'all') return publicRooms;
    return publicRooms.filter((r) => r.gameId === publicFilterGame);
  }, [publicRooms, publicFilterGame]);

  const handleCreateRoom = (gameOverride?: MultiplayerGameId) => {
    if (!userAccount) return;
    const gameId = gameOverride || selectedCreateGame;
    const stake = Math.max(0, Math.min(userAccount.pointsBalance, Math.floor(Number(createStake || 0))));
    if (stake > userAccount.pointsBalance) {
      showToast({
        type: 'error',
        title: 'Saldo insuficiente',
        message: 'Escolha uma aposta menor ou igual ao seu saldo de pontos.',
      });
      return;
    }
    createRoom({
      gameId,
      totalRounds: createRounds,
      stakePoints: stake,
      visibility: createVisibility,
      postToGlobal: createVisibility === 'public' && alsoPostGlobal,
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAccount) return;
    joinRoom(joinCodeInput);
  };

  const handleCopyRoomCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedRoomCode(true);
      showToast({
        type: 'success',
        title: 'Código copiado!',
        message: `Envie ${room.roomCode} para seu amigo entrar na sala.`,
      });
      setTimeout(() => setCopiedRoomCode(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  if (!userAccount) return null;

  /* ============================================================================
   * TELA DENTRO DA SALA (LOBBY / JOGANDO / FINALIZADO)
   * ==========================================================================*/
  if (room) {
    const isHost = room.hostUid === userAccount.uid;
    const currentGameMeta = MULTIPLAYER_CATALOG.find((c) => c.id === room.gameId);
    const allConnected = room.players.length === 2 && room.players.every((p) => p.connected);
    const allAccepted = room.players.length === 2 && room.players.every((p) => p.acceptedRules);
    const allHaveBalance = room.players.every((p) => p.pointsBalance >= room.stakePoints);
    const canStart = isHost && allConnected && allAccepted && allHaveBalance && room.stakeStatus === 'agreed';

    return (
      <div className="space-y-5">
        {/* Room Header Bar */}
        <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0e1319] p-4 sm:p-5 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-lime-400/15 border border-lime-400/40 text-lime-500 flex items-center justify-center shrink-0">
              <Swords className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  {MULTIPLAYER_GAME_LABELS[room.gameId]}
                </h2>
                <button
                  type="button"
                  onClick={handleCopyRoomCode}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-mono text-xs font-black cursor-pointer"
                >
                  {copiedRoomCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {room.roomCode}
                </button>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                    room.visibility === 'public'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                      : 'bg-slate-200/70 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  {room.visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {room.visibility === 'public' ? 'Sala Pública' : 'Sala Privada'}
                </span>
                {room.postedToGlobal && room.players.length < 2 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/15 border border-amber-400/40 text-amber-400">
                    <Megaphone className="w-3 h-3" />
                    No Chat Global
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {room.status === 'lobby'
                  ? `${room.visibility === 'public' ? 'Sala Pública' : 'Sala Privada'} · ${room.totalRounds} rodada(s) · Aposta: ${formatPoints(room.stakePoints)} pts`
                  : room.status === 'playing'
                    ? `Rodada ${room.currentRound} de ${room.totalRounds} · Em disputa: ${formatPoints(room.stakePoints)} pts`
                    : 'Partida Encerrada'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border ${
                wsConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {wsConnected ? 'Ao vivo' : 'Reconectando'}
            </span>

            {room.status === 'playing' && (
              <button
                type="button"
                onClick={() => sendWs('room:forfeit')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-500 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                Desistir
              </button>
            )}

            <button
              type="button"
              onClick={leaveRoom}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair da Sala
            </button>
          </div>
        </div>

        {/* Players Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1].map((slot) => {
            const p = room.players[slot];
            if (!p) {
              return (
                <div
                  key={slot}
                  className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 bg-white/60 dark:bg-[#090d12]/70 p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-slate-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700 dark:text-zinc-200">
                        {room.visibility === 'public'
                          ? 'Aguardando adversário aceitar...'
                          : 'Aguardando amigo entrar...'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {room.visibility === 'public'
                          ? room.postedToGlobal
                            ? 'Partida visível nas Salas Públicas e no Chat Global (some ao aceitar).'
                            : 'Visível na lista de Salas Públicas ou pelo código '
                          : 'Compartilhe o código '}
                        {(!room.postedToGlobal || room.visibility === 'private') && (
                          <span className="font-mono font-bold text-lime-500">{room.roomCode}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            const isMe = p.uid === userAccount.uid;
            return (
              <div
                key={p.uid}
                className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                  isMe
                    ? 'bg-emerald-50/70 dark:bg-[#0e1712] border-emerald-300 dark:border-lime-500/40'
                    : 'bg-white/95 dark:bg-[#0e1319]/95 border-slate-200 dark:border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ProfileAvatar
                    name={p.displayName}
                    photoURL={p.photoURL}
                    sizeClass="w-11 h-11"
                    textSizeClass="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                        {p.displayName} {isMe ? '(Você)' : ''}
                      </span>
                      {p.isHost && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-400 text-[10px] font-bold">
                          <Crown className="w-3 h-3" /> Anfitrião
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          p.connected ? 'text-emerald-500' : 'text-red-400'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            p.connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                          }`}
                        />
                        {p.connected ? 'Conectado' : 'Desconectado'}
                      </span>
                      <span className="text-slate-500 dark:text-zinc-400 font-mono">
                        Saldo: {formatPoints(p.pointsBalance)} pts
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {room.status === 'lobby' ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-extrabold ${
                        p.acceptedRules
                          ? 'bg-lime-400/20 text-lime-500 border border-lime-400/40'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {p.acceptedRules ? 'Aceitou ✓' : 'Pendente'}
                    </span>
                  ) : (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Placar</span>
                      <p className="text-xl font-mono font-black text-lime-400">{p.score}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* LOBBY CONFIGURATION & WAGER NEGOTIATION */}
        {room.status === 'lobby' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Regras da Sala */}
            <div className="lg:col-span-7 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-lime-400" />
                  Configuração da Partida
                </h3>
                {!isHost && (
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Editável pelo Anfitrião
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Jogo Selecionado
                  </span>
                  <select
                    disabled={!isHost}
                    value={room.gameId}
                    onChange={(e) => sendWs('room:config', { gameId: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-[#090d12] text-xs font-bold text-slate-900 dark:text-white disabled:opacity-70"
                  >
                    {MULTIPLAYER_CATALOG.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Número de Rodadas
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ROUND_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={!isHost}
                        onClick={() => sendWs('room:config', { totalRounds: r })}
                        className={`h-11 rounded-xl border text-xs font-black transition-colors cursor-pointer disabled:opacity-70 ${
                          room.totalRounds === r
                            ? 'bg-lime-400 text-slate-950 border-lime-300'
                            : 'bg-slate-50 dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                        }`}
                      >
                        {r}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {isHost && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Definir Pontos em Disputa (0 = Amistoso)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {STAKE_PRESETS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          disabled={amt > userAccount.pointsBalance}
                          onClick={() => sendWs('room:config', { stakePoints: amt })}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-35 ${
                            room.stakePoints === amt
                              ? 'bg-lime-400 text-slate-950 border-lime-300'
                              : 'bg-slate-50 dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                          }`}
                        >
                          {amt === 0 ? 'Amistoso (0)' : `${amt} pts`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {room.players.length < 2 && (
                    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] p-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => sendWs('room:config', { visibility: 'public' })}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                            room.visibility === 'public'
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                              : 'bg-transparent border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5" />
                          Pública
                        </button>
                        <button
                          type="button"
                          onClick={() => sendWs('room:config', { visibility: 'private' })}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                            room.visibility === 'private'
                              ? 'bg-slate-900 dark:bg-zinc-800 border-slate-700 text-white'
                              : 'bg-transparent border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Privada
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => publishToGlobal(!room.postedToGlobal)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          room.postedToGlobal
                            ? 'bg-amber-500/20 border border-amber-400/50 text-amber-400 hover:bg-amber-500/30'
                            : 'bg-lime-400 hover:bg-lime-300 text-slate-950'
                        }`}
                      >
                        <Megaphone className="w-3.5 h-3.5" />
                        {room.postedToGlobal ? 'Remover do Chat Global' : 'Enviar Partida no Chat Global'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {currentGameMeta && (
                <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] p-3 text-xs text-slate-600 dark:text-zinc-300">
                  <span className="font-bold text-slate-900 dark:text-white">Regras: </span>
                  {currentGameMeta.rulesHint}
                </div>
              )}
            </div>

            {/* Negociação de Pontos & Botão Iniciar */}
            <div className="lg:col-span-5 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Handshake className="w-4 h-4 text-lime-400" />
                  Acordo de Pontos Virtuais
                </h3>

                <div className="rounded-2xl border border-lime-400/30 bg-lime-400/10 p-4 text-center space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-lime-700 dark:text-lime-300">
                    Valor Atual da Partida
                  </span>
                  <p className="text-2xl font-mono font-black text-slate-900 dark:text-white">
                    {room.stakePoints === 0 ? 'Amistoso (0 pts)' : `${formatPoints(room.stakePoints)} pts`}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-zinc-300">
                    Transferido do perdedor para o vencedor somente após confirmação no servidor.
                  </p>
                </div>

                {/* Contraproposta pendente */}
                {room.stakeStatus === 'counter_proposed' && room.proposedCounterPoints !== null && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3.5 space-y-2.5">
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-300">
                      Contraproposta recebida: {formatPoints(room.proposedCounterPoints)} pts
                    </p>
                    {isHost ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => sendWs('room:stake_respond', { accept: true })}
                          className="min-h-[40px] rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Aceitar
                        </button>
                        <button
                          type="button"
                          onClick={() => sendWs('room:stake_respond', { accept: false })}
                          className="min-h-[40px] rounded-xl border border-red-400/50 bg-red-500/15 text-red-400 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Recusar
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-500">
                        Aguardando o anfitrião aceitar ou recusar sua contraproposta...
                      </p>
                    )}
                  </div>
                )}

                {room.stakeStatus === 'rejected' && (
                  <p className="text-xs font-semibold text-red-400">
                    Contraproposta recusada. O adversário pode aceitar {formatPoints(room.stakePoints)} pts ou enviar outro valor.
                  </p>
                )}

                {/* Controles do Adversário */}
                {!isHost && room.players.length === 2 && !myPlayer?.acceptedRules && (
                  <div className="space-y-3 pt-1">
                    <button
                      type="button"
                      disabled={userAccount.pointsBalance < room.stakePoints}
                      onClick={() => sendWs('room:stake_accept')}
                      className="w-full min-h-[44px] rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Aceitar Regras e {formatPoints(room.stakePoints)} pts
                    </button>

                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        max={userAccount.pointsBalance}
                        value={counterStakeInput}
                        onChange={(e) => setCounterStakeInput(e.target.value)}
                        placeholder="Contraproposta (pts)"
                        className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-[#090d12] text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const n = Math.max(0, Math.floor(Number(counterStakeInput || 0)));
                          sendWs('room:stake_counter', { counterPoints: n });
                        }}
                        className="min-h-[40px] px-3 rounded-xl border border-amber-400/50 bg-amber-500/15 text-amber-400 text-xs font-bold cursor-pointer"
                      >
                        Contrapropor
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botão Iniciar Partida */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                {isHost ? (
                  <>
                    <button
                      type="button"
                      disabled={!canStart}
                      onClick={() => sendWs('room:start')}
                      className="w-full min-h-[48px] rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer transition-all shadow-lg shadow-lime-500/20"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Iniciar Partida
                    </button>
                    {!canStart && (
                      <p className="text-[11px] text-center text-slate-500 dark:text-zinc-400">
                        {room.players.length < 2
                          ? 'Convide 1 amigo usando o código acima.'
                          : !allConnected
                            ? 'Todos os jogadores precisam estar conectados.'
                            : !allHaveBalance
                              ? 'Saldo insuficiente para a aposta combinada.'
                              : 'Aguardando o amigo aceitar as regras e pontos.'}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-center text-xs font-semibold text-slate-500 dark:text-zinc-400 py-2">
                    {myPlayer?.acceptedRules
                      ? 'Tudo certo! Aguardando o anfitrião iniciar a partida.'
                      : 'Aceite as regras acima ou envie uma contraproposta.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* JOGO ATIVO */}
        {room.status === 'playing' && (
          <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0e1319] p-4 sm:p-6 shadow-xl">
            <MultiplayerGameBoards
              room={room}
              myUid={userAccount.uid}
              onGameAction={(payload) => sendWs('game:action', payload)}
              onNextRound={() => sendWs('game:next_round')}
            />
          </div>
        )}

        {/* PARTIDA FINALIZADA */}
        {room.status === 'finished' && room.settlement && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-lime-400/40 bg-gradient-to-br from-[#0e1911] via-[#0b1015] to-[#090d12] p-6 sm:p-8 text-center space-y-5 shadow-2xl text-white"
          >
            <div className="w-16 h-16 rounded-2xl bg-lime-400/20 border border-lime-400/50 text-lime-400 flex items-center justify-center mx-auto">
              <Crown className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                Resultado Validado pelo Servidor
              </span>
              <h3 className="text-2xl font-black">
                {room.settlement.isDraw
                  ? 'Empate Geral!'
                  : room.settlement.winnerUid === userAccount.uid
                    ? 'Você Venceu a Partida!'
                    : `${room.players.find((p) => p.uid === room.settlement?.winnerUid)?.displayName || 'Adversário'} Venceu!`}
              </h3>
              <p className="text-xs text-zinc-300">
                {settlingMatchId === room.settlement.matchId
                  ? 'Validando e registrando pontuação no banco de dados...'
                  : settledSummary && settledSummary.transferredPoints > 0
                    ? room.settlement.winnerUid === userAccount.uid
                      ? `+${formatPoints(settledSummary.transferredPoints)} pontos creditados na sua conta!`
                      : `${formatPoints(settledSummary.transferredPoints)} pontos transferidos ao vencedor.`
                    : 'Partida amistosa concluída sem alteração de saldo.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              {room.players.map((p) => (
                <div
                  key={p.uid}
                  className={`rounded-2xl border p-3.5 ${
                    p.uid === room.settlement?.winnerUid
                      ? 'border-lime-400 bg-lime-400/15'
                      : 'border-zinc-800 bg-zinc-900/70'
                  }`}
                >
                  <p className="text-xs font-bold text-zinc-300 truncate">{p.displayName}</p>
                  <p className="text-2xl font-mono font-black text-lime-400 mt-0.5">{p.score}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  clearSettledSummary();
                  sendWs('room:rematch');
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Jogar Novamente
              </button>
              <button
                type="button"
                onClick={leaveRoom}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <DoorOpen className="w-4 h-4" />
                Voltar ao Catálogo
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  /* ============================================================================
   * HUB PRINCIPAL: JOGAR COM AMIGOS (CATÁLOGO + CRIAR/ENTRAR SALA)
   * ==========================================================================*/
  return (
    <div className="space-y-6">
      {/* Hero & Lobby Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Criar Sala (Pública ou Privada) */}
        <div className="lg:col-span-7 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-[#0e1a12] via-[#0b1016] to-[#080c10] p-5 sm:p-6 text-white shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-lime-400/20 border border-lime-400/40 text-lime-400 flex items-center justify-center">
                <Swords className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-black tracking-tight">JOGAR ONLINE</h2>
                <p className="text-xs text-zinc-400">
                  11 jogos multiplayer com Salas Públicas, Salas Privadas e aposta segura
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                wsConnected
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-lime-400 animate-pulse' : 'bg-amber-400'}`} />
              {wsConnected ? 'Servidor Online' : 'Conectando...'}
            </span>
          </div>

          {/* Modo da Sala: Pública vs Privada */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCreateVisibility('public')}
              className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                createVisibility === 'public'
                  ? 'border-lime-400 bg-lime-400/15 text-white'
                  : 'border-zinc-800 bg-[#070a0d] text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-extrabold">
                <Globe className={`w-4 h-4 ${createVisibility === 'public' ? 'text-lime-400' : 'text-zinc-500'}`} />
                Sala Pública
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Qualquer jogador pode entrar na lista pública sem código.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setCreateVisibility('private')}
              className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                createVisibility === 'private'
                  ? 'border-lime-400 bg-lime-400/15 text-white'
                  : 'border-zinc-800 bg-[#070a0d] text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-extrabold">
                <Lock className={`w-4 h-4 ${createVisibility === 'private' ? 'text-lime-400' : 'text-zinc-500'}`} />
                Sala Privada
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Apenas amigos com o código exclusivo EE-XXXXXX podem entrar.
              </p>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Jogo</span>
              <select
                value={selectedCreateGame}
                onChange={(e) => setSelectedCreateGame(e.target.value as MultiplayerGameId)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-700 bg-[#070a0d] text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-lime-400"
              >
                {MULTIPLAYER_CATALOG.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Rodadas</span>
              <select
                value={createRounds}
                onChange={(e) => setCreateRounds(Number(e.target.value))}
                className="w-full h-11 px-3 rounded-xl border border-zinc-700 bg-[#070a0d] text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-lime-400"
              >
                {ROUND_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} {r === 1 ? 'rodada' : 'rodadas'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Valendo (pts)
              </span>
              <input
                type="number"
                min={0}
                max={userAccount.pointsBalance}
                value={createStake}
                onChange={(e) => setCreateStake(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-700 bg-[#070a0d] text-xs font-mono font-bold text-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400"
              />
            </label>
          </div>

          {createVisibility === 'public' && (
            <label className="flex items-center gap-2.5 text-xs text-zinc-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alsoPostGlobal}
                onChange={(e) => setAlsoPostGlobal(e.target.checked)}
                className="w-4 h-4 accent-lime-400 rounded cursor-pointer"
              />
              <span>Enviar partida automaticamente no Chat Global (some ao ser aceita)</span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-300">
              <Coins className="w-4 h-4 text-lime-400" />
              Seu saldo: <strong className="font-mono text-white">{formatPoints(userAccount.pointsBalance)} pts</strong>
            </div>
            <button
              type="button"
              onClick={() => handleCreateRoom()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-lime-500/20"
            >
              <Plus className="w-4 h-4" />
              {createVisibility === 'public' ? 'Criar Sala Pública' : 'Criar Sala Privada'}
            </button>
          </div>
        </div>

        {/* Entrar com Código */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-lg">
          <div className="space-y-1.5">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-lime-500" />
              Entrar com Código
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Cole o código exclusivo enviado pelo seu amigo para entrar em uma Sala Privada ou Pública.
            </p>
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-3">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
              placeholder="Ex: EE-8K4M2P"
              maxLength={14}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-[#090d12] font-mono text-sm font-black tracking-wider text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-lime-400"
            />
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-zinc-800 hover:bg-slate-800 dark:hover:bg-zinc-700 border border-lime-400/40 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
            >
              <DoorOpen className="w-4 h-4 text-lime-400" />
              Entrar na Sala
            </button>
          </form>

          <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Saldo nunca fica negativo e pontos só mudam após resultado confirmado.
          </p>
        </div>
      </div>

      {/* Salas Públicas Abertas */}
      <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-lime-500" />
              Salas Públicas Abertas ({publicRooms.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Entre em qualquer partida pública disponível agora mesmo com 1 clique.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={publicFilterGame}
              onChange={(e) => setPublicFilterGame(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-[#090d12] text-xs font-bold text-slate-800 dark:text-zinc-100"
            >
              <option value="all">Todos os jogos</option>
              {MULTIPLAYER_CATALOG.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => sendWs('room:list_public')}
              title="Atualizar lista de salas públicas"
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-[#090d12] text-xs font-bold text-slate-700 dark:text-zinc-200 hover:border-lime-400 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>
        </div>

        {filteredPublicRooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12]/60 py-8 px-4 text-center space-y-1.5">
            <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">
              Nenhuma sala pública aberta no momento.
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Crie uma Sala Pública acima ou escolha um jogo abaixo para desafiar outros jogadores!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPublicRooms.map((pub) => {
              const notEnoughBalance = userAccount.pointsBalance < pub.stakePoints;
              const isMine = pub.hostUid === userAccount.uid;
              return (
                <div
                  key={pub.roomCode}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-[#090d12] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ProfileAvatar
                        name={pub.hostDisplayName}
                        photoURL={pub.hostPhotoURL}
                        sizeClass="w-9 h-9"
                        textSizeClass="text-[11px]"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {pub.hostDisplayName}
                        </p>
                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-lime-400 truncate">
                          {MULTIPLAYER_GAME_LABELS[pub.gameId] || pub.gameId}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                      1/2
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-zinc-300">
                    <span>{pub.totalRounds} rodada(s)</span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-lime-400">
                      {pub.stakePoints === 0 ? 'Amistoso (0 pts)' : `${formatPoints(pub.stakePoints)} pts`}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isMine || notEnoughBalance}
                    onClick={() => joinRoom(pub.roomCode)}
                    className="w-full min-h-[38px] rounded-xl bg-lime-400 hover:bg-lime-300 disabled:opacity-45 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <DoorOpen className="w-3.5 h-3.5" />
                    {isMine
                      ? 'Sua Sala'
                      : notEnoughBalance
                        ? `Saldo insuficiente (${formatPoints(pub.stakePoints)} pts)`
                        : 'Aceitar e Entrar'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Catálogo dos 11 Jogos Online */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
            Escolha um Jogo para Desafiar seu Amigo (11 Modos)
          </h3>
          <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
            Clique em um card para abrir uma sala na hora
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {MULTIPLAYER_CATALOG.map((game) => {
            const Icon = game.Icon;
            return (
              <motion.div
                key={game.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.16 }}
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-4 flex flex-col justify-between gap-3 shadow-sm hover:border-lime-400/60 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br border flex items-center justify-center ${game.accentClass}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-lime-400">
                      {game.category}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {game.name}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 leading-relaxed">
                      {game.tagline}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCreateGame(game.id);
                    handleCreateRoom(game.id);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {createVisibility === 'public' ? 'Criar Sala Pública' : 'Criar Sala Privada'}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Histórico Recente de Partidas Multiplayer */}
      {myMultiplayerMatches.length > 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0e1319]/95 p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-4 h-4 text-lime-500" />
            Suas Partidas Recentes com Amigos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {myMultiplayerMatches.slice(0, 6).map((m) => {
              const iWon = m.winnerUid === userAccount.uid;
              const isDraw = !m.winnerUid;
              return (
                <div
                  key={m.matchId}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#090d12] p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {MULTIPLAYER_GAME_LABELS[m.gameId] || m.gameId}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      Sala {m.roomCode}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-xl font-mono font-extrabold shrink-0 ${
                      isDraw
                        ? 'bg-zinc-800 text-zinc-300'
                        : iWon
                          ? 'bg-lime-400/20 text-lime-500'
                          : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {isDraw
                      ? 'Empate'
                      : m.stakePoints === 0
                        ? iWon
                          ? 'Vitória'
                          : 'Derrota'
                        : iWon
                          ? `+${formatPoints(m.stakePoints)}`
                          : `-${formatPoints(m.stakePoints)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
