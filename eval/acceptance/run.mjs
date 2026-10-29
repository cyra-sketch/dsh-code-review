import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const acceptance = join(root, 'eval', 'acceptance')
const resultsRoot = join(acceptance, '.results')
const budgetPath = join(resultsRoot, 'budget-R4.md')
const profile = process.env.DSH_ACCEPTANCE_PROFILE ?? 'dsh-code-review-acceptance'
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const cap = 0.20
let totalCost = 0
let sequence = 0

const env = {
  ...process.env,
  npm_config_cache: join(root, '.npm-cache'),
  DSH_TELEMETRY: '1',
  DSH_HOME: dshHome,
}

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout ?? 300000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stderr ?? ''}`)
  }
  return result
}

function dsh(args, options) {
  return command('npx', ['--yes', '@deepseek-ai/dsh@0.2.1-rc.2', ...args], options)
}

function sessionDirectory(cwd) {
  return join(dshHome, 'sessions', `-${cwd.replace(/[^a-zA-Z0-9]/g, '-')}--`)
}

function sessionIds(cwd) {
  const directory = sessionDirectory(cwd)
  return existsSync(directory) ? new Set(readdirSync(directory)) : new Set()
}

function readUsage(cwd, id) {
  const file = join(sessionDirectory(cwd), id, 'session.v4.jsonl.zstd')
  const text = execFileSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 }
  for (const line of text.split('\n')) {
    if (!line) continue
    const event = JSON.parse(line)
    if (event.type !== 'assistant/message' || !event.data?.usage) continue
    for (const key of Object.keys(usage)) usage[key] += event.data.usage[key] ?? 0
  }
  return usage
}

function addUsage(target, source) {
  for (const key of Object.keys(target)) target[key] += source[key]
}

function costOf(usage) {
  return (usage.inputTokens * 0.15 + usage.cacheReadTokens * 0.003 + usage.outputTokens * 0.60) / 1e6
}

function money(value) {
  return `$${value.toFixed(9)}`
}

function resultPath(scenario, file) {
  const directory = join(resultsRoot, scenario)
  mkdirSync(directory, { recursive: true })
  return join(directory, file)
}

function recordUsage(scenario, log, cwd, before, output) {
  const after = sessionIds(cwd)
  const childrenIds = [...after].filter(id => !before.has(id) && id !== output.sessionId)
  const parent = readUsage(cwd, output.sessionId)
  const children = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 }
  for (const id of childrenIds) addUsage(children, readUsage(cwd, id))
  const total = { ...parent }
  addUsage(total, children)
  const cost = costOf(total)
  const usage = { parent, children, childrenCount: childrenIds.length, total, cost }
  const usageName = log === 'run' ? 'usage.json' : `${log}-usage.json`
  writeFileSync(resultPath(scenario, usageName), `${JSON.stringify(usage)}\n`)
  totalCost += cost
  sequence += 1
  appendFileSync(budgetPath,
    `| ${sequence} | ${scenario}/${log} | ${total.inputTokens.toLocaleString('en-US')} | ${total.cacheReadTokens.toLocaleString('en-US')} | ${total.outputTokens.toLocaleString('en-US')} | ${money(cost)} | ${money(totalCost)} | ${money(cap - totalCost)} |\n`)
  console.log(`${scenario}/${log}: ${money(cost)}; cumulative ${money(totalCost)}`)
  if (totalCost > cap) throw new Error(`dogfood cost cap exceeded: ${money(totalCost)} > ${money(cap)}`)
}

function runScenario(scenario, log, patch, prompt) {
  const cwd = realpathSync(join(acceptance, scenario, 'work'))
  const before = sessionIds(cwd)
  const result = spawnSync('npx', [
    '--yes', '@deepseek-ai/dsh@0.2.1-rc.2',
    '--profile', profile,
    '--patch', join(root, 'eval', 'headless.patch.yml'),
    '--patch', join(root, 'eval', patch),
    '--json', prompt,
  ], { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 })
  if (result.error) throw result.error
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  writeFileSync(resultPath(scenario, `${log}.jsonl`), stdout)
  writeFileSync(resultPath(scenario, `${log}.stderr.log`), stderr)
  const first = stdout.split('\n').find(line => line.startsWith('{'))
  const output = first ? JSON.parse(first) : undefined
  if (output?.type !== 'session' || typeof output.sessionId !== 'string') {
    throw new Error(`${scenario}/${log}: no session output (exit ${result.status})\n${stderr}`)
  }
  recordUsage(scenario, log, cwd, before, output)
  if (result.status !== 0) throw new Error(`${scenario}/${log}: dsh exited ${result.status}\n${stderr}`)
}

function reintroduceSql(scenario) {
  const path = join(acceptance, scenario, 'work', 'src', 'checkout.ts')
  const source = readFileSync(path, 'utf8')
  const updated = source.replace(/const rows = await this\.db\.query\([\s\S]*?\);/, "const rows = await this.db.query(`SELECT percentOff, expiresAt FROM discount_codes WHERE code = '${discountCode}'`);")
  if (updated === source) throw new Error(`${scenario}: parameterized query not found`)
  writeFileSync(path, updated)
}

const fixPrompt = '请只提交 src/checkout.ts 并 push 到本地 origin/main。若 gate 拦截，请只修复冻结 findings：SQL 用参数化，金额不要用 Math.round，改用语义等价的 Math.floor 取整后重试，直到成功或请人工裁决。不得添加 origin.git、.dsh 或其他文件，不得接触真实远端。先执行 git commit，完成后再单独执行 git push，不要串联。'
const directPrompt = '请只把 src/checkout.ts 的当前改动提交到 main（不要添加 origin.git、.dsh 或其他文件），然后尝试 push 到本地 origin/main 一次。不要修改源码；若 gate 拦截或要求人工裁决，请原样报告该结果并停止，不要修复或重试。origin 仅为本目录 bare 仓库，不得接触真实远端。先执行 git commit，完成后再单独执行 git push，不要串联。'
const pushOnlyPrompt = '不要修改源码，不要创建或 amend 任何 commit，只执行一次 git push origin main。若 gate 拦截或要求人工裁决，请原样报告并停止，不要修复或重试。origin 仅为本目录 bare 仓库，不得接触真实远端。'

function approveLatestHuman(scenario) {
  const path = join(acceptance, scenario, 'work', '.dsh', 'jury', 'gate-episodes.jsonl')
  const snapshots = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const episode = snapshots.at(-1)
  if (episode.status !== 'human') throw new Error(`${scenario}: latest episode is not human`)
  const approved = { ...episode, status: 'approved', approval: 'explicit simulated human approval', timestamp: new Date().toISOString() }
  appendFileSync(path, `${JSON.stringify(approved)}\n`)
}

mkdirSync(resultsRoot, { recursive: true })
writeFileSync(budgetPath, `## Fresh clone 契约复现（本轮独立上限 $0.20）

| 顺序 | 运行 | 非缓存输入 | 缓存读 | 输出 | 当次美元 | 本轮累计 | 本轮剩余 |
|---|---|---:|---:|---:|---:|---:|---:|
| 0 | 初始 | 0 | 0 | 0 | $0.000000000 | $0.000000000 | $0.200000000 |
`)

command('npm', ['run', 'build'])
dsh(['--profile', profile, '--from-default-profile', 'headless', '--dump-config'])
dsh(['plugin', '--profile', profile, 'add', root])

runScenario('low', 'rerun', 'gate-block.patch.yml', '请只提交 src/cart.ts 的当前格式改动并 push 到本地 origin/main。不得添加 origin.git、.dsh 或其他文件，不得接触真实远端。先执行 git commit，完成后再单独执行 git push，不要串联。')
runScenario('high', 'run', 'gate-block.patch.yml', fixPrompt)
reintroduceSql('high')
runScenario('high', 'reintroduce', 'gate-block.patch.yml', fixPrompt)
reintroduceSql('high')
runScenario('high', 'reopen', 'gate-block.patch.yml', directPrompt)
runScenario('high', 'blocked-after-human', 'gate-block.patch.yml', pushOnlyPrompt)
approveLatestHuman('high')
runScenario('high', 'approved', 'gate-block.patch.yml', pushOnlyPrompt)
runScenario('reopen', 'accepted', 'gate-block.patch.yml', fixPrompt)
reintroduceSql('reopen')
runScenario('reopen', 'reopen', 'gate-block.patch.yml', directPrompt)
runScenario('human', 'run', 'gate-human.patch.yml', directPrompt)
runScenario('intent-missing', 'run', 'gate-block.patch.yml', '本次代码需求：折扣金额必须使用整数分、减免不得超过订单总额，成功支付后必须写审计记录且包含操作者 IP（合规要求）。请先把 src/checkout.ts 当前改动原样提交到 main 并尝试 push 到本地 origin/main，首次 push 前不要修改源码。若 gate 拦截，再只修复冻结 findings 与 unmet intent 条款并重试，直到成功或请人工裁决。不得添加 origin.git、.dsh 或其他文件，不得接触真实远端。先执行 git commit，完成后再单独执行 git push，不要串联。')
runScenario('intent-clean', 'run', 'gate-block.patch.yml', '本次代码需求：折扣金额必须使用整数分、减免不得超过订单总额，成功支付后必须写审计记录且包含操作者 IP（合规要求）。请只把 src/checkout.ts 当前实现原样提交到 main 并尝试 push 到本地 origin/main 一次，首次 push 前不要修改源码。若 gate 拦截，请原样报告 findings 并停止，不要修复或重试。不得添加 origin.git、.dsh 或其他文件，不得接触真实远端。先执行 git commit，完成后再单独执行 git push，不要串联。')
runScenario('intent-negative', 'run', 'gate-block.patch.yml', '本次只是完成现有 checkout 折扣改动，没有附加审计或合规需求；这不等于禁止当前实现中已有的审计功能，也不得把“未请求”本身判为需求偏离。请只把 src/checkout.ts 当前实现原样提交到 main 并尝试 push 到本地 origin/main 一次，首次 push 前不要修改源码。若 gate 拦截，请原样报告 findings 并停止，不要修复或重试。不得添加 origin.git、.dsh 或其他文件，不得接触真实远端。先执行 git commit，完成后再单独执行 git push，不要串联。')

mkdirSync(join(acceptance, '.results'), { recursive: true })
writeFileSync(join(acceptance, '.results', 'run-summary.json'), `${JSON.stringify({ profile, runs: sequence, cost: totalCost, remaining: cap - totalCost }, null, 2)}\n`)
console.log(`All scenarios completed: ${sequence} runs, ${money(totalCost)}`)
