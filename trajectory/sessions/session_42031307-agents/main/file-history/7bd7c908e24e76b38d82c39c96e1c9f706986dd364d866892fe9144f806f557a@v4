import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IntentClauseAssessment, Severity } from './types.js'

export interface GateFinding {
  id: string
  file: string
  line: number
  severity: Severity
  title: string
  fix: string
  status: 'open' | 'fixed' | 'dismissed'
}

export interface GateEpisode {
  episodeId: string
  baseSha: string
  headSha?: string
  round: number
  subagentCalls: number
  status: 'active' | 'accepted' | 'human'
  findings: GateFinding[]
  intentClauses?: IntentClauseAssessment[]
}

interface Snapshot extends GateEpisode {
  type: 'gate-episode'
  timestamp: string
}

export class GateEpisodeStore {
  readonly path: string

  constructor(root: string) {
    this.path = join(root, '.dsh', 'jury', 'gate-episodes.jsonl')
  }

  private async snapshots(): Promise<Snapshot[]> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Snapshot)
  }

  async load(baseSha: string): Promise<GateEpisode | undefined> {
    const snapshots = await this.snapshots()
    return snapshots.filter(snapshot => snapshot.type === 'gate-episode' && snapshot.baseSha === baseSha).at(-1)
  }

  async loadLatest(): Promise<GateEpisode | undefined> {
    const snapshots = await this.snapshots()
    return snapshots.at(-1)
  }

  async save(episode: GateEpisode): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const snapshot: Snapshot = { ...episode, type: 'gate-episode', timestamp: new Date().toISOString() }
    await appendFile(this.path, `${JSON.stringify(snapshot)}\n`, 'utf8')
  }
}
