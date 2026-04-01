import { toString } from 'mdast-util-to-string'
import type {
  Blockquote,
  Code,
  Content,
  FootnoteDefinition,
  Heading,
  Html,
  List,
  Root,
  Table,
  YAML,
} from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import YAMLParser from 'yaml'

export type BlockType =
  | 'blockquote'
  | 'code'
  | 'footnote'
  | 'html'
  | 'list'
  | 'math'
  | 'table'
  | 'text'
  | 'thematicBreak'
  | 'unknown'

export type Block = {
  id: string
  type: BlockType
  path: string[]
  text: string
  lang?: string
  meta?: Record<string, unknown>
  position?: {
    startLine?: number
    endLine?: number
  }
}

export type SectionStats = {
  directBlocks: number
  descendantBlocks: number
  codeBlocks: number
  textChars: number
}

export type Section = {
  id: string
  title: string
  depth: number
  path: string[]
  headingLine?: number
  blocks: Block[]
  sections: Section[]
  stats: SectionStats
}

export type DocumentStats = {
  preambleBlocks: number
  totalSections: number
  totalBlocks: number
  codeBlocks: number
  textChars: number
}

export type ParsedDocument = {
  file: string
  title: string | null
  frontmatter: Record<string, unknown> | null
  frontmatterRaw: string | null
  preamble: Block[]
  sections: Section[]
  stats: DocumentStats
}

type MathNode = Content & {
  type: 'math'
  value: string
}

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm)
  .use(remarkMath)

export function parseMarkdownDocument(file: string, source: string): ParsedDocument {
  const tree = processor.parse(source) as Root
  const preamble: Block[] = []
  const sections: Section[] = []
  const stack: Section[] = []
  let frontmatter: Record<string, unknown> | null = null
  let frontmatterRaw: string | null = null

  for (const node of tree.children) {
    if (node.type === 'yaml' && frontmatterRaw === null) {
      frontmatterRaw = node.value
      frontmatter = parseFrontmatter(node)
      continue
    }

    if (node.type === 'heading') {
      const section = createSection(node, stack)
      while (stack.length > 0 && stack.at(-1)!.depth >= section.depth) stack.pop()
      const parent = stack.at(-1)
      if (parent) parent.sections.push(section)
      else sections.push(section)
      stack.push(section)
      continue
    }

    const block = createBlock(node, stack.at(-1)?.path ?? [])
    if (!block) continue

    const currentSection = stack.at(-1)
    if (currentSection) currentSection.blocks.push(block)
    else preamble.push(block)
  }

  for (const section of sections) computeSectionStats(section)

  const title = inferTitle(sections, frontmatter)
  const stats = computeDocumentStats(sections, preamble)

  return {
    file,
    title,
    frontmatter,
    frontmatterRaw,
    preamble,
    sections,
    stats,
  }
}

export function findSectionByPath(sections: Section[], rawPath: string): Section | null {
  const parts = rawPath
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return null

  const all = flattenSections(sections)
  const exact = all.find((section) => samePath(section.path, parts))
  if (exact) return exact

  const tailMatches = all.filter((section) => endsWithPath(section.path, parts))
  if (tailMatches.length === 1) return tailMatches[0]

  return null
}

export function flattenSections(sections: Section[]): Section[] {
  return sections.flatMap((section) => [section, ...flattenSections(section.sections)])
}

export function flattenBlocks(sections: Section[]): Block[] {
  return flattenSections(sections).flatMap((section) => section.blocks)
}

function createSection(node: Heading, stack: Section[]): Section {
  const title = normalizeWhitespace(toString(node))
  const parent = findParentForDepth(stack, node.depth)
  const path = parent ? [...parent.path, title] : [title]
  const line = node.position?.start.line

  return {
    id: makeStableId('sec', path, line),
    title,
    depth: node.depth,
    path,
    headingLine: line,
    blocks: [],
    sections: [],
    stats: {
      directBlocks: 0,
      descendantBlocks: 0,
      codeBlocks: 0,
      textChars: 0,
    },
  }
}

function findParentForDepth(stack: Section[], depth: number): Section | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const section = stack[index]
    if (section.depth < depth) return section
  }
}

function createBlock(node: Content, path: string[]): Block | null {
  const position = {
    startLine: node.position?.start.line,
    endLine: node.position?.end.line,
  }

  switch (node.type) {
    case 'paragraph':
      return {
        id: makeStableId('blk', path, node.position?.start.line),
        type: 'text',
        path,
        text: normalizeWhitespace(toString(node)),
        position,
      }
    case 'list':
      return listToBlock(node, path)
    case 'blockquote':
      return blockquoteToBlock(node, path)
    case 'code':
      return codeToBlock(node, path)
    case 'html':
      return htmlToBlock(node, path)
    case 'table':
      return tableToBlock(node, path)
    case 'math':
      return mathToBlock(node, path)
    case 'footnoteDefinition':
      return footnoteToBlock(node, path)
    case 'thematicBreak':
      return {
        id: makeStableId('blk', path, node.position?.start.line),
        type: 'thematicBreak',
        path,
        text: '',
        position,
      }
    case 'yaml':
      return {
        id: makeStableId('blk', path, node.position?.start.line),
        type: 'unknown',
        path,
        text: node.value,
        meta: { syntax: 'yaml-frontmatter' },
        position,
      }
    default: {
      const text = normalizeWhitespace(toString(node))
      return {
        id: makeStableId('blk', path, node.position?.start.line),
        type: 'unknown',
        path,
        text,
        meta: { nodeType: node.type },
        position,
      }
    }
  }
}

function listToBlock(node: List, path: string[]): Block {
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'list',
    path,
    text: stringifyList(node),
    meta: {
      ordered: node.ordered,
      start: node.start ?? null,
      spread: node.spread ?? false,
    },
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function blockquoteToBlock(node: Blockquote, path: string[]): Block {
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'blockquote',
    path,
    text: node.children.map((child) => normalizeWhitespace(toString(child))).filter(Boolean).join('\n'),
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function codeToBlock(node: Code, path: string[]): Block {
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'code',
    path,
    text: node.value,
    lang: node.lang ?? undefined,
    meta: node.meta ? { meta: node.meta } : undefined,
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function htmlToBlock(node: Html, path: string[]): Block {
  const text = node.value.trim()
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'html',
    path,
    text,
    meta: { isComment: text.startsWith('<!--') && text.endsWith('-->') },
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function tableToBlock(node: Table, path: string[]): Block {
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'table',
    path,
    text: normalizeWhitespace(toString(node)),
    meta: {
      rows: node.children.length,
      columns: node.children[0]?.children.length ?? 0,
    },
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function mathToBlock(node: MathNode, path: string[]): Block {
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'math',
    path,
    text: node.value,
    meta: { syntax: 'math' },
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function footnoteToBlock(node: FootnoteDefinition, path: string[]): Block {
  return {
    id: makeStableId('blk', path, node.position?.start.line),
    type: 'footnote',
    path,
    text: normalizeWhitespace(toString(node)),
    meta: { identifier: node.identifier },
    position: {
      startLine: node.position?.start.line,
      endLine: node.position?.end.line,
    },
  }
}

function parseFrontmatter(node: YAML): Record<string, unknown> | null {
  try {
    const parsed = YAMLParser.parse(node.value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { value: parsed }
  } catch {
    return null
  }
}

function inferTitle(sections: Section[], frontmatter: Record<string, unknown> | null): string | null {
  const frontmatterTitle = frontmatter?.title
  if (typeof frontmatterTitle === 'string' && frontmatterTitle.length > 0) return frontmatterTitle
  const firstHeading = sections[0]
  return firstHeading?.title ?? null
}

function computeSectionStats(section: Section): SectionStats {
  const directBlocks = section.blocks.length
  const descendantSectionStats = section.sections.map(computeSectionStats)
  const descendantBlocks =
    directBlocks + descendantSectionStats.reduce((sum, stats) => sum + stats.descendantBlocks, 0)
  const codeBlocks =
    section.blocks.filter((block) => block.type === 'code').length +
    descendantSectionStats.reduce((sum, stats) => sum + stats.codeBlocks, 0)
  const textChars =
    section.blocks.reduce((sum, block) => sum + block.text.length, 0) +
    descendantSectionStats.reduce((sum, stats) => sum + stats.textChars, 0)

  section.stats = {
    directBlocks,
    descendantBlocks,
    codeBlocks,
    textChars,
  }

  return section.stats
}

function computeDocumentStats(sections: Section[], preamble: Block[]): DocumentStats {
  const flatSections = flattenSections(sections)
  const preambleCodeBlocks = preamble.filter((block) => block.type === 'code').length
  const sectionCodeBlocks = flatSections.reduce((sum, section) => sum + section.blocks.filter((block) => block.type === 'code').length, 0)
  const preambleTextChars = preamble.reduce((sum, block) => sum + block.text.length, 0)
  const sectionTextChars = flatSections.reduce(
    (sum, section) => sum + section.blocks.reduce((inner, block) => inner + block.text.length, 0),
    0,
  )

  return {
    preambleBlocks: preamble.length,
    totalSections: flatSections.length,
    totalBlocks: preamble.length + flatSections.reduce((sum, section) => sum + section.blocks.length, 0),
    codeBlocks: preambleCodeBlocks + sectionCodeBlocks,
    textChars: preambleTextChars + sectionTextChars,
  }
}

function samePath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

function endsWithPath(path: string[], suffix: string[]): boolean {
  if (suffix.length > path.length) return false
  const offset = path.length - suffix.length
  return suffix.every((part, index) => path[offset + index] === part)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stringifyList(node: List): string {
  return node.children
    .map((item, index) => {
      const marker = node.ordered ? `${(node.start ?? 1) + index}.` : '-'
      const text = normalizeWhitespace(toString(item))
      return `${marker} ${text}`.trim()
    })
    .join('\n')
}

function makeStableId(prefix: string, path: string[], line?: number): string {
  const slug = path
    .join('/')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '')

  return [prefix, slug || 'root', line ?? '0'].join('_')
}
