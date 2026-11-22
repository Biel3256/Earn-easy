import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import { PixWithdrawal, WithdrawalStatus } from '../types/earneasy';
import { formatBRL } from '../utils/pix';

type StatusFilter = 'all' | 'pending' | 'paid' | 'rejected';

const WITHDRAWAL_STATUS_UI: Record<
  WithdrawalStatus,
  { label: string; colorClass: string; Icon: React.FC<{ className?: string }> }
> = {
  pending: { label: 'Em análise', colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
  approved: { label: 'Aprovado', colorClass: 'text-sky-700 dark:text-sky-400', Icon: CheckCircle2 },
  paid: { label: 'Pago via Pix', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  rejected: { label: 'Recusado / Estornado', colorClass: 'text-red-700 dark:text-red-400', Icon: XCircle },
};

export const WithdrawalHistory: React.FC = () => {
  const { firebaseUser, authReady } = useAuth();
  const [withdrawals, setWithdrawals] = useState<PixWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [retrySeed, setRetrySeed] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    if (!firebaseUser) {
      setWithdrawals([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const withdrawalsQuery = query(
      collection(db, 'withdrawals'),
      where('userId', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    const unsubscribe = onSnapshot(
      withdrawalsQuery,
      (snapshot) => {
        setWithdrawals(snapshot.docs.map((docSnap) => docSnap.data() as PixWithdrawal));
        setLoading(false);
        setErrorMsg(null);
      },
      (err) => {
        console.error(
          'Firestore Error: ',
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            operationType: 'list',
            path: 'withdrawals',
            userId: auth.currentUser?.uid || null,
          })
        );
        setLoading(false);
        setErrorMsg('Não foi possível carregar o histórico de saques no servidor.');
      }
    );

    return () => unsubscribe();
  }, [authReady, firebaseUser, retrySeed]);

  const filteredWithdrawals = useMemo(() => {
    if (statusFilter === 'all') return withdrawals;
    if (statusFilter === 'pending') {
      return withdrawals.filter((w) => w.status === 'pending' || w.status === 'approved');
    }
    return withdrawals.filter((w) => w.status === statusFilter);
  }, [withdrawals, statusFilter]);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Histórico de Saques</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Últimos saques Pix solicitados pela sua conta em tempo real
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-950 border border-transparent dark:border-zinc-800 rounded-lg">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Em análise' },
              { id: 'paid', label: 'Pagos' },
              { id: 'rejected', label: 'Estornados' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg ? (
        <div className="py-8 text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 mx-auto" />
          <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setRetrySeed((s) => s + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-zinc-800 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-zinc-700 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar Novamente
          </button>
        </div>
      ) : loading ? (
        <div className="divide-y divide-slate-100 dark:divide-zinc-800" aria-busy="true" aria-label="Carregando histórico de saques">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="w-24 h-3 bg-slate-200 dark:bg-zinc-800 rounded" />
                <div className="w-36 h-2.5 bg-slate-100 dark:bg-zinc-800/70 rounded" />
              </div>
              <div className="w-20 h-3 bg-slate-200 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      ) : filteredWithdrawals.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400 py-6 text-center">
          {withdrawals.length === 0
            ? 'Nenhum saque Pix solicitado ainda.'
            : 'Nenhum saque encontrado neste filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400">
                <th className="py-2 font-medium">Data</th>
                <th className="py-2 font-medium">Chave Pix</th>
                <th className="py-2 font-medium">Comprovante</th>
                <th className="py-2 font-medium text-right">Valor</th>
                <th className="py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {filteredWithdrawals.map((w) => {
                const st = WITHDRAWAL_STATUS_UI[w.status] || WITHDRAWAL_STATUS_UI.pending;
                const StatusIcon = st.Icon;
                return (
                  <tr key={w.withdrawalId} className="min-h-[44px]">
                    <td className="py-2.5 font-mono tabular-nums text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                      {w.requestedDate}
                    </td>
                    <td className="py-2.5 font-mono text-slate-700 dark:text-zinc-300">
                      <div className="truncate max-w-[150px]">{w.pixKey}</div>
                      <div className="text-[11px] text-slate-400 dark:text-zinc-500">{w.pixKeyType.toUpperCase()}</div>
                    </td>
                    <td className="py-2.5 font-mono text-slate-500 dark:text-zinc-400">
                      <span className="truncate block max-w-[120px]">
                        {w.pixTransactionId || w.withdrawalId}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-zinc-100 whitespace-nowrap">
                      {formatBRL(w.amountCents)}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 font-medium ${st.colorClass}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
