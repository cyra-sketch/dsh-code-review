import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractIntentClauses } from '../../lib/intent-clauses.js'
import { findingSemanticKey } from '../../lib/jury.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const acceptance = join(root, 'eval', 'acceptance')
const results = []

const semanticRecords = new Map()
function records(name) {
  if (!semanticRecords.has(name)) {
    const path = join(acceptance, name, 'work', '.dsh', 'jury', 'findings.jsonl')
    semanticRecords.set(name, existsSync(path)
      ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      : [])
  }
  return semanticRecords.get(name)
}

function roleFinding(episode, name, role) {
  const expected = role === 'sql'
    ? findingSemanticKey({ file: 'src/checkout.ts', symbol: 'CheckoutService.checkout', category: 'security', line: 13, title: 'SQL injection' })
    : findingSemanticKey({ file: 'src/checkout.ts', symbol: 'CheckoutService.checkout', category: 'correctness', line: 22, title: 'integer cents' })
  const ids = new Set(records(name).filter(finding => findingSemanticKey(finding) === expected).map(finding => finding.id))
  return episode?.findings.find(finding => ids.has(finding.id))
}

function sqlFinding(episode, name) {
  return roleFinding(episode, name, 'sql')
}

function centsFinding(episode, name) {
  return roleFinding(episode, name, 'cents')
}

function auditFailureFinding(episode, name) {
  const ids = new Set(records(name).filter(finding => finding.file === 'src/checkout.ts' && finding.line === 50
    && finding.category !== 'intent').map(finding => finding.id))
  return episode?.findings.find(finding => ids.has(finding.id))
}

function check(name, condition, evidence) {
  results.push({ name, pass: Boolean(condition), evidence })
}

function episodes(name) {
  return readFileSync(join(acceptance, name, 'work', '.dsh', 'jury', 'gate-episodes.jsonl'), 'utf8')
    .trim().split('\n').map(line => JSON.parse(line))
}

function git(name, args) {
  return execFileSync('git', ['-C', join(acceptance, name, 'work'), ...args], { encoding: 'utf8' }).trim()
}

function remote(name, args) {
  return execFileSync('git', [`--git-dir=${join(acceptance, name, 'work', 'origin.git')}`, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function remoteHasCommit(name, sha) {
  try {
    remote(name, ['cat-file', '-e', `${sha}^{commit}`])
    return true
  } catch {
    return false
  }
}

function sameFindingSet(snapshot, expected) {
  return snapshot.findings.length === expected.length
    && snapshot.findings.every((finding, index) => finding.id === expected[index].id)
}

const low = episodes('low')
const lowAccepted = low.find(episode => episode.status === 'accepted')
check('low-risk skips review with zero subagents', low.length === 1 && lowAccepted?.subagentCalls === 0 && lowAccepted.findings.length === 0, lowAccepted)
check('low-risk accepted HEAD reaches bare remote', lowAccepted && remote('low', ['rev-parse', 'refs/heads/main']) === lowAccepted.headSha, {
  local: git('low', ['rev-parse', 'HEAD']),
  remote: remote('low', ['rev-parse', 'refs/heads/main']),
})

const high = episodes('high')
const highDiscovery = high.find(episode => episode.round === 1)
const highAccepted = high.find(episode => episode.round === 2 && episode.status === 'accepted')
const highReverified = high.find(episode => episode.round === 3 && episode.status === 'accepted')
const highIds = highDiscovery.findings.map(finding => finding.id)
check('high-risk discovery uses one single reviewer', highDiscovery?.subagentCalls === 1, {
  round: highDiscovery?.round,
  subagentCalls: highDiscovery?.subagentCalls,
  findingIds: highIds,
})
check('high-risk frozen finding set never expands', high.every(episode => sameFindingSet(episode, highDiscovery.findings)), high.map(episode => ({
  round: episode.round,
  status: episode.status,
  findingIds: episode.findings.map(finding => finding.id),
})))
const highAcceptedSource = git('high', ['show', `${highAccepted.headSha}:src/checkout.ts`])
check('Math.floor is accepted as semantically equivalent fixed', /Math\.floor\(/.test(highAcceptedSource)
  && highAccepted.findings.every(finding => finding.status === 'fixed'), {
  headSha: highAccepted.headSha,
  statuses: Object.fromEntries(highAccepted.findings.map(finding => [finding.id, finding.status])),
})
check('new HEAD is reverified against the same frozen findings', highReverified
  && highReverified.headSha !== highAccepted.headSha
  && sameFindingSet(highReverified, highDiscovery.findings)
  && highReverified.findings.every(finding => finding.status === 'fixed')
  && remoteHasCommit('high', highReverified.headSha), {
  acceptedHead: highAccepted.headSha,
  reverifiedHead: highReverified?.headSha,
  remote: remote('high', ['rev-parse', 'refs/heads/main']),
})
const highLocalHead = git('high', ['rev-parse', 'HEAD'])
const highHumanIndex = high.findIndex(episode => episode.status === 'human')
const highAfterHuman = highHumanIndex >= 0 ? high.slice(highHumanIndex + 1) : []
const highApproved = high.at(-1)
check('human keeps push blocked until exact-HEAD approval', highHumanIndex > 0
  && highAfterHuman.some(episode => episode.status === 'human')
  && !highAfterHuman.some(episode => episode.status === 'accepted')
  && highApproved?.status === 'approved'
  && highApproved.headSha === highLocalHead
  && remote('high', ['rev-parse', 'refs/heads/main']) === highLocalHead, {
  afterHuman: highAfterHuman.map(episode => ({ round: episode.round, status: episode.status, subagentCalls: episode.subagentCalls })),
  localHead: highLocalHead,
  remote: remote('high', ['rev-parse', 'refs/heads/main']),
})

const reopen = episodes('reopen')
const reopenDiscovery = reopen.find(episode => episode.round === 1)
const reopenAccepted = reopen.find(episode => episode.round === 2 && episode.status === 'accepted')
const reopenLatest = reopen.at(-1)
const reopenSql = sqlFinding(reopenLatest, 'reopen')
const reopenSqlId = reopenSql?.id
check('reintroduced SQL defect transitions fixed to open', sqlFinding(reopenAccepted, 'reopen')?.status === 'fixed'
  && reopenSql?.status === 'open', {
  accepted: reopenAccepted.findings.map(finding => ({ id: finding.id, status: finding.status })),
  reopened: reopenLatest.findings.map(finding => ({ id: finding.id, status: finding.status })),
})
check('reopen preserves untouched fixed findings and frozen set', sameFindingSet(reopenLatest, reopenDiscovery.findings)
  && reopenLatest.findings.filter(finding => finding.id !== reopenSqlId).every(finding => finding.status === 'fixed'), {
  findingIds: reopenLatest.findings.map(finding => finding.id),
  untouched: reopenLatest.findings.filter(finding => finding.id !== reopenSqlId),
})
check('reopened HEAD is absent from bare remote', remote('reopen', ['rev-parse', 'refs/heads/main']) === reopenAccepted.headSha
  && !remoteHasCommit('reopen', reopenLatest.headSha), {
  acceptedRemote: remote('reopen', ['rev-parse', 'refs/heads/main']),
  rejectedHead: reopenLatest.headSha,
})

const human = episodes('human')
const humanOnly = human.length === 1 ? human[0] : undefined
const humanLogPath = existsSync(join(acceptance, '.results', 'human', 'run.jsonl'))
  ? join(acceptance, '.results', 'human', 'run.jsonl')
  : join(acceptance, 'human', 'run.jsonl')
const humanLog = readFileSync(humanLogPath, 'utf8')
check('maxRounds=1 deterministically escalates after discovery', humanOnly?.round === 1
  && humanOnly.status === 'human'
  && humanOnly.subagentCalls === 1
  && humanLog.includes('\\"kind\\": \\"jury_gate_human_required\\"'), {
  round: humanOnly?.round,
  status: humanOnly?.status,
  subagentCalls: humanOnly?.subagentCalls,
})
check('maxRounds=1 rejected commit is absent from bare remote', humanOnly
  && remote('human', ['rev-parse', 'refs/heads/main']) === humanOnly.baseSha
  && !remoteHasCommit('human', humanOnly.headSha), {
  baseSha: humanOnly?.baseSha,
  rejectedHead: humanOnly?.headSha,
  remote: remote('human', ['rev-parse', 'refs/heads/main']),
})
check('stable SQL and cents finding ids are used across fixtures', sqlFinding(highDiscovery, 'high')?.id === sqlFinding(reopenDiscovery, 'reopen')?.id
  && sqlFinding(reopenDiscovery, 'reopen')?.id === sqlFinding(humanOnly, 'human')?.id
  && centsFinding(highDiscovery, 'high')?.id === centsFinding(reopenDiscovery, 'reopen')?.id
  && centsFinding(reopenDiscovery, 'reopen')?.id === centsFinding(humanOnly, 'human')?.id, {
  high: highIds,
  reopen: reopenDiscovery.findings.map(finding => finding.id),
  human: humanOnly?.findings.map(finding => finding.id),
})

const extractedClauses = extractIntentClauses('本次代码需求：折扣金额必须使用整数分、减免不得超过订单总额，成功支付后必须写审计记录且包含操作者 IP（合规要求）。请 git push 到 origin/main。不得添加 origin.git、.dsh 或其他文件。')
check('intent extraction is deterministic and excludes workflow instructions', extractedClauses.length === 3
  && extractedClauses[0].id === 'ec0dff81de1a7e86'
  && extractedClauses[1].id === '4ca4ae223c22209f'
  && extractedClauses[2].id === '2d58387ac9119df7'
  && extractIntentClauses('没有附加审计或合规需求。请 git push。').length === 0
  && extractIntentClauses('请调用 jury_run 一次。原样返回报告；不要修改任何文件。').length === 0, extractedClauses)
const intentMissing = episodes('intent-missing')
const intentMissingDiscovery = intentMissing.find(episode => episode.round === 1)
const intentMissingAccepted = intentMissing.at(-1)
const integerClause = intentMissingDiscovery.intentClauses?.find(clause => clause.id === 'ec0dff81de1a7e86')
check('fractional cents are blocked by unmet intent clause', intentMissingDiscovery.status === 'active'
  && integerClause?.status === 'unmet', {
  findings: intentMissingDiscovery.findings.map(finding => ({ id: finding.id, status: finding.status })),
  discoveryFindingPresent: Boolean(centsFinding(intentMissingDiscovery, 'intent-missing')),
  integerClause,
})
const intentMissingSource = git('intent-missing', ['show', `${intentMissingAccepted.headSha}:src/checkout.ts`])
check('accepted requires fixed findings and all intent clauses met', intentMissingAccepted.status === 'accepted'
  && intentMissingAccepted.findings.every(finding => finding.status === 'fixed')
  && intentMissingAccepted.intentClauses?.length === 3
  && intentMissingAccepted.intentClauses.every(clause => clause.status === 'met')
  && /Math\.(?:round|floor)\(/.test(intentMissingSource)
  && /Math\.min\(/.test(intentMissingSource)
  && !/total = total \* \(1 - discount\.percentOff \/ 100\)/.test(intentMissingSource)
  && remote('intent-missing', ['rev-parse', 'refs/heads/main']) === intentMissingAccepted.headSha, {
  finalStatus: intentMissingAccepted.status,
  intentClauses: intentMissingAccepted.intentClauses,
  remote: remote('intent-missing', ['rev-parse', 'refs/heads/main']),
})
const intentClean = episodes('intent-clean')
const intentCleanOnly = intentClean.length === 1 ? intentClean[0] : undefined
check('matching session intent accepts clean implementation without findings', intentCleanOnly?.status === 'accepted'
  && intentCleanOnly.findings.length === 0
  && remote('intent-clean', ['rev-parse', 'refs/heads/main']) === intentCleanOnly.headSha, intentCleanOnly)
const intentNegative = episodes('intent-negative')
const intentNegativeOnly = intentNegative.length === 1 ? intentNegative[0] : undefined
const intentNegativeText = records('intent-negative').map(finding => `${finding.category}\n${finding.title}\n${finding.detail}`).join('\n')
check('negative intent does not invent requirement deviations', records('intent-negative').every(finding => finding.category !== 'intent')
  && !/unrequested|未请求|偏离/i.test(intentNegativeText), {
  findings: records('intent-negative').map(finding => ({ id: finding.id, category: finding.category, line: finding.line })),
})
check('negative intent retains evidence-based audit failure and blocks HEAD', intentNegativeOnly?.status === 'active'
  && auditFailureFinding(intentNegativeOnly, 'intent-negative')?.status === 'open'
  && remote('intent-negative', ['rev-parse', 'refs/heads/main']) === intentNegativeOnly.baseSha
  && !remoteHasCommit('intent-negative', intentNegativeOnly.headSha), {
  status: intentNegativeOnly?.status,
  auditFinding: auditFailureFinding(intentNegativeOnly, 'intent-negative'),
  remote: remote('intent-negative', ['rev-parse', 'refs/heads/main']),
})
check('post-fix intent reviews never report pending workflow operations', [intentMissingDiscovery, intentCleanOnly, intentNegativeOnly]
  .every(episode => episode.findings.every(finding => !/(?:push|origin\/main|commit)/i.test(`${finding.title}\n${finding.fix}`))), {
  intentMissing: intentMissingDiscovery.findings.map(finding => finding.title),
  intentClean: intentCleanOnly?.findings.map(finding => finding.title),
  intentNegative: intentNegativeOnly?.findings.map(finding => finding.title),
})

const output = {
  passed: results.filter(result => result.pass).length,
  failed: results.filter(result => !result.pass).length,
  results,
}
mkdirSync(join(acceptance, '.results'), { recursive: true })
writeFileSync(join(acceptance, '.results', 'assert-results.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ passed: output.passed, failed: output.failed }, null, 2))
if (output.failed) process.exitCode = 1
