import type { RiskAssessment, RiskSignal } from './types.js'

const highRiskPath = /(^|\/)(auth|payment|payments|billing|secret|secrets|migration|migrations|permissions)(\/|\.|$)|(^|\/)\.github\/workflows\/|(^|\/)\.gitlab-ci|jenkinsfile/i

export function assessRisk(diff: string): RiskAssessment {
  const signals: RiskSignal[] = []
  const files = new Set<string>()
  for (const match of diff.matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)) {
    if (match[1] && match[1] !== '/dev/null') files.add(match[1])
  }
  const changedLines = diff.split('\n').filter(line =>
    (/^[+-]/.test(line) && !line.startsWith('+++') && !line.startsWith('---')),
  ).length
  const highRiskFiles = [...files].filter(file => highRiskPath.test(file))
  if (highRiskFiles.length) signals.push({ id: 'high-risk-path', label: `高危路径 ${highRiskFiles.join(', ')}`, score: 8 })
  if (changedLines >= 80) signals.push({ id: 'change-size', label: `变更 ${changedLines} 行`, score: 3 })
  else if (changedLines >= 30) signals.push({ id: 'change-size', label: `变更 ${changedLines} 行`, score: 1 })
  if (files.size >= 5) signals.push({ id: 'file-count', label: `涉及 ${files.size} 个文件`, score: 2 })
  else if (files.size >= 2) signals.push({ id: 'file-count', label: `涉及 ${files.size} 个文件`, score: 1 })
  if (/\bfetch\s*\(|https?:\/\/|\.query\s*\(|\b(?:INSERT|UPDATE|DELETE)\s+[\w"]|payments?\.charge\s*\(/i.test(diff)) {
    signals.push({ id: 'external-call', label: '新增或修改网络/数据库/支付外部调用', score: 3 })
  }
  if (/^\+\+\+ .*(?:test|spec)\./gim.test(diff) && /^\+.*\b(?:expect\s*\(|it\.skip|test\.skip|toBe\s*\()/m.test(diff)) {
    signals.push({ id: 'test-assertion', label: '修改测试断言或启用状态', score: 1 })
  }
  if (/\bPromise\.all\s*\(|\btransaction\b|\bbegin\s+(?:transaction|work)\b|\block\b|\bmutex\b|\bsemaphore\b/i.test(diff)) {
    signals.push({ id: 'concurrency', label: '并发或事务原语', score: 2 })
  }
  if (/\bownerId\b|\bpermissions?\b|\bauthorize\b|\bsecret\b|\btoken\b|\bpassword\b|\bcrypto\b|\bencrypt\b|\bdecrypt\b/i.test(diff)) {
    signals.push({ id: 'permission-crypto', label: '权限、凭证或加密相关标识', score: 3 })
  }
  const score = signals.reduce((sum, signal) => sum + signal.score, 0)
  const highPath = highRiskFiles.length > 0
  return {
    score,
    level: score >= 8 || highPath ? 'high' : score >= 4 ? 'medium' : 'low',
    tier: score >= 4 ? 'single' : 'none',
    signals: signals.map(signal => `${signal.label} (+${signal.score})`),
  }
}
