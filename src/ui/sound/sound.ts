// Sound effects, synthesized on the fly with the Web Audio API (no audio files): each sound
// in config.ts SOUNDS is a few short oscillator notes with a quick fade in and out, which gives
// a chiptune feel that suits the pixel look.
//
// Browsers only allow audio after the player has interacted with the page, so the audio
// context is created on the first sound, which always follows a click or key press.

import { SOUND_VOLUME, SOUNDS, type SoundName } from '../../config.ts';

let enabled = true;
let audio: AudioContext | null = null;

/** The Sound setting. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function context(): AudioContext | null {
  if (audio) return audio;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audio = new Ctor();
  } catch {
    return null; // no audio available: play silently
  }
  return audio;
}

/** Plays a sound effect if Sound effects is on (or always, with force). Never throws. */
export function playSound(name: SoundName, force = false): void {
  if (!enabled && !force) return;
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t0 = ctx.currentTime + 0.005;
  for (const n of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.wave;
    const start = t0 + n.at;
    const end = start + n.dur;
    osc.frequency.setValueAtTime(n.f, start);
    if ('to' in n && n.to) osc.frequency.linearRampToValueAtTime(n.to, end);
    // A fast attack and release, so notes don't click.
    const peak = SOUND_VOLUME * n.vol;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.005);
    gain.gain.setValueAtTime(peak, Math.max(start + 0.005, end - 0.02));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.01);
  }
}
