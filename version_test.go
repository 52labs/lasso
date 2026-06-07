package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// callVersion drives serveVersion and decodes the payload.
func callVersion(t *testing.T) versionInfo {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	rec := httptest.NewRecorder()
	serveVersion(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	var vi versionInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &vi); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return vi
}

// TestVersionReportsLassoVersion: /api/version always reports lasso's own
// version, regardless of update availability.
func TestVersionReportsLassoVersion(t *testing.T) {
	vi := callVersion(t)
	if vi.LassoVersion == "" {
		t.Errorf("lasso_version should be set, got %+v", vi)
	}
	if vi.LassoVersion != lassoVersion() {
		t.Errorf("lasso_version = %q, want %q", vi.LassoVersion, lassoVersion())
	}
}
