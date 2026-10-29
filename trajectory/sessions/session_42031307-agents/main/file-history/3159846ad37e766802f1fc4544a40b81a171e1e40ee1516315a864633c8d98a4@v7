import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-session-query'
import type { JsonSchemaNode, ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { finderPrompt, personas, singlePrompt, voterPrompt } from './prompts.js'
import { preprocessDiff } from './diff.js'
import { extractIntentClauses, mergeIntentClauseAssessments } from './intent-clauses.js'
import { assessRisk } from './risk.js'
import { EMPTY_TREE_SHA } from './types.js'
import type {
  DiffPreprocess,
  EffectiveTier,
  FinalFinding,
  Finding,
  FinderFinding,
  GroupedFinding,
  IntentClauseAssessment,
  JuryConfig,
  JuryResult,
  ModelRoute,
  RequestedTier,
  RiskAssessment,
  RunContext,
  RunOptions,
  Severity,
  Tier,
  Vote,
} from './types.js'

const severityRank: Record<Severity, number> = { nit: 0, minor: 1, major: 2, critical: 3 }

const findingSchema: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'detail', 'file', 'line', 'line_quote', 'symbol', 'category', 'severity', 'pre_existing'],
  properties: {
    title: { type: 'string' },
    detail: { type: 'string' },
    file: { type: 'string' },
    line: { type: 'integer' },
    line_quote: { type: 'string' },
    symbol: { type: 'string' },
    category: { type: 'string', enum: ['correctness', 'security', 'design', 'test-integrity', 'intent'] },
    severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
    pre_existing: { type: 'boolean' },
  },
}

const requirementAssessmentSchema: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status', 'reason'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['met', 'unmet', 'unknown'] },
    reason: { type: 'string' },
  },
}

const finderOutputSchema: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['findings', 'requirements'],
  properties: {
    findings: { type: 'array', items: findingSchema },
    requirements: { type: 'array', items: requirementAssessmentSchema },
  },
}

const voterOutputSchema: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['votes'],
  properties: {
    votes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'reason', 'evidence'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['valid', 'invalid', 'uncertain'] },
          reason: { type: 'string' },
          evidence: {
            type: 'object',
            additionalProperties: false,
            required: ['file', 'line'],
            properties: {
              file: { type: 'string' },
              line: { type: 'integer' },
            },
          },
        },
      },
    },
  },
}

function git(cwd: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, signal, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message))
      else resolvePromise(stdout)
    })
  })
}

async function optionalReview(root: string): Promise<string> {
  try {
    return await readFile(join(root, 'REVIEW.md'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

function normalize(value: string): string {
  return value.trim().replace(/^[ab]\//, '').replace(/\s+/g, ' ').toLowerCase()
}

function normalizeSymbol(value: string): string {
  const leaf = value.trim().split('.').filter(Boolean).at(-1) ?? value.trim()
  return leaf.replace(/\(\)$/, '').replace(/\s+/g, '').toLowerCase()
}

function evidenceScore(finding: Finding): number {
  return finding.line_quote.length + finding.detail.length + (finding.line > 0 ? 20 : 0)
}

function groupFindings(findings: FinderFinding[]): GroupedFinding[] {
  const groups = new Map<string, GroupedFinding>()
  for (const finding of findings) {
    const key = `${normalize(finding.file)}\0${normalizeSymbol(finding.symbol)}\0${finding.category}`
    const { persona: _persona, ...base } = finding
    const existing = groups.get(key)
    if (existing) {
      if (!existing.finders.includes(finding.persona)) existing.finders.push(finding.persona)
      if (evidenceScore(finding) > evidenceScore(existing)) {
        groups.set(key, { ...base, id: existing.id, finders: existing.finders })
      }
      continue
    }
    groups.set(key, {
      ...base,
      id: createHash('sha256').update(key).digest('hex').slice(0, 16),
      finders: [finding.persona],
    })
  }
  return [...groups.values()]
}

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Finding>
  const category = item.category === 'correctness' || item.category === 'security' || item.category === 'design'
    || item.category === 'test-integrity' || item.category === 'intent'
  return typeof item.title === 'string' && typeof item.detail === 'string'
    && typeof item.file === 'string' && typeof item.line === 'number' && Number.isInteger(item.line)
    && typeof item.line_quote === 'string' && typeof item.symbol === 'string' && category
    && typeof item.pre_existing === 'boolean'
    && typeof item.severity === 'string' && item.severity in severityRank
}

function isVote(value: unknown): value is Vote {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Vote>
  return typeof item.id === 'string' && typeof item.reason === 'string'
    && (item.verdict === 'valid' || item.verdict === 'invalid' || item.verdict === 'uncertain')
    && typeof item.evidence?.file === 'string' && typeof item.evidence.line === 'number'
}

function textOutput(blocks: readonly ContentBlock[]): string {
  return blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
}

function structuredValue<T>(result: SubagentResult, validate: (value: unknown) => value is T): T {
  if (result.stopReason !== 'completed') {
    throw new Error(`subagent ended with ${result.stopReason}${result.diagnostic ? `: ${result.diagnostic}` : ''}`)
  }
  if (validate(result.structured)) return result.structured
  const text = textOutput(result.output).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  try {
    const parsed: unknown = JSON.parse(text)
    if (validate(parsed)) return parsed
  } catch {
    // The structured-output error below is more actionable than a JSON parse error.
  }
  throw new Error('subagent did not return the required structured result')
}

interface RequirementOutput {
  id: string
  status: 'met' | 'unmet' | 'unknown'
  reason: string
}

interface FinderOutput {
  findings: Finding[]
  requirements: RequirementOutput[]
}

function isRequirementOutput(value: unknown): value is RequirementOutput {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RequirementOutput>
  return typeof item.id === 'string' && typeof item.reason === 'string'
    && (item.status === 'met' || item.status === 'unmet' || item.status === 'unknown')
}

function isFinderOutput(value: unknown): value is FinderOutput {
  return !!value && typeof value === 'object'
    && Array.isArray((value as { findings?: unknown }).findings)
    && (value as { findings: unknown[] }).findings.every(isFinding)
    && Array.isArray((value as { requirements?: unknown }).requirements)
    && (value as { requirements: unknown[] }).requirements.every(isRequirementOutput)
}

function isVoterOutput(value: unknown): value is { votes: Vote[] } {
  return !!value && typeof value === 'object'
    && Array.isArray((value as { votes?: unknown }).votes)
    && (value as { votes: unknown[] }).votes.every(isVote)
}

function labelOf(finding: FinalFinding): 'Important' | 'Nit' | 'Pre-existing' {
  if (finding.pre_existing) return 'Pre-existing'
  return finding.severity === 'nit' ? 'Nit' : 'Important'
}

function renderReport(
  findings: FinalFinding[],
  rejectedCount: number,
  risk: RiskAssessment,
  effectiveTier: EffectiveTier,
  requestedTier: RequestedTier,
  preprocess: DiffPreprocess,
  intentClauses: IntentClauseAssessment[],
): string {
  const counts = {
    consensus: findings.filter(item => item.consensus === 'consensus').length,
    disputed: findings.filter(item => item.consensus === 'disputed').length,
    solo: findings.filter(item => item.consensus === 'solo').length,
    Important: findings.filter(item => labelOf(item) === 'Important').length,
    Nit: findings.filter(item => labelOf(item) === 'Nit').length,
    'Pre-existing': findings.filter(item => labelOf(item) === 'Pre-existing').length,
  }
  const reason = requestedTier === 'auto' ? '自动门控' : '用户显式覆盖'
  const signals = risk.signals.length ? risk.signals.join('、') : '无风险信号'
  const lines = [
    `评审结果：${findings.length} 项（consensus ${counts.consensus} / disputed ${counts.disputed} / solo ${counts.solo}；Important ${counts.Important} / Nit ${counts.Nit} / Pre-existing ${counts['Pre-existing']}；已过滤 ${rejectedCount}）`,
    `评审档位：${effectiveTier}（${reason}；风险评分 ${risk.score}；命中信号：${signals}）`,
  ]
  if (effectiveTier === 'quick') lines.push('quick 定位：低风险轻审，不作为高危主力')
  lines.push('报告边界：findings 与 intent 条款核对不等于对代码全部正确性的保证')
  if (intentClauses.length) {
    const requirementCounts = {
      met: intentClauses.filter(clause => clause.status === 'met').length,
      unmet: intentClauses.filter(clause => clause.status === 'unmet').length,
      unknown: intentClauses.filter(clause => clause.status === 'unknown').length,
    }
    lines.push(`intent 条款：met ${requirementCounts.met} / unmet ${requirementCounts.unmet} / unknown ${requirementCounts.unknown}`)
    intentClauses.forEach(clause => lines.push(`- [${clause.status}] ${clause.text} — ${clause.reason}`))
  }
  if (preprocess.originalLines > 800) {
    lines.push(`diff 预处理：${preprocess.originalLines}→${preprocess.processedLines} 行，过滤 ${preprocess.omittedHunks} 个无关 hunk`)
  }
  if (!findings.length) {
    lines.push(effectiveTier === 'none' ? '未启动评审（低风险）' : '无需修改')
    return lines.join('\n')
  }
  findings.forEach((finding, index) => {
    lines.push(
      '',
      `${index + 1}. [${finding.consensus}] [${labelOf(finding)}] ${finding.title}`,
      `   证据：${finding.file}:${finding.line} \`${finding.line_quote}\``,
      `   ${finding.detail}`,
      `   发现者：${finding.finders.join(', ')}；voter：${finding.vote.verdict} — ${finding.vote.reason}`,
    )
  })
  return lines.join('\n')
}

function combinedVote(candidate: GroupedFinding, voteSets: Vote[][]): Vote {
  const votes = voteSets.flatMap(set => set.filter(vote => vote.id === candidate.id))
  if (!votes.length) {
    return {
      id: candidate.id,
      verdict: 'uncertain',
      reason: 'voter 未返回该 finding 的结论',
      evidence: { file: candidate.file, line: candidate.line },
    }
  }
  const verdict = votes.every(vote => vote.verdict === 'invalid') ? 'invalid'
    : votes.every(vote => vote.verdict === 'valid') ? 'valid' : 'uncertain'
  return {
    id: candidate.id,
    verdict,
    reason: votes.map((vote, index) => `voter${index + 1}: ${vote.reason}`).join('；'),
    evidence: votes[0]?.evidence ?? { file: candidate.file, line: candidate.line },
  }
}

export class JuryRunner {
  private intentByAgent = new Map<string, string>()

  constructor(private ctx: Context, private config: JuryConfig) {}

  private async intentFor(root: string, parent: Agent, options: RunOptions): Promise<string | undefined> {
    if (options.intent !== undefined) {
      this.intentByAgent.set(parent.id, options.intent)
      return options.intent
    }
    if (options.gate && this.config.gateIntent !== undefined) return this.config.gateIntent
    const remembered = this.intentByAgent.get(parent.id)
    if (remembered !== undefined) return remembered
    if (this.config.intent !== undefined) return this.config.intent
    const sessionQuery = this.ctx.get('sessionQuery')
    if (sessionQuery) {
      try {
        const surface = await sessionQuery.readSurface(parent.id)
        const firstUser = surface.events.find(event => event.type === 'user/message')
        if (firstUser) {
          const text = firstUser.data.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n')
            .trim()
          if (text) return text
        }
      } catch {
        // Older profiles without a readable current surface fall back to explicit intent configuration.
      }
    }
    if (this.config.intentFile) return readFile(resolve(root, this.config.intentFile), 'utf8')
    return undefined
  }

  private async activate(
    parent: Agent,
    label: string,
    prompt: string,
    outputSchema: ObjectJsonSchema,
    route: ModelRoute | undefined,
    tier: Tier,
    signal: AbortSignal,
  ): Promise<SubagentResult> {
    const agentOptions = { ...route, maxTokens: tier === 'quick' ? this.config.agentMaxTokens : this.config.standardMaxTokens }
    const activation = await this.ctx.subagents.startActivation({
      provider: 'spawn',
      label,
      request: {
        prompt: [{ type: 'text', text: prompt }],
        parent,
        outputSchema,
        ...agentOptions ? { agentOptions } : {},
        maxDepth: 1,
      },
      signal,
      delivery: 'caller',
    })
    return activation.result
  }

  async run(options: RunOptions, runContext: RunContext): Promise<JuryResult> {
    const { signal, cwd, parent } = runContext
    signal.throwIfAborted()
    let root: string
    let diff: string
    if (options.diffPath) {
      const path = isAbsolute(options.diffPath) ? options.diffPath : resolve(cwd, options.diffPath)
      diff = await readFile(path, 'utf8')
      try {
        root = (await git(dirname(path), ['rev-parse', '--show-toplevel'], signal)).trim()
      } catch {
        root = dirname(path)
      }
    } else {
      root = (await git(cwd, ['rev-parse', '--show-toplevel'], signal)).trim()
      diff = await git(root, ['diff', options.fromEmptyTree ? `${EMPTY_TREE_SHA}..HEAD` : options.base ? `${options.base}...HEAD` : 'HEAD'], signal)
    }
    signal.throwIfAborted()
    const runId = randomUUID()
    const ledgerPath = join(root, '.dsh', 'jury', 'findings.jsonl')
    const risk = assessRisk(diff)
    const effectiveTier = options.tier === 'auto' ? risk.tier : options.tier
    const preprocess = preprocessDiff(diff)
    const intent = await this.intentFor(root, parent, options)
    const clauses = extractIntentClauses(intent)
    if (!diff.trim() || effectiveTier === 'none' || !preprocess.diff.trim()) {
      const intentClauses = clauses.map(clause => ({ ...clause, status: 'unknown' as const, reason: 'review not started' }))
      return {
        runId,
        report: renderReport([], 0, risk, effectiveTier, options.tier, preprocess, intentClauses),
        findingCount: 0,
        rejectedCount: 0,
        ledgerPath,
        findings: [],
        intentClauses,
        subagentCalls: 0,
        risk,
        effectiveTier,
      }
    }
    diff = preprocess.diff
    const review = await optionalReview(root)
    const activePersonas = effectiveTier === 'single' ? personas.slice(0, 1) : effectiveTier === 'quick' ? personas.slice(0, 2) : personas
    const finderOutputs = await Promise.all(activePersonas.map(async (persona, index) => {
      const route = this.config.finderModels.length
        ? this.config.finderModels[index % this.config.finderModels.length]
        : undefined
      const prompt = effectiveTier === 'single'
        ? singlePrompt(review, diff, intent, clauses)
        : finderPrompt(persona.id, persona.focus, effectiveTier, review, diff, intent, clauses)
      const result = await this.activate(
        parent,
        effectiveTier === 'single' ? 'jury-single' : `jury-${persona.id}`,
        prompt,
        finderOutputSchema,
        route,
        effectiveTier,
        signal,
      )
      return structuredValue(result, isFinderOutput)
    }))
    const finderResults = finderOutputs.map((output, index) => output.findings.map(finding => ({
      ...finding,
      persona: activePersonas[index]?.id ?? 'unknown',
    })))
    const intentClauses = mergeIntentClauseAssessments(clauses, finderOutputs)
    const candidates = groupFindings(finderResults.flat())
      .filter(finding => severityRank[finding.severity] >= severityRank[this.config.severityThreshold])
    const voteSets: Vote[][] = []
    if (candidates.length && effectiveTier !== 'single') {
      const voterCount = effectiveTier === 'deep' ? 2 : 1
      const batches = Array.from({ length: Math.ceil(candidates.length / 8) }, (_, index) => candidates.slice(index * 8, index * 8 + 8))
      voteSets.push(...await Promise.all(batches.flatMap((batch, batchIndex) => Array.from({ length: voterCount }, async (_, voterIndex) => {
        const result = await this.activate(
          parent,
          `jury-voter-${batchIndex + 1}-${voterIndex + 1}`,
          voterPrompt(batch, review, diff, effectiveTier, intent),
          voterOutputSchema,
          this.config.voterModel,
          effectiveTier,
          signal,
        )
        return structuredValue(result, isVoterOutput).votes
      }))))
    }
    const findings: FinalFinding[] = []
    let rejectedCount = 0
    for (const candidate of candidates) {
      const vote = combinedVote(candidate, voteSets)
      if (vote.verdict === 'invalid') {
        rejectedCount += 1
        continue
      }
      findings.push({
        ...candidate,
        consensus: vote.verdict === 'uncertain' ? 'disputed' : candidate.finders.length > 1 ? 'consensus' : 'solo',
        vote,
      })
    }
    if (findings.length) {
      await mkdir(dirname(ledgerPath), { recursive: true })
      const timestamp = new Date().toISOString()
      const lines = findings.map(finding => JSON.stringify({
        ...finding,
        id: finding.id,
        status: 'open',
        timestamp,
        runId,
        riskScore: risk.score,
        riskLevel: risk.level,
        effectiveTier,
      }))
      await appendFile(ledgerPath, `${lines.join('\n')}\n`, 'utf8')
    }
    return {
      runId,
      report: renderReport(findings, rejectedCount, risk, effectiveTier, options.tier, preprocess, intentClauses),
      findingCount: findings.length,
      rejectedCount,
      ledgerPath,
      findings,
      intentClauses,
      subagentCalls: activePersonas.length + voteSets.length,
      risk,
      effectiveTier,
    }
  }
}
