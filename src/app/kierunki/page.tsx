"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Direction } from "@/lib/ai/expand-queries";

type Preview = { titles: string[]; skills: string[]; total: number };

export default function KierunkiPage() {
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  const apply = (j: { directions?: Direction[]; preview?: Preview }) => {
    if (j.directions) setDirs(j.directions);
    if (j.preview) setPreview(j.preview);
  };

  useEffect(() => {
    fetch("/api/expand").then((r) => r.json()).then(apply).catch(() => {});
    fetch("/api/profile").then((r) => r.json())
      .then((p) => setHasProfile((p.experience?.length ?? 0) > 0 || (p.skills?.length ?? 0) > 0))
      .catch(() => {});
  }, []);

  const propose = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/expand", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      apply(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggle = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/expand", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    apply(await r.json());
  };

  const on = dirs.filter((d) => d.accepted).length;

  return (
    <div className="wrap">
      <header className="hero" style={{ paddingBottom: 24 }}>
        <span className="mark" />
        <h1>Kierunki zawodowe</h1>
        <p className="lede">
          Odpowiedź na pytanie „jakie stanowisko wpisać w wyszukiwarkę”.
          <strong> Zaznaczone nazwy trafiają do wyszukiwania, odznaczone są pomijane.</strong>
        </p>
      </header>

      {err && <div className="alert err">{err}</div>}

      {!hasProfile ? (
        <div className="empty-state">
          <h2>Najpierw potrzebny jest profil</h2>
          <p>Bez wiedzy o Twoim doświadczeniu nie ma z czego proponować kierunków.</p>
          <p style={{ marginTop: 18 }}><Link href="/">Wgraj CV →</Link></p>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <button onClick={propose} disabled={busy}>
              {busy ? <><span className="spin" /> Analizuję profil…</> : dirs.length ? "Zaproponuj ponownie" : "Zaproponuj kierunki"}
            </button>
            {dirs.length > 0 && (
              <>
                <button className="ghost mini" onClick={() => toggle({ all: true, accepted: true })}>Zaznacz wszystkie</button>
                <button className="neutral mini" onClick={() => toggle({ all: true, accepted: false })}>Odznacz wszystkie</button>
              </>
            )}
          </div>

          {dirs.length > 0 && (
            <div className={`alert ${on === 0 ? "err" : "info"}`}>
              {on === 0 ? (
                <><strong>Nie zaznaczyłaś żadnego kierunku.</strong> Wyszukiwanie nic nie znajdzie — zaznacz przynajmniej jeden.</>
              ) : (
                <>
                  <strong>Szukam pod {on} {on === 1 ? "nazwą" : "nazwami"}.</strong>{" "}
                  Odznaczone są pomijane w całości.
                  {preview && preview.total > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary>Zobacz dokładnie, o co system zapyta portale ({preview.total} fraz)</summary>
                      <div style={{ marginTop: 8 }}>
                        <div className="block-title">Po nazwach stanowisk</div>
                        <div className="row" style={{ gap: 5 }}>
                          {preview.titles.map((t) => <span key={t} className="pill">{t}</span>)}
                        </div>
                        {preview.skills.length > 0 && (
                          <>
                            <div className="block-title" style={{ marginTop: 12 }}>Po wymaganiach — łapie oferty o mylącej nazwie</div>
                            <div className="row" style={{ gap: 5 }}>
                              {preview.skills.map((t) => <span key={t} className="pill market">{t}</span>)}
                            </div>
                          </>
                        )}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}

          {dirs.map((d) => (
            <div key={d.id} className={`dir ${d.accepted ? "on" : "off"}`}>
              <label className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", gap: 12 }}>
                <input
                  type="checkbox" checked={d.accepted} style={{ width: 17, height: 17, flex: "none", marginTop: 4 }}
                  onChange={(e) => toggle({ id: d.id, accepted: e.target.checked })}
                />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <strong>{d.pl}</strong>
                    <span className={`pill ${d.stretch === "core" ? "strong" : d.stretch === "adjacent" ? "good" : "stretch"}`}>
                      {d.stretch === "core" ? "to już umiesz" : d.stretch === "adjacent" ? "blisko" : "ambitne"}
                    </span>
                    {d.origin.includes("market") && <span className="pill market">z rynku</span>}
                  </div>
                  {d.variants.length > 0 && <div className="variants">{d.variants.join(" · ")}</div>}
                  <div className="why">{d.why}</div>
                </div>
              </label>
            </div>
          ))}

          {dirs.length > 0 && (
            <p className="muted" style={{ marginTop: 20 }}>
              Domyślnie zaznaczone są kierunki blisko Twojego doświadczenia. „Ambitne” zostają
              odznaczone — możesz je włączyć, ale wyniki będą wtedy luźniejsze.
              <br />Gotowe? <Link href="/oferty">Przejdź do wyszukiwania →</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
