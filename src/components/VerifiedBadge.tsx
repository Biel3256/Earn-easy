import React from 'react';
import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  className?: string;
  showLabel?: boolean;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  className = 'w-4 h-4',
  showLabel = false,
}) => {
  if (showLabel) {
    return (
      <span
        title="Usuário Verificado"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/30 shrink-0"
      >
        <BadgeCheck className={className} />
        Verificado
      </span>
    );
  }

  return (
    <span
      title="Usuário Verificado"
      aria-label="Usuário Verificado"
      className="inline-flex items-center justify-center text-sky-500 dark:text-sky-400 shrink-0"
    >
      <BadgeCheck className={`${className} fill-sky-500/15`} />
    </span>
  );
};
