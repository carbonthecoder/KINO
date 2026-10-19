import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export type HistoryItem = {
  id: number
  title: string
  media_type: 'movie' | 'tv'
  season?: number
  episode?: number
  year?: string
  isAnime?: boolean
  timestamp: number
}

const HISTORY_FILE = path.join(os.homedir(), '.kino_history.json')

export function getHistory(): HistoryItem[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return []
    const content = fs.readFileSync(HISTORY_FILE, 'utf8')
    const list: HistoryItem[] = JSON.parse(content)
    return Array.isArray(list) ? list.slice(0, 5) : []
  } catch {
    return []
  }
}

export function saveHistory(item: Omit<HistoryItem, 'timestamp'>): void {
  try {
    const list = getHistory().filter(h => h.id !== item.id)
    list.unshift({...item, timestamp: Date.now()})
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list.slice(0, 10), null, 2), 'utf8')
  } catch {}
}
