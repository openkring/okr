/**
 * Anonymised diary files covering every variant measured in the real archive.
 * The archive itself never enters this repository — see `diary-corpus.spec.ts`, which
 * round-trips the real archive when DIARY_ARCHIVE points at it.
 */
export const DIARY_FIXTURES: { name: string; text: string }[] = [
  {
    name: 'full — frontmatter, navigation, thoughts and a flat Erledigt list',
    text: `---
tags:
  - diary
date: 2026-08-16
status: final
location: Musterdorf ZH
weather: "☁️ 22–32°C, 0 mm"
weather_min: 21.8
weather_max: 31.7
weather_precip: 0.0
sunrise: "06:23"
sunset: "20:35"
people: [anna, bruno]
places: [musterdorf, nachbarort]
events: [sommerfest]
---

← [20260815diaryGestern](../20260815sa/20260815diaryGestern.md) | [20260817diaryMorgen](../20260817mo/20260817diaryMorgen.md) →

## Persönliche Gedanken

Erster Absatz.

Zweiter Absatz.

## Erledigt

- [x] Erste Aufgabe
- [x] Zweite Aufgabe
`,
  },
  {
    name: 'minimal — no title, no places, no events',
    text: `---
tags:
  - diary
date: 2026-02-03
status: final
location: Musterdorf ZH
weather: "🌧️ 5–9°C, 18 mm"
weather_min: 5.1
weather_max: 9.1
weather_precip: 18.2
sunrise: "07:54"
sunset: "17:22"
people: [anna]
---

## Persönliche Gedanken

Ein einzelner Absatz.
`,
  },
  {
    name: 'nested Erledigt with sub-headings and plain bullets',
    text: `---
tags:
  - diary
  - konferenz
date: 2026-04-14
status: active
location: Musterdorf ZH → Beispielstadt
weather: "🌧️ 7–11°C, 2 mm"
weather_min: 7.3
weather_max: 10.6
weather_precip: 1.9
sunrise: "06:38"
sunset: "20:12"
---

![](20260414120000.jpg)
## Persönliche Gedanken

Text mit einem Bild davor.

## Erledigt

### Verein
- Auftrag Elektriker
- Sitzung organisieren

### Persönlich
- Termin verschoben
`,
  },
  {
    name: 'trip key and inline image tags',
    text: `---
tags:
  - diary
date: 2025-06-03
status: final
title: Beispielort
location: Beispielort, France
weather: "⛅ 12–19°C, 0 mm"
weather_min: 12.4
weather_max: 18.9
weather_precip: 0.0
sunrise: "06:12"
sunset: "21:48"
people: [anna, carla]
places: [beispielort]
trip: 20250600beispielreise
---

## Persönliche Gedanken

Reisetag.

<img src="20250603140000.jpg" width="300"> <img src="20250603150000.jpg" width="300">
`,
  },
  {
    name: 'empty lists and a legacy images key',
    text: `---
tags:
  - diary
date: 2026-03-31
status: final
location: Musterdorf ZH
weather: "🌤️ 8–15°C, 0 mm"
weather_min: 8.2
weather_max: 15.4
weather_precip: 0.0
sunrise: "07:12"
sunset: "20:02"
people: []
places: []
events: []
images: "['<img src=\\"20260331120000.jpg\\" width=\\"100\\">']"
---

## Persönliche Gedanken

Kurz.
`,
  },
  {
    name: 'wikilink navigation, not yet migrated',
    text: `---
tags:
  - diary
date: 2026-08-20
status: final
location: Musterdorf ZH
weather: "⛈️ 20–28°C, 35 mm"
weather_min: 20.4
weather_max: 28.0
weather_precip: 35.3
sunrise: "06:28"
sunset: "20:28"
people: [anna]
---

← [20260819diaryGestern](../20260819mi/20260819diaryGestern.md) | [[20260821diary]] →

## Persönliche Gedanken

Der Folgetag existiert noch nicht.
`,
  },
  {
    name: 'PDF footer — the archive\'s most common body shape',
    text: `---
tags:
  - diary
date: 2019-11-08
status: final
location: Musterdorf ZH
weather: "☁️ 4–10°C, 1 mm"
weather_min: 4.2
weather_max: 9.8
weather_precip: 1.1
sunrise: "07:26"
sunset: "16:52"
---

## Persönliche Gedanken

Ein Absatz aus dem gescannten Original.

---
*Original: [20191108diaryMusterdorf.pdf](20191108diaryMusterdorf.pdf)*
`,
  },
];
