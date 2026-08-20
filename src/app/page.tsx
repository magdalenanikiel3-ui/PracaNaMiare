"use client";

import { useEffect, useState } from "react";
import type { MasterProfile } from "@/lib/profile/schema";
import type { Direction } from "@/lib/ai/expand-queries";
import type { Offer } from "@/lib/sources/types";
import type { Ranked } from "@/lib/matching/rerank";
import { BAND_LABEL } from "@/lib/matching/rerank";

type Mismatch = { flagged: boolean; requirementsFit: number; explanation: string | null };
type Company = { id: string; name: string; careerUrl: string; lastChecked: string | null; lastError: string | null; offerCount: number; failCount: number };
type Suggestion = { name: string; domain: string; why: string; size: string; careerUrl: string | null };
type Result = { offer: Offer; rough: number; matched: string[]; missing: string[]; mismatch: Mismatch; ranked: Ranked | null };
type SearchPayload = {
  results: Result[];
  gaps: { skill: string; blocksCount: number; share: number }[];
  discovered: { pl: string; why: string }[];
  hidden: { offerId: string; title: string; company: string | null; explanation: string | null }[];
  perSource: { id: string; label: string; count: number; ok: boolean; note?: string }[];
  stats: { found: number; afterPrefilter: number; rejected: number; reranked: number; queries: number; queriesByTitle: number; queriesBySkill: number; hiddenFound: number; ms: number } | null;
  rejectedSample?: { title: string; company: string | null; reason?: string }[];
};

export default function Page() {
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [dirs, setDirs] = useState<Direction[]>([]);
  const [search, setSearch] = useState<SearchPayload | null>(null);
  const [status, setStatus] = useState<{ sources: { id: string; label: string; ok: boolean; reason?: string; howToFix?: string; legalNote: string }[]; ai: { ok: boolean; name?: string; error?: string } } | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setProfile).catch(() => {});
    fetch("/api/expand").then((r) => r.json()).then((d) => setDirs(d.directions ?? [])).catch(() => {});
    fetch("/api/search").then((r) => r.json()).then((d) => d.stats && setSearch(d)).catch(() => {});
    fetch("/api/sources").then((r) => r.json()).then(setStatus).catch(() => {});
    fetch("/api/watchlist").then((r) => r.json()).then((d) => setCompanies(d.companies ?? [])).catch(() => {});
  }, []);

  const call = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  const upload = (file: File) => call("cv", async () => {
    const fd = new FormData();
    fd.append("cv", file);
    const r = await fetch("/api/profile", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Nie udało się przetworzyć CV.");
    setProfile(j);
    setDirs([]); setSearch(null);
  });

  const expand = () => call("expand", async () => {
    const r = await fetch("/api/expand", { method: "POST" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setDirs(j.directions);
  });

  const toggleDir = async (id: string, accepted: boolean) => {
    const r = await fetch("/api/expand", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accepted }),
    });
    const j = await r.json();
    setDirs(j.directions);
  };

  const savePrefs = (patch: Partial<MasterProfile["preferences"]>) => {
    if (!profile) return;
    const preferences = { ...profile.preferences, ...patch };
    setProfile({ ...profile, preferences });
    fetch("/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    }).catch(() => {});
  };

  const watchlist = async (action: string, extra: Record<string, string> = {}) => {
    const r = await fetch("/api/watchlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  };

  const suggestCompanies = () => call("suggest", async () => {
    const j = await watchlist("suggest");
    setSuggestions(j.suggestions ?? []);
  });

  const addCompany = async (name: string, url: string) => {
    await watchlist("add", { name, url });
    const r = await fetch("/api/watchlist").then((x) => x.json());
    setCompanies(r.companies ?? []);
    setSuggestions((prev) => prev.filter((s) => s.name !== name));
  };

  const removeCompany = async (id: string) => {
    await watchlist("remove", { id });
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  };

  const refreshCompanies = () => call("refresh", async () => {
    const j = await watchlist("refresh");
    setCompanies(j.companies ?? []);
  });

  const runSearch = () => call("search", async () => {
    const r = await fetch("/api/search", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setSearch(j);
  });

  const hasProfile = !!profile && (profile.experience.length > 0 || profile.skills.length > 0);
  const accepted = dirs.filter((d) => d.accepted !== false);

  return (
    <div className="wrap">
      <header className="hero">
        <span className="mark" />
        <h1>Praca na miarę</h1>
        <p className="lede">
          Wgraj CV, a resztę zrobi system: podpowie, pod jakimi nazwami szukać,
          przejrzy portale i pokaże oferty, na które sam(a) byś nie trafił(a) —
          razem z uzasadnieniem, dlaczego pasują.
        </p>
      </header>

      <nav className="progress">
        {[
          { n: 1, id: "cv", label: "CV", done: hasProfile },
          { n: 2, id: "kierunki", label: "Kierunki", done: dirs.length > 0 },
          { n: 3, id: "preferencje", label: "Preferencje", done: hasProfile },
          { n: 4, id: "firmy", label: "Firmy", done: companies.length > 0 },
          { n: 5, id: "szukaj", label: "Wyszukiwanie", done: !!search },
        ].map((s2) => (
          <a key={s2.id} href={`#${s2.id}`} className={s2.done ? "done" : ""}>
            <span className="dot">{s2.done ? "✓" : s2.n}</span>{s2.label}
          </a>
        ))}
      </nav>

      {status && !status.ai.ok && (
        <div className="alert err">
          <strong>Model AI nie jest skonfigurowany.</strong><br />{status.ai.error}
        </div>
      )}
      {err && <div className="alert err">{err}</div>}

      {/* ─── KROK 1 ─────────────────────────────────────────────────────── */}
      <section className="card" id="cv">
        <div className="step-head">
          <span className={`step-num ${hasProfile ? "done" : ""}`}>1</span>
          <h2>Twoje CV</h2>
        </div>

        {!hasProfile && (
          <p className="lead">
            Model przeanalizuje układ dokumentu, a nie tylko wyciągnięty tekst — dzięki temu
            radzi sobie z układem dwukolumnowym, tabelami i nietypowymi nagłówkami.
          </p>
        )}

        <label className={`dropzone ${busy === "cv" ? "over" : ""}`}>
          <input type="file" accept=".pdf,.docx,.txt" disabled={busy === "cv"}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          {busy === "cv" ? (
            <>
              <div className="big"><span className="spin" style={{ color: "var(--accent)" }} /> Analizuję dokument…</div>
              <div className="small">To potrwa kilkanaście sekund</div>
            </>
          ) : (
            <>
              <div className="big">{hasProfile ? "Wgraj inne CV" : "Wybierz plik z CV"}</div>
              <div className="small">PDF, DOCX lub TXT · najlepiej PDF, bo model widzi wtedy układ strony</div>
            </>
          )}
        </label>

        {hasProfile && profile && <ProfileSummary p={profile} />}
      </section>

      {/* ─── KROK 2 ─────────────────────────────────────────────────────── */}
      <section className="card" id="kierunki">
        <div className="step-head">
          <span className={`step-num ${dirs.length ? "done" : hasProfile ? "" : "idle"}`}>2</span>
          <h2>Kierunki zawodowe</h2>
        </div>
        <p className="lead">
          To jest odpowiedź na pytanie „jakie stanowisko wpisać". System proponuje nazwy trzema drogami:
          ze słownika zawodów, z analizy Twojego profilu przez AI oraz — po pierwszym wyszukaniu — z tego,
          jak <strong>naprawdę</strong> nazywane są ogłoszenia, których wymagania pokrywają się z Twoim doświadczeniem.
        </p>

        <button onClick={expand} disabled={!hasProfile || busy !== null}>
          {busy === "expand" ? <><span className="spin" /> Analizuję profil…</> : dirs.length ? "Zaproponuj ponownie" : "Zaproponuj kierunki"}
        </button>

        {dirs.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {dirs.map((d) => (
              <div key={d.id} className={`dir ${d.accepted === true ? "on" : d.accepted === false ? "off" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
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
                  <div className="row" style={{ gap: 6 }}>
                    <button className="mini" onClick={() => toggleDir(d.id, true)} disabled={d.accepted === true}>Szukaj</button>
                    <button className="mini neutral" onClick={() => toggleDir(d.id, false)} disabled={d.accepted === false}>Pomiń</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── KROK 3 ─────────────────────────────────────────────────────── */}
      {profile && (
        <section className="card" id="preferencje">
          <div className="step-head">
            <span className={`step-num ${hasProfile ? "" : "idle"}`}>3</span>
            <h2>Preferencje</h2>
          </div>
          <div className="grid g2">
            <div>
              <label>Miasto (puste = cała Polska)</label>
              <input defaultValue={profile.preferences.locations.join(", ")}
                onBlur={(e) => savePrefs({ locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <div>
              <label>Tryb pracy</label>
              <select value={profile.preferences.remote} onChange={(e) => savePrefs({ remote: e.target.value as never })}>
                <option value="any">dowolny</option>
                <option value="remote">zdalnie</option>
                <option value="hybrid">hybrydowo</option>
                <option value="onsite">stacjonarnie</option>
              </select>
            </div>
            <div>
              <label>Minimalne wynagrodzenie (zł/mies., brutto)</label>
              <input type="number" defaultValue={profile.preferences.salaryMin ?? ""}
                onBlur={(e) => savePrefs({ salaryMin: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <label>Rynek</label>
              <select value={profile.preferences.market} onChange={(e) => savePrefs({ market: e.target.value as never })}>
                <option value="all">wszystkie pasujące</option>
                <option value="pl">głównie polskie</option>
                <option value="international">głównie międzynarodowe</option>
              </select>
            </div>
          </div>
        </section>
      )}

      {/* ─── KROK 4 ─────────────────────────────────────────────────────── */}
      <section className="card" id="firmy">
        <div className="step-head">
          <span className={`step-num ${companies.length ? "done" : "idle"}`}>4</span>
          <h2>Obserwowane firmy <span className="step-note">— opcjonalne, ale mocne</span></h2>
        </div>
        <p className="lead">
          Wskaż firmy, w których naprawdę chciałabyś pracować. System będzie czytał ich zakładki
          „Kariera" i zgłaszał nowe ogłoszenia. Oferty trafiają tam często <strong>zanim</strong>
          {" "}pojawią się na portalach, a część nigdy tam nie trafia — mniej kandydatów o nich wie.
        </p>

        <div className="row" style={{ marginBottom: 12 }}>
          <button onClick={suggestCompanies} disabled={!hasProfile || busy !== null}>
            {busy === "suggest" ? <><span className="spin" /> Szukam firm…</> : "Podpowiedz firmy do mojego profilu"}
          </button>
          {companies.length > 0 && (
            <button className="ghost" onClick={refreshCompanies} disabled={busy !== null}>
              {busy === "refresh" ? <><span className="spin" style={{ borderTopColor: "var(--accent)", borderColor: "var(--border-strong)" }} /> Odczytuję…</> : "Sprawdź teraz wszystkie"}
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <strong style={{ fontSize: 14 }}>Propozycje — dodaj te, które Cię interesują</strong>
            {suggestions.map((s) => (
              <div key={s.name} className="dir" style={{ marginTop: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <strong>{s.name}</strong>
                      <span className="pill">{s.size === "duza" ? "duża" : s.size === "srednia" ? "średnia" : "mała"}</span>
                      {!s.careerUrl && <span className="pill off">nie znaleziono zakładki Kariera</span>}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 3 }}>{s.why}</div>
                    {s.careerUrl && <div className="muted" style={{ fontSize: 12 }}>{s.careerUrl}</div>}
                  </div>
                  <button className="mini" disabled={!s.careerUrl}
                    onClick={() => s.careerUrl && addCompany(s.name, s.careerUrl)}>Obserwuj</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ManualCompany onAdd={addCompany} />

        {companies.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 14 }}>Obserwujesz ({companies.length})</strong>
            {companies.map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <strong>{c.name}</strong>
                  <span className="pill" style={{ marginLeft: 8 }}>{c.offerCount} ofert</span>
                  <div className="muted" style={{ fontSize: 12 }}>{c.careerUrl}</div>
                  {c.lastError && <div className="muted" style={{ color: "var(--danger)", fontSize: 12 }}>⚠ {c.lastError}</div>}
                </div>
                <button className="mini neutral" onClick={() => removeCompany(c.id)}>Usuń</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── KROK 5 ─────────────────────────────────────────────────────── */}
      <section className="card" id="szukaj">
        <div className="step-head">
          <span className={`step-num ${search ? "done" : accepted.length ? "" : "idle"}`}>5</span>
          <h2>Wyszukiwanie</h2>
        </div>

        {status && (
          <div className="row" style={{ marginBottom: 12 }}>
            {status.sources.map((s) => (
              <span key={s.id} className={`pill ${s.ok ? "ok" : "off"}`} title={s.ok ? s.legalNote : `${s.reason}. ${s.howToFix ?? ""}`}>
                {s.ok ? "●" : "○"} {s.label}
              </span>
            ))}
          </div>
        )}
        {status && status.sources.some((s) => !s.ok) && (
          <details style={{ marginBottom: 12 }}>
            <summary>Część źródeł jest nieaktywna — zobacz, jak je włączyć</summary>
            <ul className="tight" style={{ marginTop: 8 }}>
              {status.sources.filter((s) => !s.ok).map((s) => (
                <li key={s.id}><strong>{s.label}</strong>: {s.reason}. {s.howToFix}</li>
              ))}
            </ul>
          </details>
        )}

        <button onClick={runSearch} disabled={accepted.length === 0 || busy !== null}>
          {busy === "search" ? <><span className="spin" /> Przeszukuję portale…</> : "Znajdź oferty"}
        </button>
        {accepted.length === 0 && <span className="muted" style={{ marginLeft: 10 }}>Najpierw wybierz przynajmniej jeden kierunek.</span>}

        {search?.stats && (
          <p className="stats">
            Znaleziono {search.stats.found} ofert · {search.stats.queriesByTitle} zapytań po nazwach
            i {search.stats.queriesBySkill} po wymaganiach ·
            po odsianiu zostało {search.stats.afterPrefilter} ·
            AI oceniło {search.stats.reranked} · {(search.stats.ms / 1000).toFixed(1)} s
          </p>
        )}
      </section>

      {/* ─── NIE ZNALAZŁABYŚ ICH PO NAZWIE ──────────────────────────────── */}
      {search && search.hidden?.length > 0 && (
        <section className="card highlight">
          <h2>Nie znalazłabyś ich po nazwie ({search.hidden.length})</h2>
          <p style={{ fontSize: 14 }}>
            Te oferty mają nazwę stanowiska, która nie przypomina niczego, czego szukasz —
            ale ich <strong>wymagania</strong> mocno pokrywają się z Twoim doświadczeniem.
            W polskich ogłoszeniach nazwa często opisuje miejsce etatu w strukturze firmy,
            a nie to, co się w nim faktycznie robi. Skoro Ty sama byś na nie nie trafiła,
            prawdopodobnie mniej kandydatów też nie.
          </p>
          <ul className="tight">
            {search.hidden.map((h) => (
              <li key={h.offerId} style={{ marginBottom: 6 }}>
                <strong>{h.title}</strong>{h.company ? ` — ${h.company}` : ""}
                <br /><span className="muted">{h.explanation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── ODKRYTE NAZWY ──────────────────────────────────────────────── */}
      {search && search.discovered?.length > 0 && (
        <section className="card accent">
          <h2>Nazwy odkryte z rynku</h2>
          <p style={{ fontSize: 14 }}>
            Tych nazw nie było w pierwszym wyszukiwaniu — system znalazł je, sprawdzając, jak nazywane są
            ogłoszenia, których wymagania pokrywają się z Twoim doświadczeniem. Zostały już dołączone do wyników.
          </p>
          <ul className="tight">
            {search.discovered.map((d, i) => <li key={i}><strong>{d.pl}</strong> — {d.why}</li>)}
          </ul>
        </section>
      )}

      {/* ─── ANALIZA LUK ────────────────────────────────────────────────── */}
      {search && search.gaps?.length > 0 && (
        <section className="card">
          <h2>Co najczęściej Cię blokuje</h2>
          <p className="lead">Wymagania, które powtarzają się w ofertach dla Ciebie interesujących, a których brakuje w Twoim profilu. To informacja o kierunku rozwoju, nie o jednej rekrutacji.</p>
          <ul className="tight">
            {search.gaps.map((g, i) => (
              <li key={i}><strong>{g.skill}</strong> — blokuje {g.blocksCount} z ocenionych ofert ({g.share}%)</li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── WYNIKI ─────────────────────────────────────────────────────── */}
      {search && search.results.length > 0 && (
        <section>
          <h2 className="section-title">Oferty ({search.results.length})</h2>
          {search.results.map((r) => <OfferCard key={r.offer.id} r={r} />)}
        </section>
      )}

      {search && search.results.length === 0 && search.stats && (
        <div className="alert info">
          Nic nie przeszło filtrów. Spróbuj poluzować preferencje (wynagrodzenie, tryb pracy, miasto)
          albo zaakceptować więcej kierunków zawodowych.
        </div>
      )}
    </div>
  );
}

function ManualCompany({ onAdd }: { onAdd: (name: string, url: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    try { await onAdd(name.trim(), url.trim()); setName(""); setUrl(""); }
    finally { setSaving(false); }
  };

  return (
    <details>
      <summary>Dodaj firmę ręcznie</summary>
      <div className="grid g2" style={{ marginTop: 10 }}>
        <div>
          <label>Nazwa firmy</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Orlen" />
        </div>
        <div>
          <label>Adres zakładki Kariera</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://firma.pl/kariera" />
        </div>
      </div>
      <button className="mini" style={{ marginTop: 10 }} onClick={submit} disabled={saving || !name.trim() || !url.trim()}>
        {saving ? "Sprawdzam…" : "Dodaj"}
      </button>
      <p className="muted" style={{ marginTop: 8 }}>
        Podaj adres prowadzący wprost do <strong>listy ogłoszeń</strong>, a nie do strony o firmie.
        Jeśli oferty ładują się dopiero po kliknięciu, skopiuj adres z paska po ich wyświetleniu.
      </p>
    </details>
  );
}

function ProfileSummary({ p }: { p: MasterProfile }) {
  const name = [p.person.firstName.value, p.person.lastName.value].filter(Boolean).join(" ");
  const core = p.skills.filter((s) => s.depth === "core");
  const used = p.skills.filter((s) => s.depth === "used");
  const mentioned = p.skills.filter((s) => s.depth === "mentioned");

  const badge = (c: string) =>
    c === "high" || c === "confirmed" ? "strong" : c === "medium" ? "good" : "off";

  return (
    <div style={{ marginTop: 14 }}>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 16 }}>{name || "(nie ustalono imienia i nazwiska)"}</strong>
        <span className={`pill ${badge(p.person.lastName.confidence)}`}>
          pewność: {plConf(p.person.lastName.confidence)}
        </span>
      </div>
      {p.headline.value && <div className="muted" style={{ marginBottom: 8 }}>{p.headline.value}</div>}

      <div className="row" style={{ gap: 14, fontSize: 14, marginBottom: 10 }}>
        <span>{p.experience.length} miejsc pracy</span>
        <span>{p.skills.length} umiejętności</span>
        <span>{p.languages.length} języków</span>
      </div>

      {core.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span className="muted">Potwierdzone wielokrotnie: </span>
          {core.map((s) => <span key={s.id} className="pill strong" style={{ marginRight: 4 }}>{s.name}</span>)}
        </div>
      )}
      {used.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span className="muted">Stosowane w pracy: </span>
          {used.map((s) => <span key={s.id} className="pill" style={{ marginRight: 4 }}>{s.name}</span>)}
        </div>
      )}
      {mentioned.length > 0 && (
        <details>
          <summary>Tylko wymienione, bez potwierdzenia w doświadczeniu ({mentioned.length})</summary>
          <div style={{ marginTop: 6 }}>
            {mentioned.map((s) => <span key={s.id} className="pill" style={{ marginRight: 4, opacity: .6 }}>{s.name}</span>)}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            Te umiejętności pojawiają się na liście, ale nie widać ich w opisie obowiązków. Warto je uzupełnić
            konkretnym przykładem — inaczej mają małą wagę przy dopasowaniu.
          </p>
        </details>
      )}

      {p.openQuestions.length > 0 && (
        <div className="alert info" style={{ marginTop: 12 }}>
          <strong>System nie zgaduje — woli zapytać ({p.openQuestions.length}):</strong>
          <ul className="tight" style={{ marginTop: 6 }}>
            {p.openQuestions.slice(0, 5).map((q, i) => <li key={i}>{q.question}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function OfferCard({ r }: { r: Result }) {
  const band = r.ranked?.band;
  const o = r.offer;
  return (
    <article className={`offer ${band ?? ""}`}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3>{o.title}</h3>
          <div className="meta">
            {[o.company, o.location, plRemote(o.remote), o.contract].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {r.mismatch?.flagged && <span className="pill hidden-gem">myląca nazwa</span>}
          {band && <span className={`pill ${band}`}>{BAND_LABEL[band]}</span>}
        </div>
      </div>

      <div className="row tags" style={{ gap: 6 }}>
        <span className="pill">{o.sourceLabel}</span>
        {o.salaryMin && (
          <span className="pill">
            {o.salaryMin.toLocaleString("pl-PL")}{o.salaryMax ? `–${o.salaryMax.toLocaleString("pl-PL")}` : ""} {o.salaryCurrency}
            {o.salaryPeriod === "year" ? "/rok" : o.salaryPeriod === "hour" ? "/godz." : "/mies."}
          </span>
        )}
      </div>

      {r.mismatch?.flagged && r.mismatch.explanation && (
        <div className="verdict gem">
          <strong>Nie znalazłabyś jej po nazwie.</strong> {r.mismatch.explanation}
        </div>
      )}

      {r.ranked?.verdict && <div className="verdict">{r.ranked.verdict}</div>}

      {r.ranked && r.ranked.strengths.length > 0 && (
        <>
          <div className="block-title">Co przemawia za Tobą</div>
          <ul className="tight">{r.ranked.strengths.map((s, i) => <li key={i}>{s.text}</li>)}</ul>
        </>
      )}

      {r.ranked && r.ranked.gaps.length > 0 && (
        <>
          <div className="block-title">Czego brakuje</div>
          <ul className="tight">
            {r.ranked.gaps.map((g, i) => (
              <li key={i} className={g.blocking ? "blocking" : ""}>
                {g.text}{!g.blocking && <span className="muted"> (mile widziane)</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {r.ranked && r.ranked.flags.length > 0 && (
        <div className="muted" style={{ marginTop: 6 }}>⚠ {r.ranked.flags.join(" · ")}</div>
      )}

      <a className="offer-link" href={o.url} target="_blank" rel="noopener noreferrer">
        Zobacz pełne ogłoszenie u źródła <span>→</span>
      </a>
    </article>
  );
}

const plRemote = (r: string) =>
  ({ remote: "zdalnie", hybrid: "hybrydowo", onsite: "stacjonarnie", unknown: "" } as Record<string, string>)[r] ?? "";

const plConf = (c: string) =>
  ({ confirmed: "potwierdzone", high: "wysoka", medium: "średnia", low: "niska", missing: "brak" } as Record<string, string>)[c] ?? c;
