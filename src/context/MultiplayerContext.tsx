import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  MultiplayerGameId,
  MultiplayerRoomSnapshot,
  PublicMultiplayerRoomSummary,
  RoomVisibility,
} from '../types/earneasy';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { formatPoints } from '../utils/pix';

export interface SettledSummaryState {
  matchId: string;
  transferredPoints: number;
  alreadySettled: boolean;
}

export interface CreateRoomInput {
  gameId: MultiplayerGameId;
  totalRounds: number;
  stakePoints: number;
  visibility: RoomVisibility;
  postToGlobal?: boolean;
}

interface MultiplayerContextValue {
  wsConnected: boolean;
  room: MultiplayerRoomSnapshot | null;
  publicRooms: PublicMultiplayerRoomSummary[];
  globalInvites: PublicMultiplayerRoomSummary[];
  settlingMatchId: string | null;
  settledSummary: SettledSummaryState | null;
  opponentJoinedSignal: number;
  clearSettledSummary: () => void;
  sendWs: (type: string, payload?: unknown) => boolean;
  createRoom: (input: CreateRoomInput) => void;
  joinRoom: (roomCode: string) => void;
  leaveRoom: () => void;
  publishToGlobal: (publish: boolean) => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export const MultiplayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, userAccount, settleMultiplayerMatch } = useAuth();
  const { showToast } = useToast();

  const [wsConnected, setWsConnected] = useState(false);
  const [room, setRoom] = useState<MultiplayerRoomSnapshot | null>(null);
  const [publicRooms, setPublicRooms] = useState<PublicMultiplayerRoomSummary[]>([]);
  const [globalInvites, setGlobalInvites] = useState<PublicMultiplayerRoomSummary[]>([]);
  const [settlingMatchId, setSettlingMatchId] = useState<string | null>(null);
  const [settledSummary, setSettledSummary] = useState<SettledSummaryState | null>(null);
  const [opponentJoinedSignal, setOpponentJoinedSignal] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<MultiplayerRoomSnapshot | null>(null);
  const prevRoomMetaRef = useRef<{ roomCode: string; playerCount: number } | null>(null);
  const settledIdsRef = useRef<Set<string>>(new Set());
  const pendingSendQueueRef = useRef<Array<{ type: string; payload: unknown }>>([]);
  const accountRef = useRef(userAccount);

  useEffect(() => {
    accountRef.current = userAccount;
  }, [userAccount]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const sendWs = useCallback((type: string, payload: unknown = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    pendingSendQueueRef.current.push({ type, payload });
    return false;
  }, []);

  useEffect(() => {
    if (!firebaseUser || !userAccount?.uid) {
      setRoom(null);
      setPublicRooms([]);
      setGlobalInvites([]);
      setWsConnected(false);
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws/multiplayer`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'room:list_public', payload: {} }));

        const activeRoom = roomRef.current;
        const acc = accountRef.current;
        if (activeRoom && acc) {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              payload: {
                roomCode: activeRoom.roomCode,
                uid: acc.uid,
                displayName: acc.displayName,
                photoURL: acc.photoURL,
                pointsBalance: acc.pointsBalance,
              },
            })
          );
        }

        while (pendingSendQueueRef.current.length > 0) {
          const item = pendingSendQueueRef.current.shift();
          if (item) {
            ws.send(JSON.stringify(item));
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'room:state') {
            const nextRoom = msg.payload as MultiplayerRoomSnapshot;
            const prevMeta = prevRoomMetaRef.current;
            const acc = accountRef.current;
            if (
              prevMeta &&
              prevMeta.roomCode === nextRoom.roomCode &&
              prevMeta.playerCount < 2 &&
              nextRoom.players.length === 2 &&
              acc &&
              nextRoom.hostUid === acc.uid
            ) {
              const opponent = nextRoom.players.find((p) => p.uid !== acc.uid);
              showToast({
                type: 'success',
                title: 'Adversário entrou na sala!',
                message: `${opponent?.displayName || 'Um jogador'} aceitou sua partida (${nextRoom.roomCode}).`,
              });
              setOpponentJoinedSignal((s) => s + 1);
            }
            prevRoomMetaRef.current = {
              roomCode: nextRoom.roomCode,
              playerCount: nextRoom.players.length,
            };
            setRoom(nextRoom);
          } else if (msg.type === 'room:left') {
            prevRoomMetaRef.current = null;
            setRoom(null);
            setSettledSummary(null);
          } else if (msg.type === 'rooms:directory') {
            const dir = msg.payload || {};
            setPublicRooms(Array.isArray(dir.publicRooms) ? dir.publicRooms : []);
            setGlobalInvites(Array.isArray(dir.globalInvites) ? dir.globalInvites : []);
          } else if (msg.type === 'error' && msg.payload?.message) {
            showToast({
              type: 'error',
              title: 'Sala Multiplayer',
              message: String(msg.payload.message),
            });
          }
        } catch {
          // Ignore malformed WS frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 2200);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [firebaseUser, userAccount?.uid, showToast]);

  // Keep room player balance synced with Firestore pointsBalance
  useEffect(() => {
    if (!room || !userAccount || !wsConnected) return;
    sendWs('room:update_balance', { pointsBalance: userAccount.pointsBalance });
  }, [userAccount?.pointsBalance, wsConnected, Boolean(room), sendWs]);

  // Settle finished multiplayer matches atomically
  useEffect(() => {
    if (!room || room.status !== 'finished' || !room.settlement || !userAccount) return;
    const settlement = room.settlement;
    if (settledIdsRef.current.has(settlement.matchId)) return;

    settledIdsRef.current.add(settlement.matchId);
    setSettlingMatchId(settlement.matchId);

    settleMultiplayerMatch(settlement)
      .then((res) => {
        setSettledSummary({
          matchId: settlement.matchId,
          transferredPoints: res.transferredPoints,
          alreadySettled: res.alreadySettled,
        });
        if (!res.alreadySettled) {
          if (settlement.isDraw) {
            showToast({
              type: 'info',
              title: 'Partida Empatada!',
              message: 'Nenhum ponto foi descontado ou transferido.',
            });
          } else if (settlement.winnerUid === userAccount.uid && res.transferredPoints > 0) {
            showToast({
              type: 'success',
              title: 'Vitória Confirmada!',
              message: `+${formatPoints(res.transferredPoints)} pontos ganhos na partida!`,
            });
          } else if (res.transferredPoints > 0) {
            showToast({
              type: 'info',
              title: 'Partida Encerrada',
              message: `${formatPoints(res.transferredPoints)} pontos combinados transferidos ao vencedor.`,
            });
          }
        }
      })
      .catch((err) => {
        settledIdsRef.current.delete(settlement.matchId);
        showToast({
          type: 'error',
          title: 'Erro ao validar resultado',
          message: err instanceof Error ? err.message : 'Tente novamente.',
        });
      })
      .finally(() => {
        setSettlingMatchId(null);
      });
  }, [room?.status, room?.settlement?.matchId, userAccount?.uid, settleMultiplayerMatch, showToast]);

  const createRoom = useCallback(
    (input: CreateRoomInput) => {
      const acc = accountRef.current;
      if (!acc) return;
      const stake = Math.max(0, Math.min(acc.pointsBalance, Math.floor(Number(input.stakePoints || 0))));
      if (stake > acc.pointsBalance) {
        showToast({
          type: 'error',
          title: 'Saldo insuficiente',
          message: 'Escolha uma aposta menor ou igual ao seu saldo de pontos.',
        });
        return;
      }
      setSettledSummary(null);
      sendWs('room:create', {
        uid: acc.uid,
        displayName: acc.displayName,
        photoURL: acc.photoURL,
        pointsBalance: acc.pointsBalance,
        gameId: input.gameId,
        totalRounds: input.totalRounds,
        stakePoints: stake,
        visibility: input.visibility,
        postToGlobal: Boolean(input.postToGlobal),
      });
    },
    [sendWs, showToast]
  );

  const joinRoom = useCallback(
    (roomCode: string) => {
      const acc = accountRef.current;
      if (!acc) return;
      const clean = roomCode.trim().toUpperCase();
      if (!clean) {
        showToast({
          type: 'error',
          title: 'Código obrigatório',
          message: 'Digite o código da sala (ex: EE-AB12CD).',
        });
        return;
      }
      setSettledSummary(null);
      sendWs('room:join', {
        roomCode: clean,
        uid: acc.uid,
        displayName: acc.displayName,
        photoURL: acc.photoURL,
        pointsBalance: acc.pointsBalance,
      });
    },
    [sendWs, showToast]
  );

  const leaveRoom = useCallback(() => {
    sendWs('room:leave');
  }, [sendWs]);

  const publishToGlobal = useCallback(
    (publish: boolean) => {
      sendWs('room:publish_global', { publish });
    },
    [sendWs]
  );

  const clearSettledSummary = useCallback(() => {
    setSettledSummary(null);
  }, []);

  return (
    <MultiplayerContext.Provider
      value={{
        wsConnected,
        room,
        publicRooms,
        globalInvites,
        settlingMatchId,
        settledSummary,
        opponentJoinedSignal,
        clearSettledSummary,
        sendWs,
        createRoom,
        joinRoom,
        leaveRoom,
        publishToGlobal,
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  );
};

export function useMultiplayer(): MultiplayerContextValue {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) {
    throw new Error('useMultiplayer deve ser utilizado dentro de MultiplayerProvider.');
  }
  return ctx;
}
