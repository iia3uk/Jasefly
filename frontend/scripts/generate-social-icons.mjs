import fs from 'node:fs'
import * as si from 'simple-icons'

const bySlug = Object.create(null)
for (const v of Object.values(si)) {
  if (v && typeof v === 'object' && v.slug && v.path) bySlug[v.slug] = v
}

const slugs = [
  'facebook', 'messenger', 'instagram', 'threads', 'whatsapp', 'meta', 'x', 'tiktok',
  'youtube', 'youtubemusic', 'youtubeshorts', 'discord', 'telegram', 'signal', 'viber',
  'snapchat', 'reddit', 'pinterest', 'tumblr', 'xing', 'mastodon', 'bluesky',
  'clubhouse', 'quora', 'meetup', 'nextdoor', 'myspace', 'mewe', 'minds',
  'vk', 'odnoklassniki', 'habr', 'kinopoisk', 'livejournal', 'shikimori', 'boosty',
  'wechat', 'sinaweibo', 'qq', 'qzone', 'bilibili', 'xiaohongshu', 'kuaishou', 'line',
  'kakao', 'kakaotalk', 'naver', 'douban', 'zhihu', 'renren', 'plurk', 'baidu',
  'element', 'matrix', 'threema', 'session', 'wire', 'guilded', 'googlemeet', 'zoom',
  'webex', 'revoltdotchat', 'mattermost', 'zulip', 'keybase', 'icq', 'kik', 'groupme',
  'github', 'gitlab', 'bitbucket', 'stackoverflow', 'devdotto', 'hashnode', 'medium',
  'substack', 'behance', 'dribbble', 'artstation', 'deviantart', 'figma', 'notion',
  'patreon', 'buymeacoffee', 'kofi', 'linktree', 'producthunt', 'indiehackers', 'replit',
  'codesandbox', 'stackblitz', 'ycombinator', 'wellfound',
  'steam', 'epicgames', 'playstation', 'itchdotio', 'gogdotcom',
  'roblox', 'twitch', 'kick', 'facebookgaming', 'youtubegaming', 'faceit', 'esea',
  'spotify', 'soundcloud', 'applemusic', 'bandcamp', 'deezer', 'tidal', 'lastdotfm',
  'shazam', 'genius', 'audiomack', 'vimeo', 'dailymotion', 'odysee', 'peertube', 'rumble',
  'crunchyroll', 'myanimelist', 'anilist', 'letterboxd', 'imdb', 'trakt', 'goodreads', 'strava',
  'applepodcasts', 'pocketcasts', 'castbox', 'gmail', 'protonmail', 'paypal',
  'cashapp', 'venmo', 'onlyfans',
  'lemmy', 'pixelfed', 'misskey', 'ghost', 'wordpress', 'blogger',
  'flickr', '500px', 'glassdoor', 'crunchbase', 'trello', 'asana', 'jira',
  'miro', 'airtable', 'calendly', 'basecamp',
]

/** Brands missing from Simple Icons — kept for CMS usability. */
const EXTRA = [
  {
    slug: 'linkedin',
    title: 'LinkedIn',
    hex: '0A66C2',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    slug: 'slack',
    title: 'Slack',
    hex: '4A154B',
    path: 'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.522 2.522v6.312zm-5.316 6.314a2.527 2.527 0 0 1 2.523 2.522A2.527 2.527 0 0 1 15.164 24a2.527 2.527 0 0 1-2.522-2.522v-2.522h2.522zm0-1.271a2.527 2.527 0 0 1-2.522-2.523 2.528 2.528 0 0 1 2.522-2.52h6.314A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.314z',
  },
  {
    slug: 'skype',
    title: 'Skype',
    hex: '00AFF0',
    path: 'M12.069 18.874c-4.023 0-4.79-1.879-4.79-3.294.004-.794.572-1.657 1.887-1.657 1.89 0 1.686 2.726 4.708 2.726 1.759 0 2.923-.79 2.923-1.833 0-.556-.245-1.188-1.728-1.46l-2.425-.603c-2.416-.612-4.99-1.557-4.99-4.328 0-3.254 3.047-4.478 5.876-4.478 2.536 0 5.01 1.193 5.01 3.226 0 .785-.556 1.647-1.76 1.647-1.787 0-1.548-2.418-4.603-2.418-1.385 0-2.473.534-2.473 1.56 0 .927.904 1.218 2.297 1.577l1.576.423c2.93.76 4.582 1.899 4.582 4.145 0 3.447-3.16 4.627-6.09 4.627m11.755-6.632c.069-.492.103-.999.103-1.524 0-5.36-4.384-9.707-9.79-9.707-1.68 0-3.25.422-4.623 1.166-1.42-.687-3.044-.93-4.334-.643-.446-.265-.96-.417-1.51-.417C1.504 1.117 0 2.615 0 4.463c0 .56.163 1.075.435 1.51C.15 7.166 0 8.337 0 9.56c0 5.36 4.384 9.708 9.79 9.708 1.26 0 2.462-.248 3.568-.692.78.374 1.656.59 2.585.59 1.879 0 3.404-1.497 3.404-3.344 0-.234-.028-.463-.072-.687 1.46-1.232 2.396-3.044 2.549-5.087',
  },
  {
    slug: 'codepen',
    title: 'CodePen',
    hex: '000000',
    path: 'M12 0C5.372 0 0 4.847 0 10.824c0 4.768 3.257 8.816 7.777 10.244.57.106.778-.248.778-.55 0-.27-.01-.986-.015-1.935-3.162.69-3.83-1.517-3.83-1.517-.514-1.314-1.257-1.664-1.257-1.664-1.027-.702.078-.687.078-.687 1.136.08 1.734 1.172 1.734 1.172 1.01 1.737 2.647 1.235 3.294.943.103-.733.396-1.234.72-1.518-2.524-.286-5.177-1.263-5.177-5.618 0-1.24.447-2.254 1.177-3.05-.118-.288-.51-1.444.112-3.01 0 0 .96-.307 3.144 1.166.914-.254 1.894-.382 2.868-.386.974.004 1.954.132 2.868.386 2.184-1.473 3.142-1.166 3.142-1.166.623 1.566.231 2.722.113 3.01.734.796 1.176 1.81 1.176 3.05 0 4.367-2.658 5.33-5.188 5.61.407.352.77 1.047.77 2.11 0 1.522-.014 2.75-.014 3.123 0 .303.206.662.783.548C20.75 19.63 24 15.587 24 10.824 24 4.847 18.627 0 12 0z',
  },
  {
    slug: 'xbox',
    title: 'Xbox',
    hex: '107C10',
    path: 'M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.898-2.967 1.782-2.969 2.505-7.013.805-10.261-1.123 1.894-3.927 6.494-5.427 8.433-.4.505-.809 1.018-1.276 1.018-.457 0-.868-.506-1.268-1.01-1.5-1.936-4.307-6.53-5.43-8.43-1.7 3.24-.977 7.28.8 10.25zM12 6.528c1.873 0 4.984-2.976 4.984-4.67 0-.69-.485-.95-1.058-.95-1.2 0-2.86 1.434-3.926 2.784C10.925 2.35 9.274.9 8.074.9c-.574 0-.93.26-.93.95 0 1.694 2.99 4.678 4.856 4.678zm0 6.506c.42 0 1.27-.812 2.456-1.954 1.683 1.922 3.327 3.924 4.522 5.49-.436 1.9-1.383 3.655-2.65 5.073-.727-.816-3.38-3.822-4.328-4.984-.947 1.162-3.6 4.168-4.327 4.984-1.268-1.418-2.214-3.175-2.65-5.075 1.195-1.566 2.84-3.568 4.523-5.49C10.73 12.222 11.58 13.034 12 13.034z',
  },
  {
    slug: 'canva',
    title: 'Canva',
    hex: '00C4CC',
    path: 'M6.893 13.799c1.873-.225 3.192-1.641 3.41-3.514.22-1.872-.945-3.465-2.826-3.768-.61-.096-1.15.165-1.535.537-.512.5-.86 1.23-.864 1.897-.005.768.286 1.172.87 1.189.66.019.822-.523.961-1.08.146-.577.385-1.387 1.208-1.27.691.1 1.072.898.946 1.891-.125.98-.76 1.805-1.479 1.94-.723.138-1.282-.318-1.585-1.076-.2-.498-.314-.929-.624-1.146-.422-.302-.942-.01-1.034.602-.141.944.564 2.777 3.552 3.198zM12.001.003C5.367-.029.059 5.34.001 12.014-.057 18.702 5.297 23.974 12.01 24c6.66.018 11.989-5.385 11.989-12.014C24.001 5.403 18.663.035 12.001.003z',
  },
  {
    slug: 'microsoftteams',
    title: 'Microsoft Teams',
    hex: '6264A7',
    path: 'M20.625 8.5V5.75A2.75 2.75 0 0 0 17.875 3h-6.05a2.75 2.75 0 0 0-2.75 2.75V8.5h11.55zM4.5 9.75A2.25 2.25 0 0 0 2.25 12v7.5A2.25 2.25 0 0 0 4.5 21.75h4.5A2.25 2.25 0 0 0 11.25 19.5V12A2.25 2.25 0 0 0 9 9.75H4.5zm8.25 0h7.875A1.875 1.875 0 0 1 22.5 11.625v7.5a1.875 1.875 0 0 1-1.875 1.875H15a.75.75 0 0 1-.75-.75v-9.75a.75.75 0 0 1 .75-.75h-.75zM7.125 6a2.625 2.625 0 1 0 0-5.25 2.625 2.625 0 0 0 0 5.25z',
  },
  {
    slug: 'nintendo',
    title: 'Nintendo',
    hex: 'E60012',
    path: 'M0 7.5v9c0 2.485 2.015 4.5 4.5 4.5h4V3H4.5C2.015 3 0 5.015 0 7.5zm11 0v13h8.5c2.485 0 4.5-2.015 4.5-4.5v-9C24 5.015 21.985 3 19.5 3H11v4.5zm-5.25 6.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  },
]

const aliases = {
  fb: 'facebook',
  ig: 'instagram',
  insta: 'instagram',
  yt: 'youtube',
  tg: 'telegram',
  gh: 'github',
  tw: 'x',
  twitter: 'x',
  twitterx: 'x',
  li: 'linkedin',
  linkedin: 'linkedin',
  vkcom: 'vk',
  vkontakte: 'vk',
  ok: 'odnoklassniki',
  weibo: 'sinaweibo',
  sina: 'sinaweibo',
  kakao: 'kakaotalk',
  wa: 'whatsapp',
  'whats-app': 'whatsapp',
  'buy-me-a-coffee': 'buymeacoffee',
  'ko-fi': 'kofi',
  'dev.to': 'devdotto',
  devto: 'devdotto',
  'last.fm': 'lastdotfm',
  lastfm: 'lastdotfm',
  'itch.io': 'itchdotio',
  itch: 'itchdotio',
  gog: 'gogdotcom',
  ps: 'playstation',
  ps5: 'playstation',
  'apple-music': 'applemusic',
  'youtube-music': 'youtubemusic',
  'youtube-shorts': 'youtubeshorts',
  'google-meet': 'googlemeet',
  'proton-mail': 'protonmail',
  'cash-app': 'cashapp',
  'blue-sky': 'bluesky',
  bsky: 'bluesky',
  xhs: 'xiaohongshu',
  rednote: 'xiaohongshu',
  'art-station': 'artstation',
  'deviant-art': 'deviantart',
  'product-hunt': 'producthunt',
  'hacker-news': 'ycombinator',
  hn: 'ycombinator',
  'stack-overflow': 'stackoverflow',
  so: 'stackoverflow',
  'link-tree': 'linktree',
  'peer-tube': 'peertube',
  'daily-motion': 'dailymotion',
  mal: 'myanimelist',
  lj: 'livejournal',
  teams: 'microsoftteams',
  nintendoswitch: 'nintendo',
  'nintendo-switch': 'nintendo',
  angellist: 'wellfound',
  revolt: 'revoltdotchat',
  'revolt.chat': 'revoltdotchat',
}

const icons = []
const missing = []
for (const slug of [...new Set(slugs)]) {
  const icon = bySlug[slug]
  if (!icon) {
    missing.push(slug)
    continue
  }
  icons.push({ slug: icon.slug, title: icon.title, path: icon.path, hex: icon.hex })
}

for (const extra of EXTRA) {
  if (!icons.some((i) => i.slug === extra.slug)) icons.push(extra)
}

icons.sort((a, b) => a.slug.localeCompare(b.slug))

const cleanAliases = {}
for (const [k, v] of Object.entries(aliases)) {
  if (icons.some((i) => i.slug === v)) cleanAliases[k] = v
}

const out = `/** Auto-generated social/brand icon paths (Simple Icons subset + key extras). */
export type SocialIconData = { slug: string; title: string; path: string; hex?: string }

export const SOCIAL_ICONS: SocialIconData[] = ${JSON.stringify(icons, null, 2)}

/** Alternate names → icon slug */
export const SOCIAL_ALIASES: Record<string, string> = ${JSON.stringify(cleanAliases, null, 2)}
`

fs.writeFileSync('src/shared/socialIconData.ts', out)
console.log('wrote', icons.length, 'icons; missing from SI', missing)
