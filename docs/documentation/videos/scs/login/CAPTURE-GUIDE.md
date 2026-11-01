# Aufnahme-Anleitung: Screenshots für die Login-Videos

Diese Anleitung sagt dir genau, welche Screenshots du für die beiden Videos
(Desktop & Mobile) machst, in welchem Zustand und wohin sie gehören.

> **Warum machst du die Screenshots selbst statt automatisiert?**
> Die Live-App `seeclub.org` ist durch **Firebase App Check** geschützt. Ein
> automatisierter (headless) Browser besteht App Check nicht → Firestore liefert
> `403 / Missing permissions`. Folge: kein echtes Login, keine eingeloggten
> Screens, und der Reset-Link kommt ohnehin per echter E-Mail. In deinem normalen,
> eingeloggten Browser ist all das problemlos. (Eine App-Check-Debug-Token-Ausnahme
> wäre möglich, schwächt aber den Produktionsschutz und bringt die Mail-Screens
> trotzdem nicht — daher nicht empfohlen.)

---

## Allgemeine Regeln (für alle Screenshots)

- **Sprache:** App auf Deutsch.
- **Cookie-Banner** vorher wegklicken (es überdeckt sonst das Bild).
- **Desktop-Fenster NICHT auf Vollbild maximieren.** Nutze eine Fensterbreite von
  **ca. 800–950 px**. Breiter blendet die App ein linkes Seitenmenü ein (mit einem
  gelben „Missing: …"-Hinweis) — das wollen wir nicht. Schmaler zeigt oben links
  nur das saubere Hamburger-Symbol ☰. (Siehe Referenzbilder in
  `*/assets/_reference/`.)
- **Mobile:** echtes Handy oder Portrait-Format ~390 × 844. Bildschirm-Tastatur
  sichtbar lassen, wo getippt wird.
- **Keine echten Personendaten.** Verwende eine Demo-/Test-E-Mail.
- **Format:** PNG. Dateinamen exakt wie unten (sie sind so im Storyboard verlinkt).
- Ablage Desktop: `desktop/assets/`
- Ablage Mobile: `mobile/assets/`

---

## Aufnahmeliste (gilt je 1× für Desktop UND 1× für Mobile)

| Datei | Wo / URL | Zustand & was sichtbar sein muss |
| --- | --- | --- |
| `01-browser-adresszeile.png` | Browser-Fenster | Adresszeile mit getipptem **`seeclub.org`** (Browser-Rahmen mit sichtbarer Adresszeile — das ist der einzige Shot *mit* Browser-Bedienleiste). Mobile: Adressleiste des Handy-Browsers. |
| `02-seeclub-staefa-mitgliederbereich.png` | `seeclub-staefa.ch` | Vereins-Website mit dem Menüpunkt **„Mitglieder Bereich"** sichtbar. Desktop: im Hauptmenü. Mobile: Menü (☰) geöffnet, sodass „Mitglieder Bereich" zu sehen ist. |
| `03-login-leer.png` | `seeclub.org/auth/login` | Anmeldeseite, Felder **leer**. Logo + Titel „Anmelden", Felder E-Mail/Passwort, Buttons **ANMELDEN** und **PASSWORT SETZEN**. (Rote Pflichtfeld-Hinweise dürfen erscheinen — ok.) |
| `04-login-ausgefuellt.png` | `seeclub.org/auth/login` | E-Mail ausgefüllt (Demo-Adresse), Passwort als **Punkte ••••** sichtbar, Button **ANMELDEN** ist aktiv (kräftig grün). Keine roten Fehler mehr. |
| `05-login-button-passwort-setzen.png` | `seeclub.org/auth/login` | Wie 03/04, aber Fokus/Hervorhebung auf dem Button **PASSWORT SETZEN**. *(Optional — die Hervorhebung kann auch im Videoschnitt gesetzt werden; dann genügt 03.)* |
| `06-pwdreset-email.png` | `seeclub.org/auth/pwdreset` | Seite **„Passwort setzen"**, E-Mail-Feld ausgefüllt (Demo-Adresse), Buttons **ABBRECHEN** / **OK**. |
| `07-pwdreset-bestaetigung.png` | nach Klick auf **OK** in 06 | Die Bestätigungsmeldung: *„Ein E-Mail mit Instruktionen zum Zurücksetzen des Passworts wurde an … verschickt."* (Toast/Meldung im Bild). |
| `08-PLATZHALTER-reset-mail.png` | dein E-Mail-Programm | Die erhaltene **Reset-E-Mail** mit dem **Link**. Persönliche Adresse ggf. unkenntlich machen. *(Du lieferst dieses Bild — Platzhalter im Storyboard.)* |
| `09-confirm-neues-passwort.png` | Link aus der E-Mail (`/auth/confirm…`) | Seite **„Neues Passwort festlegen"**, Passwort-Feld (Punkte), Button **PASSWORT SPEICHERN**. |
| `10-confirm-erfolg.png` | nach Klick auf **Passwort speichern** | Erfolgsmeldung: *„Passwort erfolgreich geändert. Du wirst zur Anmeldeseite weitergeleitet."* |
| `11-mitgliederbereich-home.png` | nach erfolgreichem Login | Der **eingeloggte Startbildschirm** des Mitgliederbereichs (Begrüssung „Willkommen im Mitgliederbereich!" bzw. die Startseite, die ein Mitglied nach dem Login sieht). |

---

## Reihenfolge zum effizienten Abarbeiten

1. **Vorbereitung:** Demo-/Test-Konto bereithalten, Sprache = Deutsch, Cookie-Banner einmal akzeptieren/wegklicken.
2. **Öffentliche/Formular-Screens:** `01`, `02`, `03`, `04`, `05`, `06`.
3. **Reset-Strecke (löst echte E-Mail aus):** in `06` auf **OK** → `07`; dann E-Mail öffnen → `08`; Link klicken → `09`; speichern → `10`.
4. **Login & Eingeloggt:** mit dem neuen Passwort anmelden → `11`.
5. Bilder unter den exakten Dateinamen in den jeweiligen `assets/`-Ordner legen (Desktop- und Mobile-Variante getrennt).

---

## Referenzbilder

In `*/assets/_reference/` liegen automatisch erzeugte Beispiel-Screenshots
(`03`, `06`, mobil auch `04`). Sie zeigen **den idealen Bildausschnitt** (saubere
Fensterbreite ohne Seitenmenü, Logo/Hintergrund sichtbar). Nutze sie als Vorlage
für deine eigenen, vollwertigen Aufnahmen. Sie können nach Abschluss gelöscht werden.
