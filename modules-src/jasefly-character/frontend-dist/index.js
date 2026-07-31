/**
 * Jasefly Character — дух CMS (не чат-бот).
 * Речь: ≤3 слова / эмодзи / тишина. Умный гид + разовые пасхалки.
 * Палитра #17A8FF / #0A1625 / #FFFFFF / #5FD6FF.
 */
const SLUG = 'jasefly-character'
const VERSION = '1.6.0'
const API = '/api/v1'
const WELCOME_KEY = 'jasefly_character_welcomed_v1'
const PUBLIC_HELLO_KEY = 'jasefly_character_public_hello_v1'
const APPEAR_LOG_KEY = 'jasefly_character_appear_log_v1'
const LIFE_KEY = 'jasefly_character_life_v1'
const SPIRIT_EVENT = 'jasefly-spirit'
const C = {
  primary: '#17A8FF',
  dark: '#0A1625',
  white: '#FFFFFF',
  light: '#5FD6FF',
}

const DEFAULT_BINDINGS = {
  'module.install.start': { emotion: 'loading', pose: 'celebrate', duration: 0, badge: null },
  'module.install.success': { emotion: 'success', pose: 'celebrate', duration: 2400, badge: '✓' },
  'module.install.error': { emotion: 'error', pose: 'inspect', duration: 3400, badge: null },
  'module.update.success': { emotion: 'success', pose: 'celebrate', duration: 2200, badge: '✓' },
  'admin.welcome': { emotion: 'happy', pose: 'wave', duration: 2800, badge: null },
  'admin.idle': { emotion: 'sleep', pose: 'sleep', duration: 4200, badge: null },
  'content.publish': { emotion: 'happy', pose: 'hover', duration: 2200, badge: null },
  'content.save': { emotion: 'neutral', pose: 'idle', duration: 1600, badge: null },
  'cms.error': { emotion: 'error', pose: 'inspect', duration: 3000, badge: null },
  'indexnow.done': { emotion: 'success', pose: 'wave', duration: 2000, badge: null },
  'ai.finished': { emotion: 'think', pose: 'thinking', duration: 2200, badge: null },
  'build.success': { emotion: 'success', pose: 'celebrate', duration: 2400, badge: '✓' },
  'build.error': { emotion: 'error', pose: 'inspect', duration: 3400, badge: null },
  'landing.visit': { emotion: 'happy', pose: 'hover', duration: 5200, badge: null, anchor: 'logo' },
}

function authHeaders(extra = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'same-origin', ...opts, headers: authHeaders(opts.headers || {}) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* */ }
  if (!res.ok) throw new Error(json?.error || json?.message || text || res.statusText)
  return json?.data ?? json
}

const STYLE_ID = 'jasefly-character-css'
function ensureStyles() {
  if (typeof document === 'undefined') return
  let s = document.getElementById(STYLE_ID)
  if (!s) {
    s = document.createElement('style')
    s.id = STYLE_ID
    document.head.appendChild(s)
  }
  if (s.getAttribute('data-v') === VERSION) return
  s.setAttribute('data-v', VERSION)
  s.textContent = `
@keyframes jf-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes jf-hover {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes jf-wing-l {
  0%, 100% { transform: rotate(-8deg); }
  50% { transform: rotate(-22deg); }
}
@keyframes jf-wing-r {
  0%, 100% { transform: rotate(8deg); }
  50% { transform: rotate(22deg); }
}
@keyframes jf-tail {
  0%, 100% { transform: scaleY(1) translateY(0); }
  50% { transform: scaleY(1.08) translateY(1px); }
}
@keyframes jf-core {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}
@keyframes jf-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes jf-wave-paw {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(-28deg); }
  70% { transform: rotate(12deg); }
}
@keyframes jf-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  96% { transform: scaleY(0.12); }
}
@keyframes jf-fade-in {
  from { opacity: 0; transform: translateY(8px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes jf-fade-out {
  from { opacity: 1; }
  to { opacity: 0; transform: translateY(-6px) scale(0.96); }
}
@keyframes jf-bubble-in {
  from { opacity: 0; transform: translateY(6px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes jf-beg-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
.jf-char-root {
  position: fixed;
  z-index: 99980;
  pointer-events: none;
  width: 72px;
  height: 72px;
  margin: 0;
  overflow: visible;
  animation: jf-fade-in 0.55s ease both;
  will-change: left, top, opacity;
  transition: left 0.12s ease-out, top 0.12s ease-out;
}
.jf-char-root.jf-playing {
  animation: none;
  opacity: 1;
  transition: none;
  pointer-events: auto;
  cursor: pointer;
}
.jf-char-root.jf-begging .jf-char-stage {
  animation: jf-beg-pulse 0.85s ease-in-out infinite;
  filter: drop-shadow(0 0 14px rgba(95, 214, 255, 0.7));
}
.jf-char-root.jf-hiding { animation: jf-fade-out 0.55s ease both; pointer-events: none; }
.jf-char-stage {
  width: 100%;
  height: 100%;
  transform-origin: 50% 55%;
  filter: drop-shadow(0 0 10px rgba(23, 168, 255, 0.35));
}
.jf-char-bubble {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  max-width: 168px;
  padding: 7px 11px;
  border-radius: 14px 14px 14px 6px;
  background: ${C.dark};
  color: ${C.white};
  border: 1.5px solid ${C.primary};
  font: 650 12px/1.25 Geist, "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.01em;
  white-space: nowrap;
  text-align: center;
  pointer-events: none;
  box-shadow: 0 8px 22px rgba(10, 22, 37, 0.35);
  animation: jf-bubble-in 0.28s ease both;
  z-index: 2;
}
.jf-char-bubble.side-left {
  left: 0;
  right: auto;
  transform: none;
  border-radius: 14px 14px 14px 6px;
}
.jf-char-bubble.side-right {
  left: auto;
  right: 0;
  transform: none;
  border-radius: 14px 14px 6px 14px;
}
.jf-char-bubble::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 10px;
  height: 10px;
  background: ${C.dark};
  border-right: 1.5px solid ${C.primary};
  border-bottom: 1.5px solid ${C.primary};
  transform: translateX(-50%) rotate(45deg);
}
.jf-char-bubble.side-left::after { left: 18px; }
.jf-char-bubble.side-right::after { left: auto; right: 18px; transform: rotate(45deg); }
.jf-char-bubble em {
  font-style: normal;
  color: ${C.light};
}
.jf-char-bubble.is-emoji {
  font-size: 18px;
  line-height: 1;
  padding: 8px 10px;
  border-radius: 999px;
}
@media (prefers-reduced-motion: reduce) {
  .jf-char-root { transition: none; filter: none; }
  .jf-char-stage.pose-idle,
  .jf-char-stage.pose-hover { animation: none; }
}
.jf-char-stage.pose-idle { animation: jf-float 2.4s ease-in-out infinite; }
.jf-char-stage.pose-hover { animation: jf-hover 2.8s ease-in-out infinite; }
.jf-char-stage.pose-celebrate { animation: jf-spin 2.2s ease-in-out 1; }
.jf-char-stage.pose-sleep { transform: rotate(-12deg) translateY(4px); }
.jf-char-stage.pose-look { transform: rotate(10deg); }
.jf-char-stage.pose-inspect { transform: rotate(-6deg) translate(4px, 2px); }
.jf-char-stage.pose-thinking { transform: translateY(-2px); }
.jf-char-svg .jf-wing-l { transform-origin: 28px 34px; animation: jf-wing-l 1.1s ease-in-out infinite; }
.jf-char-svg .jf-wing-r { transform-origin: 52px 34px; animation: jf-wing-r 1.1s ease-in-out infinite; }
.jf-char-svg.pose-sleep .jf-wing-l,
.jf-char-svg.pose-sleep .jf-wing-r { animation: none; transform: rotate(0deg) translateY(4px); opacity: 0.85; }
.jf-char-svg.pose-error .jf-wing-l { animation: none; transform: rotate(18deg) translateY(6px); }
.jf-char-svg.pose-error .jf-wing-r { animation: none; transform: rotate(-18deg) translateY(6px); }
.jf-char-svg .jf-tail { transform-origin: 40px 58px; animation: jf-tail 1.6s ease-in-out infinite; }
.jf-char-svg .jf-core { transform-origin: 40px 48px; animation: jf-core 2s ease-in-out infinite; }
.jf-char-svg .jf-eye { transform-origin: center; animation: jf-blink 3.6s ease-in-out infinite; }
.jf-char-svg.emotion-sleep .jf-eye,
.jf-char-svg.emotion-error .jf-eye { animation: none; }
.jf-char-svg .jf-paw-l.wave { transform-origin: 34px 54px; animation: jf-wave-paw 0.9s ease-in-out 3; }
.jf-char-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: ${C.dark};
  border: 1.5px solid ${C.white};
  color: ${C.light};
  font-size: 11px;
  line-height: 15px;
  text-align: center;
  font-weight: 700;
}
.jf-char-admin-preview {
  display: grid;
  gap: 14px;
}
.jf-char-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.jf-char-card {
  border: 1px solid #27272a;
  border-radius: 14px;
  background: rgba(10, 22, 37, 0.65);
  padding: 12px;
  text-align: center;
}
.jf-char-card span {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #a1a1aa;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
`
}

/** Eyes / mouth overlays by emotion — pure geometry */
function EyePair({ h, emotion }) {
  const L = { cx: 33, cy: 30 }
  const R = { cx: 47, cy: 30 }
  const stroke = { stroke: C.dark, strokeWidth: 2.2, strokeLinecap: 'round', fill: 'none' }

  if (emotion === 'sleep') {
    return h('g', { className: 'jf-eyes' },
      h('path', { d: 'M28 30 H38', ...stroke }),
      h('path', { d: 'M42 30 H52', ...stroke }),
    )
  }
  if (emotion === 'happy' || emotion === 'success') {
    return h('g', { className: 'jf-eyes' },
      h('path', { d: 'M29 31 Q33 27 37 31', ...stroke }),
      h('path', { d: 'M43 31 Q47 27 51 31', ...stroke }),
    )
  }
  if (emotion === 'angry') {
    return h('g', { className: 'jf-eyes' },
      h('path', { d: 'M30 28 L36 32 L30 36', ...stroke }),
      h('path', { d: 'M50 28 L44 32 L50 36', ...stroke }),
    )
  }
  if (emotion === 'error') {
    return h('g', { className: 'jf-eyes' },
      h('path', { d: 'M30 27 L36 33 M36 27 L30 33', ...stroke }),
      h('path', { d: 'M44 27 L50 33 M50 27 L44 33', ...stroke }),
    )
  }
  if (emotion === 'love') {
    const heart = (x, y) => h('path', {
      d: `M${x} ${y + 2} C${x} ${y} ${x - 3} ${y} ${x - 3} ${y + 2} C${x - 3} ${y + 4} ${x} ${y + 6} ${x} ${y + 7} C${x} ${y + 6} ${x + 3} ${y + 4} ${x + 3} ${y + 2} C${x + 3} ${y} ${x} ${y} ${x} ${y + 2} Z`,
      fill: C.primary,
      stroke: C.white,
      strokeWidth: 1,
    })
    return h('g', { className: 'jf-eyes' }, heart(33, 26), heart(47, 26))
  }
  if (emotion === 'loading') {
    return h('g', { className: 'jf-eyes' },
      h('circle', { cx: L.cx, cy: L.cy, r: 4.2, fill: 'none', stroke: C.dark, strokeWidth: 1.8 }),
      h('circle', { cx: L.cx, cy: L.cy, r: 1.6, fill: C.dark }),
      h('circle', { cx: R.cx, cy: R.cy, r: 4.2, fill: 'none', stroke: C.dark, strokeWidth: 1.8 }),
      h('circle', { cx: R.cx, cy: R.cy, r: 1.6, fill: C.dark }),
    )
  }
  if (emotion === 'think') {
    return h('g', { className: 'jf-eyes' },
      h('circle', { className: 'jf-eye', cx: L.cx, cy: L.cy, r: 2.2, fill: C.dark }),
      h('circle', { className: 'jf-eye', cx: R.cx, cy: R.cy, r: 2.2, fill: C.dark }),
    )
  }
  // neutral
  return h('g', { className: 'jf-eyes' },
    h('circle', { className: 'jf-eye', cx: L.cx, cy: L.cy, r: 3.4, fill: C.dark }),
    h('circle', { className: 'jf-eye', cx: R.cx, cy: R.cy, r: 3.4, fill: C.dark }),
  )
}

function Accessory({ h, emotion }) {
  if (emotion === 'think') {
    return h('g', { opacity: 0.95 },
      h('circle', { cx: 58, cy: 18, r: 5.5, fill: C.light, stroke: C.white, strokeWidth: 1.5 }),
      h('path', { d: 'M58 24 v3', stroke: C.white, strokeWidth: 1.5, strokeLinecap: 'round' }),
    )
  }
  if (emotion === 'success') {
    return h('g', null,
      h('circle', { cx: 60, cy: 56, r: 7, fill: C.dark, stroke: C.white, strokeWidth: 1.5 }),
      h('path', { d: 'M56.5 56 L59 58.5 L63.5 53.5', fill: 'none', stroke: C.light, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )
  }
  return null
}

/**
 * ≤20 shapes. Recognizable at 32×32.
 * Construction: wings (6) + tail + body + core + head + eyes(2) + paws(2) + optional accessory.
 */
function CharacterSvg({ h, emotion = 'neutral', pose = 'idle', size = 72, wave = false }) {
  const stroke = { stroke: C.white, strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round' }
  return h('svg', {
    className: `jf-char-svg emotion-${emotion} pose-${pose}`,
    viewBox: '0 0 80 80',
    width: size,
    height: size,
    role: 'img',
    'aria-label': 'Jasefly character',
  },
    // Left wing — 3 segments (wing / feather / lightning)
    h('g', { className: 'jf-wing-l' },
      h('path', { d: 'M30 36 C22 30 14 28 10 32 C14 34 20 38 26 42 Z', fill: C.primary, ...stroke }),
      h('path', { d: 'M28 40 C20 38 12 40 8 46 C14 46 22 46 28 44 Z', fill: C.light, ...stroke }),
      h('path', { d: 'M28 44 C22 48 16 54 14 60 C20 54 26 50 30 46 Z', fill: C.primary, ...stroke }),
    ),
    // Right wing
    h('g', { className: 'jf-wing-r' },
      h('path', { d: 'M50 36 C58 30 66 28 70 32 C66 34 60 38 54 42 Z', fill: C.primary, ...stroke }),
      h('path', { d: 'M52 40 C60 38 68 40 72 46 C66 46 58 46 52 44 Z', fill: C.light, ...stroke }),
      h('path', { d: 'M52 44 C58 48 64 54 66 60 C60 54 54 50 50 46 Z', fill: C.primary, ...stroke }),
    ),
    // Energy tail
    h('path', {
      className: 'jf-tail',
      d: 'M40 56 C36 62 34 68 38 74 C40 70 44 70 42 74 C46 68 44 62 40 56 Z',
      fill: C.light,
      ...stroke,
    }),
    // Tiny body (teardrop)
    h('path', {
      d: 'M34 44 C34 40 46 40 46 44 C46 52 42 58 40 58 C38 58 34 52 34 44 Z',
      fill: C.primary,
      ...stroke,
    }),
    // Energy core (logo mark)
    h('circle', { className: 'jf-core', cx: 40, cy: 48, r: 3.6, fill: C.light, stroke: C.white, strokeWidth: 1.4 }),
    // Head
    h('circle', { cx: 40, cy: 30, r: 14, fill: C.primary, ...stroke }),
    // Eyes
    h(EyePair, { h, emotion }),
    // Tiny paws (no arms/legs)
    h('ellipse', {
      className: wave || pose === 'wave' ? 'jf-paw-l wave' : 'jf-paw-l',
      cx: 34, cy: 54, rx: 3.2, ry: 2.2, fill: C.primary, ...stroke,
    }),
    h('ellipse', { cx: 46, cy: 54, rx: 3.2, ry: 2.2, fill: C.primary, ...stroke }),
    h(Accessory, { h, emotion }),
  )
}

function Stage({ ui, state }) {
  const h = ui.createElement
  const { emotion, pose, visible, hiding, playing, begging, x, y, size, badge, say } = state
  if (!visible && !hiding) return null
  const nearRight = x > (typeof window !== 'undefined' ? window.innerWidth * 0.62 : 400)
  const nearLeft = x < (typeof window !== 'undefined' ? window.innerWidth * 0.28 : 120)
  const side = nearRight ? 'side-right' : (nearLeft ? 'side-left' : '')
  return h('div', {
    className: `jf-char-root${hiding ? ' jf-hiding' : ''}${playing ? ' jf-playing' : ''}${begging ? ' jf-begging' : ''}`,
    style: { left: `${x}px`, top: `${y}px`, width: size, height: size },
    'data-jasefly-character': '1',
    'data-jasefly-mood': state.mood || '',
    'data-no-translate': '1',
    'aria-hidden': 'true',
    title: state.moodTitle || say || '',
  },
    say ? h('div', {
      className: `jf-char-bubble ${side}${isEmojiSay(say) ? ' is-emoji' : ''}`.trim(),
      key: say,
      'aria-hidden': 'true',
    }, say) : null,
    h('div', { className: `jf-char-stage pose-${pose}` },
      h(CharacterSvg, { h, emotion, pose, size, wave: pose === 'wave' }),
    ),
    badge ? h('div', { className: 'jf-char-badge', 'aria-hidden': 'true' }, badge) : null,
  )
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function findLogoAnchor() {
  const candidates = [
    document.querySelector('a[href="/"] img'),
    document.querySelector('header a[href="/"]'),
    document.querySelector('[data-brand-logo]'),
    document.querySelector('a[href="/"] svg'),
  ].filter(Boolean)
  const el = candidates[0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return null
  return {
    x: clamp(r.right - 18, 8, window.innerWidth - 80),
    y: clamp(r.top - 8, 8, window.innerHeight - 80),
  }
}

function defaultCorner() {
  return { x: window.innerWidth - 96, y: window.innerHeight - 110 }
}

function AdminApp({ ui }) {
  const h = ui.createElement
  const useState = ui.useState
  const useEffect = ui.useEffect
  const [settings, setSettings] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [newEvent, setNewEvent] = useState('')
  const emotions = ['neutral', 'happy', 'sleep', 'think', 'love', 'angry', 'loading', 'error', 'success']
  const poses = ['idle', 'hover', 'wave', 'look', 'thinking', 'inspect', 'sleep', 'celebrate']

  useEffect(() => {
    ensureStyles()
    apiFetch('/admin/jasefly-character/settings').then((data) => {
      setSettings({
        ...data,
        bindings: { ...DEFAULT_BINDINGS, ...(data.bindings || {}) },
      })
    }).catch((e) => setErr(e.message))
  }, [])

  const save = async () => {
    setBusy(true); setMsg(''); setErr('')
    try {
      const data = await apiFetch('/admin/jasefly-character/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
      setSettings({ ...data, bindings: { ...DEFAULT_BINDINGS, ...(data.bindings || {}) } })
      cachedConfig = { ...cachedConfig, ...data }
      setMsg('Сохранено — дух обновил карту реакций')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const preview = (emotion, pose) => {
    try {
      window.jaseflyCharacter?.show({ emotion, pose, duration: 2800, anchor: 'corner', force: true })
    } catch { /* */ }
  }

  if (!settings) {
    return h('div', { style: { color: '#a1a1aa', padding: 20 } }, err || 'Загрузка…')
  }

  const toggle = (key) => setSettings({ ...settings, [key]: settings[key] ? 0 : 1 })
  const bindings = settings.bindings || {}
  const setBinding = (event, patch) => {
    setSettings({
      ...settings,
      bindings: { ...bindings, [event]: { ...bindings[event], ...patch } },
    })
  }
  const removeBinding = (event) => {
    const next = { ...bindings }
    delete next[event]
    setSettings({ ...settings, bindings: next })
  }
  const addBinding = () => {
    const ev = (newEvent || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (!ev || bindings[ev]) return
    setSettings({
      ...settings,
      bindings: { ...bindings, [ev]: { emotion: 'happy', pose: 'hover', duration: 2200, badge: null } },
    })
    setNewEvent('')
  }

  const field = (label, key, min, max) => h('label', {
    style: { display: 'grid', gap: 6, marginBottom: 12, fontSize: 13, color: '#a1a1aa' },
  },
    label,
    h('input', {
      type: 'number',
      min, max,
      value: settings[key] ?? min,
      onChange: (e) => setSettings({ ...settings, [key]: Number(e.target.value) }),
      style: {
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa', font: 'inherit',
      },
    }),
  )

  return h('div', { style: { maxWidth: 960, color: '#e4e4e7', paddingBottom: 40 } },
    h('p', { style: { margin: 0, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#38bdf8' } }, 'Платформа'),
    h('h1', { style: { margin: '6px 0 8px', fontSize: 26, fontWeight: 650 } }, 'Дух CMS'),
    h('p', { style: { margin: 0, fontSize: 14, color: '#a1a1aa', maxWidth: 680, lineHeight: 1.55 } },
      'Тихий гид: 1–3 слова или эмодзи, часто молчит. Умные подсказки («Эй, сюда!»), разовые пасхалки (первый ZIP, первый релиз…). ',
      'Не чат-бот — живая эмоция платформы.'),
    h('div', { style: { marginTop: 18, border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)', padding: 18 } },
      [
        ['enabled', 'Дух включён'],
        ['playful', 'Игровой ИИ (курсор, прятки, меню)'],
        ['show_on_landing', 'Реагировать на landing.visit'],
        ['show_on_admin_welcome', 'Реагировать на admin.welcome'],
        ['show_on_module_ops', 'Реагировать на module.*'],
      ].map(([key, label]) =>
        h('label', {
          key,
          style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 14, cursor: 'pointer' },
        },
          h('input', {
            type: 'checkbox', checked: !!settings[key], onChange: () => toggle(key),
            style: { width: 18, height: 18, accentColor: C.primary },
          }),
          label,
        ),
      ),
      field('Пауза между выходками на сайте (сек, 1–8)', 'play_interval_sec', 1, 30),
      field('Пауза между реакциями на события (сек)', 'cooldown_sec', 5, 600),
      field('Макс. реакций на события в час', 'max_per_hour', 1, 60),
      field('Бездействие → admin.idle (мин)', 'idle_minutes', 1, 60),
      h('button', {
        type: 'button',
        onClick: () => {
          try { window.jaseflyCharacter?.playNow?.() } catch { /* */ }
        },
        style: {
          marginTop: 4, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.primary}`,
          background: 'transparent', color: C.light, cursor: 'pointer', font: 'inherit',
        },
      }, 'Сыграть сейчас'),
    ),
    h('div', { style: { marginTop: 14, border: '1px solid #27272a', borderRadius: 16, background: 'rgba(24,24,27,.55)', padding: 18 } },
      h('h2', { style: { margin: '0 0 8px', fontSize: 16 } }, 'События → реакции'),
      h('p', { style: { margin: '0 0 12px', fontSize: 13, color: '#71717a' } },
        'ZIP-модули могут добавлять свои события (ai.finished, indexnow.done…) без правки ядра.'),
      Object.keys(bindings).sort().map((event) => {
        const rule = bindings[event] || {}
        return h('div', {
          key: event,
          style: {
            display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 90px 70px 36px', gap: 8,
            alignItems: 'center', marginBottom: 8,
          },
        },
          h('code', { style: { fontSize: 12, color: C.light } }, event),
          h('select', {
            value: rule.emotion || 'neutral',
            onChange: (e) => setBinding(event, { emotion: e.target.value }),
            style: { padding: 8, borderRadius: 8, border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa' },
          }, emotions.map((em) => h('option', { key: em, value: em }, em))),
          h('select', {
            value: rule.pose || 'idle',
            onChange: (e) => setBinding(event, { pose: e.target.value }),
            style: { padding: 8, borderRadius: 8, border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa' },
          }, poses.map((p) => h('option', { key: p, value: p }, p))),
          h('input', {
            type: 'number', min: 0, max: 20000, value: rule.duration ?? 2200,
            title: 'мс; 0 = пока следующее событие / 30с',
            onChange: (e) => setBinding(event, { duration: Number(e.target.value) }),
            style: { padding: 8, borderRadius: 8, border: '1px solid #3f3f46', background: '#09090b', color: '#fafafa' },
          }),
          h('button', {
            type: 'button',
            onClick: () => preview(rule.emotion || 'neutral', rule.pose || 'idle'),
            style: { padding: '8px 6px', borderRadius: 8, border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', cursor: 'pointer' },
          }, '▶'),
          h('button', {
            type: 'button', onClick: () => removeBinding(event),
            style: { padding: 6, borderRadius: 8, border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer' },
          }, '×'),
        )
      }),
      h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
        h('input', {
          value: newEvent, placeholder: 'новое.событие',
          onChange: (e) => setNewEvent(e.target.value),
          style: {
            flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #3f3f46',
            background: '#09090b', color: '#fafafa', font: 'inherit',
          },
        }),
        h('button', {
          type: 'button', onClick: addBinding,
          style: { padding: '10px 14px', borderRadius: 10, border: '1px solid #3f3f46', background: 'transparent', color: '#e4e4e7', cursor: 'pointer' },
        }, 'Добавить'),
      ),
      h('button', {
        type: 'button', disabled: busy, onClick: save,
        style: {
          marginTop: 14, padding: '10px 16px', borderRadius: 10, border: 'none',
          background: C.primary, color: C.dark, fontWeight: 650, cursor: 'pointer',
        },
      }, busy ? 'Сохранение…' : 'Сохранить'),
      msg ? h('p', { style: { color: C.light, fontSize: 13 } }, msg) : null,
      err ? h('p', { style: { color: '#fca5a5', fontSize: 13 } }, err) : null,
    ),
    h('div', { className: 'jf-char-admin-preview', style: { marginTop: 18 } },
      h('h2', { style: { fontSize: 16, margin: 0 } }, 'Превью эмоций'),
      h('div', { className: 'jf-char-grid' },
        emotions.map((em) => h('button', {
          key: em, type: 'button', className: 'jf-char-card',
          onClick: () => preview(em, em === 'sleep' ? 'sleep' : 'hover'),
          style: { cursor: 'pointer', color: '#e4e4e7', font: 'inherit' },
        },
          h(CharacterSvg, { h, emotion: em, pose: 'hover', size: 64 }),
          h('span', null, em),
        )),
      ),
    ),
  )
}

function createController(ui, getConfig) {
  ensureStyles()
  let state = {
    visible: false,
    hiding: false,
    playing: false,
    begging: false,
    mood: '',
    moodTitle: '',
    emotion: 'neutral',
    pose: 'idle',
    x: 24,
    y: 24,
    size: 72,
    badge: null,
    say: '',
  }
  let hideTimer = null
  let hideAnimTimer = null
  let setState = null
  let stopPlaySession = null

  const apply = (patch) => {
    state = { ...state, ...patch }
    if (setState) setState({ ...state })
  }

  const pad = () => Math.max(40, state.size || 56)

  const resolveAnchor = (anchor) => {
    if (anchor === 'logo') {
      return findLogoAnchor() || defaultCorner()
    }
    if (anchor === 'corner') return defaultCorner()
    if (anchor && typeof anchor === 'object' && 'x' in anchor) {
      return {
        x: clamp(Number(anchor.x) || 0, 0, window.innerWidth - pad()),
        y: clamp(Number(anchor.y) || 0, 0, window.innerHeight - pad()),
      }
    }
    return defaultCorner()
  }

  const api = {
    version: VERSION,
    show(opts = {}) {
      const cfg = getConfig()
      if (cfg && !cfg.enabled && !opts.force) return
      if (stopPlaySession) {
        try { stopPlaySession() } catch { /* */ }
        stopPlaySession = null
      }
      clearTimeout(hideTimer)
      clearTimeout(hideAnimTimer)
      const pos = resolveAnchor(opts.anchor || 'corner')
      apply({
        visible: true,
        hiding: false,
        playing: false,
        begging: false,
        emotion: opts.emotion || 'neutral',
        pose: opts.pose || 'idle',
        x: pos.x,
        y: pos.y,
        size: opts.size || 72,
        badge: opts.badge || null,
        say: opts.say != null ? clampSay(opts.say) : (Math.random() < 0.35 ? '' : lineForEmotion(opts.emotion || 'happy')),
      })
      const dur = opts.duration === 0 ? 30000 : (opts.duration || 2200)
      if (dur > 0) {
        hideTimer = setTimeout(() => api.hide(), dur)
      }
    },
    hide() {
      clearTimeout(hideTimer)
      apply({ hiding: true, playing: false, begging: false, say: '' })
      hideAnimTimer = setTimeout(() => apply({
        visible: false, hiding: false, badge: null, playing: false, begging: false, say: '',
      }), 560)
    },
    moveTo(x, y, patch = {}) {
      clearTimeout(hideTimer)
      apply({
        visible: true,
        hiding: false,
        playing: true,
        x: clamp(x, 4, window.innerWidth - pad()),
        y: clamp(y, 4, window.innerHeight - pad()),
        ...patch,
      })
    },
    setEmotion(emotion) { apply({ emotion }) },
    setPose(pose) { apply({ pose }) },
    celebrate(ms = 2200) {
      api.show({ emotion: 'success', pose: 'celebrate', badge: '✓', duration: ms, anchor: 'corner', force: true })
    },
    error(ms = 3200) {
      api.show({ emotion: 'error', pose: 'inspect', duration: ms, anchor: 'corner', force: true })
    },
    wave(ms = 2600) {
      api.show({ emotion: 'happy', pose: 'wave', duration: ms, anchor: 'corner', force: true })
    },
    react(event, detail = {}) {
      handleSpiritEvent(api, getConfig, { event, ...detail, at: Date.now() })
    },
    playNow() {
      try { window.dispatchEvent(new CustomEvent('jasefly-character-play', { detail: { force: true } })) } catch { /* */ }
    },
    _setStopPlay(fn) { stopPlaySession = fn },
    _bind(setter) { setState = setter },
    _getState() { return state },
  }
  return api
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function pickNavTargets() {
  const selectors = [
    'header nav a[href]',
    'header a[href^="/"]',
    '[data-site-nav] a[href]',
    'nav a[href^="/"]',
  ]
  const seen = new Set()
  const out = []
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      const href = el.getAttribute('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (href.includes('/admin')) return
      const r = el.getBoundingClientRect()
      if (r.width < 10 || r.height < 8 || r.bottom < 0 || r.top > window.innerHeight) return
      const key = href + '|' + Math.round(r.left) + '|' + Math.round(r.top)
      if (seen.has(key)) return
      seen.add(key)
      out.push({ el, href, x: r.left + r.width / 2, y: r.bottom + 6, label: (el.textContent || '').trim().slice(0, 40) })
    })
    if (out.length >= 8) break
  }
  return out.filter((t) => {
    try {
      const u = new URL(t.href, location.origin)
      return u.pathname !== location.pathname
    } catch {
      return true
    }
  })
}

function edgeSpawn() {
  const w = window.innerWidth
  const h = window.innerHeight
  const side = Math.floor(Math.random() * 4)
  if (side === 0) return { x: Math.random() * (w - 60), y: -40 }
  if (side === 1) return { x: w + 10, y: Math.random() * (h - 80) }
  if (side === 2) return { x: Math.random() * (w - 60), y: h + 10 }
  return { x: -50, y: Math.random() * (h - 80) }
}

const MOOD_META = {
  playful: { title: 'Игрун', badge: null },
  shy: { title: 'Убегает', badge: null },
  needy: { title: 'Покликай!', badge: '!' },
  mischief: { title: 'Хитрец', badge: '?' },
  grumpy: { title: 'Капризуля', badge: '…' },
}

/**
 * Правило: максимум 2–3 слова. Часто — тишина или только эмодзи.
 * Длинных предложений нет никогда.
 */
const SPIRIT_LINES = {
  common: ['Хи-хи', 'Ой!', 'Упс...', 'Нашёл!', 'Бу!', 'Псс...', 'Сюда!', 'Лечу!', 'Опа!', 'Есть!', 'Красиво!', 'Работает!', 'Готово!'],
  nudge: ['Сюда?', '👀', 'Эй!', 'Тут!'],
  playful: ['Хи-хи', 'Лови!', 'Эй!'],
  shy: ['Ой!', 'Псс...'],
  needy: ['Эй!', '👆'],
  mischief: ['Бу!', 'Хи-хи', 'Псс...'],
  grumpy: ['Упс...', 'Ой!'],
  chase: ['Лови!', 'Есть!', 'Беги!'],
  flee: ['Бу!', 'Ой!', 'Упс...'],
  near: ['Ой!', 'Эй!', '👀'],
  happy: ['Привет!', 'Опа!', 'Есть!'],
  love: ['Есть!', '😊'],
  think: ['🤔', 'Псс...'],
  angry: ['Ой!', '😱'],
  success: ['Готово!', 'Есть!', '🎉'],
  error: ['Упс...', 'Бывает...'],
  sleep: ['😴', 'Zzz'],
  loading: ['⏳', 'Ща!'],
  wander: ['Лечу!', 'Псс...', 'Опа!'],
  hello: ['Привет!'],
  face: ['😊', '😴', '🤔', '😱', '🎉', '👀'],
}

/** Разовые пасхалки на жизнь проекта (localStorage). */
const LIFE_MILESTONES = {
  first_zip: { events: ['module.install.success'], say: 'Получилось!', pose: 'celebrate', emotion: 'success' },
  first_publish: { events: ['content.publish'], say: 'Первый релиз!', pose: 'celebrate', emotion: 'success' },
  first_error: { events: ['cms.error', 'module.install.error', 'build.error'], say: 'Бывает...', pose: 'inspect', emotion: 'think' },
}

function isEmojiSay(s) {
  if (!s || typeof s !== 'string') return false
  // нет букв — считаем эмодзи/символ
  return !/[a-zа-яё]/i.test(s)
}

/** Жёсткий лимит: ≤3 слова, иначе обрезаем / глушим. */
function clampSay(s) {
  if (!s) return ''
  const t = String(s).trim()
  if (!t) return ''
  if (isEmojiSay(t)) return t.slice(0, 8)
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > 3) return words.slice(0, 2).join(' ')
  return t
}

function pickLine(bucket) {
  const arr = SPIRIT_LINES[bucket] || SPIRIT_LINES.common
  return clampSay(arr[Math.floor(Math.random() * arr.length)])
}

function lineForEmotion(emotion) {
  // часто только лицо / эмодзи, без слов
  if (Math.random() < 0.55) {
    const face = { happy: '😊', sleep: '😴', think: '🤔', angry: '😱', success: '🎉', love: '😊', error: '😱', loading: '⏳' }
    return face[emotion] || pickLine('face')
  }
  if (SPIRIT_LINES[emotion]) return pickLine(emotion)
  return pickLine('common')
}

function lineForMood(moodId, near = false) {
  if (near) return Math.random() < 0.5 ? pickLine('near') : pickLine('face')
  if (Math.random() < 0.5) return '' // тишина
  if (Math.random() < 0.4) return pickLine('face')
  if (SPIRIT_LINES[moodId]) return pickLine(moodId)
  return pickLine('common')
}

function readLife() {
  try {
    const raw = localStorage.getItem(LIFE_KEY)
    const o = raw ? JSON.parse(raw) : {}
    return {
      done: o.done && typeof o.done === 'object' ? o.done : {},
      counters: o.counters && typeof o.counters === 'object' ? o.counters : {},
    }
  } catch {
    return { done: {}, counters: {} }
  }
}

function writeLife(life) {
  try { localStorage.setItem(LIFE_KEY, JSON.stringify(life)) } catch { /* */ }
}

/** Вернуть пасхалку один раз за жизнь проекта, иначе null. */
function claimMilestone(id) {
  const life = readLife()
  if (life.done[id]) return null
  const meta = LIFE_MILESTONES[id]
  if (!meta) return null
  life.done[id] = Date.now()
  writeLife(life)
  return { ...meta, id }
}

function claimMilestoneForEvent(event) {
  for (const [id, meta] of Object.entries(LIFE_MILESTONES)) {
    if (meta.events.includes(event)) {
      return claimMilestone(id)
    }
  }
  return null
}

function bumpModuleOps() {
  const life = readLife()
  life.counters.module_ops = (Number(life.counters.module_ops) || 0) + 1
  writeLife(life)
  if (life.counters.module_ops >= 100 && !life.done.modules_100) {
    life.done.modules_100 = Date.now()
    writeLife(life)
    return { id: 'modules_100', say: 'Ух ты...', emotion: 'think', pose: 'wave' }
  }
  return null
}

/**
 * Речь: чаще тишина. Иногда эмодзи. Иногда 1–2 слова.
 * Пасхалки / nudge — только через force().
 */
function createSpeech(initialDelayMs = 6000) {
  let say = ''
  let nextAt = performance.now() + initialDelayMs
  let clearAt = 0
  let lastLine = ''
  return {
    get: () => say,
    force(line, holdMs = 3200) {
      say = clampSay(line)
      if (say) lastLine = say
      clearAt = performance.now() + holdMs
      nextAt = Infinity
      return say
    },
    clear() {
      say = ''
      clearAt = 0
      nextAt = performance.now() + 12000 + Math.random() * 12000
    },
    tick(t, prefer = 'common') {
      if (clearAt && t >= clearAt) {
        say = ''
        clearAt = 0
        nextAt = t + 14000 + Math.random() * 18000
      }
      if (t >= nextAt && !say) {
        // 70% — ещё молчим (выглянул / помахал без текста)
        if (Math.random() < 0.7) {
          nextAt = t + 10000 + Math.random() * 14000
          return say
        }
        let line = ''
        const r = Math.random()
        if (r < 0.45) line = pickLine('face')
        else if (r < 0.8) line = pickLine(prefer)
        else line = pickLine('common')
        let guard = 0
        while (line && line === lastLine && guard++ < 6) {
          line = Math.random() < 0.5 ? pickLine('face') : pickLine(prefer)
        }
        say = clampSay(line)
        if (say) lastLine = say
        clearAt = t + 2200 + Math.random() * 1800
        nextAt = Infinity
      }
      return say
    },
  }
}

/** Найти раздел «Документация» / docs в навбаре. */
function findGuideTarget() {
  const keys = [/докум/i, /docs?/i, /справк/i, /guide/i, /help/i, /руковод/i, /api/i]
  const nodes = document.querySelectorAll('header a[href], nav a[href], [data-site-nav] a[href], footer a[href]')
  let fallback = null
  for (const a of nodes) {
    if (!(a instanceof HTMLElement)) continue
    const href = a.getAttribute('href') || ''
    if (!href || href.startsWith('#') || href.includes('/admin')) continue
    const label = `${a.textContent || ''} ${href}`
    const r = a.getBoundingClientRect()
    if (r.width < 8 || r.height < 6) continue
    if (r.bottom < 0 || r.top > window.innerHeight) continue
    const spot = {
      x: clamp(r.left + r.width * 0.5 - 24, 12, window.innerWidth - 64),
      y: clamp(r.bottom + 6, 48, window.innerHeight - 72),
    }
    if (keys.some((re) => re.test(label))) return spot
    if (!fallback && /menu|nav/i.test(a.closest('nav,header')?.tagName || 'nav')) fallback = spot
  }
  return fallback
}

/** Continuous companion with autonomous mood (trickster / playful / capricious). */
function bootPlayfulAI(api, getConfig) {
  let cancelled = false
  let sessionAbort = null
  let loopTimer = null
  let raf = 0
  /** @type {null | ((ok: boolean) => void)} */
  let settleOp = null
  const mouse = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.4 }
  let loopRunning = false
  let pokeQueued = null
  let lastPokeAt = 0
  let lastUserActive = Date.now()
  let lastGuideNudgeAt = 0
  let didPublicHello = false
  /** @type {{ id: string, until: number, ignoredBegs: number }} */
  let mood = { id: 'playful', until: 0, ignoredBegs: 0 }

  const onPointer = (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
  }
  const markUserActive = () => { lastUserActive = Date.now() }
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerdown', markUserActive, { passive: true })
  window.addEventListener('keydown', markUserActive, { passive: true })
  window.addEventListener('scroll', markUserActive, { passive: true })

  /** Register promise settler so abort never leaves await hanging (click freeze bug). */
  const trackOp = (resolve) => {
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      if (settleOp === finish) settleOp = null
      resolve(ok)
    }
    settleOp = finish
    return finish
  }

  const abortSession = () => {
    if (sessionAbort) {
      try { sessionAbort() } catch { /* */ }
      sessionAbort = null
    }
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    // Critical: resolve pending rAF/wait — otherwise companionLoop freezes forever
    if (settleOp) settleOp(false)
  }
  api._setStopPlay(abortSession)

  const wait = (ms, signal) => new Promise((resolve) => {
    const finish = trackOp(resolve)
    if (signal?.aborted || cancelled) {
      finish(false)
      return
    }
    const t0 = Date.now()
    const id = setInterval(() => {
      if (signal?.aborted || cancelled) {
        clearInterval(id)
        finish(false)
        return
      }
      if (Date.now() - t0 >= ms) {
        clearInterval(id)
        finish(true)
      }
    }, 32)
  })

  const animateTo = (tx, ty, ms, signal, patch = {}) => new Promise((resolve) => {
    const finish = trackOp(resolve)
    const st = api._getState()
    const x0 = st.x
    const y0 = st.y
    const t0 = performance.now()
    const tick = (now) => {
      raf = 0
      if (signal?.aborted || cancelled) {
        finish(false)
        return
      }
      const p = Math.min(1, (now - t0) / ms)
      // smootherstep — без рывка в начале/конце
      const e = p * p * p * (p * (p * 6 - 15) + 10)
      api.moveTo(x0 + (tx - x0) * e, y0 + (ty - y0) * e, patch)
      if (p < 1) raf = requestAnimationFrame(tick)
      else finish(true)
    }
    raf = requestAnimationFrame(tick)
  })

  /** frame returns false to stop; abort always settles the promise. */
  const rafLoop = (signal, frame) => new Promise((resolve) => {
    const finish = trackOp(resolve)
    const step = (now) => {
      raf = 0
      if (signal?.aborted || cancelled) {
        finish(false)
        return
      }
      let cont = true
      try {
        cont = frame(now) !== false
      } catch {
        cont = false
      }
      if (!cont) {
        finish(true)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  })

  const hangCorner = () => ({
    x: window.innerWidth - 88,
    y: window.innerHeight - 100,
  })

  const eventOwnsStage = () => {
    const st = api._getState()
    return st.visible && !st.playing
  }

  const applyMoodVisual = (extra = {}) => {
    const meta = MOOD_META[mood.id] || MOOD_META.playful
    api.moveTo(api._getState().x, api._getState().y, {
      mood: mood.id,
      moodTitle: meta.title,
      badge: extra.badge !== undefined ? extra.badge : meta.badge,
      begging: mood.id === 'needy',
      // не спамим репликой при каждой смене mood-визуала
      say: extra.say !== undefined ? extra.say : (api._getState().say || ''),
      ...extra,
    })
  }

  const pickMood = (forced) => {
    if (forced) {
      mood = { id: forced, until: Date.now() + 12000 + Math.random() * 8000, ignoredBegs: mood.ignoredBegs }
      return mood.id
    }
    if (Date.now() < mood.until) return mood.id
    // Гид чаще спокойный; капризуля редко
    let id
    const r = Math.random() + (mood.ignoredBegs > 1 ? 0.08 : 0)
    if (r < 0.42) id = 'playful'
    else if (r < 0.58) id = 'mischief'
    else if (r < 0.72) id = 'shy'
    else if (r < 0.88) id = 'needy'
    else id = 'grumpy'
    if (id === mood.id && Math.random() < 0.55) {
      id = ['playful', 'mischief', 'shy', 'needy'].filter((m) => m !== id)[Math.floor(Math.random() * 3)]
    }
    mood = {
      id,
      until: Date.now() + 14000 + Math.random() * 16000,
      ignoredBegs: id === 'needy' ? 0 : mood.ignoredBegs,
    }
    return mood.id
  }

  const SIZE = 48

  /** Пока курсор на экране — можно играть (chase/flee). */
  const inPlayTerritory = (x, y) => {
    const W = window.innerWidth
    const H = window.innerHeight
    return x > 8 && x < W - 8 && y > 8 && y < H - 8
  }

  const padX = (W) => ({ lo: 28, hi: W - SIZE - 28 })
  const padY = (H) => ({ lo: 40, hi: H - SIZE - 40 })

  /** Случайная точка «жизни» — по всему полю, не только у кромки. */
  const pickWander = (W, H, fromX, fromY) => {
    const { lo: x0, hi: x1 } = padX(W)
    const { lo: y0, hi: y1 } = padY(H)
    // 65% — свободный полёт по экрану; 35% — ближе к краям (характер)
    if (Math.random() < 0.65) {
      return {
        x: x0 + Math.random() * (x1 - x0),
        y: y0 + Math.random() * (y1 - y0),
      }
    }
    const edge = Math.floor(Math.random() * 4)
    if (edge === 0) return { x: x0 + Math.random() * 90, y: y0 + Math.random() * (y1 - y0) }
    if (edge === 1) return { x: x1 - Math.random() * 90, y: y0 + Math.random() * (y1 - y0) }
    if (edge === 2) return { x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * 70 }
    return { x: x0 + Math.random() * (x1 - x0), y: y1 - Math.random() * 70 }
  }

  /**
   * После клика: плавно гоняется за курсором или убегает по всему экрану.
   */
  async function playWithCursor(signal, mode) {
    const st = api._getState()
    const w = () => window.innerWidth
    const h = () => window.innerHeight
    let px = st.visible ? st.x : hangCorner().x
    let py = st.visible ? st.y : hangCorner().y
    let vx = 0
    let vy = 0
    let tunneling = false
    const until = performance.now() + 9000 + Math.random() * 5000
    let outSince = 0
    const chase = mode === 'chase'
    const speech = createSpeech(200)
    speech.force(pickLine(chase ? 'chase' : 'flee'), 3500)

    mood = {
      id: chase ? 'playful' : (mood.id === 'grumpy' ? 'grumpy' : 'shy'),
      until: Date.now() + 12000,
      ignoredBegs: mood.ignoredBegs,
    }

    await rafLoop(signal, () => {
      if (performance.now() > until) return false
      if (pokeQueued) return false

      const W = w()
      const H = h()
      const { lo: x0, hi: x1 } = padX(W)
      const { lo: y0, hi: y1 } = padY(H)
      const onField = inPlayTerritory(mouse.x, mouse.y)
      if (!onField) {
        if (!outSince) outSince = performance.now()
        else if (performance.now() - outSince > 1600) return false
      } else {
        outSince = 0
      }

      const targetX = clamp(mouse.x - SIZE / 2, x0, x1)
      const targetY = clamp(mouse.y - SIZE / 2, y0, y1)
      const cx = px + SIZE / 2
      const cy = py + SIZE / 2
      const t = performance.now()
      const say = speech.tick(t, chase ? 'chase' : 'flee')

      if (tunneling) {
        px += vx
        py += vy * 0.2
        if (vx > 0 && px > W + SIZE + 20) {
          px = -SIZE - 16
          vx = Math.abs(vx)
          tunneling = false
        } else if (vx < 0 && px < -SIZE - 20) {
          px = W + 16
          vx = -Math.abs(vx)
          tunneling = false
        }
        api.moveTo(px, py, {
          emotion: chase ? 'happy' : 'think',
          pose: 'hover',
          size: SIZE,
          badge: null,
          begging: false,
          mood: mood.id,
          moodTitle: MOOD_META[mood.id]?.title,
          say,
        })
        return true
      }

      if (chase) {
        const lagX = targetX + (cx < mouse.x ? -36 : 36)
        const lagY = targetY + (cy < mouse.y ? -20 : 20)
        vx += (lagX - px) * 0.014
        vy += (lagY - py) * 0.012
        vx += Math.sin(t / 520) * 0.012
        vy += Math.cos(t / 680) * 0.01
      } else {
        const awayX = cx < mouse.x ? -1 : 1
        const awayY = cy < mouse.y ? -1 : 1
        const dist = Math.hypot(cx - mouse.x, cy - mouse.y)
        const push = clamp(1 - dist / 260, 0.2, 1)
        vx += awayX * 0.024 * push
        vy += awayY * 0.018 * push
        vy += Math.sin(t / 600) * 0.01
        if (px < 40 && awayX < 0) {
          tunneling = true
          vx = -Math.max(0.45, Math.abs(vx))
        } else if (px > W - SIZE - 40 && awayX > 0) {
          tunneling = true
          vx = Math.max(0.45, Math.abs(vx))
        }
      }

      vx = clamp(vx, -0.85, 0.85)
      vy = clamp(vy, -0.55, 0.55)
      vx *= 0.93
      vy *= 0.92
      px += vx
      py += vy
      // Мягкий отскок от краёв — не прилипание
      if (px < x0) { px = x0; vx = Math.abs(vx) * 0.6 }
      if (px > x1) { px = x1; vx = -Math.abs(vx) * 0.6 }
      if (py < y0) { py = y0; vy = Math.abs(vy) * 0.55 }
      if (py > y1) { py = y1; vy = -Math.abs(vy) * 0.55 }

      const dist = Math.hypot(cx - mouse.x, cy - mouse.y)
      const near = dist < 70
      api.moveTo(px, py, {
        emotion: chase ? (near ? 'love' : 'happy') : (near ? 'think' : 'neutral'),
        pose: 'hover',
        size: SIZE,
        badge: chase && near ? '♥' : null,
        begging: false,
        mood: mood.id,
        moodTitle: chase ? 'Игрун' : 'Убегает',
        say,
      })
      return true
    })
  }

  /**
   * Живой дрейф по всему экрану: точки-цели + лёгкие дуги.
   * Края — отскок, не «место жительства». Туннель редко.
   */
  async function driftLife(signal, ms) {
    const st = api._getState()
    const w = () => window.innerWidth
    const h = () => window.innerHeight
    let px = st.visible ? st.x : hangCorner().x
    let py = st.visible ? st.y : hangCorner().y
    let vx = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.2)
    let vy = (Math.random() - 0.5) * 0.25
    let wander = pickWander(w(), h(), px, py)
    let nextWanderAt = performance.now() + 2200 + Math.random() * 2800
    let tunneling = false
    let nextTunnelWish = performance.now() + 18000 + Math.random() * 16000
    const until = performance.now() + ms
    let lastPose = 'hover'
    const speech = createSpeech(2500 + Math.random() * 4000)

    const paint = (emotion, pose, badge = null, begging = false) => {
      if (pose !== lastPose && (pose === 'wave' || pose === 'look' || lastPose === 'wave' || lastPose === 'look')) {
        if (Math.hypot(vx, vy) > 0.2) pose = 'hover'
      }
      lastPose = pose
      api.moveTo(px, py, {
        emotion, pose, size: SIZE, badge, begging,
        mood: mood.id,
        moodTitle: MOOD_META[mood.id]?.title,
        say: speech.get(),
      })
    }

    paint('happy', 'hover')

    await rafLoop(signal, () => {
      if (performance.now() > until) return false
      if (pokeQueued) return false

      const W = w()
      const H = h()
      const { lo: x0, hi: x1 } = padX(W)
      const { lo: y0, hi: y1 } = padY(H)
      const t = performance.now()
      const cx = px + SIZE / 2
      const cy = py + SIZE / 2
      const dist = Math.hypot(cx - mouse.x, cy - mouse.y)

      const fleeR = mood.id === 'shy' ? 200 : 160
      const playR = 160
      const fleeT = clamp(1 - dist / fleeR, 0, 1)
      const fleeStr = fleeT * fleeT
      const playStr = mood.id === 'playful'
        ? clamp(1 - dist / playR, 0, 1) * (1 - fleeStr)
        : 0

      if (tunneling) {
        px += vx
        py += vy * 0.3
        const fullyRight = px > W + SIZE + 24
        const fullyLeft = px < -SIZE - 24
        if (vx > 0 && fullyRight) {
          px = -SIZE - 20
          vx = Math.abs(vx)
          tunneling = false
          wander = pickWander(W, H, px, py)
        } else if (vx < 0 && fullyLeft) {
          px = W + 20
          vx = -Math.abs(vx)
          tunneling = false
          wander = pickWander(W, H, px, py)
        }
        paint(mood.id === 'mischief' ? 'think' : 'happy', 'hover')
        return true
      }

      if (t > nextWanderAt || Math.hypot(wander.x - px, wander.y - py) < 36) {
        wander = pickWander(W, H, px, py)
        nextWanderAt = t + 2400 + Math.random() * 3600
      }

      // Тянемся к точке жизни + органические дуги
      vx += (wander.x - px) * 0.007
      vy += (wander.y - py) * 0.007
      vx += Math.sin(t / 900) * 0.018
      vy += Math.cos(t / 1100) * 0.016
      vy += Math.sin(t / 1700 + px * 0.01) * 0.01

      if (fleeStr > 0.02) {
        const awayX = cx < mouse.x ? -1 : 1
        const awayY = cy < mouse.y ? -1 : 1
        vx += awayX * 0.016 * fleeStr
        vy += awayY * 0.012 * fleeStr
        if (fleeStr > 0.4 && px < 48 && awayX < 0) {
          tunneling = true
          vx = -Math.max(0.4, Math.abs(vx))
        } else if (fleeStr > 0.4 && px > W - SIZE - 48 && awayX > 0) {
          tunneling = true
          vx = Math.max(0.4, Math.abs(vx))
        }
      } else if (playStr > 0.05) {
        vx += (mouse.x - SIZE / 2 - px) * 0.003 * playStr
        vy += (mouse.y - SIZE / 2 - py) * 0.0025 * playStr
      }

      // Редкий туннель — только если сам уплыл к краю
      if (!tunneling && t > nextTunnelWish) {
        if (px > W - SIZE - 36 && vx > 0.15) {
          tunneling = true
          nextTunnelWish = t + 22000 + Math.random() * 18000
        } else if (px < 36 && vx < -0.15) {
          tunneling = true
          nextTunnelWish = t + 22000 + Math.random() * 18000
        } else {
          nextTunnelWish = t + 4000 + Math.random() * 6000
        }
      }

      const cap = 0.62 + fleeStr * 0.22
      const sp = Math.hypot(vx, vy)
      if (sp > cap && sp > 0) {
        vx *= cap / sp
        vy *= cap / sp
      }

      vx *= 0.985
      vy *= 0.98
      // Не даём замереть
      if (Math.hypot(vx, vy) < 0.12) {
        vx += (Math.random() - 0.5) * 0.04
        vy += (Math.random() - 0.5) * 0.03
      }

      px += vx
      py += vy

      // Мягкий отскок внутрь — без «тусовки у кромки»
      if (px < x0) { px = x0; vx = Math.max(0.2, Math.abs(vx)); wander = pickWander(W, H, px, py) }
      if (px > x1) { px = x1; vx = -Math.max(0.2, Math.abs(vx)); wander = pickWander(W, H, px, py) }
      if (py < y0) { py = y0; vy = Math.max(0.15, Math.abs(vy)) }
      if (py > y1) { py = y1; vy = -Math.max(0.15, Math.abs(vy)) }

      const near = fleeStr > 0.25
      let emotion = 'happy'
      let pose = 'hover'
      let badge = null
      let begging = false
      if (mood.id === 'needy') {
        emotion = 'love'
        pose = Math.hypot(vx, vy) < 0.25 ? 'wave' : 'hover'
        badge = Math.hypot(vx, vy) < 0.22 ? '!' : null
        begging = !!badge
      } else if (mood.id === 'grumpy') {
        emotion = near ? 'angry' : 'think'
        pose = 'inspect'
      } else if (mood.id === 'shy') {
        emotion = near ? 'think' : 'neutral'
        pose = 'hover'
      } else if (mood.id === 'mischief') {
        emotion = 'think'
        pose = 'thinking'
        badge = '?'
      } else if (playStr > 0.35) {
        emotion = 'love'
        pose = 'hover'
      } else if (near) {
        emotion = 'think'
        pose = 'hover'
      }

      // Чаще тишина; редко эмодзи / 1–2 слова
      if (begging) speech.tick(t, 'needy')
      else if (near) speech.tick(t, 'near')
      else speech.tick(t, Math.random() < 0.5 ? 'common' : mood.id)

      paint(emotion, pose, badge, begging)
      return true
    })
  }

  /** Мягко выглянул из текущего края — без телепортов */
  async function peekFromEdge(signal) {
    const st = api._getState()
    const W = window.innerWidth
    const H = window.innerHeight
    const y = clamp(st.visible ? st.y : (Math.random() < 0.5 ? 64 : H - 96), 48, H - SIZE - 28)
    const fromLeft = (st.visible ? st.x : 0) < W * 0.5
    const edgeX = fromLeft ? 10 : W - SIZE - 10
    const hideX = fromLeft ? -SIZE - 6 : W + 6
    // Плавно к краю → чуть наружу → обратно внутрь
    // Без текста — просто выглянул и помахал
    if (!(await animateTo(edgeX, y, 1400, signal, {
      emotion: 'happy', pose: 'wave', size: SIZE, begging: false, say: '',
      mood: mood.id, moodTitle: MOOD_META[mood.id]?.title, badge: null,
    }))) return
    await wait(700, signal)
    if (!(await animateTo(hideX, y, 1200, signal, {
      emotion: 'think', pose: 'look', size: SIZE, begging: false, say: '',
    }))) return
    await wait(400, signal)
    await animateTo(edgeX + (fromLeft ? 24 : -24), y, 1300, signal, {
      emotion: 'happy', pose: 'hover', size: SIZE, begging: false, say: '',
      mood: mood.id, moodTitle: MOOD_META[mood.id]?.title,
    })
  }

  /** Капризуля: замедлился у края и просит клик */
  async function gameBeg(signal) {
    const st = api._getState()
    const W = window.innerWidth
    const H = window.innerHeight
    const spot = {
      x: clamp(st.x, 16, W - SIZE - 16),
      y: clamp(st.y > H * 0.5 ? H - 96 : 64, 48, H - SIZE - 24),
    }
    if (!(await animateTo(spot.x, spot.y, 1400, signal, {
      emotion: 'love', pose: 'wave', size: SIZE, badge: '!', begging: true,
      mood: 'needy', moodTitle: 'Покликай!', say: pickLine('needy'),
    }))) return

    const until = performance.now() + 4500
    const startPoke = lastPokeAt
    const begSpeech = createSpeech(0)
    begSpeech.force(pickLine('needy'), 5000)
    await rafLoop(signal, () => {
      if (performance.now() > until) return false
      if (pokeQueued || lastPokeAt > startPoke) return false
      const t = performance.now() / 220
      const begSay = begSpeech.tick(performance.now(), 'needy')
      api.moveTo(spot.x + Math.sin(t) * 2, spot.y + Math.abs(Math.sin(t)) * -2.5, {
        emotion: 'love', pose: 'wave', size: SIZE, badge: '!', begging: true,
        mood: 'needy', moodTitle: 'Покликай!', say: begSay,
      })
      return true
    })

    if (pokeQueued || lastPokeAt > startPoke) {
      pokeQueued = null
      mood = { id: 'playful', until: Date.now() + 14000, ignoredBegs: 0 }
      const reward = { aborted: false }
      api.moveTo(api._getState().x, api._getState().y, {
        emotion: 'love', pose: 'celebrate', size: 54, badge: '♥', begging: false,
        mood: 'playful', moodTitle: 'Игрун', say: pickLine('love'),
      })
      await wait(400, reward)
      if (inPlayTerritory(mouse.x, mouse.y)) await playWithCursor(reward, 'chase')
      else await driftLife(reward, 5000)
      return
    }
    mood.ignoredBegs += 1
    mood = { id: 'grumpy', until: Date.now() + 12000, ignoredBegs: mood.ignoredBegs }
    await driftLife(signal, 6000)
  }

  async function gamePokeReact(signal) {
    const st = api._getState()
    const id = mood.id
    pokeQueued = null

    // Короткий отклик на клик
    // Клик: иногда только эмоция лица, без облачка
    const pokeSay = Math.random() < 0.4
      ? ''
      : (id === 'needy' ? pickLine('love') : pickLine(id === 'shy' || id === 'grumpy' ? 'near' : 'common'))
    api.moveTo(st.x, st.y, {
      emotion: id === 'shy' || id === 'grumpy' ? 'angry' : 'happy',
      pose: 'wave',
      size: SIZE,
      badge: id === 'needy' ? '♥' : null,
      begging: false,
      mood: id,
      moodTitle: MOOD_META[id]?.title,
      say: pokeSay,
    })
    await wait(280, signal)
    if (signal?.aborted) return

    // Курсор в игровой полосе → живая игра: chase или flee
    if (inPlayTerritory(mouse.x, mouse.y)) {
      let mode = 'chase'
      if (id === 'shy' || id === 'grumpy') mode = 'flee'
      else if (id === 'mischief') mode = Math.random() < 0.45 ? 'flee' : 'chase'
      else mode = 'chase' // playful / needy
      await playWithCursor(signal, mode)
      if (signal?.aborted) return
      await driftLife(signal, 5000)
      return
    }

    // Курсор ушёл с территории — просто продолжаем дрейф
    if (id === 'shy' || id === 'grumpy') {
      mood = { id: 'grumpy', until: Date.now() + 10000, ignoredBegs: mood.ignoredBegs }
    }
    await driftLife(signal, 7000)
  }

  /** Первый визит на сайт: «Привет!» → помахал → исчез. */
  async function publicHelloOnce(signal) {
    if (didPublicHello || isAdminPath()) return false
    try {
      if (localStorage.getItem(PUBLIC_HELLO_KEY)) {
        didPublicHello = true
        return false
      }
      localStorage.setItem(PUBLIC_HELLO_KEY, new Date().toISOString())
    } catch { /* */ }
    didPublicHello = true
    const c = hangCorner()
    api.moveTo(c.x, c.y, {
      emotion: 'happy', pose: 'wave', size: 54, badge: null, begging: false,
      mood: 'playful', moodTitle: 'Гид', say: 'Привет!',
    })
    await wait(2200, signal)
    if (!signal?.aborted) api.hide()
    await wait(2600, signal)
    return true
  }

  /**
   * Умный гид: 40с без действий → подлетает к «Документация»
   * и говорит коротко «Сюда?» / «Эй, сюда!» / 👀
   */
  async function gameGuideNudge(signal) {
    if (isAdminPath()) return false
    if (Date.now() - lastUserActive < 40000) return false
    if (Date.now() - lastGuideNudgeAt < 160000) return false
    const target = findGuideTarget()
    if (!target) return false
    lastGuideNudgeAt = Date.now()
    const roll = Math.random()
    const line = roll < 0.35 ? 'Эй, сюда!' : (roll < 0.65 ? 'Сюда?' : '👀')
    if (!(await animateTo(target.x, target.y, 1200, signal, {
      emotion: 'think', pose: 'look', size: SIZE, badge: null, begging: false,
      mood: 'mischief', moodTitle: 'Гид', say: '',
    }))) return false
    api.moveTo(target.x, target.y, {
      emotion: 'happy', pose: 'wave', size: SIZE, badge: null, begging: false,
      mood: 'playful', moodTitle: 'Гид', say: line,
    })
    await wait(2600, signal)
    // исчез без текста
    if (!(await animateTo(
      target.x + (Math.random() < 0.5 ? -100 : 100),
      clamp(target.y + 50, 40, window.innerHeight - 80),
      700,
      signal,
      { emotion: 'happy', pose: 'hover', size: SIZE, say: '' },
    ))) return true
    return true
  }

  async function runAntic(signal) {
    if (pokeQueued) {
      await gamePokeReact(signal)
      return
    }
    // Умная подсказка важнее случайного дрейфа
    if (await gameGuideNudge(signal)) {
      await driftLife(signal, 5000)
      return
    }
    pickMood()
    applyMoodVisual({ size: SIZE, say: '' })

    const r = Math.random()
    // peek без слов — «выглянул и всё»
    if (r < 0.22) {
      await peekFromEdge(signal)
      await driftLife(signal, 8000 + Math.random() * 6000)
      return
    }
    if (mood.id === 'needy' && r < 0.38) {
      await gameBeg(signal)
      return
    }
    await driftLife(signal, 10000 + Math.random() * 9000)
  }

  async function adminPeek(signal) {
    const size = 44
    const y = 80 + Math.random() * 120
    api.moveTo(window.innerWidth + 20, y, { emotion: 'neutral', pose: 'look', size, begging: false })
    await animateTo(window.innerWidth - size - 14, y, 450, signal, { emotion: 'happy', pose: 'wave', size })
    await wait(1400, signal)
    await animateTo(window.innerWidth + 40, y, 400, signal, { emotion: 'happy', pose: 'hover', size })
    if (!signal.aborted) api.hide()
  }

  async function companionLoop() {
    if (loopRunning) return
    loopRunning = true
    pickMood('playful')
    while (!cancelled) {
      const cfg = getConfig() || {}
      const idleSig = { get aborted() { return cancelled } }
      if (!cfg.enabled || cfg.playful === 0 || reducedMotion()) {
        const st = api._getState()
        if (st.playing) api.hide()
        await wait(4000, idleSig)
        continue
      }
      if (document.hidden) {
        await wait(2000, idleSig)
        continue
      }
      if (eventOwnsStage()) {
        await wait(800, idleSig)
        continue
      }

      const ac = { aborted: false }
      sessionAbort = () => { ac.aborted = true }
      api._setStopPlay(abortSession)

      try {
        if (isAdminPath()) {
          await wait(70000 + Math.random() * 80000, ac)
          if (cancelled || ac.aborted || !isAdminPath()) continue
          if (eventOwnsStage()) continue
          if (Math.random() > 0.55) continue
          await adminPeek(ac)
        } else {
          if (await publicHelloOnce(ac)) continue
          if (!api._getState().visible) {
            const c = hangCorner()
            // Часто появляется молча
            api.moveTo(c.x, c.y, {
              emotion: 'happy', pose: 'wave', size: 52, badge: null, begging: false,
              mood: mood.id, moodTitle: MOOD_META[mood.id]?.title,
              say: Math.random() < 0.25 ? pickLine('common') : '',
            })
            await wait(350, ac)
          }
          await runAntic(ac)
          if (ac.aborted || pokeQueued) continue
          await wait(200 + Math.random() * 400, ac)
        }
      } catch { /* */ }
      finally {
        sessionAbort = null
        if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
        if (settleOp) settleOp(false)
      }
    }
    loopRunning = false
  }

  const onPlayNow = () => {
    lastPokeAt = Date.now()
    pokeQueued = 'user'
    pickMood('playful')
    abortSession()
    if (isAdminPath()) {
      const ac = { aborted: false }
      sessionAbort = () => { ac.aborted = true }
      void (async () => {
        await peekFromEdge(ac)
        if (isAdminPath()) api.hide()
      })()
    }
  }
  window.addEventListener('jasefly-character-play', onPlayNow)

  const onDocClick = (e) => {
    const t = e.target
    if (!(t instanceof Element)) return
    if (!t.closest?.('[data-jasefly-character]')) return
    e.preventDefault()
    lastPokeAt = Date.now()
    pokeQueued = 'user'
    abortSession()
  }
  document.addEventListener('click', onDocClick, true)

  loopTimer = setTimeout(() => { void companionLoop() }, isAdminPath() ? 12000 : 500)

  return () => {
    cancelled = true
    clearTimeout(loopTimer)
    abortSession()
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerdown', markUserActive)
    window.removeEventListener('keydown', markUserActive)
    window.removeEventListener('scroll', markUserActive)
    window.removeEventListener('jasefly-character-play', onPlayNow)
    document.removeEventListener('click', onDocClick, true)
    try {
      const st = api._getState()
      if (st.playing) api.hide()
    } catch { /* */ }
  }
}

function readAppearLog() {
  try {
    const raw = localStorage.getItem(APPEAR_LOG_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'number') : []
  } catch {
    return []
  }
}

function pushAppearLog() {
  const now = Date.now()
  const hourAgo = now - 3600000
  const next = readAppearLog().filter((t) => t >= hourAgo)
  next.push(now)
  try { localStorage.setItem(APPEAR_LOG_KEY, JSON.stringify(next)) } catch { /* */ }
  return next
}

function canAppear(cfg, force) {
  if (force) return true
  const cooldown = Math.max(5, Number(cfg.cooldown_sec) || 45) * 1000
  const maxHour = Math.max(1, Number(cfg.max_per_hour) || 8)
  const log = readAppearLog()
  const last = log[log.length - 1] || 0
  if (Date.now() - last < cooldown) return false
  const hourAgo = Date.now() - 3600000
  if (log.filter((t) => t >= hourAgo).length >= maxHour) return false
  return true
}

function resolveReaction(cfg, detail) {
  const event = String(detail.event || '')
  const bindings = { ...DEFAULT_BINDINGS, ...(cfg.bindings || {}) }
  const mapped = bindings[event] || null
  if (!mapped && !detail.emotion && !detail.pose) return null
  return {
    emotion: detail.emotion || mapped?.emotion || 'neutral',
    pose: detail.pose || mapped?.pose || 'idle',
    duration: detail.duration != null ? detail.duration : (mapped?.duration ?? 2200),
    badge: detail.badge !== undefined ? detail.badge : (mapped?.badge ?? null),
    anchor: detail.anchor || mapped?.anchor || 'corner',
  }
}

function eventAllowedByToggles(cfg, event) {
  if (!cfg?.enabled) return false
  if (event.startsWith('module.') && !cfg.show_on_module_ops) return false
  if (event === 'admin.welcome' && !cfg.show_on_admin_welcome) return false
  if (event === 'landing.visit' && !cfg.show_on_landing) return false
  return true
}

function handleSpiritEvent(api, getConfig, detail) {
  const cfg = getConfig() || {}
  const event = String(detail.event || '')
  if (!event) return
  if (detail.action === 'hide' || event === 'hide') {
    api.hide()
    return
  }
  // force обходит только cooldown/hourly; toggles (enabled / show_on_*) всегда действуют
  if (!eventAllowedByToggles(cfg, event)) return
  const reaction = resolveReaction(cfg, detail)
  if (!reaction) return

  // Счётчик модулей + разовые пасхалки (важнее обычной реакции)
  let milestone = null
  if (event === 'module.install.success' || event === 'module.update.success') {
    milestone = bumpModuleOps() || claimMilestoneForEvent(event)
  } else {
    milestone = claimMilestoneForEvent(event)
  }

  const forceShow = !!detail.force || !!milestone
  if (!canAppear(cfg, forceShow)) return
  pushAppearLog()

  let say = detail.say != null ? clampSay(detail.say) : ''
  if (milestone?.say) {
    say = clampSay(milestone.say)
  } else if (!say) {
    // Обычные события: часто тишина / эмодзи, без простыней
    const r = Math.random()
    if (r < 0.4) say = ''
    else if (r < 0.75) say = lineForEmotion(reaction.emotion)
    else say = pickLine(event.includes('error') ? 'error' : (event.includes('success') || event.includes('publish') ? 'success' : 'common'))
  }

  api.show({
    ...reaction,
    emotion: milestone?.emotion || reaction.emotion,
    pose: milestone?.pose || reaction.pose,
    say,
    force: forceShow,
  })
}

function Portal({ ui, controller }) {
  const h = ui.createElement
  const useState = ui.useState
  const useEffect = ui.useEffect
  const [state, setState] = useState(controller._getState())
  useEffect(() => {
    controller._bind(setState)
    return () => controller._bind(null)
  }, [])
  return h(Stage, { ui, state })
}

function isAdminPath() {
  return typeof location !== 'undefined' && /^\/admin(\/|$)/.test(location.pathname)
}

function isLandingPath() {
  return typeof location !== 'undefined' && (location.pathname === '/' || location.pathname === '')
}

function bootBehaviors(api, getConfig) {
  const onSpirit = (ev) => {
    const d = ev?.detail || {}
    if (d.event) {
      handleSpiritEvent(api, getConfig, d)
      return
    }
    // Legacy CustomEvent('jasefly-character')
    const action = d.action
    if (action === 'spirit' && d.event) {
      handleSpiritEvent(api, getConfig, d)
      return
    }
    if (action === 'hide') { api.hide(); return }
    if (action === 'celebrate' || action === 'success') {
      handleSpiritEvent(api, getConfig, { event: 'module.install.success', force: d.force })
      return
    }
    if (action === 'error') {
      handleSpiritEvent(api, getConfig, { event: 'module.install.error', force: d.force })
      return
    }
    if (action === 'wave') {
      handleSpiritEvent(api, getConfig, { event: 'admin.welcome', force: true })
      return
    }
    if (action === 'module-progress') {
      handleSpiritEvent(api, getConfig, {
        event: 'module.install.start',
        emotion: d.emotion,
        pose: d.pose,
        duration: d.duration,
        force: d.force,
      })
      return
    }
    if (d.emotion || d.pose) api.show(d)
  }

  window.addEventListener(SPIRIT_EVENT, onSpirit)
  window.addEventListener('jasefly-character', onSpirit)

  // Ensure global emit API for other ZIP modules even if core helper not loaded yet
  if (typeof window !== 'undefined' && !window.jaseflySpirit) {
    window.jaseflySpirit = {
      emit(event, opts = {}) {
        window.dispatchEvent(new CustomEvent(SPIRIT_EVENT, {
          detail: { event, at: Date.now(), ...opts },
        }))
      },
      on() { return () => {} },
      events: {},
      EVENT: SPIRIT_EVENT,
    }
  }

  const tryLanding = () => {
    if (!isLandingPath()) return
    // При игровом ИИ дух и так живёт на сайте — не перекрываем одноразовым show()
    if (getConfig()?.playful !== 0) return
    setTimeout(() => {
      handleSpiritEvent(api, getConfig, { event: 'landing.visit', at: Date.now() })
    }, 1400)
  }

  const tryAdminWelcome = () => {
    if (!isAdminPath()) return
    try {
      if (localStorage.getItem(WELCOME_KEY)) return
      localStorage.setItem(WELCOME_KEY, new Date().toISOString())
    } catch { /* */ }
    setTimeout(() => {
      handleSpiritEvent(api, getConfig, { event: 'admin.welcome', at: Date.now(), force: true })
    }, 900)
  }

  // Idle → Sleep (reads idle_minutes from settings; admin only)
  let idleTimer = null
  const bumpIdle = () => {
    if (!isAdminPath()) return
    clearTimeout(idleTimer)
    const mins = Math.max(1, Math.min(120, Number(getConfig()?.idle_minutes) || 4))
    idleTimer = setTimeout(() => {
      handleSpiritEvent(api, getConfig, { event: 'admin.idle', at: Date.now() })
    }, mins * 60 * 1000)
  }
  const idleEvts = ['pointerdown', 'keydown', 'scroll', 'touchstart']
  idleEvts.forEach((name) => window.addEventListener(name, bumpIdle, { passive: true }))
  bumpIdle()

  setTimeout(tryLanding, 400)
  setTimeout(tryAdminWelcome, 600)

  const stopPlayful = bootPlayfulAI(api, getConfig)

  return () => {
    window.removeEventListener(SPIRIT_EVENT, onSpirit)
    window.removeEventListener('jasefly-character', onSpirit)
    idleEvts.forEach((name) => window.removeEventListener(name, bumpIdle))
    clearTimeout(idleTimer)
    try { stopPlayful?.() } catch { /* */ }
  }
}

let portalHost = null
let portalRoot = null
let controller = null
let stopBehaviors = null
let cachedConfig = {
  enabled: 1,
  show_on_landing: 1,
  show_on_admin_welcome: 1,
  show_on_module_ops: 1,
  bindings: DEFAULT_BINDINGS,
  cooldown_sec: 45,
  max_per_hour: 8,
  idle_minutes: 4,
  playful: 1,
  play_interval_sec: 5,
}

export const JaseflyFrontendModule = {
  slug: SLUG,
  version: VERSION,
  sdkVersion: 1,
  async register(ctx) {
    const ui = ctx.ui
    if (!ui?.createElement) {
      console.warn('[jasefly-character] ctx.ui missing')
      return
    }
    ensureStyles()

    try {
      const cfg = await apiFetch('/jasefly-character/config')
      cachedConfig = {
        ...cachedConfig,
        ...cfg,
        bindings: { ...DEFAULT_BINDINGS, ...(cfg.bindings || {}) },
      }
    } catch {
      /* defaults */
    }

    controller = createController(ui, () => cachedConfig)

    if (typeof document !== 'undefined' && ui.createRoot) {
      try {
        portalRoot?.unmount()
        portalHost?.remove()
      } catch { /* */ }
      const host = document.createElement('div')
      host.id = 'jasefly-character-root'
      host.setAttribute('data-no-translate', '1')
      document.body.appendChild(host)
      const root = ui.createRoot(host)
      root.render(ui.createElement(Portal, { ui, controller }))
      portalHost = host
      portalRoot = root
    }

    window.jaseflyCharacter = controller
    stopBehaviors = bootBehaviors(controller, () => cachedConfig)

    const Page = () => ui.createElement(AdminApp, { ui })
    const nav = {
      group: 'Оформление',
      path: '/admin/jasefly-character',
      label: 'Дух CMS',
      permission: 'jasefly-character.view',
      icon: 'sparkles',
    }
    const page = {
      path: 'jasefly-character',
      label: 'Дух CMS',
      group: 'Оформление',
      permission: 'jasefly-character.view',
      Component: Page,
    }
    if (ctx.admin?.registerNavItem) {
      ctx.admin.registerNavItem(nav)
      ctx.admin.registerPage?.(page)
    } else {
      ctx.registerAdminNavItem?.(nav)
      ctx.registerAdminRoute?.(page)
    }
  },
  async unregister() {
    try { stopBehaviors?.() } catch { /* */ }
    stopBehaviors = null
    try {
      portalRoot?.unmount()
      portalHost?.remove()
    } catch { /* */ }
    portalHost = null
    portalRoot = null
    controller = null
    try { delete window.jaseflyCharacter } catch { /* */ }
  },
}

export default JaseflyFrontendModule
