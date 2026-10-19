'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function Home() {
  const [copied, setCopied] = useState(false)
  const [installMethod, setInstallMethod] = useState<'curl' | 'git'>('curl')

  const curlCmd = 'curl -fsSL https://raw.githubusercontent.com/carbonthecoder/KINO/main/website/public/install.sh | bash'
  const gitCmd = 'git clone https://github.com/carbonthecoder/KINO.git && cd KINO && npm i && npm link'

  const activeCmd = installMethod === 'curl' ? curlCmd : gitCmd

  const copyCmd = () => {
    navigator.clipboard.writeText(activeCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="container">
      <div className="badge">
        <span className="badge-dot"></span>
        <span>v1.0.0 released</span>
      </div>

      <h1 className="logo">KINO</h1>

      <p className="tagline">
        Search movies, television series, and anime directly from your terminal.
        <br />
        Pick an entry, select an episode, and stream with zero ad redirects.
      </p>

      <div className="screenshot">
        <Image
          src="/screenshot.png"
          alt="KINO terminal interface"
          width={800}
          height={500}
          priority
        />
      </div>

      <div className="tabs-section">
        <div className="tab-pill">
          <code>Tab</code> Category switcher
        </div>
        <div className="tab-pill">
          <code>/</code> Spotlight search
        </div>
        <div className="tab-pill">
          <code>Enter</code> Launch player
        </div>
      </div>

      <div className="install-box" onClick={copyCmd} title="Click to copy command">
        <div className="install-header">
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className="install-label">Install</span>
            <span
              style={{
                fontSize: '0.7rem',
                color: installMethod === 'curl' ? '#ffffff' : '#666666',
                cursor: 'pointer',
                fontWeight: installMethod === 'curl' ? 600 : 400,
              }}
              onClick={(e) => {
                e.stopPropagation()
                setInstallMethod('curl')
              }}
            >
              curl
            </span>
            <span style={{ color: '#333333', fontSize: '0.7rem' }}>/</span>
            <span
              style={{
                fontSize: '0.7rem',
                color: installMethod === 'git' ? '#ffffff' : '#666666',
                cursor: 'pointer',
                fontWeight: installMethod === 'git' ? 600 : 400,
              }}
              onClick={(e) => {
                e.stopPropagation()
                setInstallMethod('git')
              }}
            >
              git + npm
            </span>
          </div>
          <span className={`copy-hint ${copied ? 'copied' : ''}`}>
            {copied ? '✓ Copied' : 'Click to copy'}
          </span>
        </div>
        <div className="install-cmd">
          <span className="prompt">$</span>
          {activeCmd}
        </div>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-title">
            <span>[ Movies / TV / Anime ]</span>
          </div>
          <div className="feature-desc">
            Direct TMDB and AniList indexing. Switch libraries with the Tab key.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-title">
            <span>Popup Tab Killer</span>
          </div>
          <div className="feature-desc">
            Includes a Manifest V3 Chrome extension that closes ad redirects automatically.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-title">
            <span>Continue Watching</span>
          </div>
          <div className="feature-desc">
            Saves episode progress in ~/.kino_history.json. Resume streaming in one step.
          </div>
        </div>

        <div className="feature-card">
          <div className="feature-title">
            <span>Embedded Server</span>
          </div>
          <div className="feature-desc">
            Runs a lightweight local web player on localhost:3000 with episode drawers.
          </div>
        </div>
      </div>

      <div className="links">
        <a
          href="https://github.com/carbonthecoder/KINO"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a
          href="https://github.com/carbonthecoder/KINO/tree/main/extension"
          target="_blank"
          rel="noopener noreferrer"
        >
          Extension
        </a>
        <a
          href="https://github.com/carbonthecoder/KINO/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
        >
          MIT License
        </a>
      </div>

      <div className="footer">
        <span>KINO</span>
        <span>·</span>
        <a
          href="https://github.com/carbonthecoder"
          target="_blank"
          rel="noopener noreferrer"
        >
          carbonthecoder
        </a>
      </div>
    </div>
  )
}
