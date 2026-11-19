import React, { useState } from 'react';
import { CheckCircle2, Lock, Mail, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EmailNotification } from '../types/earneasy';

export const NotificationsSection: React.FC = () => {
  const { firebaseUser, myNotifications, signInWithGoogle } = useAuth();
  const [selected, setSelected] = useState<EmailNotification | null>(null);

  if (!firebaseUser) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto space-y-4">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Notificações por E-mail</h2>
        <p className="text-sm text-slate-600">
          Faça login para consultar todos os comprovantes enviados por e-mail sobre suas conversões e saques via Pix.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  const activeItem = selected || myNotifications[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Central de Notificações por E-mail</h2>
        <p className="text-sm text-slate-500">
          Registro auditável de confirmações enviadas para seu e-mail a cada conversão diária ou movimentação Pix.
        </p>
      </div>

      {myNotifications.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <Mail className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700">Nenhuma notificação transacional emitida ainda.</p>
          <p className="text-xs text-slate-500">
            Ao realizar sua primeira conversão de pontos ou solicitação de saque Pix, o comprovante aparecerá aqui e será disparado por e-mail.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {myNotifications.map((item) => {
              const isSelected = activeItem?.notificationId === item.notificationId;
              return (
                <button
                  key={item.notificationId}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-mono truncate">{item.recipientEmail}</span>
                    <span className="shrink-0">
                      {item.deliveryStatus === 'sent_smtp' ? 'SMTP Enviado' : 'Comprovante Digital'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 line-clamp-1">{item.subject}</div>
                  <div className="text-xs text-slate-600 line-clamp-1 mt-0.5">{item.summary}</div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
            {activeItem && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <MailCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{activeItem.subject}</h3>
                      <p className="text-xs text-slate-500 font-mono">Para: {activeItem.recipientEmail}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {activeItem.deliveryStatus === 'sent_smtp' ? 'Entregue via SMTP' : 'Registrado'}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3 text-sm text-slate-700 leading-relaxed">
                  <p>{activeItem.summary}</p>
                  <div className="border-t border-slate-200 pt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Tipo de Evento</span>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5">{activeItem.eventType}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Código de Referência</span>
                      <div className="font-mono font-semibold text-slate-900 mt-0.5">{activeItem.referenceId}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
