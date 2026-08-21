"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MasterProfile } from "@/lib/profile/schema";

export default function StartPage() {
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [ai, setAi] = useState<{ ok: boolean; name?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setProfile).catch(() => {});
    fetch("/api/sources").then((r) => r.json()).then((d) => setAi(d.ai)).catch(() => {});
  }, []);

  const upload = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("cv", file);
      const r = await fetch("/api/profile", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Nie udało się przetworzyć CV.");
      setProfile(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const has = !!profile && (profile.experience.length > 0 || profile.skills.length > 0);

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

      {ai && !ai.ok && <div className="alert err"><strong>Model AI nie jest skonfigurowany.</strong><br />{ai.error}</div>}
      {err && <div className="alert err">{err}</div>}

      <section className="card">
        <h2>{has ? "Wgraj nowe CV" : "Zacznij od CV"}</h2>
        <p className="lead">
          Model przeanalizuje układ dokumentu, a nie tylko wyciągnięty tekst — dzięki temu
          radzi sobie z układem dwukolumnowym, tabelami i nietypowymi nagłówkami.
          {has && " Twoje preferencje i wybrane kierunki zostaną zachowane."}
        </p>

        <label
          className={`dropzone ${over || busy ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setOver(false);
            const f = e.dataTransfer.files?.[0]; if (f) upload(f);
          }}
        >
          <input type="file" accept=".pdf,.docx,.txt" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          {busy ? (
            <>
              <div className="big"><span className="spin" style={{ color: "var(--accent)" }} /> Analizuję dokument…</div>
              <div className="small">To potrwa kilkanaście sekund</div>
            </>
          ) : (
            <>
              <div className="big">Przeciągnij CV tutaj albo kliknij, żeby wybrać</div>
              <div className="small">PDF, DOCX lub TXT · najlepiej PDF, bo model widzi wtedy układ strony</div>
            </>
          )}
        </label>
      </section>

      {has && profile && (
        <section className="card">
          <h2>Co dalej</h2>
          <ol className="tight" style={{ paddingLeft: 20 }}>
            <li>
              <Link href="/profil">Sprawdź profil</Link>
              {profile.openQuestions.length > 0
                ? ` — system ma ${profile.openQuestions.length} ${profile.openQuestions.length === 1 ? "pytanie" : "pytań"}, bo nie chce zgadywać`
                : " — możesz poprawić i uzupełnić dane z CV"}
            </li>
            <li><Link href="/kierunki">Wybierz kierunki</Link> — pod jakimi nazwami szukać</li>
            <li><Link href="/preferencje">Ustaw preferencje</Link> — miasto, tryb pracy, wynagrodzenie</li>
            <li><Link href="/oferty">Znajdź oferty</Link></li>
          </ol>
        </section>
      )}
    </div>
  );
}
