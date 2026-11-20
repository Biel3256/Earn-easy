import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Coins,
  Gamepad2,
  Landmark,
  X,
} from 'lucide-react';

interface TutorialStep {
  id: number;
  kicker: string;
  title: string;
  description: string;
  highlights: string[];
  Icon: React.FC<{ className?: string }>;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    kicker: 'Passo 1 de 4 · Boas-vindas',
    title: 'Comece pelo Check-in Diário e ganhe até R$ 10,00 extras',
    description:
      'Todo dia você pode sortear pontos grátis no Check-in Diário (1.000 a 1.200 pontos por semana). Mantendo 30 dias seguidos sem falhar nenhum dia, você desbloqueia um prêmio de R$ 10,00 direto no seu saldo.',
    highlights: [
      '1 coleta diária com valor aleatório entre 143 e 172 pontos.',
      'Sequência de 30 dias consecutivos paga R$ 10,00 direto na carteira.',
      'Se perder 1 dia sem fazer check-in, a contagem de 30 dias reinicia.',
    ],
    Icon: CalendarCheck2,
  },
  {
    id: 2,
    kicker: 'Passo 2 de 4 · Como Jogar',
    title: 'Acumule pontos nos 7 jogos gratuitos verificados',
    description:
      'Escolha entre Jogo da Velha, Caça-Palavras, Dot Link, Memória de Cartas, Maior ou Menor, Desafio Matemático e Reflexo Rápido. Cada vitória avança sua Fase no jogo, soma moedas na hora e aumenta seu nível.',
    highlights: [
      'Desafio Matemático, Caça-Palavras, Dot Link e Reflexo Rápido pagam até 450 pontos por rodada.',
      'Todas as partidas passam por validação antifraude automática.',
      'Sua evolução de fases, XP e avatar personalizado aparecem no Perfil e no Ranking.',
    ],
    Icon: Gamepad2,
  },
  {
    id: 3,
    kicker: 'Passo 3 de 4 · Converter Pontos',
    title: 'Transforme seus pontos em reais uma vez por dia',
    description:
      'Acesse a aba Carteira Pix sempre que acumular múltiplos de 1.000 pontos. A taxa é fixa e transparente: 1.000 pontos equivalem a R$ 0,10 na sua carteira.',
    highlights: [
      'Limite de 1 conversão por dia (renovado às 00:00 UTC).',
      'Resolva a verificação humana antifraude antes de confirmar.',
      'Um recibo automático fica salvo na aba Notificações.',
    ],
    Icon: Coins,
  },
  {
    id: 4,
    kicker: 'Passo 4 de 4 · Primeiro Saque Pix',
    title: 'Solicite seu 1º saque via Pix a partir de R$ 0,10',
    description:
      'Já na sua primeira conversão (1.000 pts = R$ 0,10), você pode testar seu primeiro saque via Pix! Basta preencher sua chave Pix na Carteira Pix e acompanhar o pagamento em tempo real.',
    highlights: [
      'Primeiro saque Pix liberado a partir de R$ 0,10.',
      'Acompanhe o status (Pendente, Aprovado ou Pago) no Histórico de Saques.',
      'Guarde sua chave Pix favorita para agilizar próximos resgates.',
    ],
    Icon: Landmark,
  },
];

interface WelcomeTutorialModalProps {
  open: boolean;
  onClose: () => void;
  onGoToGames: () => void;
  onGoToWallet: () => void;
}

export const WelcomeTutorialModal: React.FC<WelcomeTutorialModalProps> = ({
  open,
  onClose,
  onGoToGames,
  onGoToWallet,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const step = TUTORIAL_STEPS[stepIndex];
  const StepIcon = step.Icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Top Row: Step Kicker & Close */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
              <StepIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                {step.kicker}
              </div>
              <h2
                id="tutorial-modal-title"
                className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-zinc-50 text-balance"
              >
                {step.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar tutorial"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator Bars */}
        <div className="grid grid-cols-4 gap-2">
          {TUTORIAL_STEPS.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStepIndex(idx)}
              aria-label={`Ir para passo ${idx + 1}`}
              className={`h-1.5 rounded-full transition-colors cursor-pointer ${
                idx <= stepIndex
                  ? 'bg-emerald-600 dark:bg-emerald-500'
                  : 'bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Body Content */}
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
            {step.description}
          </p>

          <ul className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 space-y-2.5 text-xs text-slate-700 dark:text-zinc-300">
            {step.highlights.map((line, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                  0{i + 1}.
                </span>
                <span className="leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {!isFirst ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Anterior
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer"
              >
                Pular tutorial
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
              >
                Próximo passo
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToWallet();
                  }}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Ir para Carteira Pix
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToGames();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Começar a Jogar
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
