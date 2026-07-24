/**
 * Support chat notification sounds.
 * Uses HTMLAudioElement + tiny WAV (more reliable than Web Audio on mobile).
 */

type Tone = 'visitor' | 'agent'

let unlocked = false
let lastPlayedAt = 0
let audioVisitor: HTMLAudioElement | null = null
let audioAgent: HTMLAudioElement | null = null
let ctx: AudioContext | null = null

function makeBeepWav(freq1: number, freq2: number, volume = 0.35): string {
  const sampleRate = 22050
  const duration = 0.28
  const n = Math.floor(sampleRate * duration)
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const env = Math.min(1, t * 30) * Math.max(0, 1 - t / duration)
    const f = t < 0.12 ? freq1 : freq2
    data[i] = Math.sin(2 * Math.PI * f * t) * env * volume
  }
  const buffer = new ArrayBuffer(44 + n * 2)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, n * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    o += 2
  }
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return 'data:audio/wav;base64,' + btoa(binary)
}

function ensureAudio() {
  if (typeof window === 'undefined') return
  if (!audioVisitor) {
    audioVisitor = new Audio(makeBeepWav(523, 659, 0.4))
    audioVisitor.preload = 'auto'
  }
  if (!audioAgent) {
    audioAgent = new Audio(makeBeepWav(880, 1175, 0.45))
    audioAgent.preload = 'auto'
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  return ctx
}

export function unlockSupportSound(): void {
  ensureAudio()
  unlocked = true
  // Play near-silent sample inside the gesture to unlock autoplay policy.
  const el = audioVisitor
  if (el) {
    const prev = el.volume
    el.volume = 0.01
    void el.play().then(() => {
      el.pause()
      el.currentTime = 0
      el.volume = prev || 1
    }).catch(() => {
      el.volume = prev || 1
    })
  }
  const c = getCtx()
  if (c && c.state === 'suspended') {
    void c.resume().catch(() => {})
  }
}

function playEl(el: HTMLAudioElement | null) {
  if (!el) return
  try {
    el.currentTime = 0
    el.volume = 1
    const p = el.play()
    if (p && typeof p.then === 'function') {
      p.catch(() => {
        // Fallback Web Audio if HTMLAudio blocked
        playOscFallback(el === audioAgent ? 'agent' : 'visitor')
      })
    }
  } catch {
    playOscFallback(el === audioAgent ? 'agent' : 'visitor')
  }
}

function playOscFallback(kind: Tone) {
  const c = getCtx()
  if (!c) return
  const go = () => {
    const t0 = c.currentTime
    const freqs = kind === 'agent' ? [880, 1175] : [523, 659]
    freqs.forEach((freq, i) => {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.13
      g.gain.setValueAtTime(0.001, start)
      g.gain.linearRampToValueAtTime(0.12, start + 0.02)
      g.gain.linearRampToValueAtTime(0.001, start + 0.14)
      osc.connect(g)
      g.connect(c.destination)
      osc.start(start)
      osc.stop(start + 0.16)
    })
  }
  if (c.state === 'suspended') {
    void c.resume().then(go).catch(() => {})
  } else {
    go()
  }
}

export function playSupportSound(kind: Tone = 'visitor'): void {
  const now = Date.now()
  if (now - lastPlayedAt < 700) return
  lastPlayedAt = now
  ensureAudio()
  if (!unlocked) {
    // Still try — some browsers allow it after prior unlock on site
    playEl(kind === 'agent' ? audioAgent : audioVisitor)
    return
  }
  playEl(kind === 'agent' ? audioAgent : audioVisitor)
}
