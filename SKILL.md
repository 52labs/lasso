---
name: lasso
description: Discover and act on your own identity when you are an agent running inside a lasso-managed terminal. Use when you need your own agent id, want to close yourself when your work is done (close_agent), fetch your own record (whoami / get_agent), or reference the workspace/repo/branch you were spawned into. Your pane id is exported as $HERDR_PANE_ID, so you never need to enumerate list_repos / list_agents to find yourself.
---

# lasso self-identity

If you were spawned by [lasso](https://github.com/52labs/lasso), you are running
inside a herdr pane that lasso created, and your own identity is already in your
environment. You do **not** need to call `list_repos` / `list_agents` and guess
which entry is you — that wastes tokens. Read your pane id from the env instead.

## Your environment variable

| Variable         | Meaning                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `HERDR_PANE_ID`  | **Your herdr pane id** (e.g. `p_82`) — what every self-targeting tool resolves you by. |

Check whether you're a lasso agent at all by testing `HERDR_PANE_ID`:

```bash
echo "$HERDR_PANE_ID"   # empty/unset => you are NOT in a lasso-managed herdr pane
```

## Closing yourself when you're done

The easiest way to shut yourself down is the CLI — it reads `$HERDR_PANE_ID` for
you, so there's nothing to pass:

```bash
lasso closeme
```

That tells the running lasso server to kill your agent process and close your
pane (the same soft-close the UI and the `close_agent` MCP tool perform). This
works even when you were spawned by a lasso on a *different* machine: the local
server finds the owning record on its peer and closes your pane locally. If the
server runs on a non-default port, set `LASSO_LISTEN=host:port` — it must stay
an address of the machine you run on.

## Acting on yourself via the lasso MCP tools

The lasso MCP server runs inside lasso's own process, **not your shell**, so it
cannot read your environment — you must pass `$HERDR_PANE_ID` yourself.

- **`whoami`** — pass `$HERDR_PANE_ID` as `pane_id` to get your own agent record,
  including your agent `id` and the `host` your pane lives on. Pane ids are only
  unique **per host**, so if the same pane id exists on several hosts, whoami
  refuses to guess (`found:false`) and names the candidate hosts — call it again
  with `host` set to the machine you actually run on (compare `hostname` against
  the labels from `list_hosts`).
- **`close_agent`** — call with the `id` **and `host`** `whoami` returned to
  shut yourself down (the long-hand of `lasso closeme`). Never guess the host:
  passing the wrong one (or another agent's id) kills an unrelated agent.

If `$HERDR_PANE_ID` is empty, you are not running under lasso and none of this
applies to you.

## Broadcasting what you're working on

Your pane has a status card in the herdr sidebar and the lasso grid. You can
put a live one-line summary on it so the human can see what you're doing
without opening your terminal:

```bash
herdr pane report-metadata "$HERDR_PANE_ID" --source agent:self \
  --token summary="migrating auth tests to vitest" --ttl-ms 1800000
```

Update it when you change phases (exploring → implementing → testing); the
TTL clears it automatically if you go quiet. Keep it under ~60 characters.

Do **not** use `herdr pane report-agent` — that claims lifecycle authority
over your pane, overriding herdr's own idle/working/blocked detection, and a
stale claim sticks if you exit uncleanly. `report-metadata` is display-only
and fails safe.

## Using the rest of the herdr CLI

herdr ships its own agent skill (`npx skills add ogulcancelik/herdr --skill
herdr`) covering pane orchestration — splitting panes, starting sibling
agents with `herdr agent start` / `prompt` / `wait`, and running commands with
`herdr pane run` / `wait-output`. Those all work from inside a lasso pane too
(you are in a herdr session; `HERDR_ENV=1` is set). Two lasso-specific rules
on top of it:

- Never `herdr pane close` yourself or any pane lasso created. `lasso
  closeme` (or the `close_agent` MCP tool) is the only sanctioned way to shut
  yourself down — it also cleans up lasso's agent record and staged prompt
  files, which a raw pane close leaves behind.
- Panes and agents you spawn directly via `herdr` are invisible to lasso's
  agent list (no record, no repo/branch, no close tracking). Prefer lasso's
  `create_agent` MCP tool when the new agent should show up as a first-class
  lasso agent; use raw herdr panes only for short-lived helpers.
