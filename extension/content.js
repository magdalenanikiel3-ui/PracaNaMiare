/**
 * WTYCZKA — ZBIERACZ OFERT
 *
 * ZASADA DZIAŁANIA I JEJ UZASADNIENIE:
 *
 * Wtyczka NIE przegląda portalu automatycznie, NIE otwiera stron w tle,
 * NIE pobiera list wyników i NIE buduje żadnej bazy ofert.
 *
 * Robi dokładnie jedno: gdy użytkownik ma otwarte konkretne ogłoszenie
 * i SAM kliknie przycisk, odczytuje to, co widzi na ekranie, i wysyła
 * do aplikacji działającej na jego własnym komputerze (localhost).
 *
 * Dlaczego to ma znaczenie:
 *   - użytkownik przetwarza treść, którą przed chwilą legalnie zobaczył,
 *   - nie generujemy ruchu automatycznego po serwerach portalu,
 *   - nie powstaje kopia bazy ofert,
 *   - dane nie opuszczają komputera użytkownika,
 *   - każde pobranie jest świadomą decyzją człowieka, nie robota.
 *
 * To wyraźnie inna sytuacja niż scraping po stronie serwera. Nie znaczy to,
 * że ryzyko jest zerowe — patrz sekcja "Kwestie prawne" w README.
 */

const PORTALS = [
  {
    match: /pracuj\.pl/,
    name: "Pracuj.pl",
    title: ['[data-test="text-positionName"]', "h1"],
    company: ['[data-test="text-employerName"]', '[data-test="anchor-company-link"]'],
    location: ['[data-test="text-region"]', '[data-test="sections-benefit-workplaces"]'],
    salary: ['[data-test="text-earningAmount"]', '[data-test="section-salary"]'],
    contract: ['[data-test="sections-benefit-contracts"]'],
    body: ['[data-test="section-offer"]', '[data-test="text-about-project"]', "main"],
  },
  {
    match: /olx\.pl/,
    name: "OLX Praca",
    title: ['[data-cy="offer_title"]', "h1"],
    company: ['[data-testid="user-profile-user-name"]', '[data-cy="seller_card"]'],
    location: ['[data-testid="location-date"]', '[data-testid="map-aside-section"]'],
    salary: ['[data-testid="ad-price-container"]', ".css-e2ir3r"],
    contract: [],
    body: ['[data-cy="ad_description"]', "main"],
  },
  {
    match: /linkedin\.com/,
    name: "LinkedIn",
    title: [".job-details-jobs-unified-top-card__job-title", "h1"],
    company: [".job-details-jobs-unified-top-card__company-name"],
    location: [".job-details-jobs-unified-top-card__primary-description-container"],
    salary: [],
    contract: [],
    body: [".jobs-description__content", "#job-details"],
  },
  {
    match: /theprotocol\.it/,
    name: "theProtocol.it",
    title: ['[data-test="text-offerTitle"]', "h1"],
    company: ['[data-test="text-employerName"]'],
    location: ['[data-test="section-workplace"]'],
    salary: ['[data-test="text-contractSalary"]'],
    contract: ['[data-test="section-contractType"]'],
    body: ['[data-test="section-requirements"]', "main"],
  },
  {
    match: /justjoin\.it/,
    name: "JustJoin.it",
    title: ["h1"],
    company: ['[data-testid="company-name"]'],
    location: ['[data-testid="offer-location"]'],
    salary: ['[data-testid="salary"]'],
    contract: [],
    body: ["main"],
  },
  {
    match: /nofluffjobs\.com/,
    name: "NoFluffJobs",
    title: ["h1"],
    company: ["#postingCompanyUrl", "a[href*='/company/']"],
    location: ["#postingLocations", "common-posting-locations"],
    salary: ["#posting-salary", "common-posting-salaries"],
    contract: [],
    body: ["#posting-requirements", "main"],
  },
];

function pick(selectors) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    const t = el?.innerText?.trim();
    if (t) return t.replace(/\s+/g, " ").slice(0, 400);
  }
  return "";
}

function portal() {
  return PORTALS.find((p) => p.match.test(location.hostname));
}

function scrape() {
  const p = portal();
  if (!p) return null;
  const title = pick(p.title);
  if (!title) return null;

  let body = "";
  for (const s of p.body) {
    const el = document.querySelector(s);
    if (el?.innerText && el.innerText.length > body.length) body = el.innerText;
  }

  return {
    portal: p.name,
    url: location.href.split("?")[0],
    title,
    company: pick(p.company),
    location: pick(p.location),
    salary: pick(p.salary),
    contract: pick(p.contract),
    description: body.replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000),
  };
}

async function send() {
  const btn = document.getElementById("pnm-btn");
  const data = scrape();
  if (!data) { flash("Nie rozpoznaję tej strony jako ogłoszenia", "#9c3328"); return; }

  const { token, appUrl } = await chrome.storage.sync.get(["token", "appUrl"]);
  if (!token) { flash("Najpierw ustaw token w opcjach wtyczki", "#9c3328"); return; }

  btn.textContent = "Wysyłam…";
  try {
    const r = await fetch(`${appUrl || "http://localhost:3000"}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": token },
      body: JSON.stringify(data),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    flash(`Zapisano (${j.total} w skrzynce)`, "#2f6b4f");
  } catch (e) {
    flash(e.message.includes("Failed to fetch") ? "Aplikacja nie działa — uruchom URUCHOM.bat" : e.message, "#9c3328");
  }
}

function flash(msg, color) {
  const btn = document.getElementById("pnm-btn");
  if (!btn) return;
  btn.textContent = msg;
  btn.style.background = color;
  setTimeout(() => { btn.textContent = "Zapisz w Praca na miarę"; btn.style.background = "#7c4f2a"; }, 2600);
}

function mount() {
  if (document.getElementById("pnm-btn") || !portal() || !scrape()) return;
  const b = document.createElement("button");
  b.id = "pnm-btn";
  b.textContent = "Zapisz w Praca na miarę";
  b.style.cssText = `
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
    background: #7c4f2a; color: #fff; border: 0; border-radius: 9px;
    padding: 11px 17px; font: 500 14px system-ui, sans-serif; cursor: pointer;
    box-shadow: 0 3px 14px rgba(0,0,0,.22);`;
  b.onclick = send;
  document.body.appendChild(b);
}

mount();
// Portale to aplikacje jednostronicowe — po zmianie oferty przycisk trzeba odtworzyć.
let last = location.href;
setInterval(() => {
  if (location.href !== last) {
    last = location.href;
    document.getElementById("pnm-btn")?.remove();
    setTimeout(mount, 1200);
  }
}, 1000);
