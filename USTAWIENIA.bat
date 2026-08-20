@echo off
chcp 65001 >nul
title Praca na miare - ustawienia
cd /d "%~dp0"

REM ==========================================================================
REM  Podglad i zmiana ustawien bez otwierania Notatnika.
REM
REM  Istnieje po to, zeby nigdy nie trzeba bylo recznie edytowac .env.local -
REM  bo recznie edytowany plik to najczestsze zrodlo problemu "klucz znika".
REM ==========================================================================

if exist ".env.local.txt" (
  if exist ".env.local" del ".env.local" >nul 2>&1
  ren ".env.local.txt" ".env.local"
  echo   [naprawa] Poprawilem nazwe pliku .env.local.txt
  echo.
)

if not exist ".env.local" (
  copy ".env.local.example" ".env.local" >nul
)

:MENU
cls
echo.
echo   ========================================
echo     USTAWIENIA - Praca na miare
echo   ========================================
echo.
echo   Plik ustawien:
echo   %CD%\.env.local
echo.
echo   ----------------------------------------
echo     Co jest ustawione
echo   ----------------------------------------
call :STAN "GEMINI_API_KEY"  "Klucz Gemini - wymagany"
call :STAN "GEMINI_MODEL"    "Model Gemini"
call :STAN "ADZUNA_APP_ID"   "Adzuna - identyfikator"
call :STAN "ADZUNA_APP_KEY"  "Adzuna - klucz"
call :STAN "JOOBLE_API_KEY"  "Jooble - klucz"
call :STAN "INGEST_TOKEN"    "Token wtyczki"
echo.
echo   ----------------------------------------
echo   1. Ustaw klucz Gemini      (aistudio.google.com/apikey)
echo   2. Ustaw klucze Adzuna     (developer.adzuna.com)
echo   3. Ustaw klucz Jooble      (pl.jooble.org/api/about)
echo   4. Wygeneruj token wtyczki
echo   5. Zmien model Gemini
echo   0. Wyjscie
echo.
set "WYBOR="
set /p "WYBOR=  Wybierz numer: "

if "%WYBOR%"=="1" goto GEMINI
if "%WYBOR%"=="2" goto ADZUNA
if "%WYBOR%"=="3" goto JOOBLE
if "%WYBOR%"=="4" goto TOKEN
if "%WYBOR%"=="5" goto MODEL
if "%WYBOR%"=="0" exit /b 0
goto MENU

:GEMINI
echo.
echo   Darmowy klucz: https://aistudio.google.com/apikey
set "V="
set /p "V=  Wklej klucz Gemini: "
if defined V call :ZAPISZ "GEMINI_API_KEY" "%V%"
goto MENU

:ADZUNA
echo.
echo   Rejestracja: https://developer.adzuna.com/
set "V="
set /p "V=  ADZUNA_APP_ID: "
if defined V call :ZAPISZ "ADZUNA_APP_ID" "%V%"
set "V="
set /p "V=  ADZUNA_APP_KEY: "
if defined V call :ZAPISZ "ADZUNA_APP_KEY" "%V%"
goto MENU

:JOOBLE
echo.
echo   Darmowy klucz na wniosek: https://pl.jooble.org/api/about
set "V="
set /p "V=  Wklej klucz Jooble: "
if defined V call :ZAPISZ "JOOBLE_API_KEY" "%V%"
goto MENU

:TOKEN
for /f %%T in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"') do set "V=%%T"
call :ZAPISZ "INGEST_TOKEN" "%V%"
echo.
echo   Wygenerowany token:
echo   %V%
echo.
echo   Skopiuj go i wklej w opcjach wtyczki w przegladarce.
echo.
pause
goto MENU

:MODEL
echo.
echo   Lista modeli: https://ai.google.dev/gemini-api/docs/models
echo   Domyslny: gemini-3.6-flash
set "V="
set /p "V=  Nazwa modelu: "
if defined V call :ZAPISZ "GEMINI_MODEL" "%V%"
goto MENU

REM ==========================================================================
:ZAPISZ
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n='%~1'; $v='%~2'.Trim(); $p='.env.local'; $c=@(Get-Content -LiteralPath $p); if($c -match ('^'+$n+'=')){$c = $c -replace ('^'+$n+'=.*'), ($n+'='+$v)} else {$c += ($n+'='+$v)}; Set-Content -LiteralPath $p -Value $c"
echo   [OK] Zapisano %~1
timeout /t 1 >nul
exit /b 0

REM ==========================================================================
REM Bez blokow if-else z nawiasami: tekst opisu moglby zawierac nawias
REM i przedwczesnie zamknac blok. Skoki przez etykiety sa odporne na to.
:STAN
findstr /r /c:"^%~1=." ".env.local" >nul 2>&1
if errorlevel 1 goto STAN_BRAK
echo     [ustawione]  %~2
exit /b 0
:STAN_BRAK
echo     [ brak  ]  %~2
exit /b 0
