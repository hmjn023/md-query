# md-query

`md-query` is a small CLI for querying Markdown structure in a way that is useful for agents and scripts.

It focuses on three operations:

- `toc`: return a lightweight heading tree
- `extract`: return blocks under a heading path
- `find`: search blocks by keyword, type, or code fence language

The implementation uses TypeScript, Bun, and [`incur`](https://github.com/wevm/incur).

## Why

Line-based tools are fine for plain text search, but they are a poor fit when you need section-aware access to long Markdown documents.

`md-query` is intended for workflows where an agent should first inspect the document outline, then read only the relevant sections.

## Install

```bash
bun install
```

## Usage

### `toc`

Return a lightweight table of contents.

```bash
bun run src/cli.ts toc ./README.md --json
```

Example output:

```json
{
  "file": "/path/to/README.md",
  "title": "README",
  "sections": [
    {
      "title": "Usage",
      "sections": [
        { "title": "toc" },
        { "title": "extract" },
        { "title": "find" }
      ]
    }
  ]
}
```

Leaf nodes omit `sections`.

### `extract`

Extract a section by heading path.

```bash
bun run src/cli.ts extract ./README.md --path "Usage>find" --json
```

Use `--include-descendants` to include blocks from nested subsections.

### `find`

Find blocks by text, type, or code fence language.

```bash
bun run src/cli.ts find ./README.md --keyword "agent" --json
bun run src/cli.ts find ./README.md --type code --lang bash --json
```

## Build

Build a single-file executable with Bun:

```bash
bun run build
```

Current build command:

```bash
bun build ./src/cli.ts --compile --outfile md-query
```

## Test

```bash
bun test
bunx tsc --noEmit
```

## Current Scope

The parser is built on `remark` and currently targets:

- CommonMark
- GFM
- YAML frontmatter
- fenced code blocks
- blockquotes
- lists
- HTML blocks and comments
- math blocks

This is still an MVP. MDX and renderer-specific behavior are out of scope.
