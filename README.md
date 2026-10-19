# KINO

```
 ░███     ░███ ░████████  ░████     ░███   ░████████   
 ░███    ░███    ░███     ░█████    ░███  ░███    ░███ 
 ░███   ░███     ░███     ░██████   ░███ ░███      ░███
 ░█████████      ░███     ░███ ░██  ░███ ░███      ░███
 ░███   ░███     ░███     ░███  ░██ ░███ ░███      ░███
 ░███    ░███    ░███     ░███   ░██████  ░███    ░███ 
 ░███     ░███ ░████████  ░███    ░█████   ░████████   
```

Minimal terminal stream launcher for movies, television, and anime.

---

## Quickstart

```bash
curl -fsSL https://raw.githubusercontent.com/carbonthecoder/KINO/main/website/public/install.sh | bash
```

Or clone and build manually:

```bash
git clone https://github.com/carbonthecoder/KINO.git
cd KINO
npm install
npm run build
npm link
```

Launch from any shell:

```bash
kino
```

---

## Controls

### Terminal CLI

| Key | Action |
| :--- | :--- |
| **`Tab`** | Switch search mode: `[ Movies ]` → `[ Series ]` → `[ Anime ]` |
| **`1` – `3`** | Quick resume recent title from Continue Watching shelf |
| **`↵`** | Search / stream selected title |
| **`↑` / `↓`** | Select title |
| **`PgUp` / `PgDn`** | Scroll results list |
| **`Esc`** | Clear / return to search input |
| **`Ctrl+C`** | Exit |

### Web Player (`http://127.0.0.1:3000`)

| Key | Action |
| :--- | :--- |
| **`/`** | Spotlight search modal (search any title without reopening CLI) |
| **`E`** | Open / close Episode Drawer with TMDB still thumbnails |
| **`1` – `4`** | Switch streaming mirror |
| **`N`** | Skip to next working mirror |
| **`S`** | Toggle `SUB` / `DUB` audio (Anime mode) |
| **`R`** | Reload video frame |
| **`F`** | Fullscreen player canvas |

---

## Companion Extension (`extension/`)

KINO includes an unpackaged Manifest V3 browser extension in [`extension/`](extension/) that listens to `chrome.tabs.onCreated` and kills outbound popup ad tabs in under 10ms without triggering anti-adblock detection. Load it unpacked in `chrome://extensions` (Developer Mode).

---

## Architecture

- **Terminal Frontend**: React 19 + Ink 7 terminal UI with dynamic public DNS bypass for TMDB metadata.
- **Embedded Web Player**: Zero-dependency local Node HTTP server running on `127.0.0.1:3000`.
- **Auto-Failover**: Monitors mirror health and automatically rotates across streaming providers if a host drops or times out.
- **Cinema Mode**: Hides top and bottom chrome automatically when mouse input remains idle for 2.5 seconds.
- **Progress Memory**: Saves current season and episode to browser `localStorage` on change.

---

## Website

The landing page lives in [`website/`](website/). To run locally:

```bash
npm run website:dev
```

When importing the repository to Vercel, set the Root Directory to `website`, or use the included `vercel.json` for automatic root deployments.

---

## License

MIT

