package main

import "testing"

func TestParseStatus(t *testing.T) {
	out := parseStatus(" M index.html\n?? new.txt\nA  staged.go\n D gone.txt\nR  old.go -> renamed.go\n")
	want := []diffFile{
		{Path: "index.html", Status: "modified", Staged: false},
		{Path: "new.txt", Status: "untracked", Staged: false},
		{Path: "staged.go", Status: "added", Staged: true},
		{Path: "gone.txt", Status: "deleted", Staged: false},
		{Path: "renamed.go", Status: "renamed", Staged: true},
	}
	if len(out) != len(want) {
		t.Fatalf("got %d files, want %d: %+v", len(out), len(want), out)
	}
	for i, w := range want {
		if out[i] != w {
			t.Errorf("file %d: got %+v, want %+v", i, out[i], w)
		}
	}
}
