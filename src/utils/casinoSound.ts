let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.08,
  delaySec = 0,
  endFreq?: number
) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (typeof endFreq === 'number' && endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, start + durationSec);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  } catch {
    // Ignore Web Audio autoplay restrictions
  }
}

export const casinoSound = {
  playSpinTick(muted: boolean, pitchRatio = 1) {
    if (muted) return;
    playTone(540 * pitchRatio, 0.045, 'triangle', 0.045);
  },

  playDoubleWin(muted: boolean, isWhite = false) {
    if (muted) return;
    if (isWhite) {
      playTone(587.33, 0.14, 'triangle', 0.1, 0);
      playTone(739.99, 0.14, 'triangle', 0.1, 0.09);
      playTone(880.0, 0.18, 'triangle', 0.11, 0.18);
      playTone(1174.66, 0.34, 'sine', 0.12, 0.27);
    } else {
      playTone(523.25, 0.12, 'triangle', 0.09, 0);
      playTone(659.25, 0.12, 'triangle', 0.09, 0.08);
      playTone(783.99, 0.22, 'sine', 0.1, 0.16);
    }
  },

  playDoubleLoss(muted: boolean) {
    if (muted) return;
    playTone(260, 0.16, 'sawtooth', 0.055, 0, 180);
    playTone(185, 0.22, 'triangle', 0.06, 0.11, 130);
  },

  playMinesGem(muted: boolean, step = 1) {
    if (muted) return;
    const semitone = Math.min(12, Math.max(0, step - 1));
    const baseFreq = 587.33 * Math.pow(2, semitone / 12);
    playTone(baseFreq, 0.11, 'sine', 0.08, 0, baseFreq * 1.18);
    playTone(baseFreq * 1.5, 0.14, 'triangle', 0.05, 0.04);
  },

  playMinesBomb(muted: boolean) {
    if (muted) return;
    playTone(170, 0.24, 'sawtooth', 0.09, 0, 52);
    playTone(110, 0.32, 'square', 0.06, 0.04, 42);
  },

  playMinesCashout(muted: boolean) {
    if (muted) return;
    playTone(523.25, 0.11, 'triangle', 0.085, 0);
    playTone(659.25, 0.11, 'triangle', 0.085, 0.075);
    playTone(783.99, 0.14, 'triangle', 0.09, 0.15);
    playTone(1046.5, 0.28, 'sine', 0.1, 0.22);
  },
};
