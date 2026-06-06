package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Agent status tracking. Without herdr there's no event stream reporting agent
// state, so a single goroutine (statusPoller) scrapes each live agent tab's tmux
// pane on a tick and runs the detect.go heuristics. The result is cached here and
// read by the SSE hub, the sidebar API (/api/tree, /api/agents), and MCP tools.

// statusStore is the process-wide cache of per-tab agent status. lastWorking is
// kept per tab for Claude's working-hold deglitch (see detectAgentStatus).
type statusStore struct {
	mu sync.RWMutex
	m  map[string]*statusEntry // keyed by tab id
}

type statusEntry struct {
	status      AgentStatus
	lastWorking time.Time
}

var agentStatuses = &statusStore{m: map[string]*statusEntry{}}

// status returns a tab's last-detected status (StatusUnknown if never polled).
func (s *statusStore) status(tabID string) AgentStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if e := s.m[tabID]; e != nil {
		return e.status
	}
	return StatusUnknown
}

// snapshot returns a copy of tab→status for the SSE payload / API responses.
func (s *statusStore) snapshot() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]string, len(s.m))
	for id, e := range s.m {
		out[id] = string(e.status)
	}
	return out
}

// forget drops a tab's cached status (called when a tab is closed).
func (s *statusStore) forget(tabID string) {
	s.mu.Lock()
	delete(s.m, tabID)
	s.mu.Unlock()
}

// pollOnce scrapes every live agent tab and updates the cache, returning whether
// any status changed (so the caller can push an SSE frame). A tab whose tmux
// session is gone, or whose foreground is no longer the agent, reads as idle.
func (s *statusStore) pollOnce() bool {
	tabs, err := liveAgentTabs()
	if err != nil {
		return false
	}
	now := time.Now()
	changed := false
	live := map[string]bool{}
	for _, tab := range tabs {
		live[tab.ID] = true
		session := tabSession(tab.ID)
		var raw AgentStatus
		if !tmuxHasSession(session) || !isAgentCommand(tmuxForegroundCmd(session)) {
			// Session gone or the agent process exited → treat as idle.
			raw = StatusIdle
		} else {
			screen, err := tmuxCapture(session)
			if err != nil {
				continue
			}
			s.mu.RLock()
			e := s.m[tab.ID]
			var prev AgentStatus
			var lw time.Time
			if e != nil {
				prev, lw = e.status, e.lastWorking
			}
			s.mu.RUnlock()
			raw = detectAgentStatus(agentKind(tab.AgentID), screen, prev, &lw, now)
			s.mu.Lock()
			if s.m[tab.ID] == nil {
				s.m[tab.ID] = &statusEntry{}
			}
			s.m[tab.ID].lastWorking = lw
			s.mu.Unlock()
		}
		s.mu.Lock()
		if s.m[tab.ID] == nil {
			s.m[tab.ID] = &statusEntry{}
		}
		if s.m[tab.ID].status != raw {
			s.m[tab.ID].status = raw
			changed = true
		}
		s.mu.Unlock()
	}
	// Drop cache entries for tabs that are no longer live.
	s.mu.Lock()
	for id := range s.m {
		if !live[id] {
			delete(s.m, id)
			changed = true
		}
	}
	s.mu.Unlock()
	return changed
}

// statusPoller scans live agent tabs on a tick and kicks the hub when a status
// changes. It pauses while no browser is connected (no one to push to), so an
// idle lasso doesn't run capture-pane forever.
func statusPoller(ctx context.Context, h *hub) {
	t := time.NewTicker(*statusEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if h.clientCount() == 0 {
				continue
			}
			if agentStatuses.pollOnce() {
				h.kick()
			}
		}
	}
}

// treeSignature is a deterministic string of the workspace/tab tree (ids,
// titles, kinds, pin/closed state). The hub bumps PanesRev when it changes so the
// sidebar re-renders after a workspace/tab is created, renamed, pinned, or closed.
func treeSignature() string {
	wss, err := listWorkspaces("local")
	if err != nil {
		return ""
	}
	var sb strings.Builder
	for _, w := range wss {
		fmt.Fprintf(&sb, "%s:%s:%t|", w.ID, w.Title, w.Pinned)
		tabs, _ := listTabs(w.ID)
		for _, t := range tabs {
			fmt.Fprintf(&sb, "  %s:%s:%s;", t.ID, t.Title, t.Kind)
		}
	}
	return sb.String()
}
