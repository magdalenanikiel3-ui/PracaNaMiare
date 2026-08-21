import type { MasterProfile } from "./schema";

/**
 * EDYCJA PROFILU PO IDENTYFIKATORZE POLA
 *
 * Tu zwraca się decyzja z samego początku projektu: każde pole Master Profile
 * ma stabilny identyfikator (`person.lastName`, `exp.2.title`, `skill.7`).
 *
 * Dzięki temu interfejs nie musi znać struktury danych — wysyła po prostu
 * "ustaw pole o tym identyfikatorze na taką wartość". Ten sam mechanizm
 * posłuży później generatorowi CV, który będzie WYBIERAŁ pola po id
 * zamiast pisać dowolny tekst.
 *
 * WAŻNE: wartość wpisana ręcznie dostaje poziom pewności "confirmed" —
 * najwyższy z możliwych. Człowiek jest ostateczną instancją, nie model.
 * Raz potwierdzonego pola żadna kolejna analiza CV nie nadpisze po cichu.
 */

export type FieldEdit = { fieldId: string; value: string | null };

export function setFieldById(p: MasterProfile, fieldId: string, value: string | null): boolean {
  const v = value?.trim() ? value.trim() : null;

  // ── dane osobowe ─────────────────────────────────────────────────────────
  const personMatch = fieldId.match(/^person\.(\w+)$/);
  if (personMatch) {
    const key = personMatch[1] as keyof MasterProfile["person"];
    const f = p.person[key];
    if (f && !Array.isArray(f)) {
      f.value = v;
      f.confidence = v ? "confirmed" : "missing";
      return true;
    }
    return false;
  }

  if (fieldId === "headline" || fieldId === "summary") {
    p[fieldId].value = v;
    p[fieldId].confidence = v ? "confirmed" : "missing";
    return true;
  }

  // ── doświadczenie: exp.N.pole  oraz  exp.N.bM (treść punktu) ─────────────
  const expField = fieldId.match(/^(exp\.\d+)\.(company|title|from|to|industry)$/);
  if (expField) {
    const e = p.experience.find((x) => x.id === expField[1]);
    if (!e) return false;
    const key = expField[2] as "company" | "title" | "from" | "to" | "industry";
    const f = e[key];
    if (!f) return false;
    f.value = v;
    f.confidence = v ? "confirmed" : "missing";
    return true;
  }

  const bullet = fieldId.match(/^(exp\.\d+)\.b\d+$/);
  if (bullet) {
    const e = p.experience.find((x) => x.id === bullet[1]);
    const b = e?.bullets.find((x) => x.id === fieldId);
    if (!b) return false;
    if (v === null) {
      e!.bullets = e!.bullets.filter((x) => x.id !== fieldId);
    } else {
      b.text = v;
    }
    return true;
  }

  // ── umiejętności ─────────────────────────────────────────────────────────
  const skill = fieldId.match(/^skill\.\w+$/);
  if (skill) {
    const idx = p.skills.findIndex((x) => x.id === fieldId);
    if (idx < 0) return false;
    if (v === null) p.skills.splice(idx, 1);
    else p.skills[idx].name = v;
    return true;
  }

  // Zmiana poziomu umiejętności: skill.3:depth
  const skillDepth = fieldId.match(/^(skill\.\w+):depth$/);
  if (skillDepth) {
    const s = p.skills.find((x) => x.id === skillDepth[1]);
    if (!s || !v) return false;
    if (["mentioned", "used", "core"].includes(v)) {
      s.depth = v as "mentioned" | "used" | "core";
      return true;
    }
    return false;
  }

  // ── języki: lang.N (nazwa) oraz lang.N:level (poziom) ────────────────────
  const langLevel = fieldId.match(/^(lang\.\w+):level$/);
  if (langLevel) {
    const l = p.languages.find((x) => x.id === langLevel[1]);
    if (!l) return false;
    l.level = v;
    l.confidence = v ? "confirmed" : l.confidence;
    return true;
  }

  const lang = fieldId.match(/^lang\.\w+$/);
  if (lang) {
    const idx = p.languages.findIndex((x) => x.id === fieldId);
    if (idx < 0) return false;
    if (v === null) p.languages.splice(idx, 1);
    else p.languages[idx].name = v;
    return true;
  }

  // ── wykształcenie ────────────────────────────────────────────────────────
  const edu = fieldId.match(/^(edu\.\d+)\.(school|field|degree|to)$/);
  if (edu) {
    const e = p.education.find((x) => x.id === edu[1]);
    if (!e) return false;
    const key = edu[2] as "school" | "field" | "degree" | "to";
    e[key].value = v;
    e[key].confidence = v ? "confirmed" : "missing";
    return true;
  }

  // ── certyfikaty ──────────────────────────────────────────────────────────
  const cert = fieldId.match(/^cert\.\w+$/);
  if (cert) {
    const idx = p.certificates.findIndex((x) => x.id === fieldId);
    if (idx < 0) return false;
    if (v === null) p.certificates.splice(idx, 1);
    else p.certificates[idx].name = v;
    return true;
  }

  return false;
}

/** Dodanie czegoś, czego model nie znalazł w CV. */
export function addItem(p: MasterProfile, kind: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;

  if (kind === "skill") {
    const canonical = v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+#.]/g, "");
    if (p.skills.some((s) => s.canonical === canonical)) return false;
    p.skills.push({
      id: `skill.u${Date.now().toString(36)}`,
      name: v, canonical,
      category: "technical",
      // Dopisane ręcznie = użytkownik potwierdza, że tego używał.
      depth: "used",
      evidenceRefs: [], yearsApprox: null,
    });
    return true;
  }

  if (kind === "language") {
    p.languages.push({ id: `lang.u${Date.now().toString(36)}`, name: v, level: null, confidence: "confirmed" });
    return true;
  }

  if (kind === "certificate") {
    p.certificates.push({ id: `cert.u${Date.now().toString(36)}`, name: v, issuer: null, date: null });
    return true;
  }

  return false;
}

/** Zamknięcie pytania, gdy użytkownik już na nie odpowiedział. */
export function resolveQuestion(p: MasterProfile, fieldId: string): void {
  p.openQuestions = p.openQuestions.filter((q) => q.fieldId !== fieldId);
}
