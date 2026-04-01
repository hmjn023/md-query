import { describe, expect, test } from 'bun:test'

import { buildTocPayload } from './cli.ts'
import { findSectionByPath, parseMarkdownDocument } from './markdown.ts'

const source = `---
title: Demo Doc
---

# Root

Intro paragraph.

## Alpha

- one
- two

## Beta

### Gamma

\`\`\`ts
console.log('hi')
\`\`\`
`

describe('toc payload', () => {
  test('returns lightweight section tree without empty sections keys on leaves', () => {
    const document = parseMarkdownDocument('/tmp/demo.md', source)
    const toc = buildTocPayload(document)

    expect(toc).toEqual({
      file: '/tmp/demo.md',
      title: 'Demo Doc',
      sections: [
        {
          title: 'Root',
          sections: [
            { title: 'Alpha' },
            {
              title: 'Beta',
              sections: [{ title: 'Gamma' }],
            },
          ],
        },
      ],
    })
  })
})

describe('section lookup', () => {
  test('finds a section by tail path', () => {
    const document = parseMarkdownDocument('/tmp/demo.md', source)
    const section = findSectionByPath(document.sections, 'Beta>Gamma')

    expect(section?.path).toEqual(['Root', 'Beta', 'Gamma'])
    expect(section?.blocks[0]).toMatchObject({
      type: 'code',
      lang: 'ts',
    })
  })
})
