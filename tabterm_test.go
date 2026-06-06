package main

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestTmuxAttachArgv(t *testing.T) {
	t.Setenv("LASSO_DIR", t.TempDir())
	argv := tmuxAttachArgv("lasso_abc")
	joined := strings.Join(argv, " ")
	// Must always carry our private socket + no-user-config, and attach the session.
	if argv[0] != "tmux" || !strings.Contains(joined, "-S "+lassoTmuxSock()) ||
		!strings.Contains(joined, "-f /dev/null") || !strings.Contains(joined, "attach -t lasso_abc") {
		t.Fatalf("attach argv missing required parts: %q", joined)
	}
}

// TestTabTermSpawns spawns a real ttyd attached to a tab's tmux session and
// checks the proxy base + that releasing detaches the viewer while the session
// survives (the core persistence guarantee).
func TestTabTermSpawns(t *testing.T) {
	requireTmux(t)
	if _, err := exec.LookPath("ttyd"); err != nil {
		t.Skip("ttyd not installed")
	}
	if err := openDB(); err != nil {
		t.Fatalf("openDB: %v", err)
	}
	t.Cleanup(func() {
		if db != nil {
			db.Close()
			db = nil
		}
	})
	ctx, cancel := context.WithCancel(context.Background())
	srvCtx = ctx
	t.Cleanup(cancel)

	dir := t.TempDir()
	_ = insertWorkspace(Workspace{ID: "w1", Host: "local", Title: "x", WorkDir: dir, Kind: "scratch"})
	_ = insertTab(Tab{ID: "tt1", WorkspaceID: "w1", Cwd: dir, Kind: "shell"})

	base, err := ensureTabTerm("tt1")
	if err != nil {
		t.Fatalf("ensureTabTerm: %v", err)
	}
	if !strings.HasPrefix(base, "/tab-term/") {
		t.Fatalf("base = %q, want /tab-term/ prefix", base)
	}
	if !tmuxHasSession(tabSession("tt1")) {
		t.Fatal("tmux session should exist after ensureTabTerm")
	}
	// A second call reuses the same entry (keepalive), same base.
	if b2, _ := ensureTabTerm("tt1"); b2 != base {
		t.Fatalf("second ensureTabTerm = %q, want %q", b2, base)
	}

	releaseTabTerm("tt1")
	time.Sleep(200 * time.Millisecond)
	// Releasing only detaches the viewer; the tmux session must still be alive.
	if !tmuxHasSession(tabSession("tt1")) {
		t.Fatal("tmux session should survive a viewer release")
	}
}
