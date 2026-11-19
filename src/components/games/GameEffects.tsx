import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export interface ParticleBurstEvent {
  id: number;
  xPct: number;
  yPct: number;
  colors: string[];
  count?: number;
  spreadPx?: number;
}

export interface FloatingFeedbackEvent {
  id: number;
  xPct?: number;
  yPct?: number;
  text: string;
  accentColor?: string;
}

interface ParticleSpec {
  idx: number;
  angleRad: number;
  distance: number;
  size: number;
  color: string;
  shape: 'circle' | 'diamond' | 'pill';
  rotation: number;
  delay: number;
}

function buildParticles(event: ParticleBurstEvent): ParticleSpec[] {
  const count = event.count ?? 14;
  const spread = event.spreadPx ?? 72;
  const shapes: ParticleSpec['shape'][] = ['circle', 'diamond', 'pill'];

  return Array.from({ length: count }).map((_, idx) => {
    const baseAngle = (Math.PI * 2 * idx) / count;
    const jitter = ((idx % 3) - 1) * 0.22;
    const angleRad = baseAngle + jitter;
    const distance = spread * (0.58 + ((idx * 17) % 10) / 20);
    const size = 5 + (idx % 4) * 2;
    const color = event.colors[idx % event.colors.length];
    const shape = shapes[idx % shapes.length];
    const rotation = ((idx * 47) % 180) - 90;
    const delay = (idx % 4) * 0.02;

    return {
      idx,
      angleRad,
      distance,
      size,
      color,
      shape,
      rotation,
      delay,
    };
  });
}

export const ParticleBurstLayer: React.FC<{ events: ParticleBurstEvent[] }> = ({ events }) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion || events.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-30" aria-hidden="true">
      <AnimatePresence>
        {events.map((event) => {
          const particles = buildParticles(event);
          return (
            <div
              key={event.id}
              className="absolute"
              style={{
                left: `${event.xPct}%`,
                top: `${event.yPct}%`,
              }}
            >
              {/* Expanding soft ring */}
              <motion.span
                initial={{ scale: 0.2, opacity: 0.85 }}
                animate={{ scale: 2.3, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2"
                style={{ borderColor: event.colors[0] }}
              />

              {/* Radial particles */}
              {particles.map((p) => {
                const targetX = Math.cos(p.angleRad) * p.distance;
                const targetY = Math.sin(p.angleRad) * p.distance + 10;

                return (
                  <motion.span
                    key={p.idx}
                    initial={{
                      x: 0,
                      y: 0,
                      scale: 0.3,
                      opacity: 1,
                      rotate: 0,
                    }}
                    animate={{
                      x: targetX,
                      y: targetY,
                      scale: [0.4, 1.15, 0.25],
                      opacity: [1, 1, 0],
                      rotate: p.rotation,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.72,
                      delay: p.delay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 block"
                    style={{
                      width: p.shape === 'pill' ? p.size * 1.45 : p.size,
                      height: p.shape === 'pill' ? p.size * 0.65 : p.size,
                      backgroundColor: p.color,
                      borderRadius:
                        p.shape === 'circle' ? '9999px' : p.shape === 'pill' ? '9999px' : '2px',
                      transform: p.shape === 'diamond' ? 'rotate(45deg)' : undefined,
                      boxShadow: `0 0 8px ${p.color}66`,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export const FloatingFeedbackLayer: React.FC<{ items: FloatingFeedbackEvent[] }> = ({ items }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-40" aria-hidden="true">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12, scale: 0.78 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: [0, 1, 1, 0] }
                : { opacity: [0, 1, 1, 0], y: -34, scale: [0.82, 1.06, 1] }
            }
            exit={{ opacity: 0 }}
            transition={{ duration: 1.15, ease: 'easeOut' }}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1 rounded-full text-xs font-extrabold shadow-lg border backdrop-blur-xs bg-slate-900/95 dark:bg-zinc-950/95 text-white border-white/15 tabular-nums"
            style={{
              left: `${item.xPct ?? 50}%`,
              top: `${item.yPct ?? 45}%`,
              color: item.accentColor || '#34d399',
            }}
          >
            {item.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
