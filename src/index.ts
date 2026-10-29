import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { JuryRunner } from './jury.js'
import { registerGate } from './gate.js'
import type { JuryConfig, JuryResult, ModelRoute, RequestedTier, RunOptions } from './types.js'

export const name = 'jury'
export const inject = ['tools', 'subagents']

const modelRoute = Schema.object({
  provider: Schema.string().min(1).required(),
  model: Schema.string().min(1).required(),
})

export interface Config extends JuryConfig {}

export const Config: Schema<Config> = Schema.object({
  finderModels: Schema.array(modelRoute).default([]),
  voterModel: modelRoute.default(undefined as unknown as ModelRoute),
  maxRounds: Schema.number().step(1).min(1).max(3).default(3),
  severityThreshold: Schema.union(['nit', 'minor', 'major', 'critical']).default('minor'),
  gateMode: Schema.union(['off', 'report', 'block']).default('off'),
  agentMaxTokens: Schema.number().step(1).min(4000).max(64000).default(24000),
  standardMaxTokens: Schema.number().step(1).min(4000).max(64000).default(32768),
  maxSubagentsPerEpisode: Schema.number().step(1).min(1).max(20).default(10),
  intent: Schema.string(),
  intentFile: Schema.string(),
  gateIntent: Schema.string(),
  gateTier: Schema.union(['single', 'quick', 'standard', 'deep']),
})

function usage(): string {
  return '用法：/jury [diff 文件路径] [single|quick|standard|deep|auto] [--base 分支] [--tier 档位]'
}

function isTier(value: unknown): value is RequestedTier {
  return value === 'single' || value === 'quick' || value === 'standard' || value === 'deep' || value === 'auto'
}

function parseOptions(rawInput: string): RunOptions {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean)
  let diffPath: string | undefined
  let base: string | undefined
  let tier: RequestedTier = 'auto'
  let explicitTier = false
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--base') {
      base = tokens[index + 1]
      if (!base) throw new Error(usage())
      index += 1
    } else if (token?.startsWith('--base=')) {
      base = token.slice('--base='.length)
    } else if (token === '--tier' || token?.startsWith('--tier=')) {
      const value = token === '--tier' ? tokens[index + 1] : token.slice('--tier='.length)
      if (!isTier(value) || explicitTier) throw new Error(usage())
      tier = value
      explicitTier = true
      if (token === '--tier') index += 1
    } else if (isTier(token)) {
      if (explicitTier) throw new Error(usage())
      tier = token
      explicitTier = true
    } else if (token && !token.startsWith('--') && diffPath === undefined) {
      diffPath = token
    } else {
      throw new Error(usage())
    }
  }
  return { ...diffPath ? { diffPath } : {}, ...base ? { base } : {}, tier }
}

export function apply(ctx: Context, config: Config): void {
  const runner = new JuryRunner(ctx, config)
  registerGate(ctx, config, runner)
  const run = (options: RunOptions, parent: Agent, signal: AbortSignal): Promise<JuryResult> => {
    if (!parent) throw new Error('jury requires a calling agent')
    return runner.run(options, { parent, signal, cwd: process.cwd() })
  }

  ctx.tools.register(defineTool({
    name: 'jury_run',
    description: 'Review a unified diff with a fresh-context reviewer or an explicit jury. Single uses 1 reviewer and no voter, quick 2 finders, standard 4, deep 4 plus a second voter; auto defaults to single.',
    parameters: {
      path: { type: 'string', description: 'Unified diff file path. Omit to review git diff HEAD.' },
      base: { type: 'string', description: 'Optional base branch; reviews base...HEAD when path is omitted.' },
      tier: { type: 'string', enum: ['single', 'quick', 'standard', 'deep', 'auto'], description: 'Review depth or deterministic risk gate; default auto and single for non-low risk.' },
      intent: { type: 'string', description: 'Optional requirements summary; finders and voters check implementation omissions and deviations.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          runId: { type: 'string', required: true },
          report: { type: 'string', required: true },
          findingCount: { type: 'integer', required: true },
          rejectedCount: { type: 'integer', required: true },
          ledgerPath: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('jury_run requires a calling agent')
      const result = await run({ ...args.path ? { diffPath: args.path } : {}, ...args.base ? { base: args.base } : {}, tier: args.tier ?? 'auto', ...args.intent ? { intent: args.intent } : {} }, exec.agent, exec.signal)
      return {
        runId: result.runId,
        report: result.report,
        findingCount: result.findingCount,
        rejectedCount: result.rejectedCount,
        ledgerPath: result.ledgerPath,
      }
    },
  }))

  ctx.get('commands')?.register({
    name: 'jury',
    description: 'Run the risk-gated review jury on a diff',
    input: { hint: '[diff 文件] [quick|standard|deep|auto] [--base 分支]' },
    async handler(invocation) {
      try {
        const result = await run(parseOptions(invocation.rawInput), invocation.agent, invocation.signal)
        return { kind: 'success', text: result.report }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
