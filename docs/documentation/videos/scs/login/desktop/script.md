# Erklärvideo — Mitgliederbereich: Anmelden & Passwort setzen (DESKTOP)

**Plattformen:** Windows · macOS · Linux (Desktop-Browser)
**Sprache:** Deutsch · **Zielgruppe:** Mitglieder mit sehr geringen IT-Kenntnissen
**Geschätzte Länge:** ca. 3–4 Minuten
**Vorlage:** ersetzt das bestehende Video <https://www.youtube.com/watch?v=gLmTEx-Ho9Q> (gleicher Inhalt, aktualisierte Screenshots)

> Es gibt zwei Versionen dieses Videos mit identischem Sprechertext: **Desktop** (dieses) und **Mobile** (iOS/Android). Nur die Screenshots und die Plattform-Hinweise unterscheiden sich.

---

## Produktionshinweise

- **Tempo:** langsam und ruhig. Lieber eine Pause zu viel als zu wenig. Jeder Klick wird angesagt, *bevor* er passiert.
- **Stil:** Du-Form, freundlich, ermutigend. Keine Fachbegriffe ohne Erklärung (z. B. „Adresszeile = das lange Feld ganz oben im Browser").
- **Cursor/Maus:** sichtbar und langsam bewegen. Wichtige Schaltflächen mit einem farbigen Rahmen oder Pfeil hervorheben.
- **Einblendungen:** kurze Textbausteine unten im Bild für die Plattform-Hinweise (Windows/Mac/Linux), siehe Spalte „Plattform-Hinweis".
- **Screenshots:** liegen in `./assets/` und sind unten je Szene mit Dateinamen referenziert.

---

## Screenshot-Liste (Desktop)

| Datei | Inhalt / Zustand | Quelle |
| --- | --- | --- |
| `01-browser-adresszeile.png` | Leerer Browser, Cursor in der Adresszeile, getippt `seeclub.org` | Live, Browser-Chrome sichtbar |
| `02-seeclub-staefa-mitgliederbereich.png` | Startseite `seeclub-staefa.ch`, Menüpunkt **„Mitglieder Bereich"** hervorgehoben | Live |
| `03-login-leer.png` | Anmeldeseite, Felder leer (Titel „Anmelden", Logo, E-Mail, Passwort, Buttons) | Live `/auth/login` |
| `04-login-ausgefuellt.png` | Anmeldeseite mit ausgefüllter E-Mail + Passwort (Punkte), Button „Anmelden" aktiv | Live, Test-Konto |
| `05-login-button-passwort-setzen.png` | Anmeldeseite, Button **„Passwort setzen"** hervorgehoben | Live `/auth/login` |
| `06-pwdreset-email.png` | Seite „Passwort setzen", E-Mail-Feld ausgefüllt, Buttons „Abbrechen"/„OK" | Live `/auth/pwdreset` |
| `07-pwdreset-bestaetigung.png` | Bestätigungsmeldung „Ein E-Mail mit Instruktionen … wurde verschickt …" | Live |
| `08-PLATZHALTER-reset-mail.png` | **PLATZHALTER** — die E-Mail mit dem Link (liefert Bruno) | von Hand |
| `09-confirm-neues-passwort.png` | Seite „Neues Passwort festlegen", Passwort-Feld, Button „Passwort speichern" | Live `/auth/confirm` |
| `10-confirm-erfolg.png` | Erfolgsmeldung „Passwort erfolgreich geändert …" | Live |
| `11-mitgliederbereich-home.png` | Eingeloggter Startbildschirm / Begrüssung „Willkommen im Mitgliederbereich!" | Live, Test-Konto |

---

## Storyboard & Sprechertext

### Intro

| # | Bild | Aktion | Sprechertext |
| --- | --- | --- | --- |
| 0 | Vereinslogo / Titel | Einblendung Titel „Mitgliederbereich – Anmelden & Passwort setzen" | „Herzlich willkommen! In diesem kurzen Video zeige ich dir Schritt für Schritt, wie du dich im Mitgliederbereich des Seeclub Stäfa anmeldest – und wie du dir beim ersten Mal ein Passwort setzt. Du brauchst dafür keine Vorkenntnisse. Wir machen das ganz in Ruhe gemeinsam." |

---

### Teil A — Den Mitgliederbereich öffnen

| # | Bild | Aktion | Sprechertext | Plattform-Hinweis (Einblendung) |
| --- | --- | --- | --- | --- |
| A1 | `01-browser-adresszeile.png` | Cursor zeigt auf die Adresszeile oben | „Als Erstes öffnest du deinen Internet-Browser – das ist das Programm, mit dem du im Internet surfst." | **Windows:** Edge oder Chrome · **Mac:** Safari · **Linux:** Firefox oder Chrome |
| A2 | `01-browser-adresszeile.png` | Eintippen `seeclub.org`, dann Enter | „Klicke ganz oben in das lange Feld – die Adresszeile. Tippe dort **seeclub.org** ein und drücke die Eingabe-Taste (Enter)." | „Adresszeile = das lange Feld ganz oben" |
| A3 | `02-seeclub-staefa-mitgliederbereich.png` | Mauszeiger fährt auf den Menüpunkt „Mitglieder Bereich" | „Es gibt auch einen zweiten Weg: Wenn du auf unserer Vereins-Website **seeclub-staefa.ch** bist, findest du im Menü den Punkt **„Mitglieder Bereich"**. Ein Klick darauf bringt dich genau an dieselbe Stelle." | beide Wege führen zum selben Ziel |

---

### Teil B — Anmelden (für wiederkehrende Mitglieder)

| # | Bild | Aktion | Sprechertext | Plattform-Hinweis |
| --- | --- | --- | --- | --- |
| B1 | `03-login-leer.png` | Anmeldeseite erscheint | „Jetzt siehst du die Anmeldeseite mit dem Vereinslogo und dem Titel **„Anmelden"**. Hier gibst du zwei Dinge ein: deine E-Mail-Adresse und dein Passwort." | — |
| B2 | `04-login-ausgefuellt.png` | E-Mail ins erste Feld tippen | „In das obere Feld **E-Mail** kommt die E-Mail-Adresse, auf der du die Informationen des Vereins bekommst. Verwende bitte genau diese Adresse." | — |
| B3 | `04-login-ausgefuellt.png` | Passwort ins zweite Feld tippen (Punkte) | „In das Feld **Passwort** tippst du dein persönliches Passwort. Es wird aus Sicherheitsgründen als Punkte angezeigt – das ist normal." | — |
| B4 | `04-login-ausgefuellt.png` | Klick auf den Button „Anmelden" | „Zum Schluss klickst du auf den Knopf **„Anmelden"**. Schon bist du drin." | — |
| B5 | `05-login-button-passwort-setzen.png` | Pfeil auf den Button „Passwort setzen" | „**Wichtig, wenn du dich zum allerersten Mal anmeldest:** Dann hast du noch gar kein Passwort. Klicke in diesem Fall auf den Knopf **„Passwort setzen"** – und folge dem nächsten Teil dieses Videos." | beim 1. Mal: weiter mit Teil C |

---

### Teil C — Passwort setzen (erstes Mal oder Passwort vergessen)

| # | Bild | Aktion | Sprechertext | Plattform-Hinweis |
| --- | --- | --- | --- | --- |
| C1 | `06-pwdreset-email.png` | Seite „Passwort setzen", E-Mail eintippen | „Nach dem Klick auf **„Passwort setzen"** erscheint diese Seite. Gib hier deine E-Mail-Adresse ein – wieder die, auf der du die Vereinsinformationen bekommst – und klicke auf **„OK"**. | — |
| C2 | `07-pwdreset-bestaetigung.png` | Bestätigungsmeldung wird gezeigt | „Du bekommst sofort eine Bestätigung: Wir haben dir eine E-Mail mit einer Anleitung geschickt. Du musst jetzt nichts weiter tun, ausser dein E-Mail-Programm zu öffnen." | — |
| C3 | `08-PLATZHALTER-reset-mail.png` | E-Mail mit Link, Pfeil auf den Link | „Öffne die E-Mail von uns. Darin findest du einen **Link** zum Anklicken. Tippe bzw. klicke einmal darauf." *(Falls die E-Mail nicht da ist: schau auch im Spam- oder Werbeordner nach.)* | Tipp: auch im Spam-Ordner schauen |
| C4 | `09-confirm-neues-passwort.png` | Seite „Neues Passwort festlegen", Passwort eintippen | „Der Link öffnet diese Seite: **„Neues Passwort festlegen"**. Denke dir hier ein Passwort aus, das nur du kennst – mindestens 6 Zeichen lang. Tippe es ein und klicke auf **„Passwort speichern"**. | mindestens 6 Zeichen |
| C5 | `10-confirm-erfolg.png` | Erfolgsmeldung | „Geschafft! Du siehst die Meldung: **„Passwort erfolgreich geändert"**. Dein Passwort ist nun gesetzt." | — |
| C6 | `03-login-leer.png` → `11-mitgliederbereich-home.png` | Zurück zur Anmeldung, dann eingeloggter Bereich | „Jetzt kannst du dich ganz normal anmelden: E-Mail und dein neues Passwort eingeben, auf **„Anmelden"** klicken – und du bist im Mitgliederbereich." | — |

---

### Outro

| # | Bild | Aktion | Sprechertext |
| --- | --- | --- | --- |
| O1 | `11-mitgliederbereich-home.png` | Begrüssung „Willkommen im Mitgliederbereich!" | „Wunderbar – du bist drin! Merke dir deine E-Mail-Adresse und dein Passwort gut. Beim nächsten Mal genügt das Anmelden in Teil B. Falls du dein Passwort einmal vergisst, gehst du einfach wieder über **„Passwort setzen"**. Viel Freude im Mitgliederbereich!" |

---

## Offene Punkte

- [ ] Screenshots `01`–`07`, `09`–`11` von der Live-Site aufnehmen (Test-Zugangsdaten erforderlich).
- [ ] `08-PLATZHALTER-reset-mail.png` durch echtes E-Mail-Bild ersetzen (Bruno).
- [ ] Reihenfolge: Login (Teil B) zuerst, mit Hinweis B5 auf Teil C beim ersten Mal — gemäss Absprache.
