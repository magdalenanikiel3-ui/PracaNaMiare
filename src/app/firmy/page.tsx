"use client";

import { useEffect, useState } from "react";

type Company = { id: string; name: string; careerUrl: string; lastChecked: string | null; lastError: string | null; offerCount: number; failCount: number };
type Suggestion = { name: string; domain: string; why: string; size: string; careerUrl: string | null };

export default function FirmyPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const reload = () => fetch("/api/watchlist").then((r) => r.json()).then((d) => setCompanies(d.companies ?? []));
  useEffect(() => { reload().catch(() => {}); }, []);

  const call = async (action: string, extra: Record<string, string> = {}) => {
    const r = await fetch("/api/watchlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="wrap">
      <header className="hero" style={{ paddingBottom: 24 }}>
        <span className="mark" />
        <h1>Obserwowane firmy</h1>
        <p className="lede">
          Wskaż firmy, w których naprawdę chciałabyś pracować. System czyta ich zakładki
          „Kariera” i dokłada znalezione oferty do wyników. Ogłoszenia trafiają tam często
          <strong> zanim</strong> pojawią się na portalach, a część nigdy tam nie trafia.
        </p>
      </header>

      {err && <div className="alert err">{err}</div>}

      <section className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <button onClick={() => run("suggest", async () => setSuggestions((await call("suggest")).suggestions ?? []))} disabled={busy !== null}>
            {busy === "suggest" ? <><span className="spin" /> Szukam firm…</> : "Podpowiedz firmy do mojego profilu"}
          </button>
          {companies.length > 0 && (
            <button className="ghost" disabled={busy !== null}
              onClick={() => run("refresh", async () => setCompanies((await call("refresh")).companies ?? []))}>
              {busy === "refresh" ? <><span className="spin" /> Odczytuję…</> : "Sprawdź teraz wszystkie"}
            </button>
          )}
        </div>

        <div className="grid g2">
          <div>
            <label>Nazwa firmy</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Orlen" />
          </div>
          <div>
            <label>Adres zakładki Kariera</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://firma.pl/kariera" />
          </div>
        </div>
        <button className="mini" style={{ marginTop: 12 }} disabled={!name.trim() || !url.trim() || busy !== null}
          onClick={() => run("add", async () => { await call("add", { name: name.trim(), url: url.trim() }); setName(""); setUrl(""); await reload(); })}>
          {busy === "add" ? "Sprawdzam…" : "Dodaj firmę"}
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          Podaj adres prowadzący wprost do <strong>listy ogłoszeń</strong>, a nie do strony o firmie.
        </p>
      </section>

      {suggestions.length > 0 && (
        <section className="card">
          <h2>Propozycje</h2>
          <p className="lead">Dobrane do Twojego profilu i lokalizacji. Dodaj te, które Cię interesują.</p>
          {suggestions.map((s) => (
            <div key={s.name} className="dir">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <strong>{s.name}</strong>
                    <span className="pill">{s.size === "duza" ? "duża" : s.size === "srednia" ? "średnia" : "mała"}</span>
                    {!s.careerUrl && <span className="pill off">nie znaleziono zakładki Kariera</span>}
                  </div>
                  <div className="why">{s.why}</div>
                  {s.careerUrl && <div className="variants">{s.careerUrl}</div>}
                </div>
                <button className="mini" disabled={!s.careerUrl || busy !== null}
                  onClick={() => run("add", async () => {
                    await call("add", { name: s.name, url: s.careerUrl! });
                    setSuggestions((prev) => prev.filter((x) => x.name !== s.name));
                    await reload();
                  })}>Obserwuj</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {companies.length > 0 && (
        <section className="card">
          <h2>Obserwujesz ({companies.length})</h2>
          {companies.map((c) => (
            <div className="field" key={c.id}>
              <div className="field-body">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <strong>{c.name}</strong>
                      <span className={`pill ${c.offerCount ? "ok" : ""}`}>{c.offerCount} ofert</span>
                    </div>
                    <div className="variants">{c.careerUrl}</div>
                    {c.lastError && <div className="evidence" style={{ color: "var(--danger)" }}>⚠ {c.lastError}</div>}
                    {c.lastChecked && <div className="evidence">sprawdzono: {new Date(c.lastChecked).toLocaleString("pl-PL")}</div>}
                  </div>
                  <button className="mini neutral" disabled={busy !== null}
                    onClick={() => run("rm", async () => { await call("remove", { id: c.id }); await reload(); })}>Usuń</button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
