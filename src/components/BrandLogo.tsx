import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  const crownSize =
    size === 'lg' ? 'w-7 h-5' : size === 'sm' ? 'w-5 h-3.5' : 'w-6 h-4';
  const textSize =
    size === 'lg' ? 'text-2xl sm:text-[26px]' : size === 'sm' ? 'text-base sm:text-lg' : 'text-xl';

  return (
    <span
      className={`inline-flex flex-col items-center justify-center select-none whitespace-nowrap shrink-0 leading-none ${className}`}
    >
      {/* Golden Crown Accent */}
      <svg
        viewBox="0 0 32 18"
        fill="none"
        className={`${crownSize} -mb-0.5 drop-shadow-[0_2px_6px_rgba(250,204,21,0.45)]`}
        aria-hidden="true"
      >
        <path
          d="M4 15L2 5.5L9.5 10L16 2.5L22.5 10L30 5.5L28 15H4Z"
          fill="url(#ee_crown_grad)"
          stroke="#FDE047"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <circle cx="2" cy="5" r="1.4" fill="#FEF08A" />
        <circle cx="16" cy="2" r="1.7" fill="#FEF08A" />
        <circle cx="30" cy="5" r="1.4" fill="#FEF08A" />
        <defs>
          <linearGradient id="ee_crown_grad" x1="2" y1="2" x2="30" y2="16" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDE047" />
            <stop offset="1" stopColor="#D97706" />
          </linearGradient>
        </defs>
      </svg>

      {/* Bold Lime/Emerald Gaming Wordmark */}
      <span
        className={`${textSize} font-display font-extrabold italic tracking-tight bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-600 dark:from-lime-300 dark:via-lime-400 dark:to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(163,230,53,0.22)]`}
      >
        Earn Easy
      </span>

      {/* Curved Lime Swoosh Underline */}
      <svg
        viewBox="0 0 110 8"
        fill="none"
        className="w-full max-w-[96px] h-1.5 -mt-0.5"
        aria-hidden="true"
      >
        <path
          d="M4 5.5C34 1.5 76 1.5 106 4.5"
          stroke="url(#ee_swoosh)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="ee_swoosh" x1="4" y1="4" x2="106" y2="4" gradientUnits="userSpaceOnUse">
            <stop stopColor="#65A30D" />
            <stop offset="0.5" stopColor="#A3E635" />
            <stop offset="1" stopColor="#10B981" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
};
