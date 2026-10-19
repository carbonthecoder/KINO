import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#000000',
}

export const metadata: Metadata = {
  title: 'KINO — Minimal Terminal Stream Launcher',
  description: 'Search and stream movies, series, and anime directly from your terminal. Zero popups, instant playback.',
  openGraph: {
    title: 'KINO — Minimal Terminal Stream Launcher',
    description: 'Search and stream movies, series, and anime directly from your terminal.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body>{children}</body>
    </html>
  )
}
