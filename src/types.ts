import type { Agent } from '@deepseek-ai/dsh-agent'

export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export type Tier = 'single' | 'quick' | 'standard' | 'deep'
export type RequestedTier = Tier | 'auto'
export type EffectiveTier = Tier | 'none'
export type Severity = 'critical' | 'major' | 'minor' | 'nit'
export type Verdict = 'valid' | 'invalid' | 'uncertain'

export interface ModelRoute {
  provider: string
  model: string
}

export interface JuryConfig {
  finderModels: ModelRoute[]
  voterModel?: ModelRoute
  maxRounds: number
  severityThreshold: Severity
  gateMode: 'off' | 'report' | 'block'
  postAcceptReview: boolean
  agentMaxTokens: number
  standardMaxTokens: number
  maxSubagentsPerEpisode: number
  intent?: string
  intentFile?: string
  gateIntent?: string
  gateTier?: Tier
}

export interface RunOptions {
  diffPath?: string
  base?: string
  fromEmptyTree?: boolean
  tier: RequestedTier
  intent?: string
  gate?: boolean
}

export interface RiskSignal {
  id: string
  label: string
  score: number
}

export interface RiskAssessment {
  score: number
  level: 'low' | 'medium' | 'high'
  tier: EffectiveTier
  signals: string[]
}

export interface DiffPreprocess {
  diff: string
  originalLines: number
  processedLines: number
  originalFiles: number
  omittedHunks: number
}

export type IntentClauseStatus = 'met' | 'unmet' | 'unknown'

export interface IntentClause {
  id: string
  text: string
}

export interface IntentClauseAssessment extends IntentClause {
  status: IntentClauseStatus
  reason: string
}

export type FindingCategory = 'correctness' | 'security' | 'design' | 'test-integrity' | 'intent'

export interface Finding {
  title: string
  detail: string
  file: string
  line: number
  line_quote: string
  symbol: string
  category: FindingCategory
  severity: Severity
  pre_existing: boolean
}

export interface FinderFinding extends Finding {
  persona: string
}

export interface GroupedFinding extends Finding {
  id: string
  finders: string[]
}

export interface Vote {
  id: string
  verdict: Verdict
  reason: string
  evidence: {
    file: string
    line: number
  }
}

export interface FinalFinding extends GroupedFinding {
  consensus: 'consensus' | 'disputed' | 'solo'
  vote: Vote
}

export interface JuryResult {
  runId: string
  report: string
  findingCount: number
  rejectedCount: number
  ledgerPath: string
  findings: FinalFinding[]
  intentClauses: IntentClauseAssessment[]
  subagentCalls: number
  risk: RiskAssessment
  effectiveTier: EffectiveTier
}

export interface RunContext {
  parent: Agent
  signal: AbortSignal
  cwd: string
}
