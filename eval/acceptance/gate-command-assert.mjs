import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import {
  gitPushChainHasHeadMutation,
  gitPushCommand,
  gitPushCommandUnparsed,
  gitPushWorkingDirectory,
  registerGate,
} from '../../lib/gate.js'

const results = []
const check = (name, pass, evidence) => results.push({ name, pass: Boolean(pass), evidence })
const args = command => ({ command })

const rejected = [
  'git commit -m "change" && git push origin main',
  'git commit --amend && git push',
  'git merge feature; git push',
  'git rebase main && git push',
  'git reset --hard HEAD~1 && git push',
  'git cherry-pick abc123 && git push',
  'git revert HEAD && git push',
  'git checkout feature && git push',
  'git pull && git push',
  'git commit -m "change" &&\ngit push origin main',
  'git merge feature | git push',
]
for (const command of rejected) {
  check(`reject HEAD mutation chained with push: ${command}`, gitPushCommand(args(command)) && gitPushChainHasHeadMutation(args(command)), {
    push: gitPushCommand(args(command)),
    headMutation: gitPushChainHasHeadMutation(args(command)),
  })
}

const allowed = [
  'git push origin main',
  'git add src/cart.ts && git push origin main',
  'cd repo && git push origin main',
  'cd "repo with space" && git push origin main',
]
for (const command of allowed) {
  check(`allow push without HEAD mutation: ${command}`, gitPushCommand(args(command)) && !gitPushChainHasHeadMutation(args(command)), {
    push: gitPushCommand(args(command)),
    headMutation: gitPushChainHasHeadMutation(args(command)),
  })
}
const unwrapped = [
  `bash -c 'git push origin main'`,
  'sh -c "git push origin main"',
  'zsh -c "git push"',
  'pwsh -Command "git push"',
  'eval git push',
  'env FOO=bar bash -c "git push"',
  'nohup git push',
  'sudo -n git push',
  'time -p bash -c "git push"',
  `bash -c "bash -c 'git push'"`,
]
for (const command of unwrapped) {
  check(`recursively unwrap shell command: ${command}`, gitPushCommand(args(command)) && !gitPushCommandUnparsed(args(command)), {
    push: gitPushCommand(args(command)),
    unparsed: gitPushCommandUnparsed(args(command)),
  })
}
check('nested commit and push retains HEAD mutation detection', gitPushChainHasHeadMutation(args(`bash -c 'git commit && git push'`)), {
  command: `bash -c 'git commit && git push'`,
})
const unparsed = [
  'if git push; then echo pushed; fi',
  `bash --noprofile -c 'git push'`,
  'xargs git push',
  'eval eval eval eval eval git push',
]
for (const command of unparsed) {
  check(`fail closed for unparsed shell command: ${command}`, gitPushCommand(args(command)) && gitPushCommandUnparsed(args(command)), {
    push: gitPushCommand(args(command)),
    unparsed: gitPushCommandUnparsed(args(command)),
  })
}
check('quoted git push in a commit message is not a push command', !gitPushCommand(args('git commit -m "git push"')), {
  push: gitPushCommand(args('git commit -m "git push"')),
})
check('cd working directory is resolved for gate inspection', gitPushWorkingDirectory(args('cd repo && git push')) === resolve(process.cwd(), 'repo')
  && gitPushWorkingDirectory(args('cd "repo with space" && git push')) === resolve(process.cwd(), 'repo with space'), {
  plain: gitPushWorkingDirectory(args('cd repo && git push')),
  quoted: gitPushWorkingDirectory(args('cd "repo with space" && git push')),
})

function harness(mode) {
  let handler
  let runs = 0
  const ctx = { on: (_event, callback) => { handler = callback } }
  const runner = {
    run: async () => {
      runs += 1
      return { subagentCalls: 0, findings: [], intentClauses: [], effectiveTier: 'none' }
    },
  }
  registerGate(ctx, { gateMode: mode }, runner)
  return {
    handler,
    runs: () => runs,
  }
}

function execution(command, injected) {
  return {
    name: 'bash',
    arguments: args(command),
    agent: { inject: message => injected.push(message) },
    callId: 'command-assert',
    signal: new AbortController().signal,
  }
}

{
  const { handler, runs } = harness('block')
  let nextCalls = 0
  const decision = await handler(execution('git commit -m "change" && git push', []), async () => {
    nextCalls += 1
    return { kind: 'allow' }
  })
  check('block mode deterministically denies commit+push before review', decision.kind === 'deny'
    && decision.info.code === 'HEAD_MUTATION_CHAIN'
    && decision.reason.includes('请分步执行：先提交，再单独 push')
    && nextCalls === 0 && runs() === 0, { decision, nextCalls, runnerCalls: runs() })
}

{
  const { handler, runs } = harness('report')
  const injected = []
  let nextCalls = 0
  await handler(execution('git commit -m "change" && git push', injected), async () => {
    nextCalls += 1
    return { kind: 'allow' }
  })
  const warning = JSON.stringify(injected)
  check('report mode injects the same deterministic warning', nextCalls === 1 && runs() === 0
    && injected.length === 1 && warning.includes('请分步执行：先提交，再单独 push'), {
    nextCalls,
    runnerCalls: runs(),
    injected: warning,
  })
}

{
  const { handler, runs } = harness('block')
  const decision = await handler(execution('if git push; then echo pushed; fi', []), async () => ({ kind: 'allow' }))
  check('block mode denies unparsed nested shell before review', decision.kind === 'deny'
    && decision.info.code === 'UNPARSED_GIT_PUSH' && runs() === 0, { decision, runnerCalls: runs() })
}

{
  const { handler, runs } = harness('report')
  const injected = []
  let nextCalls = 0
  await handler(execution('if git push; then echo pushed; fi', injected), async () => {
    nextCalls += 1
    return { kind: 'allow' }
  })
  check('report mode warns for unparsed nested shell', nextCalls === 1 && runs() === 0
    && JSON.stringify(injected).includes('无法安全解析嵌套 shell'), { nextCalls, runnerCalls: runs(), injected })
}

const projectCwd = process.cwd()
const normalWork = resolve(projectCwd, 'eval/acceptance/command-normal-work')
if (!existsSync(resolve(normalWork, '.git'))) {
  mkdirSync(resolve(normalWork, 'src'), { recursive: true })
  const git = args => execFileSync('git', args, { cwd: normalWork, stdio: 'pipe' })
  writeFileSync(resolve(normalWork, 'src', 'cart.ts'), 'export const cart = () => 0\n')
  git(['init', '-b', 'main'])
  git(['add', 'src/cart.ts'])
  git(['-c', 'user.name=R4 Command Assert', '-c', 'user.email=r4-command@localhost', 'commit', '-m', 'initial'])
  git(['init', '--bare', 'origin.git'])
  git(['remote', 'add', 'origin', resolve(normalWork, 'origin.git')])
  git(['push', '-u', 'origin', 'main'])
}
const normalCases = [
  { command: 'git push origin main', cwd: normalWork },
  { command: 'cd eval/acceptance/command-normal-work && git push origin main', cwd: projectCwd },
]
for (const { command, cwd } of normalCases) {
  const { handler, runs } = harness('block')
  let nextCalls = 0
  process.chdir(cwd)
  let decision
  try {
    decision = await handler(execution(command, []), async () => {
      nextCalls += 1
      return { kind: 'allow' }
    })
  } finally {
    process.chdir(projectCwd)
  }
  check(`standalone push follows normal accepted gate flow: ${command}`, nextCalls === 1 && runs() <= 1 && decision.kind === 'allow', {
    decision,
    nextCalls,
    runnerCalls: runs(),
  })
}

async function postAcceptCase(secondResult) {
  const work = mkdtempSync(resolve(projectCwd, 'eval/acceptance/work-post-accept-'))
  mkdirSync(resolve(work, 'src'), { recursive: true })
  writeFileSync(resolve(work, 'src', 'cart.ts'), 'export const cart = () => 0\n')
  const git = args => execFileSync('git', args, { cwd: work, stdio: 'pipe' })
  git(['init', '-b', 'main'])
  git(['add', 'src/cart.ts'])
  git(['-c', 'user.name=Post Accept Assert', '-c', 'user.email=post-accept@localhost', 'commit', '-m', 'initial'])
  git(['init', '--bare', 'origin.git'])
  git(['remote', 'add', 'origin', resolve(work, 'origin.git')])
  git(['push', '-u', 'origin', 'main'])
  let handler
  const outputs = [
    { subagentCalls: 0, findings: [], intentClauses: [], effectiveTier: 'none' },
    secondResult,
  ]
  const ctx = { on: (_event, callback) => { handler = callback } }
  const runner = { run: async () => outputs.shift() }
  registerGate(ctx, { gateMode: 'block', postAcceptReview: true }, runner)
  let nextCalls = 0
  let runnerCalls = 0
  const originalRun = runner.run
  runner.run = async (...args) => {
    runnerCalls += 1
    return originalRun(...args)
  }
  process.chdir(work)
  let decision
  try {
    decision = await handler(execution('git push origin main', []), async () => {
      nextCalls += 1
      return { kind: 'allow' }
    })
  } finally {
    process.chdir(projectCwd)
  }
  return { decision, nextCalls, runnerCalls }
}

{
  const cleanReview = { subagentCalls: 1, findings: [], intentClauses: [], effectiveTier: 'single' }
  const outcome = await postAcceptCase(cleanReview)
  check('postAcceptReview accepts final HEAD after independent clean discovery', outcome.decision.kind === 'allow'
    && outcome.nextCalls === 1 && outcome.runnerCalls === 2, outcome)
}
{
  const newIssue = {
    subagentCalls: 1,
    findings: [{ id: 'post-accept-new', file: 'src/cart.ts', line: 1, severity: 'major', title: 'new defect', detail: 'new issue', pre_existing: false }],
    intentClauses: [],
    effectiveTier: 'single',
  }
  const outcome = await postAcceptCase(newIssue)
  check('postAcceptReview blocks a newly introduced issue before push', outcome.decision.kind === 'deny'
    && outcome.decision.info.code === 'POST_ACCEPT_FINDINGS'
    && outcome.nextCalls === 0 && outcome.runnerCalls === 2, outcome)
}

const output = { passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length, results }
mkdirSync(new URL('./.results/', import.meta.url), { recursive: true })
writeFileSync(new URL('./.results/gate-command-assert-results.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ passed: output.passed, failed: output.failed }, null, 2))
if (output.failed) process.exitCode = 1
