"use client";

import { useState } from "react";

/**
 * POLE, KTÓRE MOŻNA POPRAWIĆ
 *
 * Realizuje zasadę z założeń projektu: AI nie zgaduje, tylko proponuje,
 * a ostatnie słowo ma człowiek.
 *
 * Każde pole pokazuje poziom pewności. Wpisanie własnej wartości podnosi go
 * do "potwierdzone" — i od tego momentu żadna kolejna analiza CV tego
 * nie nadpisze po cichu.
 */

export const CONF_LABEL: Record<string, string> = {
  confirmed: "potwierdzone przez Ciebie",
  high: "pewne",
  medium: "prawdopodobne",
  low: "niepewne",
  missing: "brak",
};

export function Confidence({ level }: { level: string }) {
  if (level === "high" || level === "confirmed") {
    return <span className={`conf ${level}`}>{level === "confirmed" ? "✓ Twoje" : "✓"}</span>;
  }
  return <span className={`conf ${level}`}>{CONF_LABEL[level] ?? level}</span>;
}

export default function EditableField({
  label, fieldId, value, confidence, evidence, placeholder, onSaved,
}: {
  label: string;
  fieldId: string;
  value: string | null;
  confidence?: string;
  evidence?: string | null;
  placeholder?: string;
  onSaved: (updated: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/profile/field", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId, value: draft }),
      });
      const j = await r.json();
      if (r.ok) { onSaved(j); setEditing(false); }
    } finally { setSaving(false); }
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-body">
        {editing ? (
          <div className="field-edit">
            <input
              autoFocus value={draft} placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
              }}
            />
            <button className="mini" onClick={save} disabled={saving}>{saving ? "…" : "Zapisz"}</button>
            <button className="mini neutral" onClick={() => { setDraft(value ?? ""); setEditing(false); }}>Anuluj</button>
          </div>
        ) : (
          <>
            <div
              className={`field-value ${value ? "" : "empty"}`}
              onClick={() => { setDraft(value ?? ""); setEditing(true); }}
              title="Kliknij, żeby poprawić"
            >
              <span>{value || placeholder || "kliknij, żeby uzupełnić"}</span>
              {confidence && <Confidence level={confidence} />}
            </div>
            {evidence && <div className="evidence">źródło w CV: „{evidence.slice(0, 90)}{evidence.length > 90 ? "…" : ""}”</div>}
          </>
        )}
      </div>
    </div>
  );
}
