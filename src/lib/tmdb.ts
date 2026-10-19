import dns from 'node:dns'

const originalLookup = dns.lookup
const resolver = new dns.promises.Resolver()
resolver.setServers(['8.8.8.8', '1.1.1.1'])

dns.lookup = function(hostname: string, options: any, callback?: any) {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  if (hostname.includes('themoviedb.org')) {
    resolver.resolve4(hostname).then(ips => {
      if (ips && ips.length > 0) {
        if (options && options.all) {
          callback(null, ips.map(address => ({ address, family: 4 })))
        } else {
          callback(null, ips[0], 4)
        }
      } else {
        originalLookup(hostname, options, callback)
      }
    }).catch(() => originalLookup(hostname, options, callback))
    return
  }
  return originalLookup(hostname, options, callback)
}

const TMDB_BASE = 'https://api.themoviedb.org/3'
const CONFIG_URL = 'https://strm.sh/api/config'
const FALLBACK_API_KEY = 'b32e12653f88a76db2edc3bb63af4299'

let cachedApiKey = ''
let cachedReadToken = ''

async function loadCredentials(): Promise<{apiKey: string; readToken: string}> {
  if (cachedApiKey && cachedReadToken) {
    return {apiKey: cachedApiKey, readToken: cachedReadToken}
  }

  try {
    const res = await fetch(CONFIG_URL, {cache: 'no-store', signal: AbortSignal.timeout(4000)})
    if (res.ok) {
      const data = await res.json()
      cachedApiKey = data.tmdbApiKey || ''
      cachedReadToken = data.tmdbReadAccessToken || ''
    }
  } catch {
    // config endpoint unreachable — fall back to bundled key
  }

  if (!cachedApiKey) cachedApiKey = FALLBACK_API_KEY
  if (!cachedReadToken) cachedReadToken = FALLBACK_API_KEY
  return {apiKey: cachedApiKey, readToken: cachedReadToken}
}

export type SearchMode = 'movies' | 'series' | 'anime'

export type MediaResult = {
  id: number
  title?: string
  name?: string
  media_type: 'movie' | 'tv'
  release_date?: string
  first_air_date?: string
  overview?: string
  vote_average?: number
  poster_path?: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  original_language?: string
  origin_country?: string[]
}

export type SearchResponse = {
  results: MediaResult[]
  total_results: number
}

export function isAnimeResult(r: MediaResult): boolean {
  return Boolean(
    r.original_language === 'ja' ||
    r.origin_country?.includes('JP') ||
    (r.genre_ids?.includes(16) && (r.original_language === 'ja' || r.origin_country?.includes('JP')))
  )
}

export async function searchTMDB(query: string, mode: SearchMode = 'movies'): Promise<MediaResult[]> {
  const {apiKey} = await loadCredentials()
  const q = encodeURIComponent(query)

  if (mode === 'movies') {
    const url = `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${q}&language=en-US&page=1`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TMDB API error: ${res.status}`)
    const data: SearchResponse = await res.json()
    return data.results.map(r => ({ ...r, media_type: 'movie' as const })).slice(0, 20)
  }

  if (mode === 'series') {
    const url = `${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${q}&language=en-US&page=1`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`TMDB API error: ${res.status}`)
    const data: SearchResponse = await res.json()
    return data.results.map(r => ({ ...r, media_type: 'tv' as const })).slice(0, 20)
  }

  // Anime mode: multi-search filtered for animation / Japanese origin
  const url = `${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${q}&language=en-US&page=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`)
  const data: SearchResponse = await res.json()
  const mediaOnly = data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv')
  const animeFiltered = mediaOnly.filter(r => isAnimeResult(r) || r.genre_ids?.includes(16))
  return (animeFiltered.length > 0 ? animeFiltered : mediaOnly).slice(0, 20)
}

export async function getDetails(id: number, type: 'movie' | 'tv'): Promise<MediaResult & {seasons?: {season_number: number; episode_count: number; name: string}[]}> {
  const {apiKey} = await loadCredentials()
  const res = await fetch(`${TMDB_BASE}/${type}/${id}?api_key=${apiKey}&language=en-US`)
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`)
  return res.json()
}

export type EpisodeInfo = {
  id: number
  episode_number: number
  name: string
  overview?: string
  still_path?: string | null
  air_date?: string
  vote_average?: number
}

export async function getSeasonEpisodes(tvId: number, seasonNumber: number): Promise<EpisodeInfo[]> {
  const {apiKey} = await loadCredentials()
  const res = await fetch(`${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}?api_key=${apiKey}&language=en-US`)
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`)
  const data = await res.json()
  return data.episodes || []
}

export function mediaTitle(r: MediaResult): string {
  return r.title || r.name || 'Unknown'
}

export function mediaYear(r: MediaResult): string {
  const d = r.release_date || r.first_air_date || ''
  return d ? d.slice(0, 4) : '—'
}

export function mediaType(r: MediaResult, mode?: SearchMode): string {
  if (mode === 'anime' || isAnimeResult(r)) {
    return r.media_type === 'movie' ? 'Anime Movie' : 'Anime'
  }
  return r.media_type === 'movie' ? 'Movie' : 'Series'
}
