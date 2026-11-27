'use strict';
/* Procedural sound: engine hum tied to throttle, a chime for each ring,
   a thud for a crash and a little fanfare on delivery. No audio files —
   everything is synthesised with WebAudio after the first user gesture. */

const SOUND = {
  ctx: null,
  engineOsc: null,
  engineGain: null,
  muted: false,
  started: false,
};

function startAudio() {
  if (SOUND.started) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    SOUND.ctx = new AC();
    SOUND.engineOsc = SOUND.ctx.createOscillator();
    SOUND.engineOsc.type = 'sawtooth';
    SOUND.engineOsc.frequency.value = 55;
    const filter = SOUND.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    SOUND.engineGain = SOUND.ctx.createGain();
    SOUND.engineGain.gain.value = 0;
    SOUND.engineOsc.connect(filter);
    filter.connect(SOUND.engineGain);
    SOUND.engineGain.connect(SOUND.ctx.destination);
    SOUND.engineOsc.start();
    SOUND.started = true;
  } catch (err) {
    SOUND.ctx = null;
  }
}

function updateEngineSound(f) {
  if (!SOUND.ctx || SOUND.muted) return;
  const on = f.fuel > 0 && !f.crashed;
  const target = on ? 0.015 + f.throttle * 0.05 : 0;
  SOUND.engineGain.gain.setTargetAtTime(target, SOUND.ctx.currentTime, 0.12);
  SOUND.engineOsc.frequency.setTargetAtTime(50 + f.throttle * 85 + f.speed * 0.25, SOUND.ctx.currentTime, 0.12);
}

function blip(freq, dur, type, vol, when) {
  if (!SOUND.ctx || SOUND.muted) return;
  const t0 = SOUND.ctx.currentTime + (when || 0);
  const osc = SOUND.ctx.createOscillator();
  const gain = SOUND.ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol || 0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(SOUND.ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function onRingScored(count) {
  blip(660 + count * 40, 0.18, 'triangle', 0.14, 0);
  blip(990 + count * 40, 0.26, 'triangle', 0.1, 0.09);
}

function onFlightFinished(score) {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => blip(n, 0.32, 'triangle', 0.13, i * 0.13));
}

function crashSound() {
  blip(90, 0.5, 'square', 0.16, 0);
  blip(55, 0.7, 'sawtooth', 0.12, 0.05);
}

function toggleMute() {
  SOUND.muted = !SOUND.muted;
  if (SOUND.ctx && SOUND.muted) SOUND.engineGain.gain.value = 0;
  return SOUND.muted;
}
