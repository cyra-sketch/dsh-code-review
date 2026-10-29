import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preprocessDiff } from '../../lib/diff.js'
import { acceptancePrompt, gitPushWorkingDirectory, registerGate } from '../../lib/gate.js'
import { EMPTY_TREE_SHA } from '../../lib/types.js'

const root = dirname(fileURLToPath(import.meta.url))
const project = resolve(root, '../..')
const results = []
const check = (name, pass, evidence) => results.push({ name, pass: Boolean(pass), evidence })

function fixture(prefix) {
  const work = mkdtempSync(join(root, prefix))
  mkdirSync(join(work, 'src'), { recursive: true })
  writeFileSync(join(work, 'src', 'root.ts'), 'export const root = true\n')
  const git = args => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: 'pipe' })
  git(['init', '-b', 'main'])
  git(['add', 'src/root.ts'])
  git(['-c', 'user.name=Dogfood Assert', '-c', 'user.email=dogfood@localhost', 'commit', '-m', 'root'])
  return work
}

function harness() {
  let handler
  const calls = []
  const ctx = { on: (_event, callback) => { handler = callback } }
  const runner = {
    run: async (options, runContext) => {
      calls.push({ options, cwd: runContext.cwd })
      return { subagentCalls: 0, findings: [], intentClauses: [] }
    },
  }
  registerGate(ctx, { gateMode: 'block' }, runner)
  return { handler, calls }
}

function execution(command) {
  return {
    name: 'bash',
    arguments: { command },
    agent: { inject: () => { throw new Error('unexpected inject') } },
    callId: 'dogfood-regression',
    signal: new AbortController().signal,
  }
}

{
  const work = fixture('work-no-upstream-')
  const { handler, calls } = harness()
  const previous = process.cwd()
  let nextCalls = 0
  try {
    process.chdir(work)
    await handler(execution('git push origin main'), async () => {
      nextCalls += 1
      return { kind: 'allow' }
    })
  } finally {
    process.chdir(previous)
  }
  const fullDiff = execFileSync('git', ['diff', `${EMPTY_TREE_SHA}..HEAD`], { cwd: work, encoding: 'utf8' })
  check('first push without upstream reviews committed root tree', nextCalls === 1 && calls.length === 1
    && calls[0].options.fromEmptyTree === true && calls[0].cwd === work && fullDiff.includes('export const root = true'), {
    options: calls[0]?.options,
    cwd: calls[0]?.cwd,
    fullDiffIncludesRoot: fullDiff.includes('export const root = true'),
  })
}

{
  const work = fixture('work-git-c-')
  const { handler, calls } = harness()
  const previous = process.cwd()
  let nextCalls = 0
  try {
    process.chdir(project)
    const command = `git -C ${work} push origin main`
    await handler(execution(command), async () => {
      nextCalls += 1
      return { kind: 'allow' }
    })
    check('git -C push gates the target repository', nextCalls === 1 && calls.length === 1 && calls[0].cwd === work
      && gitPushWorkingDirectory({ command }) === work, {
      runnerCwd: calls[0]?.cwd,
      parsedCwd: gitPushWorkingDirectory({ command }),
      expected: work,
    })
  } finally {
    process.chdir(previous)
  }
}

{
  const episode = {
    episodeId: 'dogfood',
    baseSha: 'base',
    round: 1,
    subagentCalls: 1,
    status: 'active',
    findings: [{ id: 'open-1', file: 'src/a.ts', line: 1, severity: 'major', title: 'open defect', fix: 'fix it', status: 'open' }],
    intentClauses: [],
  }
  const prompt = acceptancePrompt(episode, '')
  check('acceptance preserves untouched open status in prompt and frozen input', prompt.includes('"status": "open"')
    && prompt.includes('open stays open and fixed stays fixed'), {
    includesOpenStatus: prompt.includes('"status": "open"'),
    includesStatusRule: prompt.includes('open stays open and fixed stays fixed'),
  })
}

{
  const lines = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,802 +1,802 @@',
    '--- removed line',
    '+ added line',
  ]
  for (let index = 0; index < 800; index += 1) lines.push(` context ${index}`)
  const processed = preprocessDiff(`${lines.join('\n')}\n`)
  check('long diff keeps hunk lines beginning with triple dash', processed.originalFiles === 2
    && processed.processedLines === processed.originalLines
    && processed.diff.includes('--- removed line') && processed.omittedHunks === 0, {
    originalFiles: processed.originalFiles,
    originalLines: processed.originalLines,
    processedLines: processed.processedLines,
    omittedHunks: processed.omittedHunks,
  })
}

{
  const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8'))
  check('runtime schemastery is declared in dependencies and lockfile', manifest.dependencies?.['@deepseek-ai/schemastery'] === '3.18.5'
    && !manifest.devDependencies?.['@deepseek-ai/schemastery']
    && lock.packages?.['']?.dependencies?.['@deepseek-ai/schemastery'] === '3.18.5', {
    dependencies: manifest.dependencies,
    lockDependencies: lock.packages?.['']?.dependencies,
  })
}

const output = { passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length, results }
writeFileSync(join(root, 'regression-results.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ passed: output.passed, failed: output.failed }, null, 2))
if (output.failed) process.exitCode = 1
