package main

import (
	"strings"
	"testing"
)

// agentPrompt must lead with the title so the agent always knows what it's
// building — a description alone (or none) left earlier agents working blind.
func TestAgentPromptLeadsWithTitle(t *testing.T) {
	cases := []struct {
		name string
		rec  AgentRecord
		want string
	}{
		{
			name: "title only",
			rec:  AgentRecord{Title: "Add dark mode"},
			want: "Add dark mode",
		},
		{
			name: "title + description",
			rec:  AgentRecord{Title: "Add dark mode", Description: "toggle in settings"},
			want: "Add dark mode: toggle in settings",
		},
		{
			name: "notes + attachments appended",
			rec: AgentRecord{
				Title:       "Add dark mode",
				Notes:       "see thread",
				Attachments: []string{"a.png", "b.png"},
			},
			want: "Add dark mode\n\nSee NOTES.md for additional notes.\n\nAttachments: a.png, b.png",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := agentPrompt(c.rec); got != c.want {
				t.Errorf("agentPrompt = %q, want %q", got, c.want)
			}
		})
	}
}

// In plan mode claude must get --allow-dangerously-skip-permissions, NOT the
// plain --dangerously-skip-permissions: the latter forces bypass mode and
// silently overrides --permission-mode plan, so the agent never plans.
func TestAgentCommandPlanModeFlags(t *testing.T) {
	plan := agentCommand("claude", true, "do it")
	if !strings.Contains(plan, "--permission-mode plan") {
		t.Errorf("plan command missing --permission-mode plan: %q", plan)
	}
	if !strings.Contains(plan, "--allow-dangerously-skip-permissions") {
		t.Errorf("plan command must use --allow-dangerously-skip-permissions: %q", plan)
	}
	// The bypass-forcing flag would override plan mode; it must not appear as a
	// standalone token (it's a prefix of the --allow- variant, so match a space).
	if strings.Contains(plan, " --dangerously-skip-permissions") {
		t.Errorf("plan command must not force bypass mode: %q", plan)
	}

	def := agentCommand("claude", false, "do it")
	if !strings.Contains(def, "--dangerously-skip-permissions") ||
		strings.Contains(def, "--permission-mode") {
		t.Errorf("default command should bypass permissions without plan: %q", def)
	}
}
