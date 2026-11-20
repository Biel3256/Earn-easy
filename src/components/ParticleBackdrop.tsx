import React, { useEffect, useRef } from 'react';

interface ParticleBackdropProps {
  theme: 'light' | 'dark';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  hue: 'lime' | 'emerald' | 'slate';
}

export const ParticleBackdrop: React.FC<ParticleBackdropProps> = ({ theme }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let animId = 0;

    const createParticles = (w: number, h: number): Particle[] => {
      const targetCount = Math.min(64, Math.max(26, Math.floor((w * h) / 24000)));
      const list: Particle[] = [];
      for (let i = 0; i < targetCount; i++) {
        const mod = i % 5;
        list.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.34,
          vy: (Math.random() - 0.5) * 0.34 - 0.06,
          radius: 1.2 + Math.random() * 2.2,
          alpha: 0.25 + Math.random() * 0.5,
          hue: mod === 0 || mod === 1 ? 'lime' : mod === 2 || mod === 3 ? 'emerald' : 'slate',
        });
      }
      return list;
    };

    let particles = createParticles(width, height);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = createParticles(width, height);
    };

    resize();
    window.addEventListener('resize', resize);

    const drawFrame = (advance: boolean) => {
      ctx.clearRect(0, 0, width, height);

      const isDark = theme === 'dark';
      const linkDist = 128;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (advance) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -12) p.x = width + 12;
          if (p.x > width + 12) p.x = -12;
          if (p.y < -12) p.y = height + 12;
          if (p.y > height + 12) p.y = -12;
        }

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < linkDist * linkDist) {
            const strength = 1 - Math.sqrt(distSq) / linkDist;
            ctx.strokeStyle = isDark
              ? `rgba(163, 230, 53, ${(strength * 0.14).toFixed(3)})`
              : `rgba(16, 185, 129, ${(strength * 0.12).toFixed(3)})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let fill: string;
        if (p.hue === 'lime') {
          fill = isDark
            ? `rgba(163, 230, 53, ${(p.alpha * 0.85).toFixed(3)})`
            : `rgba(101, 163, 13, ${(p.alpha * 0.55).toFixed(3)})`;
        } else if (p.hue === 'emerald') {
          fill = isDark
            ? `rgba(16, 185, 129, ${(p.alpha * 0.78).toFixed(3)})`
            : `rgba(5, 150, 105, ${(p.alpha * 0.5).toFixed(3)})`;
        } else {
          fill = isDark
            ? `rgba(161, 161, 170, ${(p.alpha * 0.4).toFixed(3)})`
            : `rgba(100, 116, 139, ${(p.alpha * 0.32).toFixed(3)})`;
        }

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (prefersReducedMotion) {
      drawFrame(false);
    } else {
      const renderLoop = () => {
        if (!document.hidden) {
          drawFrame(true);
        }
        animId = window.requestAnimationFrame(renderLoop);
      };
      animId = window.requestAnimationFrame(renderLoop);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (animId) window.cancelAnimationFrame(animId);
    };
  }, [theme]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      <div
        className={`absolute -top-40 -left-32 w-[460px] h-[460px] rounded-full blur-3xl transition-colors ${
          theme === 'dark' ? 'bg-lime-500/8' : 'bg-emerald-400/15'
        }`}
      />
      <div
        className={`absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full blur-3xl transition-colors ${
          theme === 'dark' ? 'bg-emerald-500/10' : 'bg-teal-300/15'
        }`}
      />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
