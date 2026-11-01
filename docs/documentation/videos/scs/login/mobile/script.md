# Erklärvideo — Mitgliederbereich: Anmelden & Passwort setzen (MOBILE)

**Plattformen:** iOS (iPhone/iPad) · Android (Smartphone/Tablet)
**Sprache:** Deutsch · **Zielgruppe:** Mitglieder mit sehr geringen IT-Kenntnissen
**Geschätzte Länge:** ca. 3–4 Minuten
**Vorlage:** ersetzt das bestehende Video <https://www.youtube.com/watch?v=gLmTEx-Ho9Q> (gleicher Inhalt, aktualisierte Screenshots)

> Es gibt zwei Versionen dieses Videos mit identischem Sprechertext: **Mobile** (dieses) und **Desktop** (Windows/Mac/Linux). Nur die Screenshots und die Plattform-Hinweise unterscheiden sich.

---

## Produktionshinweise

- **Tempo:** langsam und ruhig. Jeder Schritt wird angesagt, *bevor* er passiert.
- **Stil:** Du-Form, freundlich, ermutigend. Auf dem Handy heisst es **„tippen"** statt „klicken".
- **Bedienung:** Fingertipp sichtbar machen (Tap-Punkt/Ring). Bildschirm-Tastatur einblenden, wenn ein Feld angetippt wird.
- **Format:** Hochkant (Portrait), schmaler Handy-Viewport (~390 × 844). Screenshots in `./assets/`.
- **Einblendungen:** kurze Plattform-Hinweise unten im Bild (iOS / Android), siehe Spalte „Plattform-Hinweis".

---

## Screenshot-Liste (Mobile)

| Datei | Inhalt / Zustand | Quelle |
| --- | --- | --- |
| `01-browser-adresszeile.png` | Handy-Browser, Adresszeile angetippt, getippt `seeclub.org` | Live, Portrait |
| `02-seeclub-staefa-mitgliederbereich.png` | `seeclub-staefa.ch` (mobil), Menüpunkt **„Mitglieder Bereich"** hervorgehoben | Live, Portrait |
| `03-login-leer.png` | Anmeldeseite mobil, Felder leer | Live `/auth/login` |
| `04-login-ausgefuellt.png` | Anmeldeseite mobil, E-Mail + Passwort ausgefüllt, Tastatur sichtbar | Live, Test-Konto |
| `05-login-button-passwort-setzen.png` | Anmeldeseite mobil, Button **„Passwort setzen"** hervorgehoben | Live `/auth/login` |
| `06-pwdreset-email.png` | Seite „Passwort setzen" mobil, E-Mail-Feld ausgefüllt, „Abbrechen"/„OK" | Live `/auth/pwdreset` |
| `07-pwdreset-bestaetigung.png` | Bestätigungsmeldung „Ein E-Mail … wurde verschickt …" | Live |
| `08-PLATZHALTER-reset-mail.png` | **PLATZHALTER** — die E-Mail mit dem Link (liefert Bruno) | von Hand |
| `09-confirm-neues-passwort.png` | Seite „Neues Passwort festlegen" mobil, Button „Passwort speichern" | Live `/auth/confirm` |
| `10-confirm-erfolg.png` | Erfolgsmeldung „Passwort erfolgreich geändert …" | Live |
| `11-mitgliederbereich-home.png` | Eingeloggter Startbildschirm / „Willkommen im Mitgliederbereich!" | Live, Test-Konto |

---

## Storyboard & Sprechertext

### Intro

| # | Bild | Aktion | Sprechertext |
| --- | --- | --- | --- |
| 0 | Vereinslogo / Titel | Einblendung Titel | „Herzlich willkommen! In diesem kurzen Video zeige ich dir Schritt für Schritt, wie du dich auf deinem Handy oder Tablet im Mitgliederbereich des Seeclub Stäfa anmeldest – und wie du dir beim ersten Mal ein Passwort setzt. Du brauchst keine Vorkenntnisse. Wir machen das ganz in Ruhe gemeinsam." |

---

### Teil A — Den Mitgliederbereich öffnen

| # | Bild | Aktion | Sprechertext | Plattform-Hinweis (Einblendung) |
| --- | --- | --- | --- | --- |
| A1 | `01-browser-adresszeile.png` | Tap auf die Adresszeile | „Als Erstes öffnest du den Internet-Browser auf deinem Gerät – das Programm zum Surfen." | **iPhone/iPad:** Safari (blauer Kompass) · **Android:** Chrome (bunter Kreis) |
| A2 | `01-browser-adresszeile.png` | `seeclub.org` tippen, „Los/Öffnen" | „Tippe oben auf die Adresszeile, schreibe dort **seeclub.org** und tippe auf der Tastatur auf **„Los"** bzw. **„Öffnen"**. | Adresszeile = das Feld ganz oben |
| A3 | `02-seeclub-staefa-mitgliederbereich.png` | Tap-Ring auf „Mitglieder Bereich" | „Es gibt auch einen zweiten Weg: Auf unserer Vereins-Website **seeclub-staefa.ch** findest du im Menü (☰) den Punkt **„Mitglieder Bereich"**. Ein Tipp darauf bringt dich an dieselbe Stelle." | beide Wege führen zum selben Ziel |

---

### Teil B — Anmelden (für wiederkehrende Mitglieder)

| # | Bild | Aktion | Sprechertext | Plattform-Hinweis |
| --- | --- | --- | --- | --- |
| B1 | `03-login-leer.png` | Anmeldeseite erscheint | „Jetzt siehst du die Anmeldeseite mit dem Vereinslogo und dem Titel **„Anmelden"**. Hier gibst du zwei Dinge ein: deine E-Mail-Adresse und dein Passwort." | — |
| B2 | `04-login-ausgefuellt.png` | E-Mail-Feld antippen, tippen | „Tippe in das obere Feld **E-Mail** und schreibe die E-Mail-Adresse, auf der du die Vereinsinformationen bekommst. Verwende bitte genau diese Adresse." | Tastatur erscheint automatisch |
| B3 | `04-login-ausgefuellt.png` | Passwort-Feld antippen, tippen (Punkte) | „Tippe dann in das Feld **Passwort** und gib dein persönliches Passwort ein. Es wird als Punkte angezeigt – das ist normal und sicher." | — |
| B4 | `04-login-ausgefuellt.png` | Tap auf „Anmelden" | „Zum Schluss tippst du auf den Knopf **„Anmelden"**. Schon bist du drin." | ggf. Tastatur zuerst schliessen |
| B5 | `05-login-button-passwort-setzen.png` | Tap-Ring auf „Passwort setzen" | „**Wichtig, wenn du dich zum allerersten Mal anmeldest:** Dann hast du noch gar kein Passwort. Tippe in diesem Fall auf **„Passwort setzen"** – und folge dem nächsten Teil dieses Videos." | beim 1. Mal: weiter mit Teil C |

---

### Teil C — Passwort setzen (erstes Mal oder Passwort vergessen)

| # | Bild | Aktion | Sprechertext | Plattform-Hinweis |
| --- | --- | --- | --- | --- |
| C1 | `06-pwdreset-email.png` | E-Mail eintippen, Tap „OK" | „Nach dem Tippen auf **„Passwort setzen"** erscheint diese Seite. Gib deine E-Mail-Adresse ein – wieder die, auf der du die Vereinsinformationen bekommst – und tippe auf **„OK"**. | — |
| C2 | `07-pwdreset-bestaetigung.png` | Bestätigungsmeldung | „Du bekommst sofort eine Bestätigung: Wir haben dir eine E-Mail mit einer Anleitung geschickt. Wechsle jetzt zu deinem E-Mail-Programm." | — |
| C3 | `08-PLATZHALTER-reset-mail.png` | E-Mail mit Link, Tap auf Link | „Öffne die E-Mail von uns. Darin findest du einen **Link**. Tippe einmal darauf." *(Falls die E-Mail nicht da ist: schau auch im Spam- oder Werbeordner nach.)* | Tipp: auch im Spam-Ordner schauen |
| C4 | `09-confirm-neues-passwort.png` | Neues Passwort tippen, Tap „Passwort speichern" | „Der Link öffnet diese Seite: **„Neues Passwort festlegen"**. Denke dir ein Passwort aus, das nur du kennst – mindestens 6 Zeichen. Tippe es ein und tippe auf **„Passwort speichern"**. | mindestens 6 Zeichen |
| C5 | `10-confirm-erfolg.png` | Erfolgsmeldung | „Geschafft! Du siehst die Meldung: **„Passwort erfolgreich geändert"**. Dein Passwort ist nun gesetzt." | — |
| C6 | `03-login-leer.png` → `11-mitgliederbereich-home.png` | Zurück zur Anmeldung, dann eingeloggt | „Jetzt kannst du dich ganz normal anmelden: E-Mail und dein neues Passwort eingeben, auf **„Anmelden"** tippen – und du bist im Mitgliederbereich." | — |

---

### Outro

| # | Bild | Aktion | Sprechertext |
| --- | --- | --- | --- |
| O1 | `11-mitgliederbereich-home.png` | Begrüssung „Willkommen im Mitgliederbereich!" | „Wunderbar – du bist drin! Merke dir deine E-Mail-Adresse und dein Passwort gut. **Tipp:** Du kannst die Seite auch zum Startbildschirm hinzufügen, dann öffnet sie sich wie eine App. Beim nächsten Mal genügt das Anmelden in Teil B. Viel Freude im Mitgliederbereich!" |

---

## Offene Punkte

- [ ] Screenshots `01`–`07`, `09`–`11` von der Live-Site im Portrait-Format aufnehmen (Test-Zugangsdaten erforderlich).
- [ ] `08-PLATZHALTER-reset-mail.png` durch echtes E-Mail-Bild ersetzen (Bruno).
- [ ] Optional: „Zum Startbildschirm hinzufügen" je iOS (Teilen-Symbol) und Android (Menü ⋮) kurz zeigen.
