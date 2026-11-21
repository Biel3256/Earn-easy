import React from 'react';
import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  showLabel = false,
  size = 'sm',
  className = '',
}) => {
  const iconSize =
    size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const textSize =
    size === 'xs' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-[11px]';

  return (
    <span
      title="Perfil Verificado (+18 e Facial)"
      aria-label="Perfil Verificado"
      className={`inline-flex items-center gap-1 text-sky-500 dark:text-sky-400 font-bold shrink-0 ${className}`}
    >
      <BadgeCheck className={`${iconSize} shrink-0 fill-sky-500/15`} />
      {showLabel && <span className={`${textSize} leading-none`}>Verificado</span>}
    </span>
  );
};
