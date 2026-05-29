# `pane.cwd` reports the shell's cwd, not the foreground process's — wrong for agent panes

Note: I LOVE herdr. I'm building a companion native and web application with a tree viewer and file
editor which requires knowledge of the active pane. This issue addresses a critical shortcoming in building that solution. I read CONTRIBUTING.md -- I'm happy to contribute a PR if approved.

Without further ado...

## Summary

A pane's reported `cwd` reflects the **shell's** working directory, not the
directory of whatever process currently owns the terminal. When a long-running
foreground program (an AI coding agent, an editor, any TUI) is the pane's
foreground process and its cwd differs from the shell's last-reported cwd,
`pane.cwd` is wrong — it reports the shell's dir, not the program's. For agent
panes this is the common case, and it breaks any tooling that asks herdr "what
directory is this agent working in?"

## What herdr already does (so this isn't a duplicate of #269 / #332 / #300)

To be precise about scope, since this area has had recent fixes:

- **#269 / #332** fixed which *shell* cwd is surfaced — the live runtime cwd
  (`cwd_for_pane` / `display_name_from`) instead of the frozen `identity_cwd`.
  Both are shell-derived (updated when the shell emits `OSC 7` on `cd`).
- **#300** reads the pane's **foreground process group** (`tcgetpgrp`) — but only
  to *identify which agent* is running, not to read its working directory.

None of these track the **foreground process's cwd**. That's the gap here, and
it's orthogonal to the shell-cwd labeling fixed in #269/#332.

## Current behavior (reproduced on v0.6.4, latest release)

Real `claude` agent pane:

```jsonc
// herdr pane.get / agent.list
{ "agent": "claude", "agent_status": "working", "cwd": "/home/stephan" }
// the agent process actually owning that terminal:
//   readlink /proc/<agent-pid>/cwd  ->  /home/stephan/.../<the-real-project>
```

Minimal deterministic repro on a herdr-**native** pane (rules out any external
pty/mirroring) — launch a process whose cwd diverges from its launch dir:

```bash
herdr agent start probe --cwd /tmp -- \
  python3 -c 'import os,sys; os.chdir("/usr"); sys.stdin.read()'

herdr pane get <pane_id>          # => "cwd":"/tmp"
readlink /proc/<probe-pid>/cwd    # => /usr   (the process is really in /usr)
```

Verified on v0.6.4: the process's real cwd was `/usr`, herdr's API reported
`/tmp`. The shell-derived value never moves because a non-shell foreground
process emits no `OSC 7`.

## Desired change

Make a pane's reported `cwd` reflect the directory of the PTY's **foreground
process group leader** (the process actually in control of the terminal). When
the shell is at a prompt the foreground process *is* the shell, so plain shell
panes are unchanged; when an agent is running, you get the agent's cwd.

Two options, not mutually exclusive:

1. **(Preferred) herdr resolves the foreground cwd itself.** herdr already
   obtains the foreground pgid via `tcgetpgrp(master_fd)` for agent detection
   (#300), so it has the leader PID — it just needs to read that leader's cwd:
   - Linux: `std::fs::read_link("/proc/{pid}/cwd")`
   - macOS: `proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, …)` (libproc) — the
     `foreground_job()` path from #100
   Use this as the canonical `cwd` (it's correct for any foreground program),
   falling back to the shell/`OSC 7` value only when the platform lookup is
   unavailable. This is a small extension of machinery that already exists.

2. **(Minimal) expose the PID(s) in `pane_info`.** Add `pid` and/or
   `foreground_pid` to `pane.get` / `pane.list` / `agent.list` so consumers can
   resolve cwd (and more) themselves. Today there is **no key at all** linking a
   pane to its OS process, so external tools can't even work around it.

Option 1 is the real fix; option 2 is a cheap, low-risk improvement that also
unblocks integrations regardless.

## Why this belongs in herdr

herdr is a terminal workspace manager **for AI coding agents** — and agent panes
are exactly the foreground-process case the shell-cwd path misses. "Which
directory is this agent working in?" is a first-class question for agent
workflows (file viewers, repo/branch context, "open folder", routing), and herdr
is the only component positioned to answer it accurately, because it holds the
PTY and the foreground PID.

## What it affects

- **Socket API / data model:** `cwd` semantics on `pane.*` / `agent.*` become
  accurate for foreground processes (same field, no breaking shape change).
  Option 2 adds fields.
- **Workflow / integrations:** anything consuming `pane.cwd` becomes correct for
  agent panes.
- **UI:** if herdr surfaces pane cwd in its own UI it becomes accurate there too;
  no new visual language or interaction model.

## Environment

- herdr 0.6.4 (protocol 11) — latest release at time of writing
- Linux 6.8 (x86_64); confirmed on a herdr-native pane (not an attached/mirrored pty)

## Notes for implementation

- The distinction that matters is **foreground process group leader vs session
  leader (shell)**: reading the shell's `/proc/<pid>/cwd` still returns the
  launch dir; it must be the fg pgrp leader (`tcgetpgrp`).
- For multi-process groups (e.g. `sh -c claude`), walk to the deepest/most
  specific member, as #300 already contemplates for transitions.
- Resolution can be lazy (on `pane.get`/`pane.list`) to avoid overhead, or
  refreshed on focus; `OSC 7` remains a fine fast-path hint, with the process
  cwd as source of truth when they diverge.

/i-intend-to-pr
