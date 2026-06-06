package main

import (
	"testing"
	"time"
)

// TestPollOnceTracksTabs verifies the poller's bookkeeping: a live agent tab with
// no running session reads idle and lands in the cache; closing it drops it. This
// exercises liveAgentTabs → pollOnce → snapshot without needing a real agent
// (the detect heuristics are covered in detect_test.go).
func TestPollOnceTracksTabs(t *testing.T) {
	openTestDB(t)
	_ = appendAgent("local", AgentRecord{ID: "a1", Title: "T", Type: "scratch", Agent: "claude", WorkDir: "/x", CreatedAt: time.Now()})
	_ = insertWorkspace(Workspace{ID: "wa1", Host: "local", Title: "T", WorkDir: "/x", Kind: "scratch"})
	_ = insertTab(Tab{ID: "a1", WorkspaceID: "wa1", Title: "T", Cwd: "/x", Kind: "agent", AgentID: "a1"})

	if changed := agentStatuses.pollOnce(); !changed {
		t.Fatal("first poll of a new tab should report a change")
	}
	if got := agentStatuses.status("a1"); got != StatusIdle {
		t.Errorf("status = %q, want idle (no live session)", got)
	}
	if snap := agentStatuses.snapshot(); snap["a1"] != "idle" {
		t.Errorf("snapshot = %+v, want a1=idle", snap)
	}

	// Closing the tab removes it from the live set; the next poll drops the entry.
	_ = closeTab("a1")
	if changed := agentStatuses.pollOnce(); !changed {
		t.Fatal("dropping a closed tab should report a change")
	}
	if got := agentStatuses.status("a1"); got != StatusUnknown {
		t.Errorf("status after close = %q, want unknown (dropped)", got)
	}
}

func TestTreeSignatureChanges(t *testing.T) {
	openTestDB(t)
	base := treeSignature()
	_ = insertWorkspace(Workspace{ID: "w1", Host: "local", Title: "A", Kind: "scratch"})
	if treeSignature() == base {
		t.Error("signature should change after adding a workspace")
	}
	withWs := treeSignature()
	_ = renameWorkspace("w1", "renamed")
	if treeSignature() == withWs {
		t.Error("signature should change after a rename")
	}
}
