@echo off
chcp 65001 >nul
title Praca na miare
cd /d "%~dp0"

echo.
echo   ========================================
echo     PRACA NA MIARE
echo   ========================================
echo.

REM ==========================================================================
REM  KROK 1 - naprawa najczestszego bledu na Windows
REM
REM  Notatnik domyslnie dopisuje .txt do nazwy pliku. Powstaje wtedy
REM  ".env.local.txt" zamiast ".env.local". Windows ukrywa znane rozszerzenia,
REM  wiec w folderze nadal widac "env.local" i wszystko wyglada poprawnie -
REM  a aplikacja tego pliku nie widzi i klucz "znika" przy kazdym uruchomieniu.
REM ==========================================================================
if exist ".env.local.txt" (
  echo   [naprawa] Znalazlem plik .env.local.txt
  echo             Notatnik dopisal rozszerzenie .txt - zmieniam nazwe.
  if exist ".env.local" del ".env.local" >nul 2>&1
  ren ".env.local.txt" ".env.local"
  echo.
)

REM ==========================================================================
REM  KROK 2 - utworzenie pliku konfiguracyjnego, jesli go nie ma
REM ==========================================================================
if not exist ".env.local" (
  copy ".env.local.example" ".env.local" >nul
  echo   [start] Utworzylem plik ustawien .env.local
  echo.
)

REM ==========================================================================
REM  KROK 3 - uzupelnienie brakujacych ustawien przy aktualizacji aplikacji
REM ==========================================================================
findstr /b /c:"GEMINI_MODEL=" ".env.local" >nul 2>&1
if errorlevel 1 (
  echo GEMINI_MODEL=gemini-3.6-flash>>".env.local"
  echo   [aktualizacja] Dopisalem GEMINI_MODEL do ustawien.
  echo.
)

REM ==========================================================================
REM  KROK 4 - klucz do modelu AI
REM
REM  Klucz wpisuje sie TUTAJ, w tym oknie. Plik zapisuje program, wiec
REM  Notatnik w ogole nie bierze w tym udzialu i nie ma jak nic zepsuc.
REM ==========================================================================
findstr /r /c:"^GEMINI_API_KEY=." ".env.local" >nul 2>&1
if not errorlevel 1 goto KLUCZ_OK

echo   ----------------------------------------
echo     BRAKUJE KLUCZA DO MODELU AI
echo   ----------------------------------------
echo.
echo   Klucz jest darmowy. Wez go stad:
echo     https://aistudio.google.com/apikey
echo.
echo   Zaloguj sie kontem Google, kliknij "Create API key",
echo   skopiuj klucz i wklej go tutaj ponizej.
echo.
echo   (wklejanie: prawy przycisk myszy albo Ctrl+V, potem Enter)
echo.
set "KEY="
set /p "KEY=  Klucz: "

if not defined KEY goto BRAK_KLUCZA

powershell -NoProfile -ExecutionPolicy Bypass -Command "$k='%KEY%'.Trim(); $p='.env.local'; $c=@(Get-Content -LiteralPath $p); if($c -match '^GEMINI_API_KEY='){$c = $c -replace '^GEMINI_API_KEY=.*', ('GEMINI_API_KEY=' + $k)} else {$c += ('GEMINI_API_KEY=' + $k)}; Set-Content -LiteralPath $p -Value $c"

findstr /r /c:"^GEMINI_API_KEY=." ".env.local" >nul 2>&1
if errorlevel 1 goto ZAPIS_NIEUDANY

echo.
echo   [OK] Klucz zapisany na stale w pliku .env.local
echo        Przy kolejnych uruchomieniach nie bedzie juz o niego pytal.
echo.
goto KLUCZ_OK

:BRAK_KLUCZA
echo.
echo   Nie wklejono klucza. Bez niego aplikacja nie przeanalizuje CV.
echo   Uruchom ten plik ponownie, gdy bedziesz miec klucz.
echo.
pause
exit /b 1

:ZAPIS_NIEUDANY
echo.
echo   [BLAD] Nie udalo sie zapisac klucza do pliku.
echo          Sprawdz, czy folder nie jest tylko do odczytu.
echo.
pause
exit /b 1

:KLUCZ_OK

REM ==========================================================================
REM  KROK 5 - ostrzezenie o OneDrive
REM ==========================================================================
echo %CD% | findstr /i "OneDrive" >nul 2>&1
if not errorlevel 1 (
  echo   ----------------------------------------
  echo     UWAGA - projekt lezy w folderze OneDrive
  echo   ----------------------------------------
  echo   Instalacja bedzie bardzo wolna, a pliki ustawien moga sie
  echo   cofac przy synchronizacji. Przenies caly folder np. do:
  echo       C:\Projekty\praca-na-miare
  echo.
)

REM ==========================================================================
REM  KROK 6 - czy Node.js w ogole jest zainstalowany
REM ==========================================================================
where node >nul 2>&1
if errorlevel 1 goto BRAK_NODE

REM ==========================================================================
REM  KROK 7 - zaleznosci
REM
REM  Sprawdzamy KONKRETNY plik uruchomieniowy, a nie sam folder node_modules.
REM  Sam folder moze istniec, a byc niekompletny w srodku - wtedy pojawia sie
REM  blad "'next' is not recognized".
REM
REM  Dwie najczestsze drogi do tego stanu:
REM    1. folder projektu skopiowano z innego komputera razem z node_modules
REM       (te pliki sa przygotowane pod konkretna maszyne i sie nie przenosza),
REM    2. instalacja zostala przerwana w polowie.
REM ==========================================================================
if exist "node_modules\.bin\next.cmd" goto ZALEZNOSCI_OK

if not exist "node_modules" goto INSTALUJ

echo   ----------------------------------------
echo     NAPRAWA INSTALACJI
echo   ----------------------------------------
echo   Folder node_modules istnieje, ale brakuje w nim programu Next.
echo   Zwykle znaczy to, ze projekt skopiowano z innego komputera
echo   albo instalacja przerwala sie w polowie.
echo.
echo   Usuwam ten folder i instaluje od nowa. Nic innego nie ruszam.
echo.
rmdir /s /q "node_modules" >nul 2>&1
if exist "package-lock.json" del /q "package-lock.json" >nul 2>&1
echo.

:INSTALUJ
echo   [start] Instaluje zaleznosci. To potrwa kilka minut.
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto BLAD_INSTALACJI

if not exist "node_modules\.bin\next.cmd" goto INSTALACJA_NIEPELNA
echo.

:ZALEZNOSCI_OK

REM ==========================================================================
REM  KROK 8 - wybor wolnego portu
REM
REM  Gdy port 3000 jest zajety, Next sam przechodzi na inny - a przegladarka
REM  zostalaby otwarta pod zlym adresem. Dlatego wybieramy port sami.
REM ==========================================================================
set "PORT=3000"
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if errorlevel 1 goto PORT_OK
set "PORT=3100"
echo   [uwaga] Port 3000 jest zajety przez inny program.
echo           Uruchamiam aplikacje na porcie 3100.
echo.
:PORT_OK

REM ==========================================================================
REM  KROK 9 - start
REM
REM  Przegladarke otwieramy DOPIERO gdy serwer zacznie odpowiadac.
REM  Wczesniej otwarta karta pokazuje "witryna nieosiagalna", bo Next
REM  potrzebuje kilkunastu sekund na uruchomienie.
REM ==========================================================================
echo   ----------------------------------------
echo     Uruchamiam aplikacje...
echo     http://localhost:%PORT%
echo   ----------------------------------------
echo.
echo   Przegladarka otworzy sie SAMA, gdy aplikacja bedzie gotowa.
echo   Zwykle trwa to od 10 do 30 sekund. Nie zamykaj tego okna.
echo.

start "" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "$u='http://localhost:%PORT%'; for($i=0; $i -lt 120; $i++){ try{ $null = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2; Start-Process $u; break } catch { Start-Sleep -Milliseconds 1000 } }"

call npm run dev -- -p %PORT%

echo.
echo   ----------------------------------------
echo     Aplikacja zostala zatrzymana.
echo   ----------------------------------------
echo.
echo   Jesli powyzej widac czerwony blad - skopiuj go i pokaz Claude.
echo.
pause
exit /b 0

REM ==========================================================================
:BRAK_NODE
echo   ----------------------------------------
echo     BRAKUJE NODE.JS
echo   ----------------------------------------
echo.
echo   Aplikacja go potrzebuje, zeby dzialac. Instalacja jest darmowa:
echo.
echo     1. Wejdz na https://nodejs.org
echo     2. Pobierz wersje oznaczona jako LTS
echo     3. Zainstaluj, klikajac Dalej na kazdym kroku
echo     4. Uruchom ten plik ponownie
echo.
start "" https://nodejs.org
pause
exit /b 1

REM ==========================================================================
:BLAD_INSTALACJI
echo.
echo   ----------------------------------------
echo     INSTALACJA SIE NIE POWIODLA
echo   ----------------------------------------
goto PORADA

REM ==========================================================================
:INSTALACJA_NIEPELNA
echo.
echo   ----------------------------------------
echo     INSTALACJA SIE NIE DOKONCZYLA
echo   ----------------------------------------
echo   npm zakonczyl sie bez bledu, ale brakuje programu Next.
echo   To niemal zawsze oznacza, ze synchronizacja przerwala zapis plikow.
goto PORADA

REM ==========================================================================
:PORADA
echo.
echo   MOZLIWE PRZYCZYNY, od najczestszej:
echo.
echo   1. Folder projektu zostal skopiowany z innego komputera
echo      RAZEM z folderem node_modules.
echo      Ten folder zawiera pliki przygotowane pod konkretna maszyne
echo      i nie przenosi sie poprawnie - trzeba go odtworzyc na miejscu.
echo      Rozwiazanie: usun node_modules i uruchom ten plik ponownie.
echo.
echo   2. Poprzednia instalacja zostala przerwana
echo      - zamknieciem okna, uspieniem komputera albo brakiem miejsca.
echo      Rozwiazanie: to samo co wyzej.
echo.
echo   3. Brak polaczenia z internetem podczas instalacji.
echo.
echo   4. Program antywirusowy blokuje zapis plikow przez npm.
echo.
echo   5. Projekt lezy w folderze synchronizowanym do chmury
echo      - OneDrive, Dropbox, Google Drive. Synchronizacja potrafi
echo      przerwac zapis w polowie.
echo      Rozwiazanie: PRZENIES-POZA-ONEDRIVE.bat
echo.
echo   ----------------------------------------
echo   RECZNA NAPRAWA - wpisz w tym oknie:
echo.
echo       rmdir /s /q node_modules
echo       npm install
echo.
echo   ----------------------------------------
echo.
pause
exit /b 1
