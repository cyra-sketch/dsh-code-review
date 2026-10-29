import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ObjectJsonSchema, PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { GateEpisodeStore } from './gate-episode.js'
import type { GateEpisode, GateFinding } from './gate-episode.js'
import { JuryRunner } from './jury.js'
import type { JuryConfig } from './types.js'

const execFileAsync = promisify(execFile)

const acceptanceSchema: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['checks', 'requirements'],
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status', 'reason'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['fixed', 'open'] },
          reason: { type: 'string' },
        },
      },
    },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status', 'reason'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['met', 'unmet', 'unknown'] },
          reason: { type: 'string' },
        },
      },
    },
  },
}

interface AcceptanceCheck {
  id: string
  status: 'fixed' | 'open'
  reason: string
}

interface AcceptanceRequirement {
  id: string
  status: 'met' | 'unmet' | 'unknown'
  reason: string
}

interface AcceptanceOutput {
  checks: AcceptanceCheck[]
  requirements: AcceptanceRequirement[]
}

async function git(args: string[], signal: AbortSignal, cwd = process.cwd()): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, signal, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return stdout.trim()
}

async function gateBase(signal: AbortSignal, cwd = process.cwd()): Promise<{ base?: string; baseSha: string; root: string }> {
  const root = await git(['rev-parse', '--show-toplevel'], signal, cwd)
  try {
    const base = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], signal, cwd)
    const baseSha = await git(['rev-parse', base], signal, cwd)
    return { base, baseSha, root }
  } catch {
    const baseSha = await git(['rev-parse', 'HEAD'], signal, cwd)
    return { baseSha, root }
  }
}

async function isAncestor(ancestor: string, head: string, signal: AbortSignal, cwd = process.cwd()): Promise<boolean> {
  try {
    await git(['merge-base', '--is-ancestor', ancestor, head], signal, cwd)
    return true
  } catch {
    return false
  }
}

function commandText(arguments_: unknown): string | undefined {
  if (!arguments_ || typeof arguments_ !== 'object') return undefined
  const command = (arguments_ as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}

function commandSegments(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let quote = ''
  let escaped = false
  const push = () => {
    if (current.trim()) segments.push(current)
    current = ''
  }
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? ''
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      current += char
      escaped = true
      continue
    }
    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '\n' || char === '\r' || char === ';' || char === '|' || char === '&') {
      push()
      if ((char === '|' || char === '&') && command[index + 1] === char) index += 1
      continue
    }
    current += char
  }
  push()
  return segments
}

function gitSubcommand(segment: string): string | undefined {
  return /^\s*(?:\w+=\S+\s+)*git(?:\s+(?:-C\s+\S+|-c\s+\S+|--git-dir(?:=\S+|\s+\S+)|--work-tree(?:=\S+|\s+\S+)))*\s+([a-z-]+)(?:\s|$)/.exec(segment)?.[1]
}

export function gitPushCommand(arguments_: unknown): boolean {
  const command = commandText(arguments_)
  return command !== undefined && commandSegments(command).some(segment => gitSubcommand(segment) === 'push')
}

export function gitPushChainHasHeadMutation(arguments_: unknown): boolean {
  const command = commandText(arguments_)
  if (command === undefined) return false
  const subcommands = commandSegments(command).map(gitSubcommand)
  const mutations = new Set(['amend', 'cherry-pick', 'checkout', 'commit', 'merge', 'pull', 'rebase', 'reset', 'revert', 'switch'])
  return subcommands.includes('push') && subcommands.some(subcommand => subcommand !== undefined && mutations.has(subcommand))
}

export function gitPushWorkingDirectory(arguments_: unknown): string {
  const command = commandText(arguments_)
  if (command === undefined) return process.cwd()
  const first = commandSegments(command)[0]
  const cd = first ? /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+?))\s*$/.exec(first) : undefined
  const target = cd?.[1] ?? cd?.[2] ?? cd?.[3]
  return target ? resolve(process.cwd(), target) : process.cwd()
}

function openFindings(episode: GateEpisode): GateFinding[] {
  return episode.findings.filter(finding => finding.status === 'open')
}

function unmetIntentClauses(episode: GateEpisode) {
  return (episode.intentClauses ?? []).filter(clause => clause.status === 'unmet')
}

function canAccept(episode: GateEpisode): boolean {
  return openFindings(episode).length === 0 && unmetIntentClauses(episode).length === 0
}

function feedback(episode: GateEpisode, mode: 'discovery' | 'verification', human: boolean): string {
  const open = openFindings(episode)
  const unmet = unmetIntentClauses(episode)
  return JSON.stringify({
    kind: human ? 'jury_gate_human_required' : 'jury_gate_blocked',
    episodeId: episode.episodeId,
    baseSha: episode.baseSha,
    round: episode.round,
    mode,
    remaining: open.length,
    intentRemaining: unmet.length,
    message: human ? '请人工裁决' : mode === 'discovery'
      ? '发现模式：请修复冻结 findings 与 unmet intent 条款后重试'
      : '验收模式：仍有未清零 findings 或 unmet intent 条款',
    acceptedSemantics: 'accepted requires zero open findings and zero unmet intent clauses; this is not a guarantee of all code correctness',
    findings: open.map(finding => ({
      id: finding.id,
      file: finding.file,
      line: finding.line,
      severity: finding.severity,
      title: finding.title,
      fix: finding.fix,
    })),
    intentClauses: (episode.intentClauses ?? []).map(clause => ({
      id: clause.id,
      text: clause.text,
      status: clause.status,
      reason: clause.reason,
    })),
  }, null, 2)
}

function isAcceptanceOutput(value: unknown): value is AcceptanceOutput {
  return !!value && typeof value === 'object' && Array.isArray((value as { checks?: unknown }).checks)
    && (value as { checks: AcceptanceCheck[] }).checks.every(check => typeof check.id === 'string'
      && (check.status === 'fixed' || check.status === 'open') && typeof check.reason === 'string')
    && Array.isArray((value as { requirements?: unknown }).requirements)
    && (value as { requirements: AcceptanceRequirement[] }).requirements.every(requirement => typeof requirement.id === 'string'
      && (requirement.status === 'met' || requirement.status === 'unmet' || requirement.status === 'unknown')
      && typeof requirement.reason === 'string')
}

async function acceptDiff(
  ctx: Context,
  config: JuryConfig,
  parent: Agent,
  episode: GateEpisode,
  diff: string,
  signal: AbortSignal,
): Promise<AcceptanceOutput> {
  const frozen = episode.findings.map(({ id, file, line, title, fix }) => ({ id, file, line, title, fix }))
  const clauses = (episode.intentClauses ?? []).map(({ id, text }) => ({ id, text }))
  const prompt = `You are a lightweight acceptance agent, not a general reviewer. Perform two independent checks. First compare the new diff with frozen finding set F. For every finding id, decide fixed when the new diff resolves that exact issue and open otherwise. A finding stays fixed when the diff does not touch it or fixes it with semantically equivalent code. Only mark open when the exact defect remains or is explicitly reintroduced. Second, assess every intent clause independently against the current diff, even when it is not represented in F. Return exactly one met|unmet|unknown assessment and short reason for every clause: met only for demonstrated compliance, unmet for a demonstrated violation or omission, and unknown when evidence is insufficient. Do not assume a clause is met merely because all findings are fixed. Return checks and requirements arrays, do not add findings, do not use tools, and do not return prose outside the structured result.\nFrozen F:\n${JSON.stringify(frozen, null, 2)}\nIntent clauses:\n${JSON.stringify(clauses, null, 2)}\nNew diff:\n${diff}`
  const activation = await ctx.subagents.startActivation({
    provider: 'spawn',
    label: `jury-acceptance-${episode.round + 1}`,
    request: {
      prompt: [{ type: 'text', text: prompt }],
      parent,
      outputSchema: acceptanceSchema,
      agentOptions: { maxTokens: config.agentMaxTokens },
      maxDepth: 1,
    },
    signal,
    delivery: 'caller',
  })
  const result = await activation.result
  if (result.stopReason !== 'completed' || !isAcceptanceOutput(result.structured)) {
    throw new Error(`acceptance failed: ${result.stopReason}`)
  }
  const known = new Set(episode.findings.map(finding => finding.id))
  const knownClauses = new Set((episode.intentClauses ?? []).map(clause => clause.id))
  return {
    checks: result.structured.checks.filter(check => known.has(check.id)),
    requirements: result.structured.requirements.filter(requirement => knownClauses.has(requirement.id)),
  }
}

export function registerGate(ctx: Context, config: JuryConfig, runner: JuryRunner): void {
  if (config.gateMode === 'off') return
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next: () => Promise<PreToolDecision>) => {
    if ((exec.name !== 'bash' && exec.name !== 'pwsh') || !gitPushCommand(exec.arguments) || !exec.agent) return next()
    const parent = exec.agent
    const settle = (text: string, code: string): PreToolDecision | Promise<PreToolDecision> => {
      if (config.gateMode === 'report') {
        parent.inject(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'tool', callId: exec.callId } }))
        return next()
      }
      return { kind: 'deny', reason: text, info: { name: 'JuryGate', code } }
    }
    if (gitPushChainHasHeadMutation(exec.arguments)) {
      return settle('请分步执行：先提交，再单独 push；同一命令中的 HEAD 变更无法被 pre-push gate 验收', 'HEAD_MUTATION_CHAIN')
    }
    const cwd = gitPushWorkingDirectory(exec.arguments)
    const { base, baseSha, root } = await gateBase(exec.signal, cwd)
    const store = new GateEpisodeStore(root)
    const headSha = await git(['rev-parse', 'HEAD'], exec.signal, cwd)
    let episode = await store.load(baseSha)
    if (!episode) {
      const latest = await store.loadLatest()
      if (latest?.status === 'accepted' && latest.headSha && latest.headSha !== headSha
        && await isAncestor(latest.headSha, headSha, exec.signal, cwd)) {
        episode = latest
      }
    }
    if (episode?.status === 'accepted' && episode.headSha === headSha) return next()
    if (episode?.status === 'accepted') episode.status = 'active'
    if (episode?.status === 'human') return settle(feedback(episode, 'verification', true), 'HUMAN_REVIEW_REQUIRED')

    if (!episode) {
      episode = { episodeId: randomUUID(), baseSha, headSha, round: 1, subagentCalls: 0, status: 'active', findings: [], intentClauses: [] }
      try {
        const result = await runner.run({ tier: config.gateTier ?? 'auto', gate: true, ...base ? { base } : {} }, { parent, signal: exec.signal, cwd })
        episode.subagentCalls = result.subagentCalls
        episode.intentClauses = result.intentClauses
        episode.findings = result.findings
          .filter(finding => !finding.pre_existing && finding.severity !== 'nit')
          .map(finding => ({
            id: finding.id,
            file: finding.file,
            line: finding.line,
            severity: finding.severity,
            title: finding.title,
            fix: finding.detail,
            status: 'open',
          }))
      } catch {
        episode.status = 'human'
        await store.save(episode)
        return settle(feedback(episode, 'discovery', true), 'REVIEW_FAILED')
      }
      if (canAccept(episode)) {
        episode.status = 'accepted'
        episode.headSha = headSha
        await store.save(episode)
        return next()
      }
      if (episode.round >= config.maxRounds || episode.subagentCalls >= config.maxSubagentsPerEpisode) {
        episode.status = 'human'
        await store.save(episode)
        return settle(feedback(episode, 'discovery', true), 'BUDGET_EXHAUSTED')
      }
      await store.save(episode)
      return settle(feedback(episode, 'discovery', false), 'IMPORTANT_FINDINGS')
    }

    if (episode.round >= config.maxRounds || episode.subagentCalls >= config.maxSubagentsPerEpisode) {
      episode.status = 'human'
      await store.save(episode)
      return settle(feedback(episode, 'verification', true), 'BUDGET_EXHAUSTED')
    }

    try {
      const diff = await git(['diff', base ? `${base}...HEAD` : 'HEAD'], exec.signal, cwd)
      const acceptance = await acceptDiff(ctx, config, parent, episode, diff, exec.signal)
      episode.round += 1
      episode.subagentCalls += 1
      const byId = new Map(acceptance.checks.map(check => [check.id, check]))
      for (const finding of episode.findings) {
        const check = byId.get(finding.id)
        finding.status = check?.status === 'fixed' ? 'fixed' : 'open'
      }
      const requirementsById = new Map(acceptance.requirements.map(requirement => [requirement.id, requirement]))
      for (const clause of episode.intentClauses ?? []) {
        const assessment = requirementsById.get(clause.id)
        clause.status = assessment?.status ?? 'unknown'
        clause.reason = assessment?.reason ?? 'acceptance agent did not assess this clause'
      }
      episode.headSha = headSha
    } catch {
      episode.round += 1
      episode.subagentCalls += 1
      episode.status = 'human'
      await store.save(episode)
      return settle(feedback(episode, 'verification', true), 'ACCEPTANCE_FAILED')
    }

    if (canAccept(episode)) {
      episode.status = 'accepted'
      episode.headSha = headSha
      await store.save(episode)
      return next()
    }
    if (episode.round >= config.maxRounds || episode.subagentCalls >= config.maxSubagentsPerEpisode) {
      episode.status = 'human'
      await store.save(episode)
      return settle(feedback(episode, 'verification', true), 'BUDGET_EXHAUSTED')
    }
    await store.save(episode)
    return settle(feedback(episode, 'verification', false), 'IMPORTANT_FINDINGS')
  })
}
