"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MasterProfile } from "@/lib/profile/schema";

export default function PreferencjePage() {
  const [p, setP] = useState<MasterProfile | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetch("/api/profile").then((r) => r.json()).then(setP).catch(() => {}); }, []);

  const save = (patch: Partial<MasterProfile["preferences"]>) => {
    if (!p) return;
    const preferences = { ...p.preferences, ...patch };
    setP({ ...p, preferences });
    fetch("/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    }).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1600); }).catch(() => {});
  };

  if (!p) return <div className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Wczytuję…</p></div>;
  const pr = p.preferences;

  return (
    <div className="wrap">
      <header className="hero" style={{ paddingBottom: 24 }}>
        <span className="mark" />
        <h1>Preferencje</h1>
        <p className="lede">
          Te ustawienia odsiewają oferty jeszcze zanim trafią do oceny AI — dzięki temu
          wyszukiwanie jest szybsze i tańsze. Zmiany zapisują się same.
        </p>
      </header>

      <section className="card">
        <h2>Gdzie i jak</h2>
        <div className="grid g2">
          <div>
            <label>Miasta — po przecinku, puste znaczy cała Polska</label>
            <input defaultValue={pr.locations.join(", ")}
              placeholder="np. Kraków, Katowice"
              onBlur={(e) => save({ locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div>
            <label>Tryb pracy</label>
            <select value={pr.remote} onChange={(e) => save({ remote: e.target.value as never })}>
              <option value="any">dowolny</option>
              <option value="remote">zdalnie</option>
              <option value="hybrid">hybrydowo</option>
              <option value="onsite">stacjonarnie</option>
            </select>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Oferty bez podanego trybu pracy nigdy nie są odrzucane — brak informacji to nie odmowa.
        </p>
      </section>

      <section className="card">
        <h2>Wynagrodzenie</h2>
        <div className="grid g2">
          <div>
            <label>Minimum, zł brutto miesięcznie</label>
            <input type="number" defaultValue={pr.salaryMin ?? ""} placeholder="np. 12000"
              onBlur={(e) => save({ salaryMin: e.target.value ? Number(e.target.value) : null })} />
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Oferta odpada dopiero, gdy jej <strong>górna</strong> granica jest wyraźnie poniżej Twojego
          minimum. Gdy widełki się przecinają — zostaje, bo jest o czym rozmawiać.
        </p>
      </section>

      <section className="card">
        <h2>Rynek</h2>
        <div className="grid g2">
          <div>
            <label>Język i typ ofert</label>
            <select value={pr.market} onChange={(e) => save({ market: e.target.value as never })}>
              <option value="all">wszystkie pasujące</option>
              <option value="pl">głównie polskie</option>
              <option value="international">głównie międzynarodowe</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Czego nie chcesz</h2>
        <div className="grid g2">
          <div>
            <label>Firmy do pominięcia — po przecinku</label>
            <input defaultValue={pr.excludeCompanies.join(", ")}
              placeholder="np. dawny pracodawca"
              onBlur={(e) => save({ excludeCompanies: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
          <div>
            <label>Branże do pominięcia — po przecinku</label>
            <input defaultValue={pr.excludeIndustries.join(", ")}
              placeholder="np. call center"
              onBlur={(e) => save({ excludeIndustries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Świadome wykluczenia oszczędzają najwięcej czasu — nie oglądasz w kółko tego,
          do czego i tak nie chcesz wracać.
        </p>
      </section>

      {saved && <div className="alert info">Zapisano.</div>}
      <p className="muted" style={{ marginTop: 18 }}>Gotowe? <Link href="/oferty">Przejdź do wyszukiwania →</Link></p>
    </div>
  );
}
