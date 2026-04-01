# Repository Guidelines

## Project Structure & Module Organization

Core source files live in [`src/`](/home/hmjn/projects/ts/md-query/src). [`src/cli.ts`](/home/hmjn/projects/ts/md-query/src/cli.ts) defines the `incur`-based CLI commands: `toc`, `extract`, and `find`. [`src/markdown.ts`](/home/hmjn/projects/ts/md-query/src/markdown.ts) contains Markdown parsing, section tree construction, and block normalization. Tests live alongside the code in [`src/cli.test.ts`](/home/hmjn/projects/ts/md-query/src/cli.test.ts). Project configuration is in [`package.json`](/home/hmjn/projects/ts/md-query/package.json) and [`tsconfig.json`](/home/hmjn/projects/ts/md-query/tsconfig.json).

## Build, Test, and Development Commands

- `bun install`: install dependencies.
- `bun run dev --help`: run the TypeScript CLI directly during development.
- `bun run build`: compile a single-file executable with Bun (`md-query`).
- `bun test`: run the Bun test suite.
- `bunx tsc --noEmit`: run strict type-checking.

Use `--json` when verifying CLI output, for example: `bun run src/cli.ts toc README.md --json`.

## Coding Style & Naming Conventions

Write TypeScript with strict typing enabled. Follow the existing style: 2-space indentation, single quotes, semicolons omitted, and small focused helper functions. Use `camelCase` for functions and variables, `PascalCase` for exported types, and descriptive file names such as `markdown.ts` or `cli.test.ts`. Keep output schemas explicit and stable because this project is intended for agent consumption.

## Testing Guidelines

Tests use Bun’s built-in test runner from `bun:test`. Add tests in `src/*.test.ts` near the code they cover. Prefer small fixture strings in test files over external fixture directories unless the input becomes hard to read inline. Cover command-shaping behavior first: heading tree shape, path resolution, and normalized block output.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects, for example: `Implement md-query CLI MVP`, `Add project README`. Keep that style. Each pull request should explain the user-visible CLI change, mention any output-schema changes, and include the verification commands you ran. If a command’s JSON output changes, include a short before/after example in the PR description.

## Agent-Specific Notes

Do not commit local artifacts such as `node_modules/`, `md-query`, `.cache/`, `.codex`, or `session.md`. Preserve the lightweight `toc` output: leaf sections should omit empty `sections` keys.
