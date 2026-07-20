package main

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// herdrEchoSock starts a one-shot herdr-shaped server on a unix socket that waits
// delay before answering, so a test can pin down which read deadline applied.
func herdrEchoSock(t *testing.T, delay time.Duration) string {
	t.Helper()
	// Not t.TempDir(): its path blows past the ~104-byte sockaddr_un limit on
	// macOS, so the bind fails with EINVAL.
	dir, err := os.MkdirTemp("/tmp", "lasso-t")
	if err != nil {
		t.Fatalf("tempdir: %v", err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	sock := filepath.Join(dir, "h.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				if _, err := bufio.NewReader(conn).ReadBytes('\n'); err != nil {
					return
				}
				time.Sleep(delay)
				conn.Write([]byte(`{"id":"ui","result":{"ok":true}}` + "\n"))
			}()
		}
	}()
	return sock
}

func TestHerdrTimeoutForSlowMutations(t *testing.T) {
	// worktree/workspace mutations shell out to git and routinely outlast the
	// read default; everything else keeps the snappy default.
	for _, m := range []string{"worktree.create", "worktree.remove", "workspace.create"} {
		if got := herdrTimeoutFor(m); got <= herdrReadTimeout {
			t.Errorf("herdrTimeoutFor(%q) = %v, want > %v", m, got, herdrReadTimeout)
		}
	}
	for _, m := range []string{"pane.read", "pane.list", "ping", "agent.list"} {
		if got := herdrTimeoutFor(m); got != herdrReadTimeout {
			t.Errorf("herdrTimeoutFor(%q) = %v, want %v", m, got, herdrReadTimeout)
		}
	}
}

// A worktree.create that takes longer than the read default must still succeed —
// this is the regression that surfaced as a 502 from the New Agent modal.
func TestHerdrCallSockSlowMethodOutlastsReadDefault(t *testing.T) {
	sock := herdrEchoSock(t, herdrReadTimeout+500*time.Millisecond)

	res, err := herdrCallSock(sock, "worktree.create", map[string]any{"branch": "x"})
	if err != nil {
		t.Fatalf("worktree.create past the read default: %v", err)
	}
	var got struct {
		OK bool `json:"ok"`
	}
	if err := json.Unmarshal(res, &got); err != nil || !got.OK {
		t.Fatalf("result = %s (err %v), want ok:true", res, err)
	}

	// The same delay on a cheap read still trips the default deadline.
	if _, err := herdrCallSock(sock, "pane.read", map[string]any{}); err == nil {
		t.Fatal("pane.read past the read default: got nil error, want timeout")
	}
}
