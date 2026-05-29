<!--
Draft GitHub issue for ogulcancelik/herdr.
Per CONTRIBUTING.md, keep `/i-intend-to-pr` at the bottom only if you actually
plan to implement it (a maintainer then replies `/approve`). Remove that line to
file as a pure report/proposal.
-->

# `pane.cwd` is stale for agent panes — track the foreground process group's cwd

## Summary

A pane's reported `cwd` reflects the **shell's** working directory, not the
directory of whatever process currently owns the terminal. The moment a
long-running foreground program (an AI coding agent, an editor, any TUI) takes
over the PTY, the shell stops emitting `OSC 7`, so `pane.cwd` freezes at the
shell's last-known directory — typically the dir the shell was launched in. For
agent panes this is usually wrong, which breaks any tooling that asks herdr
"what directory is this pane working in?"

## Current behavior

`pane.list` / `pane.get` / `agent.list` return a `cwd` that tracks the shell via
`OSC 7`. For an interactive shell sitting at a prompt this is accurate and live
(e.g. it follows `cd` into subdirectories). But for a pane running an agent, the
agent process is the terminal's foreground process and its working directory is
not reflected.

Observed on a real `claude` agent pane:

```jsonc
// herdr pane.get
{ "pane_id": "…", "agent": "claude", "agent_status": "working",
  "cwd": "/home/stephan" }            // shell's launch dir

// the agent process actually owning that terminal:
//   readlink /proc/<agent-pid>/cwd  ->  /home/stephan/projects/<the-real-project>
```

`cwd` says `/home/stephan`; the agent is working in a project directory. They
disagree because the shell launched in `$HOME`, then started the agent, and no
further `OSC 7` was emitted.

Minimal deterministic repro (no agent needed — any foreground process that
changes its own cwd without emitting `OSC 7`):

```bash
# inside a herdr pane:
cd /tmp                                          # OSC 7 fires -> herdr cwd = /tmp
python3 -c 'import os; os.chdir("/var"); input()'  # foreground proc cwd = /var, no OSC 7

# from anywhere:
herdr pane get <pane_id>                         # still reports "cwd":"/tmp", not "/var"
```

## Desired change

Make `pane.cwd` reflect the directory of the PTY's **foreground process group
leader** (the process actually in control of the terminal), rather than only the
shell's `OSC 7` value. When an agent is running, that's the agent's cwd; when the
shell is at a prompt, the foreground process *is* the shell, so behavior for
plain shell panes is unchanged.

Two options, not mutually exclusive:

1. **(Preferred — fully fixes it) herdr resolves the foreground cwd itself.**
   herdr already owns each pane's PTY master fd and child PID, so it can:
   - get the foreground process group of the pty master: `tcgetpgrp(master_fd)`;
   - read that leader's cwd:
     - Linux: `std::fs::read_link("/proc/{pgid}/cwd")`
     - macOS: `proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, …)` (libproc)
   - use this as the canonical `cwd`, falling back to the `OSC 7` value only when
     the platform lookup is unavailable.
   This requires no cooperation from the shell or the agent and is correct for
   every foreground program, not just agents.

2. **(Minimal — unblocks external tooling) expose the PID(s) in `pane_info`.**
   Add `pid` (the pane's leader) and/or `foreground_pid` to `pane.get` /
   `pane.list` / `agent.list`. Consumers can then resolve cwd (and anything else)
   themselves. This is a smaller, non-opinionated change; today there is **no
   key at all** linking a pane to its OS process, so external tools cannot do
   this even as a workaround.

Option 1 is the real fix; option 2 is a cheap, low-risk improvement that also
helps integrations regardless.

## Why this belongs in herdr

herdr is a terminal workspace manager **for AI coding agents** — and agent panes
are precisely the foreground-process case where `OSC 7` never fires. "Which
directory is this agent working in?" is a first-class question for agent
workflows (file viewers, repo/branch context, "open folder", routing), and
herdr is the only component positioned to answer it accurately, because it holds
the PTY and PID. Accurate per-pane cwd is core to the product's stated purpose,
not a niche edge case.

## What it affects

- **Socket API / data model:** `cwd` semantics on `pane.*` / `agent.*`
  (more accurate; same field, no breaking shape change). Option 2 adds fields.
- **Workflow / integrations:** anything consuming `pane.cwd` (external tools,
  agent routing) becomes correct for agent panes.
- **UI:** only if herdr surfaces pane cwd anywhere in its own UI — it would
  become accurate there too. No new visual language or interaction model.

## Environment

- herdr 0.6.4 (protocol 11)
- Linux 6.8 (x86_64)
- Agents launched as foreground processes within panes (e.g. `claude`).

## Notes for implementation

- The distinction that matters is **foreground process group leader vs session
  leader (shell)**: polling the shell's `/proc/<pid>/cwd` would still return the
  launch dir; it must be the fg pgrp (`tcgetpgrp`). Worth confirming against
  herdr's current pty/process handling.
- Resolution can be lazy (on `pane.get`/`pane.list`) rather than polled, to avoid
  overhead; or refreshed on focus events.
- `OSC 7` remains a useful fast-path/hint; the process cwd is the source of truth
  when they diverge.

<!-- Keep the next line only if you plan to implement this yourself: -->
/i-intend-to-pr
