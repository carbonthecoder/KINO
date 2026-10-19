'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [copied, setCopied] = useState(false)
  const [installMethod, setInstallMethod] = useState<'curl' | 'git'>('curl')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    if (current === 'light' || current === 'dark') {
      setTheme(current)
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('kino-theme', next)
    } catch {}
  }

  const curlCmd = 'curl -fsSL https://kinothecli.vercel.app/install.sh | bash'
  const gitCmd = 'git clone https://github.com/carbonthecoder/KINO.git && cd KINO && npm i && npm link'

  const activeCmd = installMethod === 'curl' ? curlCmd : gitCmd

  const copyCmd = () => {
    navigator.clipboard.writeText(activeCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="container">
      <div className="top-bar">
        <button
          type="button"
          onClick={toggleTheme}
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className={`theme-icon ${theme === 'light' ? 'rotate-sun' : 'rotate-moon'}`}>
            {theme === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </span>
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>

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
        <div className="screenshot-frame">
          <Image
            src="/screenshot.png"
            alt="KINO terminal interface"
            width={852}
            height={667}
            priority
          />
        </div>
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
          <div className="install-tabs">
            <span className="install-label">Install</span>
            <button
              type="button"
              className={`install-tab-btn ${installMethod === 'curl' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setInstallMethod('curl')
              }}
            >
              curl
            </button>
            <span className="install-tab-divider">/</span>
            <button
              type="button"
              className={`install-tab-btn ${installMethod === 'git' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setInstallMethod('git')
              }}
            >
              git + npm
            </button>
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
