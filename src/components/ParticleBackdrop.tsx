import React from 'react';

interface ParticleBackdropProps {
  theme: 'light' | 'dark';
}

export const ParticleBackdrop: React.FC<ParticleBackdropProps> = React.memo(({ theme }) => {
  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(circle at 12% 8%, rgba(163, 230, 53, 0.08), transparent 42%), radial-gradient(circle at 88% 28%, rgba(16, 185, 129, 0.09), transparent 40%)'
            : 'radial-gradient(circle at 12% 8%, rgba(16, 185, 129, 0.10), transparent 42%), radial-gradient(circle at 88% 28%, rgba(20, 184, 166, 0.08), transparent 40%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(rgba(163, 230, 53, 0.14) 1px, transparent 1px)'
            : 'radial-gradient(rgba(16, 185, 129, 0.16) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
    </div>
  );
});

ParticleBackdrop.displayName = 'ParticleBackdrop';
