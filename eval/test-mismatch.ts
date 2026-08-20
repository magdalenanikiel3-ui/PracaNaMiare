/**
 * TEST WYKRYWANIA MYLĄCYCH NAZW —  npm run test:mismatch
 *
 * Czysta logika, bez sieci i bez modelu AI: uruchamia się w ułamku sekundy
 * i nic nie kosztuje. Dlatego uruchamiaj go po KAŻDEJ zmianie progów
 * w title-mismatch.ts.
 *
 * Progi są celowo ostre. Etykieta „myląca nazwa", która pojawia się przy co
 * drugiej ofercie, przestaje cokolwiek znaczyć — a to ma być najmocniejszy
 * sygnał w całym wyniku wyszukiwania.
 */
import { detectMismatch } from "../src/lib/matching/title-mismatch";
import { buildSkillQueries } from "../src/lib/ai/expand-queries";
import { emptyProfile, canonicalizeSkill } from "../src/lib/profile/schema";
import type { Offer } from "../src/lib/sources/types";

const p = emptyProfile();
p.headline = { id: "headline", value: "Analityk BI", confidence: "high", evidence: [] };
p.acceptedDirections = ["Analityk BI", "Analityk danych"];
p.experience = [{
  id: "exp.0",
  company: { id: "a", value: "Firma", confidence: "high", evidence: [] },
  title:   { id: "b", value: "Specjalista ds. raportowania", confidence: "high", evidence: [] },
  from:    { id: "c", value: "2020-01", confidence: "high", evidence: [] },
  to:      { id: "d", value: "2024-06", confidence: "high", evidence: [] },
  bullets: [],
}];
p.skills = [
  ["Power BI","tool","core"], ["SQL","technical","core"], ["Excel","tool","core"],
  ["DAX","technical","used"], ["raportowanie","business","used"],
  ["komunikatywność","soft","core"],
].map(([name,category,depth],i)=>({
  id:`skill.${i}`, name, canonical: canonicalizeSkill(name),
  category: category as never, depth: depth as never, evidenceRefs: [], yearsApprox: null,
}));

const mk = (title: string, skills: string[]): Offer => ({
  id:"x", source:"t", sourceLabel:"T", title, company:null, location:null, remote:"unknown",
  salaryMin:null, salaryMax:null, salaryCurrency:null, salaryPeriod:null, contract:null,
  description:"", skills, publishedAt:null, url:"http://x",
});

const cases: [string, string[], boolean][] = [
  ["Specjalista ds. wsparcia biznesu", ["power bi","sql","excel","dax"], true],
  ["Koordynator ds. administracji",    ["excel","sql","raportowanie"],   true],
  ["Analityk BI",                      ["power bi","sql","excel"],       false],
  ["Starszy Analityk danych",          ["sql","excel","power bi"],       false],
  ["Kierowca kat. C+E",                ["prawo jazdy"],                  false],
  ["Konsultant ds. wdrożeń",           ["sql","excel","power bi","dax"], true],
  ["Specjalista ds. raportowania",     ["excel","sql","power bi"],       false],
];

console.log("\nWYKRYWANIE MYLĄCYCH NAZW\n" + "─".repeat(72));
let ok = 0;
for (const [title, skills, expected] of cases) {
  const matched = skills.map(canonicalizeSkill).filter(c => p.skills.some(s => s.canonical === c));
  const m = detectMismatch(p, mk(title, skills), matched, skills.length);
  const pass = m.flagged === expected;
  if (pass) ok++;
  console.log(`${pass?"✓":"✗"} ${m.flagged?"OZNACZONA":"zwykła   "}  ${title}`);
  console.log(`     znajomość nazwy ${(m.titleFamiliarity*100).toFixed(0)}% · dopasowanie wymagań ${(m.requirementsFit*100).toFixed(0)}%${pass?"":`  ← OCZEKIWANO ${expected?"OZNACZONEJ":"zwykłej"}`}`);
}
console.log("─".repeat(72));
console.log(`${ok}/${cases.length} przypadków zgodnych\n`);
console.log("ZAPYTANIA PO WYMAGANIACH (obok nazw stanowisk):");
console.log("  " + buildSkillQueries(p).join("\n  ") + "\n");
if (ok !== cases.length) process.exit(1);
