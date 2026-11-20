import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Headset,
  MessageSquare,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { SupportMessage, SupportTicket, SupportTopic } from '../types/earneasy';
import { generateId } from '../utils/antifraud';
import {
  BIEL_QUICK_QUESTIONS,
  BIEL_TOPIC_LABELS,
  buildBielClientReply,
} from '../utils/bielSupport';
import { extractReadableError, timestampToMillis } from '../utils/pix';

interface LocalBielMessage {
  id: string;
  role: 'user' | 'biel';
  text: string;
}

const TICKET_STATUS_TEXT: Record<SupportTicket['status'], string> = {
  waiting_human: 'Na fila do ADM',
  active_human: 'Ao vivo',
  closed: 'Encerrado',
};

function formatMsgTime(ts: unknown): string {
  const ms = timestampToMillis(ts);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface FloatingSupportWidgetProps {
  externalOpenSignal?: number;
}

export const FloatingSupportWidget: React.FC<FloatingSupportWidgetProps> = ({
  externalOpenSignal = 0,
}) => {
  const { firebaseUser, userAccount, withdrawalSettings, isFirstWithdrawalEligible } = useAuth();
  const uid = firebaseUser?.uid || '';
  const playerName = (userAccount?.displayName || firebaseUser?.displayName || 'Jogador').slice(0, 80);

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'biel' | 'tickets' | 'ticket_chat'>('biel');

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);

  const [selectedTopic, setSelectedTopic] = useState<SupportTopic>('other');
  const [bielMessages, setBielMessages] = useState<LocalBielMessage[]>([
    {
      id: 'biel_welcome',
      role: 'biel',
      text: 'Olá! Eu sou o Biel, assistente de suporte do Earn Easy. Toque em uma dúvida rápida abaixo ou escreva sua pergunta — logo em seguida você pode enviar sua conversa direto para o Administrador responder no chat ao vivo.',
    },
  ]);
  const [bielDraft, setBielDraft] = useState('');
  const [readyForHuman, setReadyForHuman] = useState(false);

  const [humanDraft, setHumanDraft] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [sendingHuman, setSendingHuman] = useState(false);
  const [error, setError] = useState('');

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (externalOpenSignal > 0) {
      setIsOpen(true);
    }
  }, [externalOpenSignal]);

  useEffect(() => {
    if (!uid) {
      setTickets([]);
      return;
    }
    const ticketsQuery = query(collection(db, 'supportTickets'), where('userId', '==', uid));
    return onSnapshot(
      ticketsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as SupportTicket)
          .sort((a, b) => timestampToMillis(b.updatedAt) - timestampToMillis(a.updatedAt));
        setTickets(list);
      },
      (err) => {
        setError(extractReadableError(err, 'Não foi possível carregar seus atendimentos.'));
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!selectedTicketId) {
      setTicketMessages([]);
      return;
    }
    const msgsQuery = query(
      collection(db, 'supportTickets', selectedTicketId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(
      msgsQuery,
      (snap) => {
        setTicketMessages(snap.docs.map((d) => d.data() as SupportMessage));
      },
      (err) => {
        setError(extractReadableError(err, 'Não foi possível carregar as mensagens do chamado.'));
      }
    );
  }, [selectedTicketId]);

  useEffect(() => {
    if (!isOpen) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, view, bielMessages.length, ticketMessages.length, selectedTicketId]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.ticketId === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  const openTicketCount = useMemo(
    () => tickets.filter((t) => t.status !== 'closed').length,
    [tickets]
  );

  if (!firebaseUser) return null;

  const askBiel = (text: string, topicOverride?: SupportTopic) => {
    const clean = text.trim().slice(0, 800);
    if (!clean) return;

    const topicToUse = topicOverride || selectedTopic;
    const userMsg: LocalBielMessage = {
      id: generateId('um'),
      role: 'user',
      text: clean,
    };
    const nextHistory = [...bielMessages, userMsg];
    const userTurns = nextHistory.filter((m) => m.role === 'user').length;

    const result = buildBielClientReply({
      userMessage: clean,
      selectedTopic: topicToUse,
      userDisplayName: playerName,
      userAccount,
      withdrawalSettings,
      isFirstWithdrawalEligible,
      userTurnCount: userTurns,
    });

    setSelectedTopic(result.detectedTopic);
    setBielMessages([
      ...nextHistory,
      { id: generateId('bm'), role: 'biel', text: result.reply },
    ]);
    setBielDraft('');
    setReadyForHuman(result.readyForHuman);
    setError('');
  };

  const handleEscalateToSpecialist = async () => {
    if (!uid || escalating) return;
    setEscalating(true);
    setError('');

    const ticketId = generateId('sup');
    const userMessages = bielMessages.filter((m) => m.role === 'user');
    const firstQuestion = userMessages[0]?.text || BIEL_TOPIC_LABELS[selectedTopic];
    const subject = `${BIEL_TOPIC_LABELS[selectedTopic]}: ${firstQuestion}`.slice(0, 140);
    const bielSummary = bielMessages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? playerName : 'Biel'}: ${m.text}`)
      .join(' | ')
      .slice(0, 800);

    try {
      const batch = writeBatch(db);
      const ticketRef = doc(db, 'supportTickets', ticketId);
      batch.set(ticketRef, {
        ticketId,
        userId: uid,
        userDisplayName: playerName,
        topic: selectedTopic,
        subject: subject.length >= 3 ? subject : 'Solicitação de Suporte',
        bielSummary: bielSummary.length >= 3 ? bielSummary : 'Triagem concluída com Biel.',
        status: 'waiting_human',
        assignedAdminUid: '',
        assignedAdminName: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const msgsToPersist = bielMessages.slice(-6);
      msgsToPersist.forEach((m) => {
        const messageId = generateId('smsg');
        batch.set(doc(db, 'supportTickets', ticketId, 'messages', messageId), {
          messageId,
          ticketId,
          senderUid: uid,
          senderName: m.role === 'user' ? playerName : 'Biel (Triagem)',
          senderRole: m.role === 'user' ? 'user' : 'biel',
          text: m.text.slice(0, 800),
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setSelectedTicketId(ticketId);
      setView('ticket_chat');
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível enviar sua conversa ao administrador.'));
    } finally {
      setEscalating(false);
    }
  };

  const handleSendHumanMessage = async () => {
    if (!uid || !activeTicket || activeTicket.status === 'closed' || sendingHuman) return;
    const text = humanDraft.trim().slice(0, 800);
    if (!text) return;

    setSendingHuman(true);
    setError('');
    const messageId = generateId('smsg');
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'supportTickets', activeTicket.ticketId, 'messages', messageId), {
        messageId,
        ticketId: activeTicket.ticketId,
        senderUid: uid,
        senderName: playerName,
        senderRole: 'user',
        text,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'supportTickets', activeTicket.ticketId), {
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setHumanDraft('');
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível enviar sua mensagem.'));
    } finally {
      setSendingHuman(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!activeTicket || activeTicket.status === 'closed') return;
    try {
      await updateDoc(doc(db, 'supportTickets', activeTicket.ticketId), {
        status: 'closed',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setError(extractReadableError(err, 'Não foi possível encerrar o chamado.'));
    }
  };

  const startNewBiel = () => {
    setSelectedTicketId(null);
    setView('biel');
    setReadyForHuman(false);
    setSelectedTopic('other');
    setBielMessages([
      {
        id: generateId('bw'),
        role: 'biel',
        text: `Olá, ${playerName}! Como posso te ajudar hoje? Toque em uma dúvida rápida ou escreva sua mensagem para encaminhar ao ADM.`,
      },
    ]);
  };

  return (
    <>
      {isOpen && (
        <aside
          aria-label="Chat de Suporte Earn Easy"
          className="fixed bottom-[8.75rem] md:bottom-20 right-3 sm:right-5 z-50 w-[calc(100vw-1.5rem)] sm:w-[395px] h-[500px] max-h-[calc(100vh-10rem)] md:max-h-[calc(100vh-7.5rem)] rounded-3xl border border-slate-200 dark:border-lime-500/25 bg-white/95 dark:bg-[#0e1319]/95 backdrop-blur-xl shadow-2xl shadow-slate-900/20 dark:shadow-black/80 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-slate-900 dark:bg-[#090d12] text-white border-b border-slate-800 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {view !== 'biel' && (
                <button
                  type="button"
                  onClick={() => setView(view === 'ticket_chat' ? 'tickets' : 'biel')}
                  aria-label="Voltar"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-8 h-8 rounded-xl bg-lime-500/20 border border-lime-400/40 text-lime-300 flex items-center justify-center shrink-0">
                {view === 'ticket_chat' ? <Headset className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold leading-snug">
                  {view === 'ticket_chat' && activeTicket
                    ? activeTicket.assignedAdminName
                      ? `ADM: ${activeTicket.assignedAdminName}`
                      : 'Chat com Administrador'
                    : view === 'tickets'
                      ? `Meus Chamados (${tickets.length})`
                      : 'Biel · Suporte Rápido'}
                </div>
                <div className="text-[11px] text-zinc-400 leading-snug">
                  {view === 'ticket_chat' && activeTicket
                    ? TICKET_STATUS_TEXT[activeTicket.status]
                    : 'Perguntas rápidas e envio direto ao ADM'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setView(view === 'tickets' ? 'biel' : 'tickets')}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-zinc-100 whitespace-nowrap cursor-pointer"
              >
                {view === 'tickets' ? 'Biel' : `Chamados (${tickets.length})`}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar suporte"
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="px-3.5 py-2 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300 flex items-start justify-between gap-2 shrink-0">
              <span className="leading-snug break-words">{error}</span>
              <button type="button" onClick={() => setError('')} className="underline cursor-pointer shrink-0">
                OK
              </button>
            </div>
          )}

          {/* Body */}
          {view === 'tickets' ? (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
              <button
                type="button"
                onClick={startNewBiel}
                className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Nova Conversa com Biel
              </button>

              {tickets.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Você ainda não enviou nenhum chamado ao administrador. Toque em uma pergunta no Biel para começar.
                </div>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.ticketId}
                    type="button"
                    onClick={() => {
                      setSelectedTicketId(t.ticketId);
                      setView('ticket_chat');
                    }}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#090d12] hover:border-lime-500/60 transition-colors space-y-1.5 cursor-pointer"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 leading-snug break-words">
                      {t.subject}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 gap-2">
                      <span>{BIEL_TOPIC_LABELS[t.topic] || 'Suporte'}</span>
                      <span
                        className={`font-semibold shrink-0 ${
                          t.status === 'active_human'
                            ? 'text-lime-600 dark:text-lime-400'
                            : t.status === 'waiting_human'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-400 dark:text-zinc-500'
                        }`}
                      >
                        {TICKET_STATUS_TEXT[t.status]}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : view === 'ticket_chat' && activeTicket ? (
            <>
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-[#090d12] flex items-center justify-between gap-2 shrink-0">
                <div className="text-[11px] font-medium flex items-center gap-1.5 min-w-0">
                  {activeTicket.status === 'active_human' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-lime-400 font-semibold">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      {activeTicket.assignedAdminName || 'Administrador'} entrou no chat
                    </span>
                  ) : activeTicket.status === 'waiting_human' ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Aguardando administrador aceitar...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500 dark:text-zinc-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Atendimento encerrado
                    </span>
                  )}
                </div>

                {activeTicket.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={handleCloseTicket}
                    className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300 hover:underline shrink-0 cursor-pointer"
                  >
                    Encerrar
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {ticketMessages.map((msg) => {
                  const isUser = msg.senderRole === 'user';
                  const isAdminMsg = msg.senderRole === 'admin';
                  const timeStr = formatMsgTime(msg.createdAt);
                  return (
                    <div
                      key={msg.messageId}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                          isUser
                            ? 'bg-emerald-600 dark:bg-lime-500 text-white dark:text-slate-950 font-medium'
                            : isAdminMsg
                              ? 'bg-slate-900 dark:bg-zinc-800 text-white border border-slate-800 dark:border-lime-500/30'
                              : 'bg-slate-100 dark:bg-[#090d12] text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="mt-0.5 text-[10px] text-slate-400 dark:text-zinc-500 font-mono flex items-center gap-1">
                        {isAdminMsg && <ShieldCheck className="w-3 h-3 text-lime-400" />}
                        {isUser ? 'Você' : msg.senderName}
                        {timeStr ? ` · ${timeStr}` : ''}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {activeTicket.status === 'closed' ? (
                <div className="p-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-zinc-400 shrink-0">
                  <span>Chamado encerrado</span>
                  <button
                    type="button"
                    onClick={startNewBiel}
                    className="px-3 py-2 bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                  >
                    Nova Conversa
                  </button>
                </div>
              ) : (
                <div className="p-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2 shrink-0">
                  <input
                    type="text"
                    value={humanDraft}
                    maxLength={800}
                    onChange={(e) => setHumanDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendHumanMessage()}
                    placeholder={
                      activeTicket.status === 'waiting_human'
                        ? 'Envie detalhes enquanto aguarda o ADM...'
                        : 'Responda ao administrador...'
                    }
                    className="flex-1 min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#090d12] px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendHumanMessage}
                    disabled={sendingHuman || !humanDraft.trim()}
                    aria-label="Enviar mensagem"
                    className="min-w-[42px] min-h-[42px] px-3 py-2 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 rounded-xl flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Starter Questions */}
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap gap-1.5 bg-slate-50/70 dark:bg-[#090d12] shrink-0">
                {BIEL_QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => askBiel(q.questionText, q.topic)}
                    className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                      selectedTopic === q.topic
                        ? 'bg-emerald-50 dark:bg-lime-500/15 border-emerald-300 dark:border-lime-500/50 text-emerald-800 dark:text-lime-300'
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-lime-400'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              {/* Biel Conversation */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {bielMessages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                          isUser
                            ? 'bg-emerald-600 dark:bg-lime-400 text-white dark:text-slate-950 font-medium'
                            : 'bg-slate-100 dark:bg-zinc-800/90 text-slate-900 dark:text-zinc-100'
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="mt-0.5 text-[10px] text-slate-400 dark:text-zinc-500">
                        {isUser ? playerName : 'Biel · Triagem'}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Escalate Bar */}
              <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#090d12] border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 leading-tight">
                  {readyForHuman ? 'Pronto para falar com o ADM:' : 'Ou fale direto com o ADM:'}
                </span>
                <button
                  type="button"
                  onClick={handleEscalateToSpecialist}
                  disabled={escalating}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-lime-400 hover:bg-slate-800 dark:hover:bg-lime-300 disabled:opacity-50 text-white dark:text-slate-950 text-[11px] font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Headset className="w-3.5 h-3.5" />
                  {escalating ? 'Enviando...' : 'Enviar para ADM'}
                </button>
              </div>

              {/* Input */}
              <div className="p-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2 shrink-0">
                <input
                  type="text"
                  value={bielDraft}
                  maxLength={800}
                  onChange={(e) => setBielDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && askBiel(bielDraft)}
                  placeholder="Escreva para o Biel..."
                  className="flex-1 min-h-[42px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#090d12] px-3 py-2 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
                <button
                  type="button"
                  onClick={() => askBiel(bielDraft)}
                  disabled={!bielDraft.trim()}
                  aria-label="Enviar pergunta ao Biel"
                  className="min-w-[42px] min-h-[42px] px-3 py-2 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 rounded-xl flex items-center justify-center cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </aside>
      )}

      {/* Floating Bottom-Right Launcher */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? 'Minimizar chat de suporte' : 'Abrir suporte com Biel'}
        className="fixed bottom-[4.75rem] right-3 md:bottom-5 md:right-5 z-40 h-11 md:h-12 px-3.5 md:px-4 rounded-2xl bg-slate-900/95 dark:bg-lime-400 backdrop-blur-md hover:bg-slate-800 dark:hover:bg-lime-300 text-white dark:text-slate-950 shadow-xl shadow-slate-900/25 dark:shadow-lime-500/20 border border-slate-700/70 dark:border-lime-300 inline-flex items-center gap-2 transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.97] cursor-pointer"
      >
        {isOpen ? (
          <>
            <X className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold whitespace-nowrap">Fechar Suporte</span>
          </>
        ) : (
          <>
            <MessageSquare className="w-4 h-4 text-lime-400 dark:text-slate-950 shrink-0" />
            <span className="text-xs font-bold whitespace-nowrap">
              <span className="hidden sm:inline">Suporte · </span>Biel
            </span>
            {openTicketCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500 dark:bg-slate-950 text-white dark:text-lime-400 text-[10px] font-mono font-bold tabular-nums">
                {openTicketCount}
              </span>
            )}
          </>
        )}
      </button>
    </>
  );
};
