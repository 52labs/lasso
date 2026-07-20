package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestReapOrphanHerdrSSH(t *testing.T) {
	tmp := t.TempDir()
	mk := func(name string) string {
		dir := filepath.Join(tmp, name)
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "config"), []byte("Host *\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		return dir
	}

	deadDir := mk("herdr-ssh-999999999-0")                     // pid can't exist
	aliveDir := mk(fmt.Sprintf("herdr-ssh-%d-0", os.Getpid())) // our own pid: alive
	bogusDir := mk("herdr-ssh-bogus")                          // no pid segment
	nonNumeric := mk("herdr-ssh-12x-0")                        // unparsable pid
	unrelated := mk("some-other-dir")                          // wrong prefix entirely

	if got := reapOrphanHerdrSSH(context.Background(), tmp); got != 1 {
		t.Errorf("removed = %d, want 1", got)
	}
	if fileExists(deadDir) {
		t.Errorf("dead-owner dir %s should have been removed", deadDir)
	}
	for _, dir := range []string{aliveDir, bogusDir, nonNumeric, unrelated} {
		if !fileExists(dir) {
			t.Errorf("dir %s should have been left alone", dir)
		}
	}

	// A second pass finds nothing to do.
	if got := reapOrphanHerdrSSH(context.Background(), tmp); got != 0 {
		t.Errorf("second pass removed = %d, want 0", got)
	}
}
