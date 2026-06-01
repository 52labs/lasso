package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"syscall"
)

// Lasso self-update. Unlike herdr (which runs on each host and is updated there
// via the host switcher's "Update"), lasso runs only on the local machine, as a
// pitchfork daemon. New features change behavior and can shift the herdr
// protocol lasso targets, so the host switcher also offers "Update lasso": pull
// the latest source and let the supervisor rebuild + restart it, bringing lasso
// in line with a host running a newer herdr.
//
// The prod install is a pitchfork daemon (default name "lasso") whose run script
// does `git checkout main; go build; exec ./lasso` from the source checkout. So
// updating is: `git pull --ff-only` in that checkout, then `pitchfork restart
// <daemon>` — the restart rebuilds the pulled code. The restart SIGTERMs this
// very process, so the updater must be fully detached to outlive it.

// lassoSrcDir is the source checkout to update: LASSO_SRC_DIR if set, else the
// directory holding the running binary (prod builds to <checkout>/lasso).
func lassoSrcDir() string {
	if d := os.Getenv("LASSO_SRC_DIR"); d != "" {
		return d
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(exe)
}

// lassoDaemon is the pitchfork daemon name to restart (override for non-default
// deployments via LASSO_PITCHFORK_DAEMON).
func lassoDaemon() string {
	if d := os.Getenv("LASSO_PITCHFORK_DAEMON"); d != "" {
		return d
	}
	return "lasso"
}

// lassoVersion reports this build's version from the Go-embedded VCS stamp
// (`go build` records vcs.revision/vcs.modified automatically). Falls back to
// "dev" when the stamp is absent (e.g. `go run`).
func lassoVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	var rev string
	var dirty bool
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	if rev == "" {
		return "dev"
	}
	if len(rev) > 12 {
		rev = rev[:12]
	}
	if dirty {
		rev += "-dirty"
	}
	return rev
}

// selfUpdateAvailable reports whether this looks like the supervised prod
// install: a git checkout supervised by a pitchfork daemon. Dev/worktree runs
// (no pitchfork, or running from `go run`) return false so the UI can hide the
// action and the endpoint can refuse cleanly.
func selfUpdateAvailable() bool {
	// Never self-update a dev instance: it's served by Vite with hot reload and
	// its binary often lives in a throwaway worktree, so a pull+restart would
	// rebuild the wrong tree (and bounce the prod daemon).
	if *devMode {
		return false
	}
	src := lassoSrcDir()
	if src == "" {
		return false
	}
	if _, err := os.Stat(filepath.Join(src, ".git")); err != nil {
		return false
	}
	pf, err := exec.LookPath("pitchfork")
	if err != nil {
		return false
	}
	// `pitchfork status <daemon>` exits non-zero if the daemon isn't registered.
	return exec.Command(pf, "status", lassoDaemon()).Run() == nil
}

// serveSelfUpdate kicks off a detached "git pull + pitchfork restart" so lasso
// rebuilds itself from the latest source. Returns immediately; the client sees
// the server bounce a moment later.
func serveSelfUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST required", http.StatusMethodNotAllowed)
		return
	}
	if !selfUpdateAvailable() {
		http.Error(w, "lasso isn't a self-updatable install here (no pitchfork-supervised git checkout) — "+
			"update it the way it was deployed", http.StatusConflict)
		return
	}
	src := lassoSrcDir()
	daemon := lassoDaemon()

	// One detached shell does the whole update. setsid + Setpgid put it in its
	// own session/process group so `pitchfork restart`, which kills this process,
	// can't take the updater down mid-flight. Output is discarded — the caller is
	// about to be restarted and pitchfork logs capture the rebuild.
	script := fmt.Sprintf(
		"git -C %s pull --ff-only && pitchfork restart %s",
		shellQuote(src), shellQuote(daemon))
	cmd := exec.Command("setsid", "sh", "-c", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	if err := cmd.Start(); err != nil {
		http.Error(w, "start updater: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Release so we don't leave a zombie when we're restarted out from under it.
	_ = cmd.Process.Release()

	writeJSON(w, map[string]any{"started": true, "src": src, "daemon": daemon})
}
