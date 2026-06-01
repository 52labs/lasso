package main

import (
	"io"
	"os"
	"path/filepath"
	"testing"
)

// fakeCreateBackend embeds the Backend interface (nil) and overrides only
// Create. moveAttachments must reach the destination through Create alone;
// touching any other method (e.g. the old Rename/Open path) panics on the nil
// interface, which is exactly the regression we want to catch.
type fakeCreateBackend struct {
	Backend
	created map[string]bool
}

func (f *fakeCreateBackend) Create(p string) (io.WriteCloser, error) {
	f.created[p] = true
	return os.Create(p)
}

// moveAttachments stages on the lasso-local disk but writes to the (possibly
// remote) work dir via the active backend. This guards that it reads the local
// staging file and streams it out through Create — never via Rename/Open, which
// resolve on the remote host and would drop every attachment.
func TestMoveAttachmentsWritesThroughBackend(t *testing.T) {
	base := t.TempDir()
	t.Setenv("LASSO_DIR", base)

	// Stage two uploads exactly as serveAgentUpload would (local os.*).
	uploadID := "upl123"
	staging := filepath.Join(lassoUploadsDir(), uploadID)
	if err := os.MkdirAll(staging, 0o755); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{"spec.md": "# spec", "diagram.txt": "a->b"}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(staging, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	// A destination standing in for the agent's work dir on the active backend.
	dest := filepath.Join(base, "workdir")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}

	fake := &fakeCreateBackend{created: map[string]bool{}}
	moveAttachments(fake, uploadID, []string{"spec.md", "diagram.txt"}, dest)

	for name, want := range files {
		dst := filepath.Join(dest, name)
		if !fake.created[dst] {
			t.Errorf("%s was not written through the backend's Create", name)
		}
		got, err := os.ReadFile(dst)
		if err != nil {
			t.Errorf("read %s: %v", name, err)
			continue
		}
		if string(got) != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}

	// Staging is cleared after a successful move.
	if _, err := os.Stat(staging); !os.IsNotExist(err) {
		t.Errorf("staging dir should be removed, stat err = %v", err)
	}
}

// A nil/empty upload must be a no-op (and must not panic on the nil backend).
func TestMoveAttachmentsNoopWhenEmpty(t *testing.T) {
	t.Setenv("LASSO_DIR", t.TempDir())
	fake := &fakeCreateBackend{created: map[string]bool{}}
	moveAttachments(fake, "", nil, t.TempDir())
	moveAttachments(fake, "upl", nil, t.TempDir())
	if len(fake.created) != 0 {
		t.Errorf("expected no writes, got %v", fake.created)
	}
}
