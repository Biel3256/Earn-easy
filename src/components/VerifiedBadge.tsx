import React from 'react';
import { BadgeCheck, Crown } from 'lucide-react';
import { VerifiedBadgeTier } from '../types/earneasy';

export function resolveVerifiedBadgeTier(
  tier?: VerifiedBadgeTier | null,
  legacyVerified?: boolean
): VerifiedBadgeTier {
  if (tier === 'owner') return 'owner';
  if (tier === 'blue' || legacyVerified === true) return 'blue';
  return 'none';
}

interface VerifiedBadgeProps {
  tier?: VerifiedBadgeTier | null;
  legacyVerified?: boolean;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  tier,
  legacyVerified,
  showLabel = false,
  size = 'sm',
  className = '',
}) => {
  const resolved = resolveVerifiedBadgeTier(tier, legacyVerified);
  if (resolved === 'none') return null;

  const iconSize =
    size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const textSize =
    size === 'xs' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-[11px]';

  if (resolved === 'owner') {
    if (showLabel) {
      return (
        <span
          title="Dono Oficial — Verificado Real"
          aria-label="Dono Oficial Verificado Real"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-400/25 to-amber-500/20 border border-amber-400/60 text-amber-700 dark:text-amber-300 font-extrabold shrink-0 shadow-xs ${className}`}
        >
          <Crown className={`${iconSize} shrink-0 text-amber-500 dark:text-amber-300 fill-amber-400/35`} />
          <span className={`${textSize} leading-none tracking-tight`}>Dono Oficial</span>
        </span>
      );
    }

    return (
      <span
        title="Dono Oficial — Verificado Real"
        aria-label="Dono Oficial Verificado Real"
        className={`inline-flex items-center justify-center text-amber-500 dark:text-amber-300 font-extrabold shrink-0 ${className}`}
      >
        <Crown className={`${iconSize} shrink-0 fill-amber-400/35 drop-shadow-xs`} />
      </span>
    );
  }

  return (
    <span
      title="Perfil Verificado Azul"
      aria-label="Perfil Verificado Azul"
      className={`inline-flex items-center gap-1 text-sky-500 dark:text-sky-400 font-bold shrink-0 ${className}`}
    >
      <BadgeCheck className={`${iconSize} shrink-0 fill-sky-500/15`} />
      {showLabel && <span className={`${textSize} leading-none`}>Verificado</span>}
    </span>
  );
};
