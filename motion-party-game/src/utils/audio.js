let audioContext = null;
let masterGain = null;
let currentMasterVolume = 0.6;

export function initAudio() {
  if (audioContext) {
    return audioContext;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioContext = new Ctx();
  masterGain = audioContext.createGain();
  masterGain.gain.value = currentMasterVolume;
  masterGain.connect(audioContext.destination);
  return audioContext;
}

export function setMasterVolume(value) {
  currentMasterVolume = Math.max(0, Math.min(1, value));
  if (masterGain) {
    masterGain.gain.value = currentMasterVolume;
  }
}

export function playTone(frequency = 440, duration = 0.12, type = "sine", volume = 0.2) {
  const ctx = initAudio();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
}

export function playHit() {
  playTone(680, 0.08, "square", 0.28);
}

export function playMiss() {
  playTone(190, 0.18, "sawtooth", 0.2);
}

export function playScore() {
  playTone(540, 0.09, "triangle", 0.28);
  setTimeout(() => playTone(810, 0.1, "triangle", 0.22), 60);
}

export function playStart() {
  playTone(420, 0.1, "sine", 0.18);
  setTimeout(() => playTone(620, 0.12, "sine", 0.2), 80);
  setTimeout(() => playTone(860, 0.14, "sine", 0.24), 170);
}

export function playCountdown() {
  playTone(330, 0.07, "square", 0.15);
}
