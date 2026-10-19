import React, {useCallback, useEffect, useState} from 'react'
import {Box, Text, useApp, useInput, useStdout} from 'ink'
import Spinner from 'ink-spinner'
import open from 'open'
import {FramedInput} from './components/framed-input.js'
import {FullScreen} from './components/fullscreen.js'
import {Logo} from './components/logo.js'
import {Shortcuts} from './components/shortcuts.js'
import {TextInput} from './components/text-input.js'
import {ThemeProvider, type ThemeMode, useTheme} from './theme.js'
import {searchTMDB, mediaTitle, mediaYear, mediaType, isAnimeResult, type MediaResult, type SearchMode} from './lib/tmdb.js'
import {ensurePlayerRunning, getPlayerUrl} from './lib/server.js'
import {truncate, wrapText} from './lib/format.js'
import {getHistory, saveHistory, type HistoryItem} from './lib/history.js'

const TAGLINE = 'Search. Hit enter. Open. Watch.'

type Phase =
  | {name: 'input'; warning?: string}
  | {name: 'searching'}
  | {name: 'results'; results: MediaResult[]; query: string}
  | {name: 'empty'; query: string}
  | {name: 'watching'; title: string; results: MediaResult[]; query: string}
  | {name: 'error'; message: string}

const Gap = ({lines = 1}: {lines?: number}) => (
  <Box flexDirection="column" flexShrink={0}>
    {Array.from({length: lines}, (_, i) => (
      <Text key={i}> </Text>
    ))}
  </Box>
)

type AppProps = {
  initialThemeMode?: ThemeMode
}

export function App({initialThemeMode = 'auto'}: AppProps) {
  return (
    <ThemeProvider mode={initialThemeMode}>
      <AppContent />
    </ThemeProvider>
  )
}

function AppContent() {
  const theme = useTheme()
  const {exit} = useApp()
  const {stdout} = useStdout()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('movies')
  const [phase, setPhase] = useState<Phase>({name: 'input'})
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [history, setHistory] = useState<HistoryItem[]>(() => getHistory())

  const columns = stdout?.columns && stdout.columns > 0 ? stdout.columns : 80
  const rows = stdout?.rows && stdout.rows > 1 ? stdout.rows : 24
  const boxWidth = Math.max(14, Math.min(64, columns - 6))
  const contentWidth = Math.max(10, columns - 4)

  const useDualColumn = columns >= 90 && phase.name === 'results' && phase.results.length > 8
  const panelWidth = useDualColumn ? Math.floor(contentWidth * 0.5) : contentWidth
  const infoWidth = useDualColumn ? contentWidth - panelWidth - 3 : 0
  const maxVisible = Math.max(4, rows - 14)

  // Keep selected item visible in scroll window
  useEffect(() => {
    if (phase.name !== 'results') return
    if (selectedIndex < scrollOffset) setScrollOffset(selectedIndex)
    if (selectedIndex >= scrollOffset + maxVisible) setScrollOffset(selectedIndex - maxVisible + 1)
  }, [selectedIndex, maxVisible, phase.name])

  const handleSearch = useCallback(async (q: string, searchMode: SearchMode = mode) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setPhase({name: 'searching'})
    try {
      const results = await searchTMDB(trimmed, searchMode)
      if (results.length === 0) {
        setPhase({name: 'empty', query: trimmed})
      } else {
        setSelectedIndex(0)
        setScrollOffset(0)
        setPhase({name: 'results', results, query: trimmed})
      }
    } catch (err) {
      setPhase({name: 'error', message: err instanceof Error ? err.message : String(err)})
    }
  }, [mode])

  const cycleMode = useCallback(() => {
    setMode(prev => {
      const next: SearchMode = prev === 'movies' ? 'series' : prev === 'series' ? 'anime' : 'movies'
      return next
    })
  }, [])

  useEffect(() => {
    if (phase.name === 'results' && phase.query) {
      void handleSearch(phase.query, mode)
    }
  }, [mode])

  const handleWatch = useCallback(async (result: MediaResult, results: MediaResult[], currentQuery: string) => {
    const title = mediaTitle(result)
    setPhase({name: 'watching', title, results, query: currentQuery})
    try {
      await ensurePlayerRunning()
      const isAnime = mode === 'anime' || isAnimeResult(result)
      const url = getPlayerUrl(result, isAnime)
      saveHistory({
        id: result.id,
        title,
        media_type: result.media_type,
        year: mediaYear(result),
        isAnime,
      })
      setHistory(getHistory())
      await open(url)
      setTimeout(() => {
        setPhase(prev => {
          if (prev.name === 'watching') return {name: 'results', results: prev.results, query: prev.query}
          return prev
        })
      }, 1500)
    } catch (err) {
      setPhase({name: 'error', message: err instanceof Error ? err.message : String(err)})
    }
  }, [mode])

  useInput((input, key) => {
    if (key.tab) {
      cycleMode()
      return
    }

    if (key.ctrl && input === 'c') {
      exit()
      return
    }

    if (phase.name === 'input' && !query) {
      const num = parseInt(input, 10)
      if (!isNaN(num) && num >= 1 && num <= history.length) {
        const item = history[num - 1]!
        const r: MediaResult = {
          id: item.id,
          title: item.title,
          name: item.title,
          media_type: item.media_type,
          release_date: item.year,
        }
        void handleWatch(r, [r], item.title)
        return
      }
    }

    if (phase.name === 'error') {
      if (key.escape || key.return) setPhase({name: 'input'})
      return
    }

    if (phase.name === 'results') {
      if (key.upArrow) {
        setSelectedIndex(i => Math.max(0, i - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex(i => Math.min(phase.results.length - 1, i + 1))
        return
      }
      if (key.pageUp) {
        setSelectedIndex(i => Math.max(0, i - maxVisible))
        return
      }
      if (key.pageDown) {
        setSelectedIndex(i => Math.min(phase.results.length - 1, i + maxVisible))
        return
      }
      if (key.home) {
        setSelectedIndex(0)
        return
      }
      if (key.end) {
        setSelectedIndex(phase.results.length - 1)
        return
      }
      if (key.escape) {
        setPhase({name: 'input'})
        return
      }
      if (key.return) {
        const r = phase.results[selectedIndex]
        if (r) void handleWatch(r, phase.results, phase.query)
        return
      }
    }

    if (phase.name === 'empty') {
      if (key.escape || key.return) setPhase({name: 'input'})
      return
    }

    if (phase.name === 'watching') return
  })

  const handleSubmit = (value: string) => {
    void handleSearch(value, mode)
  }

  const hints: Array<[string, string]> = (() => {
    switch (phase.name) {
      case 'input':
        return [['tab', 'mode'], ['enter', 'search'], ['^c', 'quit']]
      case 'searching':
        return [['esc', 'cancel'], ['^c', 'quit']]
      case 'results':
        return [['tab', 'mode'], ['up/down', 'choose'], ['pg', 'scroll'], ['enter', 'watch'], ['esc', 'back'], ['^c', 'quit']]
      case 'empty':
        return [['tab', 'mode'], ['enter', 'search again'], ['esc', 'back'], ['^c', 'quit']]
      case 'watching':
        return [['esc', 'back'], ['^c', 'quit']]
      case 'error':
        return [['enter', 'try again'], ['^c', 'quit']]
    }
  })()

  const ModeTabs = () => (
    <Box flexDirection="row" alignItems="center" marginBottom={1}>
      <Text
        color={mode === 'movies' ? theme.bg : theme.primary}
        backgroundColor={mode === 'movies' ? theme.primary : undefined}
        bold={mode === 'movies'}
      >
        {mode === 'movies' ? ' [ Movies ] ' : '   Movies   '}
      </Text>
      <Text color={theme.gray} dimColor={theme.dimSecondary}> │ </Text>
      <Text
        color={mode === 'series' ? theme.bg : theme.primary}
        backgroundColor={mode === 'series' ? theme.primary : undefined}
        bold={mode === 'series'}
      >
        {mode === 'series' ? ' [ Series ] ' : '   Series   '}
      </Text>
      <Text color={theme.gray} dimColor={theme.dimSecondary}> │ </Text>
      <Text
        color={mode === 'anime' ? theme.bg : theme.primary}
        backgroundColor={mode === 'anime' ? theme.primary : undefined}
        bold={mode === 'anime'}
      >
        {mode === 'anime' ? ' [ Anime ] ' : '   Anime   '}
      </Text>
      <Text color={theme.gray} dimColor={theme.dimSecondary}>   [Tab to switch]</Text>
    </Box>
  )

  return (
    <FullScreen>
      <Logo />
      <Gap />
      <Text color={theme.primary}>{TAGLINE}</Text>
      <Text color={theme.gray} dimColor={theme.dimSecondary}>movies | series | anime</Text>
      <Gap />

      {phase.name === 'input' && (
        <Box flexDirection="column" alignItems="center">
          <ModeTabs />
          <FramedInput
            title={
              mode === 'movies'
                ? 'Search Movies'
                : mode === 'series'
                ? 'Search Series'
                : 'Search Anime'
            }
            width={boxWidth}
          >
            <TextInput
              value={query}
              onChange={setQuery}
              onSubmit={handleSubmit}
              placeholder={
                mode === 'movies'
                  ? 'Inception, Dune, Oppenheimer...'
                  : mode === 'series'
                  ? 'Breaking Bad, Game of Thrones, Dark...'
                  : 'Attack on Titan, Jujutsu Kaisen, One Piece...'
              }
              width={boxWidth - 6}
            />
          </FramedInput>
          {phase.warning ? (
            <Text color={theme.gray} dimColor={theme.dimSecondary}>x {phase.warning}</Text>
          ) : (
            <Text color={theme.gray} dimColor={theme.dimSecondary}>[enter] search | [tab] mode</Text>
          )}

          {history.length > 0 && !query && (
            <Box flexDirection="column" marginTop={1} alignItems="center">
              <Gap />
              <Text color={theme.gray} dimColor={theme.dimSecondary}>
                ── Continue Watching ──────────────────────────
              </Text>
              {history.slice(0, 3).map((item, idx) => (
                <Text key={item.id} color={theme.primary}>
                  <Text color={theme.gray} dimColor={theme.dimSecondary}>[{idx + 1}] </Text>
                  {truncate(item.title, 32)}
                  <Text color={theme.gray} dimColor={theme.dimSecondary}> ({item.year || item.media_type})</Text>
                </Text>
              ))}
              <Text color={theme.gray} dimColor={theme.dimSecondary}>
                press 1-{Math.min(3, history.length)} to resume
              </Text>
            </Box>
          )}
        </Box>
      )}

      {phase.name === 'searching' && (
        <Box flexDirection="column" alignItems="center">
          <ModeTabs />
          <FramedInput title={mode === 'movies' ? 'Search Movies' : mode === 'series' ? 'Search Series' : 'Search Anime'} width={boxWidth} buttonDim>
            <Text color={theme.gray} dimColor={theme.dimSecondary}>
              {query.length > boxWidth - 8 ? `${query.slice(0, boxWidth - 9)}...` : query}
            </Text>
          </FramedInput>
          <Gap />
          <Text color={theme.gray} dimColor={theme.dimSecondary}>
            <Spinner type="dots" /> searching {mode}...
          </Text>
        </Box>
      )}

      {phase.name === 'results' && (
        <Box flexDirection="column" width={contentWidth}>
          <Box justifyContent="center" marginBottom={1}>
            <ModeTabs />
          </Box>
          <Box width={contentWidth} flexDirection={useDualColumn ? 'row' : 'column'}>
            {useDualColumn && (
              <Box flexDirection="column" width={infoWidth} paddingRight={3} paddingTop={1}>
                {phase.results[selectedIndex] && (() => {
                  const r = phase.results[selectedIndex]!
                  return (
                    <>
                      {wrapText(mediaTitle(r), Math.max(10, infoWidth - 4)).map((line, i) => (
                        <Text key={i} bold color={theme.primary}>{line}</Text>
                      ))}
                      <Gap />
                      <Text color={theme.gray} dimColor={theme.dimSecondary}>
                        {'| ' + mediaType(r, mode)}{r.vote_average ? ` | ${r.vote_average.toFixed(1)}` : ''}{r.release_date || r.first_air_date ? ` | ${(r.release_date || r.first_air_date)!.slice(0, 4)}` : ''}
                      </Text>
                      {r.overview && (
                        <>
                          <Gap />
                          {wrapText(truncate(r.overview, 200), Math.max(10, infoWidth - 4)).slice(0, 5).map((line, i) => (
                            <Text key={i} color={theme.gray} dimColor={theme.dimSecondary}>{line}</Text>
                          ))}
                        </>
                      )}
                    </>
                  )
                })()}
              </Box>
            )}
            <Box flexDirection="column" width={useDualColumn ? panelWidth : contentWidth} paddingTop={1}>
              {!useDualColumn && phase.results[selectedIndex] && (() => {
                const r = phase.results[selectedIndex]!
                return (
                  <Box marginBottom={1} flexDirection="column">
                    {wrapText(mediaTitle(r), Math.max(10, contentWidth - 4)).map((line, i) => (
                      <Text key={i} bold color={theme.primary}>{line}</Text>
                    ))}
                    <Text color={theme.gray} dimColor={theme.dimSecondary}>
                      {'| ' + mediaType(r, mode)}{r.vote_average ? ` | ${r.vote_average.toFixed(1)}` : ''}{r.release_date || r.first_air_date ? ` | ${(r.release_date || r.first_air_date)!.slice(0, 4)}` : ''}
                    </Text>
                  </Box>
                )
              })()}
              <Box flexDirection="column" borderStyle="round" borderColor={theme.gray} borderDimColor={theme.dimSecondary} borderTop={false} borderBottom={false} borderLeft={false} borderRight={false} paddingX={1} paddingTop={0} paddingBottom={0}>
                <Text color={theme.gray} dimColor={theme.dimSecondary}>
                  {'╭─ Results ' + '─'.repeat(Math.max(0, (useDualColumn ? panelWidth : contentWidth) - 14)) + '╮'}
                </Text>
                {phase.results.slice(scrollOffset, scrollOffset + maxVisible).map((r, i) => {
                  const absoluteIndex = scrollOffset + i
                  const isSelected = absoluteIndex === selectedIndex
                  const rowWidth = (useDualColumn ? panelWidth : contentWidth) - 4
                  const title = truncate(mediaTitle(r), Math.max(10, rowWidth - 22))
                  const year = mediaYear(r)
                  const type = mediaType(r, mode)
                  const indicator = isSelected ? '>' : ' '
                  const pad = Math.max(0, rowWidth - title.length - year.length - type.length - 6)
                  return (
                    <Text key={r.id} color={isSelected ? theme.primary : theme.gray} dimColor={!isSelected && theme.dimSecondary} bold={isSelected}>
                      {indicator} {title}{' '.repeat(pad)}{year} {type}
                    </Text>
                  )
                })}
                {phase.results.length > maxVisible && (
                  <Text color={theme.gray} dimColor={theme.dimSecondary}>
                    {scrollOffset > 0 ? '  ^ more above' : ''}
                    {scrollOffset + maxVisible < phase.results.length ? '  v more below' : ''}
                  </Text>
                )}
                <Text color={theme.gray} dimColor={theme.dimSecondary}>
                  {'╰' + '─'.repeat(Math.max(0, (useDualColumn ? panelWidth : contentWidth) - 4)) + '╯'}
                </Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {phase.name === 'empty' && (
        <Box flexDirection="column" alignItems="center">
          <Text color={theme.gray} dimColor={theme.dimSecondary}>
            x no results for <Text color={theme.primary}>"{truncate(phase.query, 40)}"</Text>
          </Text>
          <Gap />
          <Text color={theme.gray} dimColor={theme.dimSecondary}>check the spelling or try another title.</Text>
        </Box>
      )}

      {phase.name === 'watching' && (
        <Box flexDirection="column" alignItems="center">
          <Text color={theme.primary}>
            <Spinner type="dots" />
          </Text>
          <Text color={theme.gray} dimColor={theme.dimSecondary}> opening {truncate(phase.title, 30)} in browser...</Text>
        </Box>
      )}

      {phase.name === 'error' && (
        <Box flexDirection="column" alignItems="center">
          <Text bold color={theme.primary}>x {phase.message}</Text>
        </Box>
      )}

      <Gap lines={2} />
      <Shortcuts items={hints} />
    </FullScreen>
  )
}
