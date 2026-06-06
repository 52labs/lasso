package main

import (
	"context"
	"os"
	"strings"
	"time"
)

// Startup reconciliation between the saved workspace/tab tree (SQLite) and the
// live tmux sessions on lasso's server. Across a lasso restart/upgrade the tmux
// server keeps running, so a tab's session is still live and just gets
// reattached. Across a full reboot the tmux server is gone; we restore the tree
// from the DB and recreate FRESH SHELLS in each tab's saved cwd on first attach —
// we never auto-relaunch agents (the user restarts them).

// reconcileTabs runs once at boot. It retires tabs whose working directory is
// gone (a deleted worktree) and kills orphan lasso_* sessions that no live tab
// claims (crash leftovers). It does NOT pre-create sessions — that's lazy, via
// ensureTabSession on first attach, so boot doesn't spawn dozens of shells.
func reconcileTabs() {
	tabs, err := allLiveTabs()
	if err != nil {
		return
	}
	want := map[string]bool{}
	for _, t := range tabs {
		session := tabSession(t.ID)
		// Retire a tab whose directory no longer exists (e.g. the worktree was
		// removed) so it doesn't linger in the sidebar pointing at nothing.
		if t.Cwd != "" {
			if _, err := os.Stat(t.Cwd); os.IsNotExist(err) {
				_ = closeTab(t.ID)
				_ = tmuxKillSession(session)
				continue
			}
		}
		want[session] = true
	}
	for _, s := range tmuxListSessions() {
		if strings.HasPrefix(s, "lasso_") && !want[s] {
			_ = tmuxKillSession(s)
		}
	}
}

// ensureTabSession returns a tab's tmux session, creating a fresh shell in the
// tab's saved cwd if the session isn't live (after a reboot the tmux server is
// gone). Agents are NOT relaunched — a recreated tab is a bare shell. Called by
// the per-tab ttyd attach path so sessions come back lazily on first view.
func ensureTabSession(tabID string) (string, error) {
	session := tabSession(tabID)
	if tmuxHasSession(session) {
		return session, nil
	}
	tab, err := getTab(tabID)
	if err != nil {
		return "", err
	}
	cwd := tab.Cwd
	if cwd == "" {
		cwd, _ = os.UserHomeDir()
	} else if _, err := os.Stat(cwd); err != nil {
		// Saved dir is gone — fall back to home so new-session doesn't fail.
		cwd, _ = os.UserHomeDir()
	}
	if err := tmuxNewSession(session, cwd, []string{"LASSO_TAB_ID=" + tabID}); err != nil {
		return "", err
	}
	return session, nil
}

// cwdSaver periodically persists each live tab's current working directory, so a
// post-reboot recreated shell lands where the user actually was, not the original
// launch dir. Only writes when the cwd changed, to keep DB churn low.
func cwdSaver(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			tabs, err := allLiveTabs()
			if err != nil {
				continue
			}
			for _, tab := range tabs {
				session := tabSession(tab.ID)
				if !tmuxHasSession(session) {
					continue
				}
				cur, err := tmuxCurrentPath(session)
				if err != nil || cur == "" || cur == tab.Cwd {
					continue
				}
				_ = setTabCwd(tab.ID, cur)
			}
		}
	}
}
