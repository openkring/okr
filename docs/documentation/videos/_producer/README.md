# Video-Producer

Renders the help/tutorial videos under `docs/documentation/videos/<tenant>/<topic>/`
to MP4 from their `script.md` storyboard + screenshots, using **Remotion** for the
video and **Azure Speech** (Swiss-German neural voice) for narration.

This folder is **standalone** — it is *not* part of the Nx/Angular workspace and has
its own `node_modules`. Nothing here is imported by the app.

## How it works

```
script.md (storyboard table)  ──parse──►  scenes[]
                                              │
narration text  ──Azure TTS──►  per-scene mp3 + exact duration
screenshots (assets/, _reference/ fallback) ─┘
                                              ▼
                              Remotion composition ──► out/<tenant>-<topic>-<variant>.mp4
```

One composition drives both variants: **desktop** (1920×1080) and **mobile**
(1080×1920) share the same Sprechertext, only assets/orientation differ.

## Setup

```sh
cd docs/documentation/videos/_producer
npm install                 # installs Remotion (+ a headless Chromium on first render)
cp .env.example .env        # then fill in your Azure Speech key
```

Create a **Speech** resource in the Azure portal, then set in `.env`:

- `SPEECH_KEY` — resource key
- `SPEECH_REGION` — e.g. `switzerlandnorth`
- `SPEECH_VOICE` — `de-CH-LeniNeural` (f) or `de-CH-JanNeural` (m)

`.env` is git-ignored — never commit the key.

## Render

```sh
# loads .env automatically (Node 22 --env-file via the npm scripts below)
npm run render -- scs/login desktop
npm run render -- scs/login mobile
```

Output lands in `out/`. Re-running re-uses cached narration unless the text changed.

### Without an Azure key (silent draft)

If `SPEECH_KEY` is unset, the pipeline still renders a **silent, correctly-timed
draft** (durations estimated from word count) so you can review pacing and layout.

### Missing screenshots

Scenes whose screenshot isn't in `…/<variant>/assets/` fall back to the
`assets/_reference/` sample, and otherwise show a labelled **placeholder** tile.
A warning lists every placeholder used.

## Branding (applied to every video by default)

Each video is branded automatically from the tenant:

- **Colours** — `videos/<tenant>/brand.json` (`primary`, `secondary`), taken from
  the app theme (`apps/<tenant>-app/src/theme/variables.scss`). Missing file →
  Seeclub Stäfa defaults. Used for the title accent, chapter chips, hint pills and
  the background tint.
- **Logo** — always downloaded from
  `https://bkaiser.imgix.net/tenant/<tenant>/logo/logo.svg` and shown on a white
  badge: large on the title card, small watermark on every other scene. If the
  fetch fails (offline), the video renders without the logo.

To brand a new tenant, add `videos/<tenant>/brand.json`:

```json
{ "name": "My Club", "primary": "#009D53", "secondary": "#014DA2" }
```

## Live preview / editing

```sh
npm run prepare-video -- scs/login desktop   # parse + TTS + stage assets
npm run studio                               # Remotion Studio (scrub, tweak, re-render)
```

## Where things live

| Path | What |
|---|---|
| `src/parse-script.ts` | storyboard markdown → scenes |
| `src/tts.ts` | Azure Speech synthesis + caching |
| `src/prepare.ts` | orchestration: parse, synthesize, stage `public/` |
| `src/Root.tsx`, `src/Video.tsx`, `src/scenes/*` | Remotion composition |
| `public/`, `out/`, `build/` | generated (git-ignored) |

## Adapting to other topics

Any topic that follows the same `script.md` storyboard format works out of the box:

```sh
npm run render -- <tenant>/<topic> desktop
```
