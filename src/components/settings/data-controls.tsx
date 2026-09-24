"use client";

/**
 * Export and deletion.
 *
 * The endpoints existed but nothing called them, so there was no way for a
 * user to get their data out or to remove it. For a product holding
 * reflections, chat transcripts and crisis events, both are requirements
 * rather than conveniences.
 *
 * Deletion asks the user to type the word. A single click is too cheap for an
 * action that cannot be undone.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, AlertTriangle } from "lucide-react";

const CONFIRM_WORD = "DELETE";

export function DataControls() {
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `mettle-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("We couldn't build your export. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== CONFIRM_WORD) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Deletion failed");
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
      setDeleting(false);
    }
  };

  return (
    <section className="card" style={{ padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 650, margin: "0 0 4px" }}>Your data</h2>
        <p className="mind-sub">
          Everything we hold about you, on request. Both actions apply to your account only.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", minHeight: 44 }}
        >
          <Download size={15} aria-hidden="true" />
          {exporting ? "Preparing…" : "Download everything"}
        </button>
        <p className="mind-sub" style={{ fontSize: "0.78rem" }}>
          A single JSON file: goals, tasks, plans, state readings, reflections and
          conversations.
        </p>
      </div>

      <div style={{ paddingTop: 16, borderTop: "1px solid var(--border-color)" }}>
        {!confirmOpen ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
                minHeight: 44,
                width: "100%",
                padding: "12px 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--accent-danger)",
                background: "transparent",
                color: "var(--accent-danger)",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              Delete my account
            </button>
            <p className="mind-sub" style={{ fontSize: "0.78rem", marginTop: 8 }}>
              Removes your data permanently. This cannot be undone.
            </p>
          </>
        ) : (
          <div
            role="group"
            aria-label="Confirm account deletion"
            style={{
              padding: 16,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--accent-danger)",
              background: "rgba(226, 75, 74, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <p
              style={{
                margin: 0,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: "0.875rem",
                lineHeight: 1.55,
              }}
            >
              <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                This deletes your goals, plans, state readings, reflections and every
                conversation. It cannot be undone. Export first if you want a copy.
              </span>
            </p>

            <div>
              <label htmlFor="confirm-delete" style={{ display: "block", fontSize: "0.8rem", marginBottom: 6 }}>
                Type <strong>{CONFIRM_WORD}</strong> to confirm
              </label>
              <input
                id="confirm-delete"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="input-field"
                autoComplete="off"
                style={{ width: "100%", padding: "10px 14px" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={confirmText !== CONFIRM_WORD || deleting}
                style={{
                  flex: 1,
                  minHeight: 44,
                  minWidth: 140,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background:
                    confirmText === CONFIRM_WORD ? "var(--accent-danger)" : "var(--bg-secondary)",
                  color: confirmText === CONFIRM_WORD ? "#fff" : "var(--text-muted)",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: confirmText === CONFIRM_WORD && !deleting ? "pointer" : "not-allowed",
                }}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmText("");
                  setError(null);
                }}
                disabled={deleting}
                className="btn-secondary"
                style={{ flex: 1, minHeight: 44, minWidth: 100 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mind-error">
          {error}
        </p>
      )}
    </section>
  );
}
