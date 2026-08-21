"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * PANEL BOCZNY
 *
 * Zamiast jednej długiej strony z pięcioma krokami — osobne ekrany.
 * Powód jest praktyczny: do profilu i preferencji wraca się wielokrotnie,
 * a przewijanie za każdym razem przez całą stronę męczy.
 *
 * Kropki przy pozycjach pokazują stan, żeby było widać, czego jeszcze brakuje,
 * bez wchodzenia w każdą zakładkę osobno.
 */

type Status = {
  profile: boolean;
  questions: number;
  directions: number;
  companies: number;
  offers: number;
};

const NAV = [
  { href: "/",            label: "Start",        hint: "Wgraj CV" },
  { href: "/profil",      label: "Mój profil",   hint: "Sprawdź i uzupełnij" },
  { href: "/kierunki",    label: "Kierunki",     hint: "Czego szukać" },
  { href: "/preferencje", label: "Preferencje",  hint: "Gdzie i za ile" },
  { href: "/firmy",       label: "Obserwowane",  hint: "Zakładki Kariera" },
  { href: "/oferty",      label: "Oferty",       hint: "Wyniki" },
];

export default function Sidebar() {
  const path = usePathname();
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [p, d, w, o] = await Promise.all([
          fetch("/api/profile").then((r) => r.json()),
          fetch("/api/expand").then((r) => r.json()),
          fetch("/api/watchlist").then((r) => r.json()),
          fetch("/api/search").then((r) => r.json()),
        ]);
        if (!alive) return;
        setS({
          profile: (p.experience?.length ?? 0) > 0 || (p.skills?.length ?? 0) > 0,
          questions: p.openQuestions?.length ?? 0,
          directions: (d.directions ?? []).filter((x: { accepted?: boolean }) => x.accepted).length,
          companies: w.companies?.length ?? 0,
          offers: o.results?.length ?? 0,
        });
      } catch { /* panel działa też bez danych */ }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [path]);

  const badge = (href: string): { text: string; kind: "ok" | "warn" | "none" } => {
    if (!s) return { text: "", kind: "none" };
    switch (href) {
      case "/":            return s.profile ? { text: "✓", kind: "ok" } : { text: "", kind: "none" };
      case "/profil":      return s.questions > 0 ? { text: String(s.questions), kind: "warn" }
                                 : s.profile ? { text: "✓", kind: "ok" } : { text: "", kind: "none" };
      case "/kierunki":    return s.directions > 0 ? { text: String(s.directions), kind: "ok" } : { text: "", kind: "none" };
      case "/firmy":       return s.companies > 0 ? { text: String(s.companies), kind: "ok" } : { text: "", kind: "none" };
      case "/oferty":      return s.offers > 0 ? { text: String(s.offers), kind: "ok" } : { text: "", kind: "none" };
      default:             return { text: "", kind: "none" };
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Praca na miarę</span>
      </div>

      <nav>
        {NAV.map((item) => {
          const active = path === item.href;
          const b = badge(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${active ? "active" : ""}`}>
              <span className="nav-main">
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
              {b.text && <span className={`nav-badge ${b.kind}`}>{b.text}</span>}
            </Link>
          );
        })}
      </nav>

      {s && s.questions > 0 && (
        <Link href="/profil" className="sidebar-note">
          System ma {s.questions} {s.questions === 1 ? "pytanie" : "pytań"} — nie zgaduje, woli dopytać.
        </Link>
      )}
    </aside>
  );
}
