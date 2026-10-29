import { createHash } from 'node:crypto'
import type { IntentClause } from './types.js'

const operational = /(?:^请|若\s*gate|gate\s*拦截|首次\s*push|重试|人工裁决|不得添加|不得接触|真实远端|本地\s*origin|原样返回|返回报告|不要修改|不得修改|不要编辑|不得编辑|\bjury_run\b|\bgit\s+(?:commit|push)\b|\bcommit\b|\bpush\b|\borigin\/main\b|\bbare\s+remote\b|\bdo not modify\b|\breturn\b[^.\n]*\breport\b)/i
const noRequirement = /(?:没有|无)(?:附加|额外)?[^。；\n]*需求|no\s+(?:additional|extra)\b[^.\n]*requirements?/i

function candidates(intent: string): string[] {
  return intent.split(/[\n。；;]+|(?<=[.!?])\s+/)
    .filter(sentence => !operational.test(sentence) && !noRequirement.test(sentence))
    .flatMap(sentence => sentence.split(/[，,](?=\s*(?:[^，,]{0,24}(?:必须|应当|需要|不得|不可|\bmust\b|\bshall\b|\bshould\b|\brequired\b)))/i))
    .flatMap(sentence => sentence.split('、'))
}

export function extractIntentClauses(intent?: string): IntentClause[] {
  if (!intent) return []
  const clauses = new Map<string, IntentClause>()
  for (const candidate of candidates(intent)) {
    const text = candidate
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^\s*本次(?:代码)?需求\s*[:：]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text || operational.test(text) || noRequirement.test(text)) continue
    const key = text.toLowerCase()
    if (clauses.has(key)) continue
    clauses.set(key, {
      id: createHash('sha256').update(key).digest('hex').slice(0, 16),
      text,
    })
  }
  return [...clauses.values()]
}

export function mergeIntentClauseAssessments(
  clauses: IntentClause[],
  outputs: { requirements: { id: string; status: 'met' | 'unmet' | 'unknown'; reason: string }[] }[],
): (IntentClause & { status: 'met' | 'unmet' | 'unknown'; reason: string })[] {
  return clauses.map(clause => {
    const assessments = outputs.flatMap(output => output.requirements.filter(requirement => requirement.id === clause.id))
    const unmet = assessments.find(assessment => assessment.status === 'unmet')
    if (unmet) return { ...clause, status: unmet.status, reason: unmet.reason }
    if (assessments.length === outputs.length && assessments.every(assessment => assessment.status === 'met')) {
      return { ...clause, status: 'met', reason: assessments[0]?.reason ?? '' }
    }
    return {
      ...clause,
      status: 'unknown',
      reason: assessments.find(assessment => assessment.status === 'unknown')?.reason ?? 'reviewer did not assess this clause',
    }
  })
}
