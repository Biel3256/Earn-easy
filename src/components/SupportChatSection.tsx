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
  Clock,
  Headset,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  UserCheck,
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
  waiting_human: 'Aguardando ADM aceitar',
  active_human: 'Em atendimento ao vivo',
  closed: 'Encerrado',
};

function formatMsgTime(ts: unknown): string {
  const ms = timestampToMillis(ts);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const SupportChatSection: React.FC = () => {
  const { firebaseUser, userAccount, withdrawalSettings, isFirstWithdrawalEligible } = useAuth();
  const uid = firebaseUser?.uid || '';
  const playerName = (userAccount?.displayName || firebaseUser?.displayName || 'Jogador').slice(0, 80);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);

  const [selectedTopic, setSelectedTopic] = useState<SupportTopic>('other');
  const [bielMessages, setBielMessages] = useState<LocalBielMessage[]>([
    {
      id: 'biel_welcome',
      role: 'biel',
      text: `Olá, ${playerName}! Eu sou o Biel, assistente de suporte do Earn Easy. Toque em uma das perguntas rápidas abaixo ou me conte sua dúvida — logo após, você pode enviar a conversa direto para o Administrador responder no chat ao vivo.`,
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
    if (!uid) return;
    const ticketsQuery = query(
      collection(db, 'supportTickets'),
      where('userId', '==', uid)
    );
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bielMessages.length, ticketMessages.length, selectedTicketId]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.ticketId === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

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

  const startNewBielConversation = () => {
    setSelectedTicketId(null);
    setSelectedTopic('other');
    setReadyForHuman(false);
    setBielMessages([
      {
        id: generateId('bw'),
        role: 'biel',
        text: `Olá, ${playerName}! Sobre qual assunto você gostaria de conversar agora? Escolha uma dúvida rápida abaixo ou escreva sua mensagem.`,
      },
    ]);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-zinc-50 tracking-tight">
            Suporte & Ajuda (Biel)
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            Tire dúvidas instantâneas com as respostas rápidas do Biel e envie sua conversa direto para o Administrador responder em tempo real.
          </p>
        </div>

        {selectedTicketId && (
          <button
            type="button"
            onClick={startNewBielConversation}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Nova Conversa com Biel
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span className="break-words">{error}</span>
          <button type="button" onClick={() => setError('')} className="underline cursor-pointer shrink-0">
            Fechar
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[310px_1fr] items-stretch">
        {/* Lista de Atendimentos + Botão Nova Triagem */}
        <aside className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
          <button
            type="button"
            onClick={startNewBielConversation}
            className={`w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-left text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer ${
              selectedTicketId === null
                ? 'bg-emerald-600 dark:bg-lime-400 text-white dark:text-slate-950'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700'
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>Falar com o Biel (Suporte Rápido)</span>
          </button>

          <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 space-y-2.5">
            <h2 className="text-xs font-bold text-slate-900 dark:text-zinc-100">
              Meus Chamados ({tickets.length})
            </h2>

            {tickets.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                Nenhum chamado enviado ainda. Escolha uma dúvida no Biel e clique em "Enviar para Administrador (Suporte ao Vivo)" quando quiser falar com o ADM.
              </p>
            ) : (
              <div className="space-y-2">
                {tickets.map((ticket) => {
                  const selected = selectedTicketId === ticket.ticketId;
                  return (
                    <button
                      key={ticket.ticketId}
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.ticketId)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors space-y-1.5 cursor-pointer ${
                        selected
                          ? 'bg-emerald-50 dark:bg-lime-500/10 border-emerald-300 dark:border-lime-500/50'
                          : 'bg-slate-50/70 dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 leading-snug break-words">
                        {ticket.subject}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                        <span>{BIEL_TOPIC_LABELS[ticket.topic] || 'Suporte'}</span>
                        <span
                          className={`font-semibold ${
                            ticket.status === 'active_human'
                              ? 'text-emerald-600 dark:text-lime-400'
                              : ticket.status === 'waiting_human'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-400 dark:text-zinc-500'
                          }`}
                        >
                          {TICKET_STATUS_TEXT[ticket.status]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Área Principal do Chat */}
        <div className="bg-white dark:bg-[#0e1319] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex min-h-[500px] max-h-[650px] flex-col">
          {!activeTicket ? (
            <>
              {/* Header Biel */}
              <div className="pb-3.5 border-b border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-lime-500/15 border border-emerald-200 dark:border-lime-500/30 text-emerald-700 dark:text-lime-400 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
                      Biel · Suporte Rápido
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      Respostas imediatas e encaminhamento direto para o Painel ADM
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleEscalateToSpecialist}
                  disabled={escalating}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 bg-slate-900 dark:bg-lime-400 hover:bg-slate-800 dark:hover:bg-lime-300 disabled:opacity-50 text-white dark:text-slate-950 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Headset className="w-4 h-4" />
                  {escalating ? 'Enviando...' : 'Enviar para Administrador (Suporte ao Vivo)'}
                </button>
              </div>

              {/* Perguntas iniciais clicáveis */}
              <div className="py-3 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap gap-2">
                {BIEL_QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => askBiel(q.questionText, q.topic)}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      selectedTopic === q.topic
                        ? 'bg-emerald-50 dark:bg-lime-500/15 border-emerald-300 dark:border-lime-500/50 text-emerald-800 dark:text-lime-300'
                        : 'bg-slate-50 dark:bg-[#090d12] border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:border-lime-400'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              {/* Mensagens Biel */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
                {bielMessages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                          isUser
                            ? 'bg-emerald-600 dark:bg-lime-400 text-white dark:text-slate-950 font-medium'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100'
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                        {isUser ? playerName : 'Biel · Triagem'}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Banner de encaminhamento após triagem */}
              {readyForHuman && (
                <div className="mb-3 p-3.5 rounded-xl bg-slate-50 dark:bg-[#090d12] border border-slate-200 dark:border-lime-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                    Quer conversar diretamente com o Administrador? Clique ao lado para abrir seu chamado no Painel ADM agora.
                  </span>
                  <button
                    type="button"
                    onClick={handleEscalateToSpecialist}
                    disabled={escalating}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-emerald-600 dark:bg-lime-400 hover:bg-emerald-700 dark:hover:bg-lime-300 disabled:opacity-50 text-white dark:text-slate-950 text-xs font-bold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Headset className="w-4 h-4" />
                    {escalating ? 'Enviando...' : 'Abrir Chat com ADM'}
                  </button>
                </div>
              )}

              {/* Input Biel */}
              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
                <input
                  type="text"
                  value={bielDraft}
                  maxLength={800}
                  onChange={(e) => setBielDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && askBiel(bielDraft)}
                  placeholder="Escreva sua dúvida para o Biel..."
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#090d12] px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
                <button
                  type="button"
                  onClick={() => askBiel(bielDraft)}
                  disabled={!bielDraft.trim()}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Enviar
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Header Chamado Humano */}
              <div className="pb-3.5 border-b border-slate-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {activeTicket.status === 'active_human' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-lime-400">
                        <UserCheck className="w-4 h-4" />
                        Em atendimento com {activeTicket.assignedAdminName || 'Administrador'}
                      </span>
                    ) : activeTicket.status === 'waiting_human' ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Clock className="w-4 h-4" />
                        Na fila — Aguardando administrador aceitar
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-zinc-400">
                        <CheckCircle2 className="w-4 h-4" />
                        Atendimento encerrado
                      </span>
                    )}
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-zinc-50 mt-0.5 break-words">
                    {activeTicket.subject}
                  </h2>
                </div>

                {activeTicket.status !== 'closed' && (
                  <button
                    type="button"
                    onClick={handleCloseTicket}
                    className="min-h-[40px] px-3 py-1.5 border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Encerrar Chamado
                  </button>
                )}
              </div>

              {/* Mensagens ao vivo do chamado */}
              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
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
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                          isUser
                            ? 'bg-emerald-600 dark:bg-lime-400 text-white dark:text-slate-950 font-medium'
                            : isAdminMsg
                              ? 'bg-slate-900 dark:bg-zinc-800 text-white border border-slate-800 dark:border-lime-500/30'
                              : 'bg-slate-100 dark:bg-[#090d12] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="mt-1 text-[10px] text-slate-400 dark:text-zinc-500 font-mono flex items-center gap-1">
                        {isAdminMsg && <ShieldCheck className="w-3 h-3 text-lime-400" />}
                        {isUser
                          ? 'Você'
                          : isAdminMsg
                            ? `${msg.senderName} (ADM)`
                            : msg.senderName}
                        {timeStr ? ` · ${timeStr}` : ''}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {activeTicket.status === 'closed' ? (
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
                  <span>Este atendimento foi encerrado.</span>
                  <button
                    type="button"
                    onClick={startNewBielConversation}
                    className="min-h-[42px] px-3.5 py-2 bg-lime-400 hover:bg-lime-300 text-slate-950 font-bold rounded-lg cursor-pointer"
                  >
                    Abrir Novo Chamado
                  </button>
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex gap-2">
                  <input
                    type="text"
                    value={humanDraft}
                    maxLength={800}
                    onChange={(e) => setHumanDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendHumanMessage()}
                    placeholder={
                      activeTicket.status === 'waiting_human'
                        ? 'Adicione mais detalhes enquanto aguarda o ADM...'
                        : 'Escreva sua resposta para o administrador...'
                    }
                    className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#090d12] px-3.5 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendHumanMessage}
                    disabled={sendingHuman || !humanDraft.trim()}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    Enviar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
