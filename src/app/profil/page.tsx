"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import EditableField, { Confidence } from "@/components/EditableField";
import type { MasterProfile } from "@/lib/profile/schema";

export default function ProfilPage() {
  const [p, setP] = useState<MasterProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setP).finally(() => setLoading(false));
  }, []);

  const upd = (j: unknown) => setP(j as MasterProfile);

  const patch = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/profile/field", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.ok) upd(await r.json());
  };

  if (loading) return <div className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Wczytuję…</p></div>;

  if (!p || (p.experience.length === 0 && p.skills.length === 0)) {
    return (
      <div className="wrap">
        <div className="empty-state">
          <h2>Nie ma jeszcze profilu</h2>
          <p>Wgraj CV, a system zbuduje z niego profil, który potem poprawisz i uzupełnisz.</p>
          <p style={{ marginTop: 18 }}><Link href="/">Przejdź do wgrania CV →</Link></p>
        </div>
      </div>
    );
  }

  const ev = (f: { evidence?: { quote: string; verified: boolean }[] }) =>
    f.evidence?.find((e) => e.verified)?.quote ?? null;

  return (
    <div className="wrap">
      <header className="hero" style={{ paddingBottom: 24 }}>
        <span className="mark" />
        <h1>Mój profil</h1>
        <p className="lede">
          To jest źródło prawdy o Tobie — nie CV. Wszystko, co tu poprawisz, system
          uzna za pewne i wykorzysta przy dopasowywaniu ofert. Kliknij dowolną wartość, żeby ją zmienić.
        </p>
      </header>

      {/* ── PYTANIA ────────────────────────────────────────────────────── */}
      {p.openQuestions.length > 0 && (
        <section className="card">
          <h2>System woli zapytać, niż zgadnąć</h2>
          <p className="lead">
            Tych rzeczy nie udało się jednoznacznie odczytać z CV. Możesz je uzupełnić teraz
            albo pominąć — ale każda odpowiedź poprawia trafność dopasowania.
          </p>
          {p.openQuestions.map((q) => (
            <QuestionCard key={q.fieldId} q={q} onSaved={upd} />
          ))}
        </section>
      )}

      {/* ── DANE OSOBOWE ───────────────────────────────────────────────── */}
      <section className="card">
        <h2>Dane osobowe</h2>
        <EditableField label="Imię"     fieldId="person.firstName" value={p.person.firstName.value} confidence={p.person.firstName.confidence} evidence={ev(p.person.firstName)} onSaved={upd} />
        <EditableField label="Nazwisko" fieldId="person.lastName"  value={p.person.lastName.value}  confidence={p.person.lastName.confidence}  evidence={ev(p.person.lastName)}  onSaved={upd} />
        <EditableField label="E-mail"   fieldId="person.email"     value={p.person.email.value}     confidence={p.person.email.confidence}     onSaved={upd} />
        <EditableField label="Telefon"  fieldId="person.phone"     value={p.person.phone.value}     confidence={p.person.phone.confidence}     onSaved={upd} />
        <EditableField label="Miasto"   fieldId="person.city"      value={p.person.city.value}      confidence={p.person.city.confidence}      onSaved={upd} />
      </section>

      {/* ── PROFIL ZAWODOWY ────────────────────────────────────────────── */}
      <section className="card">
        <h2>Profil zawodowy</h2>
        <EditableField label="Stanowisko" fieldId="headline" value={p.headline.value} confidence={p.headline.confidence}
          placeholder="np. Analityk BI" onSaved={upd} />
        <EditableField label="Podsumowanie" fieldId="summary" value={p.summary.value} confidence={p.summary.confidence}
          placeholder="dwa–trzy zdania o Tobie" onSaved={upd} />
      </section>

      {/* ── JĘZYKI ─────────────────────────────────────────────────────── */}
      <section className="card">
        <h2>Języki {p.languages.length === 0 && <span className="step-note">— nic nie odczytano z CV</span>}</h2>
        {p.languages.length === 0 && (
          <p className="lead">
            Model nie znalazł w CV sekcji z językami. To częsty problem, gdy poziom jest
            pokazany kropkami albo paskiem zamiast tekstem. Dopisz je ręcznie — w ogłoszeniach
            język jest jednym z najczęstszych wymagań.
          </p>
        )}
        {p.languages.map((l) => (
          <div className="field" key={l.id}>
            <span className="field-label">{l.name}</span>
            <div className="field-body" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <EditableField label="" fieldId={`${l.id}:level`} value={l.level}
                  confidence={l.level ? l.confidence : "missing"}
                  placeholder="np. B2, biegły, C1" onSaved={upd} />
              </div>
              <button className="mini neutral" onClick={() => patch({ fieldId: l.id, value: null })}>Usuń</button>
            </div>
          </div>
        ))}
        <AddChip kind="language" placeholder="np. angielski" label="Dodaj język" onSaved={upd} />
      </section>

      {/* ── UMIEJĘTNOŚCI ───────────────────────────────────────────────── */}
      <section className="card">
        <h2>Umiejętności</h2>
        <p className="lead">
          Poziom wynika z tego, gdzie umiejętność pojawia się w CV. <strong>Potwierdzone</strong> znaczy,
          że widać ją w opisie obowiązków wielokrotnie. <strong>Tylko wymieniona</strong> znaczy, że jest
          na liście, ale nic jej nie potwierdza — takie mają najmniejszą wagę przy dopasowaniu.
          Kliknij poziom, żeby go zmienić.
        </p>
        {(["core", "used", "mentioned"] as const).map((depth) => {
          const items = p.skills.filter((s) => s.depth === depth);
          if (items.length === 0) return null;
          const title = depth === "core" ? "Potwierdzone wielokrotnie"
            : depth === "used" ? "Stosowane w pracy" : "Tylko wymienione";
          return (
            <div key={depth} style={{ marginBottom: 14 }}>
              <div className="block-title">{title} ({items.length})</div>
              <div className="row" style={{ gap: 6 }}>
                {items.map((s) => (
                  <SkillChip key={s.id} id={s.id} name={s.name} depth={s.depth} onSaved={upd} />
                ))}
              </div>
            </div>
          );
        })}
        <AddChip kind="skill" placeholder="np. SQL" label="Dodaj umiejętność" onSaved={upd} />
      </section>

      {/* ── DOŚWIADCZENIE ──────────────────────────────────────────────── */}
      <section className="card">
        <h2>Doświadczenie</h2>
        {p.experience.map((e) => (
          <div className="exp-block" key={e.id}>
            <EditableField label="Stanowisko" fieldId={`${e.id}.title`}   value={e.title.value}   confidence={e.title.confidence}   evidence={ev(e.title)} onSaved={upd} />
            <EditableField label="Firma"      fieldId={`${e.id}.company`} value={e.company.value} confidence={e.company.confidence} evidence={ev(e.company)} onSaved={upd} />
            <EditableField label="Od"         fieldId={`${e.id}.from`}    value={e.from.value}    confidence={e.from.confidence}    placeholder="RRRR-MM" onSaved={upd} />
            <EditableField label="Do"         fieldId={`${e.id}.to`}      value={e.to.value}      confidence={e.to.confidence}      placeholder="RRRR-MM lub „obecnie”" onSaved={upd} />
            <EditableField label="Branża"     fieldId={`${e.id}.industry`} value={e.industry?.value ?? null} confidence={e.industry?.confidence} placeholder="np. energetyka" onSaved={upd} />

            {e.bullets.length > 0 && (
              <>
                <div className="block-title" style={{ marginTop: 14 }}>Obowiązki i osiągnięcia</div>
                {e.bullets.map((b) => (
                  <EditableField key={b.id} label={b.quantified ? "z liczbą" : ""} fieldId={b.id} value={b.text} onSaved={upd} />
                ))}
              </>
            )}
          </div>
        ))}
      </section>

      {/* ── WYKSZTAŁCENIE ──────────────────────────────────────────────── */}
      {p.education.length > 0 && (
        <section className="card">
          <h2>Wykształcenie</h2>
          {p.education.map((e) => (
            <div className="exp-block" key={e.id}>
              <EditableField label="Uczelnia" fieldId={`${e.id}.school`} value={e.school.value} confidence={e.school.confidence} onSaved={upd} />
              <EditableField label="Kierunek" fieldId={`${e.id}.field`}  value={e.field.value}  confidence={e.field.confidence}  onSaved={upd} />
              <EditableField label="Stopień"  fieldId={`${e.id}.degree`} value={e.degree.value} confidence={e.degree.confidence} onSaved={upd} />
              <EditableField label="Rok"      fieldId={`${e.id}.to`}     value={e.to.value}     confidence={e.to.confidence}     onSaved={upd} />
            </div>
          ))}
        </section>
      )}

      {/* ── CERTYFIKATY ────────────────────────────────────────────────── */}
      <section className="card">
        <h2>Certyfikaty i uprawnienia</h2>
        {p.certificates.length === 0 && (
          <p className="lead">
            Nic nie odczytano. Warto dopisać: prawo jazdy z kategorią, uprawnienia SEP,
            certyfikaty księgowe lub językowe, PRINCE2, Scrum — bywają wymogiem w ogłoszeniach.
          </p>
        )}
        <div className="row" style={{ gap: 6 }}>
          {p.certificates.map((c) => (
            <span key={c.id} className="pill">
              {c.name}
              <button className="mini neutral" style={{ padding: "0 4px", border: 0, background: "none" }}
                onClick={() => patch({ fieldId: c.id, value: null })} title="Usuń">×</button>
            </span>
          ))}
        </div>
        <AddChip kind="certificate" placeholder="np. Prawo jazdy kat. B" label="Dodaj certyfikat" onSaved={upd} />
      </section>

      <p className="muted" style={{ marginTop: 24 }}>
        Ostatnia zmiana: {new Date(p.updatedAt).toLocaleString("pl-PL")} ·
        Dane są wyłącznie na Twoim komputerze, w pliku <code>data/profile.json</code>.
      </p>
    </div>
  );
}

function QuestionCard({ q, onSaved }: { q: { fieldId: string; question: string; why: string }; onSaved: (j: unknown) => void }) {
  const [v, setV] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!v.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/profile/field", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId: q.fieldId, value: v }),
      });
      if (r.ok) onSaved(await r.json());
    } finally { setSaving(false); }
  };

  return (
    <div className="question">
      <p><strong>{q.question}</strong></p>
      <div className="why">{q.why}</div>
      <div className="field-edit">
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Twoja odpowiedź"
          onKeyDown={(e) => e.key === "Enter" && save()} />
        <button className="mini" onClick={save} disabled={saving || !v.trim()}>{saving ? "…" : "Zapisz"}</button>
      </div>
    </div>
  );
}

function SkillChip({ id, name, depth, onSaved }: { id: string; name: string; depth: string; onSaved: (j: unknown) => void }) {
  const next = { mentioned: "used", used: "core", core: "mentioned" } as Record<string, string>;
  const cls = depth === "core" ? "strong" : depth === "used" ? "" : "";

  const cycle = async () => {
    const r = await fetch("/api/profile/field", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: `${id}:depth`, value: next[depth] }),
    });
    if (r.ok) onSaved(await r.json());
  };

  const remove = async () => {
    const r = await fetch("/api/profile/field", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId: id, value: null }),
    });
    if (r.ok) onSaved(await r.json());
  };

  return (
    <span className={`pill ${cls}`} style={{ opacity: depth === "mentioned" ? .6 : 1 }}>
      <span onClick={cycle} style={{ cursor: "pointer" }} title="Kliknij, żeby zmienić poziom">{name}</span>
      <button className="mini neutral" style={{ padding: "0 3px", border: 0, background: "none", fontSize: 14 }}
        onClick={remove} title="Usuń">×</button>
    </span>
  );
}

function AddChip({ kind, placeholder, label, onSaved }: { kind: string; placeholder: string; label: string; onSaved: (j: unknown) => void }) {
  const [v, setV] = useState("");
  const add = async () => {
    if (!v.trim()) return;
    const r = await fetch("/api/profile/field", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: { kind, value: v } }),
    });
    if (r.ok) { onSaved(await r.json()); setV(""); }
  };
  return (
    <div className="chip-add">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => e.key === "Enter" && add()} />
      <button className="mini" onClick={add} disabled={!v.trim()}>{label}</button>
    </div>
  );
}
