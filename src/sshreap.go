package main

// Reaper for orphaned herdr SSH control masters.
//
// The left terminal runs `herdr --remote <host>` under ttyd, which spawns one
// herdr client per connected browser and kills it on disconnect. Each client
// opens a private OpenSSH control master (<tmp>/herdr-ssh-<pid>-<n>/ctl) that
// herdr only shuts down on clean exit — a killed client orphans the master,
// which keeps its TCP connection to the remote sshd alive indefinitely
// (herdr's generated ssh config adds ServerAlive keepalives, so it never goes
// stale). Every browser (re)connect to the terminal of a remote active host
// leaks one, and enough of them saturate the remote sshd into resetting new
// handshakes (kex_exchange_identification: Connection reset by peer).
//
// herdr is third-party and pinned, so lasso cleans up after it: a herdr-ssh
// dir whose owning pid is gone is garbage by definition — a live herdr only
// ever uses its own pid's dir — so ask the orphaned master to exit and remove
// the dir. Dirs whose pid is alive (any user's) are never touched.

import (
	"context"
	"errors"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const herdrSSHReapInterval = 30 * time.Second

// startHerdrSSHReaper reaps once at startup (clearing anything accumulated
// while lasso was down) and then on an interval until ctx is cancelled.
func startHerdrSSHReaper(ctx context.Context) {
	go func() {
		reapOrphanHerdrSSH(ctx, os.TempDir())
		t := time.NewTicker(herdrSSHReapInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				reapOrphanHerdrSSH(ctx, os.TempDir())
			}
		}
	}()
}

// reapOrphanHerdrSSH removes every herdr-ssh control dir in tmpDir whose
// owning process is dead, first asking its control master (if any) to exit so
// the sshd-side connection closes too. Returns how many dirs were removed.
func reapOrphanHerdrSSH(ctx context.Context, tmpDir string) (removed int) {
	dirs, _ := filepath.Glob(filepath.Join(tmpDir, "herdr-ssh-*"))
	for _, dir := range dirs {
		rest := strings.TrimPrefix(filepath.Base(dir), "herdr-ssh-")
		pidStr, _, ok := strings.Cut(rest, "-")
		if !ok {
			continue
		}
		pid, err := strconv.Atoi(pidStr)
		if err != nil || pid <= 0 || processAlive(pid) {
			continue
		}
		if ctl := filepath.Join(dir, "ctl"); fileExists(ctl) {
			// Ask the master to close down (this drops its TCP connection to
			// the remote sshd). The destination argument is required by ssh
			// but unused: -O talks to the master over the control socket only.
			octx, cancel := context.WithTimeout(ctx, 5*time.Second)
			_ = exec.CommandContext(octx, "ssh", "-o", "ControlPath="+ctl, "-O", "exit", "orphan").Run()
			cancel()
		}
		if err := os.RemoveAll(dir); err == nil {
			removed++
		}
	}
	if removed > 0 {
		log.Printf("sshreap:  cleaned %d orphaned herdr-ssh control dir(s)", removed)
	}
	return removed
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// processAlive reports whether pid exists. EPERM means it exists but belongs
// to another user — treated as alive so we never touch someone else's master.
func processAlive(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
