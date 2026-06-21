# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lasso is a Go backend (`src/main.go` and friends) that serves a React/TypeScript SPA. All Go code lives under `src/` (the Go module root — `src/go.mod`). The frontend in `src/web/` is **built and embedded into the Go binary** — `go build` embeds `src/web/dist/`, so it must exist locally (run `mise run build`) but is **not** committed (it's gitignored). CI builds the frontend and produces release binaries.

## Commands

Backend (run from repo root, via [mise](https://mise.jdx.dev); Go sources are in `src/`):
- `mise run build` — builds the frontend (`bun run build` in `src/web/`) then `go build` in `src/` (binary → `./lasso`)
- `mise run dev` — Vite dev server with HMR, proxying to the Go backend (requires tailscale up; auto-bumps the dev port from 8190 if busy)
- `mise run test` — `go test .` in `src/`

Frontend (`src/web/`, package manager is **bun**):
- `bun run dev` / `bun run build` (`tsc -b && vite build`)
- `bun run typecheck` — `tsc --noEmit`
- `bun run lint` — `biome lint .`
- `bun run format` — `biome format --write .`
- `bun run check` — `biome check --write .` (format + lint fixes + import/class sorting)

## Frontend workflow

- Run `bun run typecheck` and `bun run lint` before considering frontend work done.
- `src/web/dist/` is the embedded bundle — gitignored and not committed. Run `mise run build` to regenerate it locally; CI builds it for releases.

## Formatting & linting

Tooling is **Biome** (`src/web/biome.json`) — it replaced Prettier + ESLint. Style: 2-space indent, no semicolons, double quotes, ES5 trailing commas, 80-col width. Tailwind class sorting is handled by Biome's `useSortedClasses` (aware of `cn`/`cva`). a11y rules are demoted to warnings (not previously enforced); don't treat them as blocking. Go code: standard `gofmt`.

## Security gotchas

- Never bind to `0.0.0.0`. Use loopback or the tailscale IP. For non-loopback access set `UI_AUTH=user:pass`.
- `/api/file` reads arbitrary absolute paths as the running user — safe only on a private tailnet.
- Running lasso nested inside herdr requires `allow_nested = true` in `~/.config/herdr/config.toml`.
- The `/mcp` MCP server is **unauthenticated** (exempt from `UI_AUTH` via `withAuthExcept`) — it lets any client that can reach lasso spawn and drive agents. Same trust model as `/api/file`: safe only on loopback / a private tailnet, or behind an edge auth gate (e.g. Cloudflare Access). It introduces no new binding.
- The origin deliberately implements **no** OAuth (no `.well-known`, no `401`/`WWW-Authenticate`). So OAuth-based MCP clients (Claude Desktop / claude.ai connectors) connecting to `/mcp` over the public hostname require **Managed OAuth enabled on the Cloudflare Access app** — Access then acts as the OAuth 2.1 authorization server (Dynamic Client Registration + auth-code/PKCE), runs the login against the existing Access policy, and issues tokens; the origin still sees an authenticated Access session and needs no auth code. Without it the client's registration fails ("Couldn't register with lasso's sign-in service"). This is an edge setting on the Access application, not a `cloudflared`/tunnel change.
