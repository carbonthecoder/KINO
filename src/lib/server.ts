import {spawn, type ChildProcess} from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import {type MediaResult, getDetails, getSeasonEpisodes, searchTMDB, isAnimeResult} from './tmdb.js'

const customDir = process.env.STRM_WEB_DIR
const defaultDir = path.resolve(process.env.USERPROFILE || process.env.HOME || '', '.kino-web')
const MOVIE_PLAYER_DIR = customDir ? path.resolve(customDir) : defaultDir
const PORT = 3000

let playerProcess: ChildProcess | null = null
let embeddedServer: http.Server | null = null

function startEmbeddedServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    embeddedServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)

      // API: Quick Search in player
      if (url.pathname === '/api/search') {
        const q = url.searchParams.get('q') || ''
        const searchMode = (url.searchParams.get('mode') || 'movies') as any
        if (!q.trim()) {
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
          res.end(JSON.stringify({results: []}))
          return
        }
        try {
          const results = await searchTMDB(q, searchMode)
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
          res.end(JSON.stringify({
            results: results.slice(0, 8).map(r => ({
              id: r.id,
              title: r.title || r.name,
              year: (r.release_date || r.first_air_date || '').slice(0, 4),
              type: r.media_type,
              isAnime: isAnimeResult(r),
              poster: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : '',
            })),
          }))
        } catch (err) {
          res.writeHead(500, {'Content-Type': 'application/json'})
          res.end(JSON.stringify({error: err instanceof Error ? err.message : String(err)}))
        }
        return
      }

      // API: TV show seasons & details
      if (url.pathname === '/api/tv-details') {
        const id = parseInt(url.searchParams.get('id') || '0', 10)
        if (!id) {
          res.writeHead(400, {'Content-Type': 'application/json'})
          res.end(JSON.stringify({error: 'Missing id'}))
          return
        }
        try {
          const details = await getDetails(id, 'tv')
          const seasons = (details.seasons || [])
            .filter(s => s.season_number > 0)
            .map(s => ({
              season_number: s.season_number,
              name: s.name,
              episode_count: s.episode_count,
            }))
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
          res.end(JSON.stringify({
            id: details.id,
            name: details.name || details.title,
            seasons,
          }))
        } catch (err) {
          res.writeHead(500, {'Content-Type': 'application/json'})
          res.end(JSON.stringify({error: err instanceof Error ? err.message : String(err)}))
        }
        return
      }

      // API: Episodes for a given season with thumbnails and overviews
      if (url.pathname === '/api/season-episodes') {
        const id = parseInt(url.searchParams.get('id') || '0', 10)
        const season = parseInt(url.searchParams.get('season') || '1', 10)
        if (!id) {
          res.writeHead(400, {'Content-Type': 'application/json'})
          res.end(JSON.stringify({error: 'Missing id'}))
          return
        }
        try {
          const episodes = await getSeasonEpisodes(id, season)
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
          res.end(JSON.stringify({
            season,
            episodes: episodes.map(e => ({
              episode_number: e.episode_number,
              name: e.name,
              overview: e.overview || '',
              air_date: e.air_date || '',
              still_path: e.still_path || '',
              vote_average: e.vote_average || 0,
            })),
          }))
        } catch (err) {
          res.writeHead(500, {'Content-Type': 'application/json'})
          res.end(JSON.stringify({error: err instanceof Error ? err.message : String(err)}))
        }
        return
      }

      // Player Web UI
      if (url.pathname === '/movies') {
        const id = url.searchParams.get('id') || ''
        const type = url.searchParams.get('type') || 'movie'
        const isTv = type === 'tv'
        const isAnime = url.searchParams.get('anime') === '1'

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KINO // ${isAnime ? 'ANIME' : type.toUpperCase()}</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    :root {
      --bg: #000000;
      --surface: #0a0a0a;
      --surface-hover: #141414;
      --border: #222222;
      --border-focus: #444444;
      --text: #ededed;
      --text-muted: #888888;
      --text-dim: #444444;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Geist", sans-serif;
      --font-mono: "Geist Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }

    header {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      gap: 12px;
      flex-shrink: 0;
      z-index: 50;
      transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    }
    footer {
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      background: #000000;
      border-top: 1px solid var(--border);
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-dim);
      flex-shrink: 0;
      z-index: 50;
      transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.26s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Auto-hiding Cinema Mode */
    body.cinema-hidden header {
      transform: translateY(-100%);
      opacity: 0;
      pointer-events: none;
    }
    body.cinema-hidden footer {
      transform: translateY(100%);
      opacity: 0;
      pointer-events: none;
    }
    body.cinema-hidden {
      cursor: none;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .brand-triangle {
      width: 14px;
      height: 12px;
      fill: #ffffff;
      flex-shrink: 0;
    }
    .brand-name {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #ffffff;
    }
    .meta-tag {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--surface-hover);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }

    .nav-cluster {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: nowrap;
    }

    /* Compact Server Dropdown with Arrow */
    .server-dropdown-wrap {
      position: relative;
    }
    .server-select-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s, border-color 0.15s;
    }
    .server-select-btn:hover {
      background: var(--surface-hover);
      border-color: var(--border-focus);
    }
    .chevron-icon {
      transition: transform 0.2s;
    }
    .server-dropdown-wrap.open .chevron-icon {
      transform: rotate(180deg);
    }
    .server-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      background: #0d0d0d;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px;
      min-width: 150px;
      display: none;
      flex-direction: column;
      gap: 2px;
      z-index: 100;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
    }
    .server-dropdown-wrap.open .server-menu {
      display: flex;
    }
    .server-menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .server-menu-item:hover {
      background: var(--surface-hover);
      color: #ffffff;
    }
    .server-menu-item.active {
      background: #181818;
      color: #ffffff;
      font-weight: 600;
    }
    .menu-kbd {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
    }

    /* Series Season Selector */
    .control-select-wrap {
      display: inline-flex;
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 3px 8px;
      gap: 6px;
    }
    .ctrl-label {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    select {
      background: transparent;
      color: var(--text);
      border: none;
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      max-width: 140px;
    }
    select option {
      background: #0a0a0a;
      color: #ededed;
    }

    .btn {
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      white-space: nowrap;
    }
    .btn-secondary {
      background: var(--surface);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: var(--surface-hover);
      border-color: var(--border-focus);
      color: var(--text);
    }

    .player-wrap {
      flex: 1;
      width: 100%;
      height: 100%;
      background: #000000;
      position: relative;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #000000;
    }

    /* Toast Notification */
    .toast {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(10, 10, 10, 0.95);
      border: 1px solid var(--border);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 60;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.25s, transform 0.25s;
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #eab308;
    }

    .foot-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      display: inline-block;
    }
    .status-dot.switching {
      background: #eab308;
      animation: pulse 1s infinite alternate;
    }
    @keyframes pulse {
      from { opacity: 0.5; }
      to { opacity: 1; }
    }
    .foot-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .kbd-hint {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .kbd-hint kbd {
      background: var(--surface-hover);
      border: 1px solid var(--border);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
      color: var(--text-muted);
    }

    /* Episode Drawer */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 999;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease;
    }
    .drawer-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      width: 440px;
      max-width: 92vw;
      height: 100vh;
      background: #0a0a0a;
      border-left: 1px solid var(--border);
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      box-shadow: -14px 0 36px rgba(0, 0, 0, 0.9);
    }
    .drawer.open {
      transform: translateX(0);
    }
    .drawer-header {
      height: 58px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
    }
    .drawer-title {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: 0.02em;
    }
    .drawer-subtitle {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .drawer-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Rich Episode Card */
    .ep-card {
      display: flex;
      gap: 12px;
      padding: 10px;
      background: #0d0d0d;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, transform 0.15s;
      align-items: flex-start;
    }
    .ep-card:hover {
      background: #141414;
      border-color: #383838;
      transform: translateY(-1px);
    }
    .ep-card.active {
      background: #181818;
      border-color: #ededed;
    }
    .ep-thumb-wrap {
      width: 120px;
      height: 68px;
      flex-shrink: 0;
      border-radius: 5px;
      overflow: hidden;
      background: #141414;
      position: relative;
    }
    .ep-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ep-badge-overlay {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.15);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      color: #ededed;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .ep-card-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .ep-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .ep-card-title {
      font-size: 13px;
      font-weight: 600;
      color: #ededed;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ep-card.active .ep-card-title {
      color: #ffffff;
    }
    .ep-playing-pill {
      font-family: var(--font-mono);
      font-size: 8px;
      font-weight: 700;
      background: #ffffff;
      color: #000000;
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .ep-card-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-dim);
    }
    .ep-card-desc {
      font-size: 11px;
      line-height: 1.4;
      color: var(--text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: 2px;
    }

    /* Quick Search Spotlight Modal */
    .search-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 1100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      backdrop-filter: blur(4px);
    }
    .search-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    .search-modal {
      position: fixed;
      top: 15%;
      left: 50%;
      transform: translate(-50%, -10px) scale(0.98);
      width: 540px;
      max-width: 90vw;
      background: #0d0d0d;
      border: 1px solid var(--border-focus);
      border-radius: 8px;
      z-index: 1101;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.95);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .search-modal.open {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0) scale(1);
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      background: #111111;
    }
    .search-box input {
      flex: 1;
      background: transparent;
      border: none;
      color: #ffffff;
      font-family: var(--font-sans);
      font-size: 13px;
      outline: none;
    }
    .esc-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 2px 5px;
      border-radius: 4px;
      cursor: pointer;
    }
    .search-results-list {
      max-height: 380px;
      overflow-y: auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .search-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      color: var(--text);
      transition: background 0.15s;
    }
    .search-item:hover {
      background: var(--surface-hover);
    }
    .search-thumb {
      width: 32px;
      height: 48px;
      border-radius: 3px;
      object-fit: cover;
      background: #1a1a1a;
      flex-shrink: 0;
    }
    .search-info {
      flex: 1;
      min-width: 0;
    }
    .search-title {
      font-size: 13px;
      font-weight: 600;
      color: #ededed;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .search-meta {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <header id="siteHeader">
    <div class="brand">
      <svg class="brand-triangle" viewBox="0 0 75 65"><polygon points="37.5 0 75 65 0 65"></polygon></svg>
      <span class="brand-name">KINO</span>
      <span class="meta-tag">${isAnime ? 'ANIME' : type}</span>
    </div>

    <div class="nav-cluster">
      <!-- Quick Search Trigger -->
      <button class="btn btn-secondary" onclick="toggleQuickSearch(true)" title="Search titles (/)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <span style="opacity:0.6; font-family:var(--font-mono); font-size:10px;">/</span>
      </button>

      <!-- Compact Server Dropdown with Arrow -->
      <div class="server-dropdown-wrap" id="serverDropdownWrap">
        <button class="server-select-btn" onclick="toggleServerMenu(event)">
          <span class="status-dot" id="serverDot"></span>
          <span id="currentServerLabel">VidSrc SU</span>
          <svg class="chevron-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="server-menu" id="serverMenu">
          <div class="server-menu-item active" data-server="vidsrc-su" onclick="setServer('vidsrc-su')">
            <span>VidSrc SU</span><span class="menu-kbd">1</span>
          </div>
          <div class="server-menu-item" data-server="autoembed" onclick="setServer('autoembed')">
            <span>AutoEmbed</span><span class="menu-kbd">2</span>
          </div>
          <div class="server-menu-item" data-server="twoembed" onclick="setServer('twoembed')">
            <span>2Embed</span><span class="menu-kbd">3</span>
          </div>
          <div class="server-menu-item" data-server="vidsrc-to" onclick="setServer('vidsrc-to')">
            <span>VidSrc TO</span><span class="menu-kbd">4</span>
          </div>
        </div>
      </div>

      ${isTv || isAnime ? `
      <!-- Series Season Selector (Without Episode Count) -->
      <div class="control-select-wrap">
        <span class="ctrl-label">SEASON</span>
        <select id="seasonSelect" onchange="onSeasonChange()">
          <option value="1">Season 1</option>
        </select>
      </div>

      <!-- Episode Drawer Trigger Button -->
      <button class="btn btn-secondary" onclick="toggleDrawer()" title="View episodes (E)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
        Episodes ▾
      </button>
      ` : ''}

      ${isAnime ? `
      <button class="btn btn-secondary" id="audioToggle" onclick="toggleAudio()" title="Toggle Sub/Dub (S)">
        AUDIO: <span id="audioLabel" style="font-weight:700; color:#fff;">SUB</span>
      </button>
      ` : ''}

      <button class="btn btn-secondary" onclick="reloadFrame()" title="Reload (R)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
      </button>

      <button class="btn btn-secondary" onclick="toggleFullscreen()" title="Fullscreen (F)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
      </button>
    </div>
  </header>

  <div class="player-wrap" id="playerWrap">
    <iframe
      id="frame"
      src=""
      allowfullscreen="true"
      webkitallowfullscreen="true"
      mozallowfullscreen="true"
      referrerpolicy="origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen">
    </iframe>

    <div class="toast" id="playerToast">
      <span class="toast-dot"></span>
      <span id="toastMsg">Streaming</span>
    </div>
  </div>

  <div class="drawer-overlay" id="drawerOverlay" onclick="toggleDrawer(false)"></div>
  <aside class="drawer" id="episodeDrawer">
    <div class="drawer-header">
      <div>
        <div class="drawer-title">Episodes</div>
        <div class="drawer-subtitle" id="drawerSeasonName">Season 1</div>
      </div>
      <button class="step-btn" onclick="toggleDrawer(false)">✕</button>
    </div>
    <div class="drawer-list" id="drawerList"></div>
  </aside>

  <!-- Quick Search Spotlight Modal -->
  <div class="search-overlay" id="searchOverlay" onclick="toggleQuickSearch(false)"></div>
  <div class="search-modal" id="searchModal">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="quickSearchInput" type="text" placeholder="Search movies, series, anime... (type to search)" autocomplete="off" oninput="onQuickSearch(this.value)" />
      <span class="esc-badge" onclick="toggleQuickSearch(false)">ESC</span>
    </div>
    <div class="search-results-list" id="searchResultsList"></div>
  </div>

  <footer id="siteFooter">
    <div class="foot-left">
      <span class="status-dot"></span>
      <span>127.0.0.1:${PORT}</span>
      <span class="meta-tag" id="activeServerBadge">VidSrc SU</span>
    </div>
    <div class="foot-right">
      <span class="kbd-hint"><kbd>1-4</kbd> Server</span>
      <span class="kbd-hint"><kbd>N</kbd> Next Mirror</span>
      <span class="kbd-hint"><kbd>/</kbd> Search</span>
      ${isTv || isAnime ? '<span class="kbd-hint"><kbd>E</kbd> Episodes</span>' : ''}
      ${isAnime ? '<span class="kbd-hint"><kbd>S</kbd> Sub/Dub</span>' : ''}
      <span class="kbd-hint"><kbd>R</kbd> Reload</span>
      <span class="kbd-hint"><kbd>F</kbd> Fullscreen</span>
    </div>
  </footer>

  <script>
    const id = "${id}";
    const type = "${type}";
    const isTv = ${isTv};
    const isAnime = ${isAnime};

    const SERVERS = [
      { id: 'vidsrc-su', name: 'VidSrc SU' },
      { id: 'autoembed', name: 'AutoEmbed' },
      { id: 'twoembed', name: '2Embed' },
      { id: 'vidsrc-to', name: 'VidSrc TO' }
    ];

    let currentServerIndex = 0;
    let currentServer = SERVERS[0].id;
    let currentAudio = 'sub';
    let currentSeason = 1;
    let currentEpisode = 1;
    let seasonsData = [];
    let episodesData = [];
    let idleTimer = null;
    let failoverTimer = null;
    let searchDebounce = null;
    const IDLE_TIMEOUT_MS = 2500;
    const FAILOVER_TIMEOUT_MS = 6000;

    // Trap rogue top-level redirect attempts from iframe ads
    window.addEventListener('beforeunload', function(e) {
      e.preventDefault();
      return (e.returnValue = 'Leave KINO player?');
    });

    // Auto-hiding Cinema Mode
    function resetIdleTimer() {
      document.body.classList.remove('cinema-hidden');
      clearTimeout(idleTimer);

      const drawer = document.getElementById('episodeDrawer');
      const menu = document.getElementById('serverDropdownWrap');
      const searchModal = document.getElementById('searchModal');
      if (
        (drawer && drawer.classList.contains('open')) ||
        (menu && menu.classList.contains('open')) ||
        (searchModal && searchModal.classList.contains('open'))
      ) return;

      idleTimer = setTimeout(() => {
        const isDrawerOpen = drawer && drawer.classList.contains('open');
        const isMenuOpen = menu && menu.classList.contains('open');
        const isSearchOpen = searchModal && searchModal.classList.contains('open');
        if (!isDrawerOpen && !isMenuOpen && !isSearchOpen) {
          document.body.classList.add('cinema-hidden');
        }
      }, IDLE_TIMEOUT_MS);
    }

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);

    // Quick Search Spotlight
    function toggleQuickSearch(open) {
      const modal = document.getElementById('searchModal');
      const overlay = document.getElementById('searchOverlay');
      const input = document.getElementById('quickSearchInput');
      const isOpen = open !== undefined ? open : !modal.classList.contains('open');
      modal.classList.toggle('open', isOpen);
      overlay.classList.toggle('open', isOpen);
      if (isOpen) {
        setTimeout(() => input.focus(), 60);
      } else {
        input.value = '';
        document.getElementById('searchResultsList').innerHTML = '';
      }
      resetIdleTimer();
    }

    function onQuickSearch(val) {
      clearTimeout(searchDebounce);
      const query = val.trim();
      const list = document.getElementById('searchResultsList');
      if (!query) {
        list.innerHTML = '';
        return;
      }
      searchDebounce = setTimeout(async () => {
        try {
          const res = await fetch('/api/search?q=' + encodeURIComponent(query) + '&mode=' + (isAnime ? 'anime' : 'movies'));
          const data = await res.json();
          if (!data.results || data.results.length === 0) {
            list.innerHTML = '<div style="padding:16px; text-align:center; font-size:12px; color:#666;">No results found</div>';
            return;
          }
          list.innerHTML = data.results.map(r => \`
            <a class="search-item" href="/movies?id=\${r.id}&type=\${r.type}\${r.isAnime ? '&anime=1' : ''}">
              \${r.poster ? \`<img class="search-thumb" src="\${r.poster}" />\` : '<div class="search-thumb"></div>'}
              <div class="search-info">
                <div class="search-title">\${escapeHtml(r.title)}</div>
                <div class="search-meta">\${r.year || '—'} · \${r.isAnime ? 'ANIME' : r.type.toUpperCase()}</div>
              </div>
            </a>
          \`).join('');
        } catch (_) {}
      }, 220);
    }

    // Server Menu Dropdown
    function toggleServerMenu(e) {
      if (e) e.stopPropagation();
      const wrap = document.getElementById('serverDropdownWrap');
      wrap.classList.toggle('open');
    }

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('serverDropdownWrap');
      if (wrap && !wrap.contains(e.target)) {
        wrap.classList.remove('open');
      }
    });

    function showToast(msg, duration = 3000) {
      const toast = document.getElementById('playerToast');
      const text = document.getElementById('toastMsg');
      if (!toast || !text) return;
      text.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, duration);
    }

    // Auto-Failover to next server if one fails or times out
    function autoFailover(reason) {
      const nextIndex = (currentServerIndex + 1) % SERVERS.length;
      const nextSrv = SERVERS[nextIndex];
      showToast(reason + ' → Switching to ' + nextSrv.name, 3500);
      setServer(nextSrv.id);
    }

    function setServer(srvId) {
      currentServer = srvId;
      const idx = SERVERS.findIndex(s => s.id === srvId);
      if (idx !== -1) currentServerIndex = idx;

      const currentObj = SERVERS[currentServerIndex] || SERVERS[0];
      const label = document.getElementById('currentServerLabel');
      const badge = document.getElementById('activeServerBadge');
      if (label) label.textContent = currentObj.name;
      if (badge) badge.textContent = currentObj.name;

      document.querySelectorAll('.server-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.server === srvId);
      });

      const wrap = document.getElementById('serverDropdownWrap');
      if (wrap) wrap.classList.remove('open');

      updateSrc();
    }

    function nextServer() {
      const nextIndex = (currentServerIndex + 1) % SERVERS.length;
      setServer(SERVERS[nextIndex].id);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function loadSeriesData() {
      if (!isTv && !isAnime) {
        updateSrc();
        return;
      }

      // Check saved progress
      try {
        const saved = localStorage.getItem('kino_progress_' + id) || localStorage.getItem('show_progress_' + id);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.season) currentSeason = parseInt(parsed.season, 10);
          if (parsed.episode) currentEpisode = parseInt(parsed.episode, 10);
        }
      } catch (_) {}

      try {
        const res = await fetch('/api/tv-details?id=' + id);
        if (!res.ok) throw new Error('Failed to load seasons');
        const data = await res.json();
        seasonsData = data.seasons || [];

        const seasonSelect = document.getElementById('seasonSelect');
        if (seasonSelect && seasonsData.length > 0) {
          seasonSelect.innerHTML = seasonsData.map(s => 
            \`<option value="\${s.season_number}" \${s.season_number === currentSeason ? 'selected' : ''}>\` +
            \`\${s.name || ('Season ' + s.season_number)}\` +
            \`</option>\`
          ).join('');

          if (!seasonsData.some(s => s.season_number === currentSeason)) {
            currentSeason = seasonsData[0].season_number;
            seasonSelect.value = String(currentSeason);
          }
        }
      } catch (err) {
        console.error('Failed to load seasons from TMDB', err);
      }

      await loadSeasonEpisodes(currentSeason, currentEpisode);
    }

    async function loadSeasonEpisodes(season, targetEp = 1) {
      currentSeason = season;

      try {
        const res = await fetch('/api/season-episodes?id=' + id + '&season=' + season);
        if (!res.ok) throw new Error('Failed to load episodes');
        const data = await res.json();
        episodesData = data.episodes || [];

        if (episodesData.length > 0) {
          if (episodesData.some(ep => ep.episode_number === targetEp)) {
            currentEpisode = targetEp;
          } else {
            currentEpisode = episodesData[0].episode_number;
          }
        }
      } catch (err) {
        console.error('Failed to load episodes from TMDB', err);
        currentEpisode = targetEp;
      }

      updateDrawer();
      updateSrc();
      saveProgress();
    }

    function onSeasonChange() {
      const sel = document.getElementById('seasonSelect');
      if (!sel) return;
      const newSeason = parseInt(sel.value, 10);
      loadSeasonEpisodes(newSeason, 1);
    }

    function saveProgress() {
      try {
        const state = JSON.stringify({
          season: currentSeason,
          episode: currentEpisode
        });
        localStorage.setItem('kino_progress_' + id, state);
      } catch (_) {}
    }

    function updateDrawer() {
      const list = document.getElementById('drawerList');
      const dSeason = document.getElementById('drawerSeasonName');
      if (dSeason) {
        const sObj = seasonsData.find(s => s.season_number === currentSeason);
        dSeason.textContent = sObj ? (sObj.name + ' (' + episodesData.length + ' Episodes)') : ('Season ' + currentSeason);
      }

      if (list) {
        list.innerHTML = episodesData.map(ep => {
          const isActive = ep.episode_number === currentEpisode;
          const stillUrl = ep.still_path
            ? 'https://image.tmdb.org/t/p/w300' + ep.still_path
            : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="68" viewBox="0 0 120 68" fill="%23141414"><rect width="120" height="68"/><text x="50%" y="55%" fill="%23444444" font-family="sans-serif" font-size="11" text-anchor="middle">EP ' + ep.episode_number + '</text></svg>';

          return \`
            <div class="ep-card \${isActive ? 'active' : ''}" onclick="selectEpisodeFromDrawer(\${ep.episode_number})">
              <div class="ep-thumb-wrap">
                <img class="ep-thumb" src="\${stillUrl}" loading="lazy" alt="Episode \${ep.episode_number}">
                <span class="ep-badge-overlay">\${String(ep.episode_number).padStart(2, '0')}</span>
              </div>
              <div class="ep-card-body">
                <div class="ep-card-header">
                  <span class="ep-card-title">\${escapeHtml(ep.name || ('Episode ' + ep.episode_number))}</span>
                  \${isActive ? '<span class="ep-playing-pill">PLAYING</span>' : ''}
                </div>
                <div class="ep-card-meta">
                  \${ep.air_date ? \`<span>\${ep.air_date}</span>\` : ''}
                  \${ep.vote_average ? \`<span>★ \${ep.vote_average.toFixed(1)}</span>\` : ''}
                </div>
                \${ep.overview ? \`<p class="ep-card-desc">\${escapeHtml(ep.overview)}</p>\` : ''}
              </div>
            </div>
          \`;
        }).join('');
      }
    }

    function selectEpisodeFromDrawer(epNum) {
      currentEpisode = epNum;
      updateDrawer();
      updateSrc();
      saveProgress();
      toggleDrawer(false);
    }

    function toggleDrawer(force) {
      const drawer = document.getElementById('episodeDrawer');
      const overlay = document.getElementById('drawerOverlay');
      if (!drawer) return;
      const isOpen = force !== undefined ? force : !drawer.classList.contains('open');
      drawer.classList.toggle('open', isOpen);
      if (overlay) overlay.classList.toggle('open', isOpen);
      resetIdleTimer();
    }

    function toggleAudio() {
      currentAudio = currentAudio === 'sub' ? 'dub' : 'sub';
      const el = document.getElementById('audioLabel');
      if (el) el.textContent = currentAudio.toUpperCase();
      updateSrc();
    }

    function getTargetUrl(server) {
      const s = currentSeason;
      const e = currentEpisode;

      if (server === 'vidsrc-su') {
        return type === 'movie'
          ? 'https://vidsrc.su/embed/movie/' + id
          : 'https://vidsrc.su/embed/tv/' + id + '/' + s + '/' + e;
      }
      if (server === 'autoembed') {
        return type === 'movie'
          ? 'https://autoembed.co/movie/tmdb/' + id
          : 'https://autoembed.co/tv/tmdb/' + id + '-' + s + '-' + e;
      }
      if (server === 'twoembed') {
        return type === 'movie'
          ? 'https://www.2embed.skin/embed/' + id
          : 'https://www.2embed.skin/embedtv/' + id + '&s=' + s + '&e=' + e;
      }
      if (server === 'vidsrc-to') {
        return type === 'movie'
          ? 'https://vidsrc.to/embed/movie/' + id
          : 'https://vidsrc.to/embed/tv/' + id + '/' + s + '/' + e;
      }
      return 'https://www.themoviedb.org/' + type + '/' + id;
    }

    function updateSrc() {
      clearTimeout(failoverTimer);
      const target = getTargetUrl(currentServer);
      const frame = document.getElementById('frame');
      const dot = document.getElementById('serverDot');
      
      if (dot) dot.classList.add('switching');
      frame.src = target;

      failoverTimer = setTimeout(() => {
        if (dot) dot.classList.remove('switching');
      }, FAILOVER_TIMEOUT_MS);
    }

    const frameEl = document.getElementById('frame');
    frameEl.addEventListener('load', () => {
      clearTimeout(failoverTimer);
      const dot = document.getElementById('serverDot');
      if (dot) dot.classList.remove('switching');
    });

    frameEl.addEventListener('error', () => {
      autoFailover('Server load error');
    });

    function reloadFrame() {
      const f = document.getElementById('frame');
      const cur = f.src;
      f.src = '';
      setTimeout(() => { f.src = cur; }, 100);
    }

    function toggleFullscreen() {
      const elem = document.getElementById('playerWrap');
      if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') {
          toggleQuickSearch(false);
          document.activeElement.blur();
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        toggleQuickSearch(true);
        return;
      }
      if (e.key === '1') setServer('vidsrc-su');
      if (e.key === '2') setServer('autoembed');
      if (e.key === '3') setServer('twoembed');
      if (e.key === '4') setServer('vidsrc-to');
      if (e.key === 'n' || e.key === 'N') nextServer();
      if (e.key === 'r' || e.key === 'R') reloadFrame();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'e' || e.key === 'E') toggleDrawer();
      if (e.key === 's' || e.key === 'S') toggleAudio();
      if (e.key === 'Escape') {
        toggleQuickSearch(false);
        toggleDrawer(false);
        const wrap = document.getElementById('serverDropdownWrap');
        if (wrap) wrap.classList.remove('open');
      }
    });

    loadSeriesData();
  </script>
</body>
</html>`
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
        res.end(html)
        return
      }

      res.writeHead(404, {'Content-Type': 'text/plain'})
      res.end('Not Found')
    })

    embeddedServer.on('error', reject)
    embeddedServer.listen(PORT, () => {
      resolve()
    })
  })
}

async function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}`, {timeout: 500}, () => {
      req.destroy()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function waitForServer(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true
    await new Promise(r => setTimeout(r, 300))
  }
  return false
}

export async function ensurePlayerRunning(): Promise<void> {
  if (await isPortOpen(PORT)) return

  if (fs.existsSync(path.join(MOVIE_PLAYER_DIR, '.next'))) {
    playerProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: MOVIE_PLAYER_DIR,
      stdio: 'ignore',
      detached: true,
    })
    playerProcess.unref()

    const started = await waitForServer(PORT)
    if (!started) {
      throw new Error(`movie-player failed to start on port ${PORT}`)
    }
    return
  }

  // Fall back to built-in embedded streaming server
  await startEmbeddedServer()
}

export function getPlayerUrl(result: MediaResult, isAnime = false): string {
  const type = result.media_type === 'movie' ? 'movie' : 'tv'
  const animeFlag = isAnime ? '&anime=1' : ''
  return `http://127.0.0.1:${PORT}/movies?id=${result.id}&type=${type}${animeFlag}`
}
