/**
 * TEST EDYCJI PROFILU —  npm run test:edycja
 *
 * Sprawdza mechanizm, na ktorym stoi caly edytowalny profil: ustawianie pol
 * po identyfikatorze. Bez sieci i bez AI, wiec uruchamia sie natychmiast.
 *
 * Szczegolnie pilnuje jednej rzeczy: wartosc wpisana recznie MUSI dostac
 * poziom pewnosci "confirmed". To gwarancja, ze kolejna analiza CV nie
 * nadpisze po cichu tego, co czlowiek juz poprawil.
 */
import { emptyProfile, canonicalizeSkill } from "../src/lib/profile/schema";
import { setFieldById, addItem, resolveQuestion } from "../src/lib/profile/edit";

const p = emptyProfile();
p.experience = [{
  id: "exp.0",
  company:  { id:"a", value:"Stara", confidence:"medium", evidence:[] },
  title:    { id:"b", value:"Analityk", confidence:"low", evidence:[] },
  from:     { id:"c", value:"2020-01", confidence:"high", evidence:[] },
  to:       { id:"d", value:null, confidence:"missing", evidence:[] },
  bullets: [{ id:"exp.0.b0", text:"stary tekst", skills:[], quantified:false, evidence:[] }],
}];
p.skills = [{ id:"skill.0", name:"SQL", canonical:canonicalizeSkill("SQL"), category:"technical", depth:"mentioned", evidenceRefs:[], yearsApprox:null }];
p.languages = [{ id:"lang.0", name:"angielski", level:null, confidence:"low" }];
p.openQuestions = [{ fieldId:"lang.0:level", question:"Poziom?", why:"brak" }];

const t: [string, boolean][] = [];
const chk = (n:string, c:boolean) => t.push([n,c]);

setFieldById(p, "person.lastName", "Nikiel");
chk("dane osobowe zapisane", p.person.lastName.value === "Nikiel");
chk("pewnosc podniesiona do potwierdzonej", p.person.lastName.confidence === "confirmed");

setFieldById(p, "exp.0.company", "Nowa Firma");
chk("firma w doswiadczeniu", p.experience[0].company.value === "Nowa Firma");

setFieldById(p, "exp.0.b0", "poprawiony tekst");
chk("punkt obowiazkow", p.experience[0].bullets[0].text === "poprawiony tekst");

setFieldById(p, "skill.0:depth", "core");
chk("poziom umiejetnosci", p.skills[0].depth === "core");

setFieldById(p, "lang.0:level", "B2");
chk("poziom jezyka", p.languages[0].level === "B2");
resolveQuestion(p, "lang.0:level");
chk("pytanie zamkniete", p.openQuestions.length === 0);

addItem(p, "skill", "Power BI");
chk("dodano umiejetnosc", p.skills.some(s => s.name === "Power BI"));
chk("dodana ma poziom used", p.skills.find(s=>s.name==="Power BI")?.depth === "used");
chk("duplikat odrzucony", addItem(p, "skill", "power bi") === false);

addItem(p, "language", "niemiecki");
chk("dodano jezyk", p.languages.some(l => l.name === "niemiecki"));

setFieldById(p, "skill.0", null);
chk("usunieto umiejetnosc", !p.skills.some(s => s.id === "skill.0"));

chk("nieznane pole odrzucone", setFieldById(p, "cos.dziwnego", "x") === false);

const bad = t.filter(([,ok]) => !ok);
for (const [n,ok] of t) console.log(`  ${ok?"✓":"✗"} ${n}`);
console.log(`\n  ${t.length-bad.length}/${t.length} zaliczonych`);
if (bad.length) process.exit(1);
