package main

import (
	"os/exec"
	"strings"
	"testing"
	"time"
)

// requireTmux skips the test when tmux isn't installed, and points lassoDir at a
// throwaway dir so the test drives its OWN private tmux server socket (never the
// user's). The server is killed on cleanup.
func requireTmux(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not installed")
	}
	t.Setenv("LASSO_DIR", t.TempDir())
	t.Setenv("HOME", t.TempDir()) // isolate from the real herdr session.json (migrateV2)
	t.Cleanup(func() { _ = tmux("kill-server") })
}

func TestTmuxSessionLifecycle(t *testing.T) {
	requireTmux(t)
	s := tabSession("test1")
	if err := tmuxNewSession(s, t.TempDir(), []string{"LASSO_TAB_ID=test1"}); err != nil {
		t.Fatalf("new-session: %v", err)
	}
	if !tmuxHasSession(s) {
		t.Fatal("session not present after create")
	}
	if got := tmuxListSessions(); len(got) != 1 || got[0] != s {
		t.Fatalf("list-sessions = %v, want [%s]", got, s)
	}
	if err := tmuxKillSession(s); err != nil {
		t.Fatalf("kill-session: %v", err)
	}
	if tmuxHasSession(s) {
		t.Fatal("session still present after kill")
	}
}

func TestTmuxSendLineAndCapture(t *testing.T) {
	requireTmux(t)
	s := tabSession("test2")
	if err := tmuxNewSession(s, t.TempDir(), nil); err != nil {
		t.Fatalf("new-session: %v", err)
	}
	defer tmuxKillSession(s)
	// A shell needs a moment to be ready for input.
	tmuxWaitReady(s)
	if err := tmuxSendLine(s, "echo hello-from-tmux-test"); err != nil {
		t.Fatalf("send-line: %v", err)
	}
	// Poll the screen for the echoed output.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		out, _ := tmuxCapture(s)
		if strings.Contains(out, "hello-from-tmux-test") {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	out, _ := tmuxCapture(s)
	t.Fatalf("echoed text not found in capture:\n%s", out)
}

func TestTmuxEnvVar(t *testing.T) {
	requireTmux(t)
	s := tabSession("test3")
	if err := tmuxNewSession(s, t.TempDir(), []string{"LASSO_TAB_ID=test3"}); err != nil {
		t.Fatalf("new-session: %v", err)
	}
	defer tmuxKillSession(s)
	out, err := tmuxOut("show-environment", "-t", s, "LASSO_TAB_ID")
	if err != nil {
		t.Fatalf("show-environment: %v", err)
	}
	if strings.TrimSpace(out) != "LASSO_TAB_ID=test3" {
		t.Fatalf("env = %q, want LASSO_TAB_ID=test3", strings.TrimSpace(out))
	}
}

func TestComposerEmpty(t *testing.T) {
	box := func(inner string) string {
		return "some output above\n" +
			"────────────────────\n" +
			inner + "\n" +
			"────────────────────\n" +
			" footer status line"
	}
	if !composerEmpty(box("❯ ")) {
		t.Error("empty composer (just prompt) should be empty")
	}
	if composerEmpty(box("❯ write a haiku")) {
		t.Error("composer with a draft should NOT be empty")
	}
	if composerEmpty("no rule lines at all here") {
		t.Error("missing composer geometry should return false (not-empty)")
	}
}
