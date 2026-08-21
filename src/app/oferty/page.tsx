"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Offer } from "@/lib/sources/types";
import type { Ranked } from "@/lib/matching/rerank";
import { BAND_LABEL } from "@/lib/matching/rerank";

type Mismatch = { flagged: boolean; requirementsFit: number; explanation: string | null };
type Result = { offer: Offer; rough: number; matched: string[]; missing: string[]; mismatch: Mismatch; ranked: Ranked | null };
type Payload = {
  results: Result[];
  aiError: string | null;
  gaps: { skill: string; blocksCount: number; share: number }[];
  discovered: { pl: string; why: string }[];
  hidden: { offerId: string; title: string; company: string | null; explanation: string | null }[];
  perSource: { id: string; label: string; count: number; ok: boolean; note?: string }[];
  stats: { found: number; afterPrefilter: number; reranked: number; queriesByTitle: number; queriesBySkill: number; topN: number; ms: number } | null;
};

export default function OfertyPage() {
  const [d, setD] = useState<Payload | null>(null);
  const [sources, setSources] = useState<{ id: string; label: string; ok: boolean; reason?: string; howToFix?: string; legalNote: string }[]>([]);
  const [ai, setAi] = useState<{ ok: boolean; rpm?: number; model?: string } | null>(null);
  const [dirs, setDirs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/search").then((r) => r.json()).then((j) => j.stats && setD(j)).catch(() => {});
    fetch("/api/sources").then((r) => r.json()).then((j) => { setSources(j.sources ?? []); setAi(j.ai ?? null); }).catch(() => {});
    fetch("/api/expand").then((r) => r.json())
      .then((j) => setDirs((j.directions ?? []).filter((x: { accepted?: boolean }) => x.accepted).length)).catch(() => {});
  }, []);

  const search = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setD(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="wrap">
      <header className="hero" style={{ paddingBottom: 24 }}>
        <span className="mark" />
        <h1>Oferty</h1>
        <p className="lede">
          System pyta portale dwiema drogami naraz: nazwami stanowisk oraz kombinacjami
          Twoich umiejętności. Druga droga łapie oferty o mylącej nazwie, których
          po tytule nigdy byś nie znalazła.
        </p>
      </header>

      {err && <div className="alert err">{err}</div>}

      <section className="card">
        <div className="row" style={{ gap: 6, marginBottom: 14 }}>
          {sources.map((s) => (
            <span key={s.id} className={`pill ${s.ok ? "ok" : "off"}`} title={s.ok ? s.legalNote : `${s.reason}. ${s.howToFix ?? ""}`}>
              {s.ok ? "●" : "○"} {s.label}
            </span>
          ))}
        </div>

        {sources.some((s) => !s.ok) && (
          <details style={{ marginBottom: 14 }}>
            <summary>Część źródeł jest nieaktywna — zobacz, jak je włączyć</summary>
            <ul className="tight" style={{ marginTop: 8 }}>
              {sources.filter((s) => !s.ok).map((s) => (
                <li key={s.id}><strong>{s.label}</strong>: {s.reason}. {s.howToFix}</li>
              ))}
            </ul>
          </details>
        )}

        <button onClick={search} disabled={dirs === 0 || busy}>
          {busy ? <><span className="spin" /> Przeszukuję portale…</> : "Znajdź oferty"}
        </button>
        {dirs === 0
          ? <span className="muted" style={{ marginLeft: 10 }}>Najpierw <Link href="/kierunki">zaznacz kierunek</Link>.</span>
          : <span className="muted" style={{ marginLeft: 10 }}>Szukam pod {dirs} {dirs === 1 ? "nazwą" : "nazwami"}.</span>}

        {ai?.ok && ai.rpm !== undefined && ai.rpm <= 15 && (
          <p className="muted" style={{ marginTop: 12 }}>
            Model pracuje na darmowym limicie <strong>{ai.rpm} zapytań na minutę</strong>, więc
            system rozkłada je w czasie i wyszukiwanie potrwa dłużej. To normalne.
            Po włączeniu płatnego rozliczenia podnieś <code>AI_MAX_RPM</code> w pliku ustawień.
          </p>
        )}

        {d?.stats && (
          <p className="stats">
            {d.stats.found} ofert · {d.stats.queriesByTitle} zapytań po nazwach i {d.stats.queriesBySkill} po wymaganiach ·
            po odsianiu {d.stats.afterPrefilter} · AI oceniło {d.stats.reranked} z {d.stats.topN} · {(d.stats.ms / 1000).toFixed(1)} s
          </p>
        )}
      </section>

      {d?.aiError && (
        <div className="alert err">
          <strong>Oceny AI nie udało się wykonać — oferty poniżej mają tylko ocenę wstępną.</strong>
          <div style={{ marginTop: 6, fontSize: 13.5 }}>{d.aiError}</div>
          <div style={{ marginTop: 8, fontSize: 13.5 }}>
            <strong>Co z tym zrobić:</strong>
            <ul className="tight" style={{ marginTop: 6 }}>
              <li>Odczekaj 1–2 minuty i kliknij „Znajdź oferty” ponownie — limit odnawia się co minutę.</li>
              <li>Zmniejsz liczbę ocenianych ofert: <code>RERANK_MAX_OFFERS</code> w pliku ustawień.</li>
              <li>Odznacz część kierunków — mniej nazw to mniej zapytań.</li>
              <li>Docelowo: włącz płatne rozliczenie w Google AI Studio i podnieś <code>AI_MAX_RPM</code>.</li>
            </ul>
          </div>
        </div>
      )}

      {d && d.hidden?.length > 0 && (
        <section className="card highlight">
          <h2>Nie znalazłabyś ich po nazwie ({d.hidden.length})</h2>
          <p style={{ fontSize: 14.5 }}>
            Nazwa stanowiska nie przypomina niczego, czego szukasz — ale wymagania mocno
            pokrywają się z Twoim doświadczeniem. Skoro Ty sama byś na nie nie trafiła,
            prawdopodobnie mniej kandydatów też nie.
          </p>
          <ul className="tight">
            {d.hidden.map((h) => (
              <li key={h.offerId} style={{ marginBottom: 6 }}>
                <strong>{h.title}</strong>{h.company ? ` — ${h.company}` : ""}
                <br /><span className="muted">{h.explanation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d && d.discovered?.length > 0 && (
        <section className="card accent">
          <h2>Nazwy odkryte z rynku</h2>
          <p style={{ fontSize: 14.5 }}>
            Tych nazw nie było w pierwszym wyszukiwaniu. System znalazł je, sprawdzając,
            jak nazywane są ogłoszenia, których wymagania pasują do Twojego doświadczenia.
          </p>
          <ul className="tight">
            {d.discovered.map((x, i) => <li key={i}><strong>{x.pl}</strong> — {x.why}</li>)}
          </ul>
        </section>
      )}

      {d && d.gaps?.length > 0 && (
        <section className="card">
          <h2>Co najczęściej Cię blokuje</h2>
          <p className="lead">
            Wymagania powtarzające się w interesujących Cię ofertach, których brakuje w profilu.
            To informacja o kierunku rozwoju, nie o jednej rekrutacji.
          </p>
          <ul className="tight">
            {d.gaps.map((g, i) => (
              <li key={i}><strong>{g.skill}</strong> — blokuje {g.blocksCount} z ocenionych ofert ({g.share}%)</li>
            ))}
          </ul>
        </section>
      )}

      {d && d.results.length > 0 && (
        <>
          <h2 className="section-title">Wszystkie oferty ({d.results.length})</h2>
          {d.results.map((r) => <OfferCard key={r.offer.id} r={r} />)}
        </>
      )}

      {d && d.results.length === 0 && d.stats && (
        <div className="alert info">
          Nic nie przeszło filtrów. Spróbuj poluzować <Link href="/preferencje">preferencje</Link> albo
          zaakceptować więcej <Link href="/kierunki">kierunków</Link>.
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
          <div className="meta">{[o.company, o.location, plRemote(o.remote), o.contract].filter(Boolean).join(" · ")}</div>
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
        <div className="verdict gem"><strong>Nie znalazłabyś jej po nazwie.</strong> {r.mismatch.explanation}</div>
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

      {r.ranked && r.ranked.flags.length > 0 && <div className="muted" style={{ marginTop: 8 }}>⚠ {r.ranked.flags.join(" · ")}</div>}

      <a className="offer-link" href={o.url} target="_blank" rel="noopener noreferrer">
        Zobacz pełne ogłoszenie u źródła <span>→</span>
      </a>
    </article>
  );
}

const plRemote = (x: string) =>
  ({ remote: "zdalnie", hybrid: "hybrydowo", onsite: "stacjonarnie", unknown: "" } as Record<string, string>)[x] ?? "";
