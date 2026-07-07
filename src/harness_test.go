package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeClaudeModel(t *testing.T) {
	cases := map[string]string{
		"opus":            "opus",
		"  sonnet  ":      "sonnet",
		"":                "",
		"default":         "", // Claude Code's "use account default" sentinel
		"Default":         "",
		"claude-opus-4-8": "claude-opus-4-8",
	}
	for in, want := range cases {
		if got := normalizeClaudeModel(in); got != want {
			t.Errorf("normalizeClaudeModel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestClaudeModelFromJSON(t *testing.T) {
	dir := t.TempDir()
	b := &localBackend{}

	write := func(name, body string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}

	if got := claudeModelFromJSON(b, filepath.Join(dir, "missing.json")); got != "" {
		t.Errorf("missing file: got %q, want empty", got)
	}
	if got := claudeModelFromJSON(b, write("no-model.json", `{"foo":"bar"}`)); got != "" {
		t.Errorf("absent key: got %q, want empty", got)
	}
	if got := claudeModelFromJSON(b, write("nonstring.json", `{"model":123}`)); got != "" {
		t.Errorf("non-string model: got %q, want empty", got)
	}
	if got := claudeModelFromJSON(b, write("garbage.json", `not json`)); got != "" {
		t.Errorf("garbage: got %q, want empty", got)
	}
	if got := claudeModelFromJSON(b, write("ok.json", `{"model":"opus"}`)); got != "opus" {
		t.Errorf("valid model: got %q, want opus", got)
	}
	if got := claudeModelFromJSON(b, write("default.json", `{"model":"default"}`)); got != "" {
		t.Errorf("default sentinel: got %q, want empty", got)
	}
}

// TestClaudeConfiguredModel exercises the full precedence against a temp HOME:
// ANTHROPIC_MODEL env > ~/.claude/settings.json > ~/.claude.json.
func TestClaudeConfiguredModel(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("ANTHROPIC_MODEL", "")
	b := &localBackend{}

	// Nothing configured anywhere → empty (Claude Code uses the account default).
	if got := claudeConfiguredModel(b); got != "" {
		t.Fatalf("no config: got %q, want empty", got)
	}

	// ~/.claude.json top-level model (the /model command's persisted choice).
	if err := os.WriteFile(filepath.Join(home, ".claude.json"), []byte(`{"model":"sonnet","other":1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := claudeConfiguredModel(b); got != "sonnet" {
		t.Fatalf(".claude.json: got %q, want sonnet", got)
	}

	// ~/.claude/settings.json wins over ~/.claude.json.
	claudeDir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), []byte(`{"model":"opus"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := claudeConfiguredModel(b); got != "opus" {
		t.Fatalf("settings.json precedence: got %q, want opus", got)
	}

	// ANTHROPIC_MODEL wins over the files.
	t.Setenv("ANTHROPIC_MODEL", "haiku")
	if got := claudeConfiguredModel(b); got != "haiku" {
		t.Fatalf("env precedence: got %q, want haiku", got)
	}
}
