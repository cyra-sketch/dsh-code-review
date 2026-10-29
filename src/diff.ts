import type { DiffPreprocess } from './types.js'

interface Hunk {
  lines: string[]
}

interface Section {
  header: string[]
  hunks: Hunk[]
}

function splitSections(lines: string[]): Section[] {
  const sections: Section[] = []
  let current: Section | undefined
  let hunk: Hunk | undefined
  for (const line of lines) {
    const startsFile = line.startsWith('diff --git ') || (!hunk && line.startsWith('--- '))
    if (startsFile) {
      current = { header: [line], hunks: [] }
      sections.push(current)
      hunk = undefined
    } else if (line.startsWith('@@') && current) {
      hunk = { lines: [line] }
      current.hunks.push(hunk)
    } else if (hunk) {
      hunk.lines.push(line)
    } else if (current) {
      current.header.push(line)
    }
  }
  return sections
}

function irrelevantHunk(hunk: Hunk): boolean {
  const changed = hunk.lines.filter(line =>
    (/^[+-]/.test(line) && !line.startsWith('+++') && !line.startsWith('---')),
  )
  if (!changed.length) return false
  const importOnly = changed.every(line => /^\s*(?:import\b|export\s+(?:type\s+)?.*\bfrom\b)/.test(line.slice(1).trim()))
  const normalize = (lines: string[]): string[] => lines.map(line => line.slice(1).replace(/\s+/g, ''))
  const removed = changed.filter(line => line.startsWith('-'))
  const added = changed.filter(line => line.startsWith('+'))
  const formatOnly = JSON.stringify(normalize(removed)) === JSON.stringify(normalize(added))
  return importOnly || formatOnly
}

export function preprocessDiff(diff: string): DiffPreprocess {
  const originalLines = diff.trimEnd().split('\n').length
  if (originalLines <= 800) {
    return { diff, originalLines, processedLines: originalLines, originalFiles: 0, omittedHunks: 0 }
  }
  const sections = splitSections(diff.trimEnd().split('\n'))
  const kept: string[] = []
  let omittedHunks = 0
  for (const section of sections) {
    const hunks = section.hunks.filter(hunk => {
      const irrelevant = irrelevantHunk(hunk)
      if (irrelevant) omittedHunks += 1
      return !irrelevant
    })
    if (section.hunks.length && !hunks.length) continue
    kept.push(...section.header, ...hunks.flatMap(hunk => hunk.lines))
  }
  const processed = kept.join('\n')
  return {
    diff: processed ? `${processed}\n` : '',
    originalLines,
    processedLines: kept.length,
    originalFiles: sections.length,
    omittedHunks,
  }
}
