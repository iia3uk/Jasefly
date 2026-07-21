export type VideoPlatform =
  | 'file'
  | 'youtube'
  | 'vimeo'
  | 'rutube'
  | 'vk'
  | 'dailymotion'
  | 'ok'
  | 'iframe'
  | 'unknown'

export type ResolvedVideo =
  | { kind: 'iframe'; src: string; platform: VideoPlatform; geoRisk?: boolean }
  | { kind: 'file'; src: string; platform: 'file' }
  | { kind: 'none' }

/** Hosts that are often blocked or flaky without VPN in RU/CIS. */
export function isGeoRiskyPlatform(platform: VideoPlatform): boolean {
  return platform === 'youtube'
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/** True for direct video file URLs (extension-based). */
export function isVideoFileUrl(url: string | null | undefined): boolean {
  return /\.(mp4|webm|ogg|ogv|m3u8)(\?|#|$)/i.test(String(url || ''))
}

export function isVideoMime(mime: string | null | undefined): boolean {
  return String(mime || '').toLowerCase().startsWith('video/')
}

function isDirectVideoFile(url: string): boolean {
  return isVideoFileUrl(url)
}

/**
 * Turn a share/watch URL (or raw embed URL / iframe src) into a playable source.
 * Supports YouTube, Vimeo, Rutube, VK, Dailymotion, OK.ru, direct files, and any https iframe URL.
 */
export function resolveVideoUrl(raw: string | null | undefined): ResolvedVideo {
  const input = String(raw || '').trim()
  if (!input) return { kind: 'none' }

  // Paste of full iframe HTML
  const iframeSrc = input.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]
  const url = iframeSrc || input

  if (isDirectVideoFile(url) || url.startsWith('blob:') || url.startsWith('data:video')) {
    return { kind: 'file', src: url, platform: 'file' }
  }

  let parsed: URL
  try {
    parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://example.com')
  } catch {
    return { kind: 'none' }
  }

  // Already an embed URL — use as-is (any platform)
  if (/\/embed(\/|$)/i.test(parsed.pathname) || /player\./i.test(parsed.hostname)) {
    const platform = detectPlatform(parsed.hostname)
    return {
      kind: 'iframe',
      src: parsed.href,
      platform,
      geoRisk: isGeoRiskyPlatform(platform),
    }
  }

  const host = hostOf(parsed.href)

  // YouTube
  if (host.includes('youtu.be') || host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
    let id = ''
    if (host.includes('youtu.be')) id = parsed.pathname.replace(/^\//, '').split('/')[0] || ''
    else id = parsed.searchParams.get('v') || parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] || ''
    if (!id) return { kind: 'none' }
    return {
      kind: 'iframe',
      src: `https://www.youtube-nocookie.com/embed/${id}`,
      platform: 'youtube',
      geoRisk: true,
    }
  }

  // Vimeo
  if (host.includes('vimeo.com')) {
    const id = parsed.pathname.split('/').filter(Boolean).pop()
    if (!id || !/^\d+$/.test(id)) return { kind: 'none' }
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}`, platform: 'vimeo' }
  }

  // Rutube (works in RU without VPN)
  if (host.includes('rutube.ru')) {
    const id =
      parsed.pathname.match(/\/video\/([a-f0-9]{32})/i)?.[1]
      || parsed.pathname.match(/\/play\/embed\/([a-f0-9]{32})/i)?.[1]
      || parsed.searchParams.get('v')
      || ''
    if (!id) return { kind: 'none' }
    return { kind: 'iframe', src: `https://rutube.ru/play/embed/${id}`, platform: 'rutube' }
  }

  // VK Video
  if (host.includes('vk.com') || host.includes('vkvideo.ru') || host.includes('vk.ru')) {
    // https://vk.com/video-123_456 or video123_456
    const m =
      parsed.pathname.match(/video(-?\d+)_(\d+)/)
      || parsed.href.match(/video(-?\d+)_(\d+)/)
      || parsed.searchParams.get('z')?.match(/video(-?\d+)_(\d+)/)
    if (m) {
      return {
        kind: 'iframe',
        src: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`,
        platform: 'vk',
      }
    }
  }

  // Dailymotion
  if (host.includes('dailymotion.com') || host.includes('dai.ly')) {
    const id =
      host.includes('dai.ly')
        ? parsed.pathname.replace(/^\//, '')
        : parsed.pathname.match(/\/video\/([^/?#_]+)/)?.[1] || ''
    if (!id) return { kind: 'none' }
    return { kind: 'iframe', src: `https://www.dailymotion.com/embed/video/${id}`, platform: 'dailymotion' }
  }

  // OK.ru
  if (host.includes('ok.ru') || host.includes('odnoklassniki.ru')) {
    const id = parsed.pathname.match(/\/video\/(\d+)/)?.[1] || parsed.pathname.match(/\/live\/(\d+)/)?.[1]
    if (id) {
      return {
        kind: 'iframe',
        src: `https://ok.ru/videoembed/${id}`,
        platform: 'ok',
      }
    }
  }

  // Any other https URL → try as generic iframe (user pasted platform embed link)
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    return {
      kind: 'iframe',
      src: parsed.href,
      platform: 'iframe',
    }
  }

  return { kind: 'none' }
}

function detectPlatform(hostname: string): VideoPlatform {
  const h = hostname.replace(/^www\./, '').toLowerCase()
  if (h.includes('youtube') || h.includes('youtu.be')) return 'youtube'
  if (h.includes('vimeo')) return 'vimeo'
  if (h.includes('rutube')) return 'rutube'
  if (h.includes('vk.com') || h.includes('vkvideo') || h.includes('vk.ru')) return 'vk'
  if (h.includes('dailymotion') || h.includes('dai.ly')) return 'dailymotion'
  if (h.includes('ok.ru') || h.includes('odnoklassniki')) return 'ok'
  return 'iframe'
}

export type VideoPlaybackChoice = {
  resolved: ResolvedVideo
  /** True when we skipped YouTube in favour of a safer source. */
  usedFallback: boolean
  youtubeSkipped: boolean
}

/**
 * Pick best source: self-hosted file first, then non-YouTube URL, then YouTube.
 * `fallbackUrl` is used when primary is YouTube (or empty) so RU visitors aren't stuck.
 */
export function chooseVideoSource(opts: {
  mediaUrl?: string | null
  url?: string | null
  fallbackUrl?: string | null
  /** If true (default), never start with YouTube when another source exists. */
  preferNonYoutube?: boolean
}): VideoPlaybackChoice {
  const preferNonYoutube = opts.preferNonYoutube !== false
  const file = opts.mediaUrl?.trim()
  if (file) {
    return {
      resolved: { kind: 'file', src: file, platform: 'file' },
      usedFallback: false,
      youtubeSkipped: false,
    }
  }

  const primary = resolveVideoUrl(opts.url)
  const fallback = resolveVideoUrl(opts.fallbackUrl)

  if (preferNonYoutube && primary.kind === 'iframe' && primary.geoRisk) {
    if (fallback.kind !== 'none') {
      return { resolved: fallback, usedFallback: true, youtubeSkipped: true }
    }
  }

  if (primary.kind !== 'none') {
    return { resolved: primary, usedFallback: false, youtubeSkipped: false }
  }

  if (fallback.kind !== 'none') {
    return { resolved: fallback, usedFallback: true, youtubeSkipped: false }
  }

  return { resolved: { kind: 'none' }, usedFallback: false, youtubeSkipped: false }
}
