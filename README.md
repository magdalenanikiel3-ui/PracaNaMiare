# Praca na miarę — v0.5

Silnik wyszukiwania i dopasowania ofert pracy. Punkt ciężkości: **użytkownik nie
musi wiedzieć, jakiego stanowiska szukać.**

---

## ⚠️ Najpierw przenieś projekt poza OneDrive

Ten folder leży w OneDrive. Instalacja zależności zajmuje tam **kilkanaście
minut zamiast kilkunastu sekund** (zmierzone), bo OneDrive próbuje synchronizować
kilkadziesiąt tysięcy plików z `node_modules`.

```
Przenieś cały folder do:  C:\Projekty\praca-na-miare
```

Kopia w OneDrive niech zostanie jako backup, ale pracuj na tej poza nim.

---

## Uruchomienie

1. Weź darmowy klucz Gemini: <https://aistudio.google.com/apikey>
2. Uruchom `URUCHOM.bat` — utworzy `.env.local` i zainstaluje zależności.
3. Wklej klucz do `.env.local` jako `GEMINI_API_KEY=...`
4. Uruchom `URUCHOM.bat` ponownie → <http://localhost:3000>

**Koszt: 0 zł.** Gemini ma darmowy tier, który przy użytku własnym i testach
z pierwszymi użytkownikami w zupełności wystarcza. Dostawcę zmienisz jedną
zmienną `AI_PROVIDER` (`gemini` / `openai` / `anthropic` / `ollama`) — kod jest
od niego niezależny.

---

## Co się zmieniło względem v0.4 i dlaczego

| Obszar | v0.4 | v0.5 | Powód |
|---|---|---|---|
| Oferty | dane demo w `lib/data.ts` | 5 realnych źródeł + wtyczka | v0.4 nie wyszukiwał niczego — oferty były wpisane ręcznie |
| Nazwy stanowisk | 11 zahardkodowanych ról | 3 niezależne drogi generowania | 11 ról nie rozwiązuje problemu; magazynier czy fizjoterapeuta dostawał zero |
| Pewność | `confidence: 0.67` od modelu | wyliczana ze struktury | Modele podają źle skalibrowane liczby — „0.67" nie znaczy 67% trafności |
| Dowód | `evidence: string`, nigdy niesprawdzany | cytat weryfikowany w dokumencie | Niesprawdzany dowód to ozdoba, nie kontrola |
| Ocena oferty | `92% dopasowania` | pasma + jawne luki | Nikt nie obroni różnicy między 87% a 84%; użytkownik traci zaufanie |
| Antyhalucynacja | prośba w prompcie | filtr na wyniku | Prompt można zignorować, filtru nie |
| Baza danych | Prisma + PostgreSQL | pliki JSON | Stawianie serwera bazy przed weryfikacją pomysłu to koszt bez zwrotu |
| Jakość | brak pomiaru | zestaw wzorcowy `npm run eval` | „Nowa wersja jest lepsza" bez testu to opinia |

Z v0.4 zostały: struktura PL↔EN nazw stanowisk (rozwinięta w taksonomię),
`unpdf`, wersje Next/React i układ ekranów.

---

## Jak działa silnik nazw stanowisk

Problem nie polega na tłumaczeniu polskiego na angielski. Polega na tym, że:

1. **Nie znasz słownika rynku.** Robisz raporty w Excelu i SQL od czterech lat,
   a rynek nazywa to „Reporting Analyst", „MIS Specialist" albo „Specjalista
   ds. controllingu" — i sam(a) nie wpadniesz na żadną z tych nazw.
2. **Nie wiesz, dokąd Twoje doświadczenie może Cię przenieść.**
3. **Ten sam zawód nazywa się inaczej na każdym portalu.**

Dlatego kandydatów generujemy **trzema niezależnymi drogami**:

```
       ┌─ A. TAKSONOMIA ──── słownik PL↔EN, deterministyczny, darmowy, nie halucynuje
profil ┼─ B. MODEL AI ────── wychodzi poza listę, rozumie nietypowe ścieżki
       └─ C. RYNEK ───────── uczy się z prawdziwych ogłoszeń  ← najmocniejsza
```

**Droga C jest sednem.** Po pierwszym, szerokim przeszukaniu system bierze
znalezione oferty i sprawdza, które z nich mają wysokie pokrycie wymagań
z Twoimi umiejętnościami. Nazwy **tych** ofert to prawdziwy słownik rynku dla
Twojego profilu. Potem uruchamia drugie wyszukiwanie — już tymi nazwami.

Pierwszy przebieg zgaduje. Drugi korzysta ze słownika, którego system nauczył
się z rynku. To jest ta wartość, której nie da wyszukiwarka żadnego portalu —
bo żaden portal nie zna Twojego profilu.

Kierunki trafiają do Ciebie jako propozycje z uzasadnieniem. **AI proponuje,
decydujesz Ty.**

### Ale nazwy to tylko sposób wyciągnięcia ofert, nie kryterium dopasowania

W polskich ogłoszeniach nazwa bywa przypadkowa. „Specjalista ds. wsparcia
biznesu" to często czysta analityka. „Koordynator ds. administracji" bywa
w 70% pracą w Excelu. Nazwa mówi, jak firma nazywa etat w swojej strukturze —
nie co się w nim robi.

Dlatego system szuka **dwiema osiami naraz**:

- **po nazwach stanowisk** — łapie oferty nazwane tak, jak się spodziewamy,
- **po kombinacjach wymagań** (`Power BI SQL`, `Excel DAX`) — łapie oferty,
  których nazwa jest myląca, ale których treść pasuje.

Oferta „Specjalista ds. wsparcia biznesu" nigdy nie wypadnie z zapytania
„Analityk BI". Wypadnie z zapytania „Power BI SQL".

### „Nie znalazłabyś ich po nazwie"

Gdy nazwa oferty **nie przypomina** niczego, czego szukasz, ale jej wymagania
pokrywają się mocno z Twoim profilem — system oznacza ją osobno i wypycha
na górę listy.

To jest najcenniejszy wynik w całym wyszukiwaniu. Skoro Ty sama byś na nią
nie trafiła, prawdopodobnie nie trafiła też połowa innych kandydatów.

Wykrywanie jest deterministyczne (zero kosztu, zero AI) i ma własny test:

```bash
npm run test:mismatch
```

Progi są celowo ostre. Etykieta, która pojawia się przy co drugiej ofercie,
przestaje cokolwiek znaczyć.

---

## Dwuetapowe dopasowanie

```
~300 ofert
    ↓  ETAP 1 — prefiltr deterministyczny (darmowy, natychmiastowy)
    │  twarde warunki: wynagrodzenie, tryb pracy, lokalizacja, wykluczenia
    ↓
 ~40 ofert
    ↓  ETAP 2 — reranking AI (płatny, tylko czubek listy)
    │  pasmo + uzasadnienie + luki + ostrzeżenia
    ↓
 24 ocenione oferty + analiza luk
```

Pytanie modelu o każdą z 300 ofert byłoby wolne i kosztowne, a 90% z nich odpada
na warunkach, które sprawdzisz za darmo. Różnica w koszcie: rząd wielkości.
Różnica w jakości końcowej: żadna.

**Analiza luk** odwraca perspektywę: zamiast tylko „te oferty pasują", pokazuje
„brak SQL blokuje Cię w 40% ofert, które Cię interesują". To informacja
o kierunku rozwoju, nie o jednej rekrutacji — i najtrudniejsza do skopiowania
część produktu.

---

## Źródła ofert

| Źródło | Podstawa prawna | Klucz | Charakterystyka |
|---|---|---|---|
| **CBOP** | dane publiczne MRPiPS | nie | cała Polska, także małe miejscowości; mocne w produkcji, handlu, administracji |
| **Adzuna** | oficjalne API, darmowy tier | tak | agreguje wiele portali; mocne w korporacjach i pracy biurowej |
| **Jooble** | oficjalne API, darmowy klucz | tak | szerokie pokrycie, w tym mniejsze serwisy lokalne |
| **EURES** | portal instytucji UE | nie | cała UE, dobre przy pracy zdalnej i za granicą |
| **Obserwowane firmy** | zakładki „Kariera”, wskazane przez Ciebie | nie | firmy, w których naprawdę chcesz pracować |
| **Serwisy branżowe** | publiczne wyniki wyszukiwania | nie | aktywują się same wg branży z profilu |
| **Skrzynka** | wtyczka do przeglądarki | token | Pracuj.pl, OLX, LinkedIn, theProtocol, JustJoin, NoFluffJobs |

CBOP i Adzuna mają **odwrotne profile** — razem dają pokrycie, którego nie da
żadne z osobna.

### Ile to realnie jest — i dlaczego nie warto gonić kompletu

Wg danych publikowanych przez same serwisy: **Adzuna** ma w Polsce rzędu
150–250 tys. ogłoszeń i indeksuje m.in. Pracuj.pl, Infopracę, GoldenLine
i Absolvent, a także małe portale lokalne i branżowe. **Jooble** podaje ok.
145 tys. ofert w Polsce zbieranych z ponad 4 tys. źródeł.

Wniosek praktyczny: **„przeszukuj jak najwięcej stron" jest w dużej mierze
już załatwione** — pośrednio, przez agregatory. Nie da się jednoosobowo
dogonić firm, które robią to od lat całymi zespołami, i nie ma po co.

Prawdziwe dziury są trzy: **zakładki Kariera** małych i średnich firm,
**świeżość** (agregatory mają opóźnienie) i **sektor publiczny** poza CBOP.
Pierwszą zasypują obserwowane firmy, drugą wtyczka, trzecią serwisy branżowe.

### Zmierz to sam(a), nie wierz na słowo

```bash
npm run diagnoza "analityk danych"
```

Skrypt odpytuje wszystkie źródła i pokazuje to, co naprawdę ma znaczenie:
nie ile ofert daje źródło, tylko ile daje ofert **których nie ma nigdzie
indziej**. Źródło z 200 ofertami, z których wszystkie są też w innym źródle,
jest warte zero. Uruchom dla 3–4 różnych zawodów, zanim wyciągniesz wnioski.

### ⚠️ Konektory wymagają weryfikacji przy pierwszym uruchomieniu

Zostały napisane na podstawie dokumentacji i typowych kształtów odpowiedzi,
ale **nie zostały uruchomione przeciwko żywym API** (środowisko, w którym
powstawały, nie miało dostępu do sieci). Portale zmieniają odpowiedzi bez
zapowiedzi.

```bash
npm run source              # lista źródeł i ich stan
npm run source cbop         # sprawdź jedno źródło
npm run source adzuna "analityk danych"
```

Skrypt pokazuje, co naprawdę wróciło, i ostrzega, gdy dużo pól jest pustych —
to znak, że trzeba poprawić mapowanie w `src/lib/sources/<id>.ts`. Zajmuje to
zwykle kilka minut. **Nie zgaduj — sprawdź.**

### Dołożenie nowego portalu

Jeden plik w `src/lib/sources/` implementujący `JobSource` + jedna linijka
w `registry.ts`. Zero zmian w silniku dopasowania. To celowe: dostęp do portali
jest niepewny, więc źródła muszą być wymienne.

---

## Obserwowane firmy

**Tak, każdy użytkownik wpisuje własne firmy.** I to jest sedno pomysłu,
a nie jego ograniczenie.

Nie da się przeszukać wszystkich firm w Polsce. Ale każdy ma w głowie krótką
listę miejsc, w których naprawdę chciałby pracować — i nikt dziś tej listy
nie obsługuje. Trzydzieści firm to weekend pracy, a wartość na ofertę jest
wielokrotnie wyższa niż z przypadkowego ogłoszenia z agregatora.

Przewagi zakładki „Kariera” nad portalem:

- ogłoszenie trafia tam **zanim** pojawi się na portalu, czasem o tygodnie,
- część ogłoszeń **nigdy** nie trafia na portale — firma oszczędza na publikacji,
- mniej kandydatów, bo trzeba wiedzieć, gdzie patrzeć,
- zerowe ryzyko prawne: ta zakładka istnieje po to, żeby ją czytać.

Żeby nikt nie stanął przed pustym polem, model **podpowiada firmy** na
podstawie profilu i sam sprawdza, pod jakim adresem mają zakładkę Kariera.

```bash
npm run firmy                                  # lista i stan
npm run firmy test https://firma.pl/kariera    # sprawdź adres przed dodaniem
npm run firmy add "Nazwa" https://...          # dodaj
npm run firmy refresh                          # odczytaj wszystkie od nowa
```

## Serwisy branżowe — branża to dane, nie kod

Ta aplikacja ma służyć **wszystkim**, nie tylko analitykom i finansistom.
Gdyby obsługa każdej branży wymagała osobnego konektora w kodzie,
fizjoterapeuci, kucharze i magazynierzy nigdy by się nie doczekali.

Dlatego wszystkie serwisy branżowe czyta ten sam silnik (`page-reader.ts`),
a dodanie branży to **dopisanie wiersza** w `branch-portals.ts` albo
w `data/branch-portals.json` — bez ruszania kodu.

Serwisy **aktywują się same**, na podstawie rodzin zawodowych wynikających
z wybranych kierunków. Fizjoterapeuta nie dostanie ofert IT, a programista
ogłoszeń z serwisu medycznego.

Na start wpięte: analityka, IT i finanse. Adresy wymagają sprawdzenia
przy pierwszym uruchomieniu.

## Pracuj.pl i OLX — wtyczka do przeglądarki

Tam są najważniejsze oferty, a żaden z tych portali nie udostępnia API do
agregacji i oba zabraniają automatycznego pobierania treści.

Rozwiązanie: **nie pobieramy niczego serwerem i nie budujemy własnej bazy.**
Wtyczka działa w Twojej przeglądarce, na stronie, którą sam(a) otworzyłeś/aś,
i wysyła ofertę do aplikacji na Twoim komputerze — po kliknięciu przycisku.

- nie zwielokrotniamy bazy portalu,
- nie ma ruchu automatycznego po ich serwerach,
- treść nie opuszcza Twojego urządzenia,
- każde pobranie to świadoma decyzja człowieka.

Instalacja: `extension/JAK-ZAINSTALOWAC.md`

Oferty ze skrzynki biorą udział w dopasowaniu na równi z pozostałymi — dostają
takie samo pasmo, uzasadnienie i listę luk.

---

## Zestaw wzorcowy — `npm run eval`

**Najważniejszy plik w projekcie, mimo że dziś pusty.**

Bez niego „nowa wersja parsera jest lepsza" to opinia. Zmieniasz prompt,
poprawia się jedno CV, psują się trzy inne — i dowiadujesz się o tym od
użytkownika.

Błąd „Iturri" z v0.4 został wykryty przypadkiem. `eval/run.ts` zamienia
przypadek w proces: pole `mustNotContain` to test regresji na konkretne błędy,
które już raz wystąpiły. **Błąd naprawiony bez testu wraca.**

Zanim zaczniesz poprawiać prompty: zbierz 20–50 różnorodnych CV
(jedno- i dwukolumnowe, z tabelami, ze zdjęciem, PL i EN, z różnych branż),
opisz oczekiwany wynik w `.json` i zapisz wynik jako punkt odniesienia.
Instrukcja w komentarzu na górze `eval/run.ts`.

---

## Kwestie prawne — do rozstrzygnięcia przed publicznym udostępnieniem

Aplikacja działa lokalnie i na własny użytek. **Zanim udostępnisz ją innym,
te cztery rzeczy wymagają decyzji, a trzy z nich rozmowy z prawnikiem.**

**1. Wtyczka.** Model „użytkownik czyta to, co sam otworzył" znacząco zmniejsza
ryzyko wobec scrapingu serwerowego, ale go nie zeruje. Do konsultacji przed
publicznym wydaniem.

**2. RODO.** CV to jedne z najwrażliwszych danych, jakie można zbierać masowo —
bywa w nich zdrowie, przynależność związkowa, zdjęcie. Dziś dane leżą wyłącznie
na dysku użytkownika, co jest najlepszą możliwą sytuacją. Wersja webowa wymaga:
podstawy prawnej, umowy powierzenia z dostawcą AI, polityki retencji, realnego
prawa do usunięcia, gwarancji braku treningu na danych i decyzji o rezydencji
danych w UE.

**3. AI Act.** Aneks III klasyfikuje systemy AI do rekrutacji i selekcji jako
wysokiego ryzyka. Narzędzie po stronie **kandydata** prawdopodobnie tam nie
wpada, ale sformułowanie jest niejednoznaczne — a jeśli kiedykolwiek sprzedasz
to rekruterowi, wpada na pewno. Do sprawdzenia z prawnikiem.

**4. Nazwa.** „Praca na miarę" to fraza opisowa, więc trudna do zastrzeżenia
i trudna w SEO. Sprawdź dostępność domeny i bazę znaków towarowych UPRP/EUIPO,
zanim zaczniesz budować markę.

---

## Struktura

```
src/lib/
  profile/schema.ts        Master Profile — jedyne źródło prawdy, każde pole ma id
  profile/read-document.ts wydobycie tekstu (do weryfikacji cytatów, nie do ekstrakcji)
  ai/provider.ts           warstwa dostawcy — Gemini/OpenAI/Anthropic/Ollama
  ai/extract-profile.ts    CV → profil; tu naprawiony jest błąd „Iturri"
  ai/expand-queries.ts     ★ silnik nazw stanowisk — trzy drogi
  taxonomy/pl-titles.ts    słownik PL↔EN — siatka bezpieczeństwa, nie mechanizm
  sources/                 konektory, jeden plik = jeden portal
  matching/prefilter.ts    etap 1 — darmowy
  matching/rerank.ts       etap 2 — AI, pasma zamiast procentów
extension/                 wtyczka do Chrome
eval/                      zestaw wzorcowy
```

---

## Co dalej

Kolejność świadomie inna niż w dokumencie projektowym: najtrudniejszy prawnie
element (agregacja z dużych portali) jest **na końcu**, a wartość dowozimy
wcześniej.

- **v0.6 — wskazówki rozwojowe.** Sufit wynagrodzenia („z Twoim profilem
  realny sufit to ~14 000 zł; w ofertach, które odblokowuje SQL, mediana
  to 18 500 zł"), ranking braków po zwrocie zamiast po częstości, oraz
  wymagany poziom umiejętności zamiast samego faktu jej braku. Wszystko
  liczone z ofert, które i tak są już pobrane — zero nowych źródeł.
- **v0.7 — inteligentny wywiad.** 3 pytania na raz, z możliwością powrotu,
  nie 30-minutowe przesłuchanie. Najmocniejszy wyróżnik produktu: buduje profil
  bogatszy niż CV, którego konkurencja nie ma.
- **v0.8 — generowanie CV pod ofertę.** Architektura jest już gotowa:
  generator wybiera i przeformułowuje pola po `id`, więc dopisanie
  nieistniejącego doświadczenia jest technicznie niemożliwe, a nie tylko
  zakazane w prompcie.
- **v0.9 — śledzenie aplikacji.** Proste, a mocno trzyma użytkownika
  w oknie poszukiwań.
- **v0.10 — przygotowanie do rozmowy** na bazie konkretnej oferty i profilu.
  Wysoka wartość, zero ryzyka prawnego.
- **v1.0 — rozstrzygnięcie sprawy Pracuj.pl/OLX:** rozmowa o partnerstwie,
  program afiliacyjny albo pozostanie przy modelu wtyczki.

Dwie rzeczy, których w tym projekcie nadal nie ma i które będą decydować
o jego losie bardziej niż kod: **model biznesowy** (kto płaci i dlaczego nie
wystarczy wkleić CV do ChatGPT) oraz **kanał dotarcia** (osoby szukające pracy
znikają, gdy ją znajdą — LTV jest z natury krótkie).
