# Jak wrzucić projekt na GitHub

Zajmie 15 minut. Rozwiązuje trzy rzeczy naraz: adres do rejestracji w Adzunie,
przenoszenie plików między komputerami i kopię zapasową całej pracy.

---

## ⚠️ Zanim zaczniesz — jedna rzecz, której NIE rób

**Nie przeciągaj folderu na stronę github.com.**

Wgrywanie przez stronę ignoruje plik `.gitignore`, przez co wysłałabyś:

- `.env.local` — z Twoim kluczem API
- `data/profile.json` — z Twoim imieniem, nazwiskiem, telefonem i historią zatrudnienia
- `node_modules` — kilkadziesiąt tysięcy niepotrzebnych plików

Boty skanują GitHub w czasie rzeczywistym i wyłapują klucze API w kilka minut.
Program opisany niżej pilnuje tego za Ciebie automatycznie.

---

## 1. Zainstaluj GitHub Desktop

<https://desktop.github.com>

Pobierz, zainstaluj, zaloguj się kontem GitHub, które właśnie założyłaś.

To program z oknami i przyciskami — nie trzeba niczego wpisywać w konsoli.

---

## 2. Dodaj projekt

W GitHub Desktop:

1. Menu **File** → **Add local repository**
2. **Choose…** → wskaż folder `praca-na-miare`
3. Pojawi się komunikat, że to nie jest jeszcze repozytorium —
   kliknij odnośnik **create a repository**
4. Sprawdź pola:
   - **Name**: `praca-na-miare`
   - **Git ignore**: zostaw **None** — mamy już własny, lepszy plik
   - **License**: `MIT` jeśli chcesz, żeby inni mogli korzystać. Możesz pominąć.
5. **Create repository**

---

## 3. Sprawdź, co zostanie wysłane — to najważniejszy krok

Po lewej stronie zobaczysz listę plików do wysłania. **Powinno być około 51 pozycji.**

Przewiń ją i upewnij się, że **NIE MA** na niej:

| Nie może się pojawić | Dlaczego |
|---|---|
| `.env.local` | Twój klucz API |
| `.env.local.txt` | to samo, wersja od Notatnika |
| `data/profile.json` | Twoje dane osobowe z CV |
| `data/inbox.json` | zapisane oferty |
| `node_modules` | kilkadziesiąt tysięcy plików |
| cokolwiek z `eval/cases/` poza `PRZYKLAD.json` | prawdziwe CV |

Jeśli którykolwiek z nich widnieje na liście — **zatrzymaj się i napisz do mnie.**
Coś jest nie tak z plikiem `.gitignore` i naprawię to, zanim cokolwiek wyjdzie.

Powinnaś natomiast zobaczyć: `src/`, `extension/`, `scripts/`, `README.md`,
pliki `.bat` i `.env.local.example` — ten ostatni to sam szablon, bez kluczy.

---

## 4. Wyślij

1. Na dole po lewej, w polu **Summary**, wpisz np. `Pierwsza wersja`
2. **Commit to main**
3. Na górze **Publish repository**
4. Odznacz **Keep this code private**, jeśli chcesz podać adres Adzunie
   — przy prywatnym repozytorium nie zobaczą strony
5. **Publish repository**

Gotowe. Adres do wklejenia w Adzunie:

```
https://github.com/TWOJA-NAZWA/praca-na-miare
```

---

## 5. Od teraz: dwa komputery bez pendrive'a

**Gdy coś zmienisz na komputerze A:**
GitHub Desktop → wpisz krótki opis → **Commit to main** → **Push origin**

**Gdy siadasz do komputera B:**
GitHub Desktop → **Fetch origin** → **Pull origin**

Za pierwszym razem na komputerze B: **File** → **Clone repository** → wybierz swój
projekt → wskaż folder np. `C:\Projekty`.

Po sklonowaniu uruchom `URUCHOM.bat` — poprosi o klucz API, bo `.env.local`
celowo nie jest przesyłany. To zamierzone: klucz zostaje na Twoich komputerach.

---

## Częste pytania

**Czy ktoś zobaczy mój klucz API?**
Nie. `.env.local` nigdy nie opuszcza Twojego komputera. Zostało to sprawdzone
symulacją wysyłki — żaden plik z kluczem ani z danymi z CV nie przechodzi.

**Czy ktoś zobaczy moje CV?**
Nie. Cały katalog `data/` i `eval/cases/` są wyłączone.

**Czy ktoś może ukraść pomysł, skoro repozytorium jest publiczne?**
Kod może skopiować każdy — ale wartość tego projektu nie leży w kodzie.
Leży w tym, że go rozumiesz, rozwijasz i wiesz, dlaczego działa tak, a nie
inaczej. Publiczne repozytorium jest za to dowodem, że to Twoja praca,
z datą przy każdej zmianie.

**Wolę prywatne.**
Też dobrze — działa wszystko poza podaniem adresu Adzunie. Wtedy w rejestracji
podaj profil LinkedIn. Prywatne repozytorium możesz upublicznić później
jednym przełącznikiem w ustawieniach.
