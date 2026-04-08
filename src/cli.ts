import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Cli, z } from 'incur'

import {
  findSectionByPath,
  flattenBlocks,
  parseMarkdownDocument,
  type Block,
  type Section,
} from './markdown.ts'

const cli = Cli.create('md-query', {
  version: '0.1.0',
  description: 'Query markdown structure for agents and scripts.',
  sync: {
    suggestions: [
      'show the table of contents for README.md',
      'extract the section path Overview>Requirements from docs/spec.md',
      'find TypeScript code blocks in docs/architecture.md',
    ],
  },
})

type SerializedSection = {
  title: string
  sections?: SerializedSection[]
}

type TocPayload = {
  file: string
  title: string | null
  sections: SerializedSection[]
}

cli.command('toc', {
  description: 'Return a lightweight section tree and document stats.',
  args: z.object({
    file: z.string().describe('Markdown file to inspect'),
  }),
  examples: [{ args: { file: './docs/spec.md' }, description: 'Inspect a markdown file' }],
  async run({ args }) {
    const document = await loadDocument(args.file)
    return buildTocPayload(document)
  },
})

cli.command('extract', {
  description: 'Extract a section by heading path.',
  args: z.object({
    file: z.string().describe('Markdown file to inspect'),
  }),
  options: z.object({
    path: z.string().describe('Heading path separated by > characters'),
    includeDescendants: z.boolean().optional().describe('Include descendant section blocks'),
  }),
  alias: {
    path: 'p',
    includeDescendants: 'i',
  },
  examples: [
    {
      args: { file: './docs/spec.md' },
      options: { path: 'Overview>Requirements' },
      description: 'Extract one section',
    },
  ],
  async run({ args, options }) {
    const document = await loadDocument(args.file)
    const section = findSectionByPath(document.sections, options.path)
    if (!section) {
      throw new Error(`Section not found: ${options.path}`)
    }

    const blocks = options.includeDescendants ? collectSectionBlocks(section) : section.blocks

    return {
      file: document.file,
      title: document.title,
      section: {
        id: section.id,
        title: section.title,
        depth: section.depth,
        path: section.path,
        headingLine: section.headingLine,
        stats: section.stats,
      },
      blocks,
      text: blocks.map((block) => block.text).filter(Boolean).join('\n\n'),
    }
  },
})

cli.command('find', {
  description: 'Find blocks by keyword, type, or language.',
  args: z.object({
    file: z.string().describe('Markdown file to inspect'),
  }),
  options: z.object({
    keyword: z.string().optional().describe('Case-insensitive text match'),
    type: z
      .enum(['blockquote', 'code', 'footnote', 'html', 'list', 'math', 'table', 'text', 'thematicBreak', 'unknown'])
      .optional()
      .describe('Block type to match'),
    lang: z.string().optional().describe('Fence language to match when type is code'),
  }),
  alias: {
    keyword: 'k',
    type: 't',
    lang: 'l',
  },
  examples: [
    {
      args: { file: './docs/spec.md' },
      options: { keyword: '認証' },
      description: 'Search text blocks',
    },
    {
      args: { file: './docs/spec.md' },
      options: { type: 'code', lang: 'ts' },
      description: 'Find TypeScript code blocks',
    },
  ],
  async run({ args, options }) {
    if (!options.keyword && !options.type && !options.lang) {
      throw new Error('At least one of --keyword, --type, or --lang is required')
    }

    const document = await loadDocument(args.file)
    const matches = [...document.preamble, ...flattenBlocks(document.sections)].filter((block) =>
      matchesBlock(block, options),
    )

    return {
      file: document.file,
      title: document.title,
      query: options,
      count: matches.length,
      matches,
    }
  },
})

if (import.meta.main) {
  await cli.serve()
}

async function loadDocument(file: string) {
  const absolutePath = resolve(file)
  const source = await readFile(absolutePath, 'utf8')
  return parseMarkdownDocument(absolutePath, source)
}

export function buildTocPayload(document: ReturnType<typeof parseMarkdownDocument>): TocPayload {
  return {
    file: document.file,
    title: document.title,
    sections: document.sections.map(serializeSection),
  }
}

function serializeSection(section: Section): SerializedSection {
  const children = section.sections.map(serializeSection)
  return {
    title: section.title,
    ...(children.length > 0 ? { sections: children } : {}),
  }
}

function collectSectionBlocks(section: Section): Block[] {
  return [...section.blocks, ...section.sections.flatMap(collectSectionBlocks)]
}

function matchesBlock(
  block: Block,
  query: {
    keyword?: string
    type?: string
    lang?: string
  },
): boolean {
  if (query.type && block.type !== query.type) return false
  if (query.lang && block.lang?.toLowerCase() !== query.lang.toLowerCase()) return false
  if (query.keyword) {
    const needle = query.keyword.toLowerCase()
    const haystacks = [block.text, block.path.join(' > '), block.lang ?? '']
    if (!haystacks.some((value) => value.toLowerCase().includes(needle))) return false
  }
  return true
}
