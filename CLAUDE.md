# CLAUDE.md

Guidance for AI assistants working in this repository.

## Project intent

`html-only-agent` is a chat UI where Claude's responses are rendered as **raw HTML** rather than Markdown, so the model can produce rich visual output — layouts, charts, tables, interactive widgets — directly in the conversation surface.

Source: `README.md`.

## Current state — pre-implementation

As of the initial commit (`0d6af5b`, 2026-05-08), the repository contains only `README.md` and this file. There is no application code, package manifest, build config, test suite, or directory structure yet. Anyone picking this up is making the first architectural decisions.

Do not invent or assume a stack (framework, package manager, runtime, hosting). Ask the user, or read the latest commits, before writing code that depends on one.

## Core product contract

The single non-obvious convention is the output format: **model responses are HTML, not Markdown.** Any prompt sent to Claude should instruct it to reply with HTML, and the UI must render that HTML so it actually displays as rich content.

Rendering raw model HTML is a security-sensitive choice. When implementing, treat this as an open decision rather than a default — sandboxed `<iframe srcdoc>`, DOMPurify-style sanitization, or a strict CSP each have different trade-offs. Flag the chosen approach to the user before merging.

## Repository & workflow

- Local path: `/home/user/html-only-agent`
- GitHub: `risingtides-dev/html-only-agent`
- Default branch: `main`
- Open pull requests as **draft** against `main`.
- Don't commit secrets or `.env` files. There is no `.gitignore` yet — add one alongside the first code commit.

## Updating this file

Once a stack is chosen and code lands, **rewrite this file** to document the real structure: entry points, build/test/lint commands, directory layout, and any conventions that emerge. Don't grow the placeholder sections above — replace them.
