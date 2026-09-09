/*
  Grenzen für hochgeladene Videos (Album). Zweck dieser Prüfung ist Komfort: dem Mitglied
  200 MB Upload zu ersparen, die am Ende ohnehin abgelehnt würden.

  Die Grenze ist aber KEINE reine Komfortgrenze mehr, sondern eine von drei Stellen, an denen
  dieselben 200 MB stehen müssen:
    - MAX_VIDEO_BYTES (hier)                      -- die Vorprüfung im Client
    - videoSizeOk() in storage.rules              -- was Firebase überhaupt annimmt
    - MAX_INPUT_BYTES in apps/functions/src/video -- was der Transcoder verarbeitet
  Driften sie auseinander, lehnt Firebase mit einem blanken `storage/unauthorized` ab: der
  Nutzer sieht ein rotes Kreuz ohne Text. Genau das war der Fall, solange storage.rules jeden
  Upload bei 25 MB deckelte.

  In storage.rules wird das Video an der ENDUNG erkannt, nicht am contentType: der SDK lädt
  ohne expliziten contentType hoch, also gewinnt der vom Browser geratene File.type -- und der
  ist bei .mov in Chrome/Firefox regelmässig leer.
*/

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;   // 200 MB
export const MAX_VIDEO_SECONDS = 120;               // 2:00

/** Wie lange auf die Metadaten des Probe-Elements gewartet wird, bevor die Dauer als
 *  unbekannt gilt. Kein Fehlerfall: Chrome kennt viele .mov-Container nicht. */
const PROBE_TIMEOUT_MS = 5000;

export interface VideoCheckResult {
  ok: boolean;
  reason?: 'size' | 'duration';
  /** Bytes bei reason 'size', Sekunden bei reason 'duration' — für die Fehlermeldung. */
  actual?: number;
}

/** 252 -> '4:12'. Sekunden werden abgeschnitten, nicht gerundet. */
export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/**
 * Liest die Dauer über ein temporäres <video>-Element (nur Metadaten, die Datei wird nicht
 * abgespielt). Liefert undefined, wenn der Browser den Container nicht öffnen kann oder das
 * Element nicht innerhalb von PROBE_TIMEOUT_MS meldet.
 */
function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
      resolve(undefined);
      return;
    }
    const element = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration: number | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      element.removeAttribute('src');
      resolve(duration);
    };

    const timer = setTimeout(() => finish(undefined), PROBE_TIMEOUT_MS);
    element.preload = 'metadata';
    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? element.duration : undefined);
    element.onerror = () => finish(undefined);
    element.src = objectUrl;
  });
}

/**
 * Prüft Grösse und Dauer, bevor ein Byte hochgeht.
 *
 * Die Grösse entscheidet zuerst und allein — eine zu grosse Datei wird nicht erst noch
 * geöffnet. Lässt sich die Dauer nicht ermitteln, gilt nur die Grössengrenze: ablehnen wäre
 * hier der schlechtere Fehler, weil Chrome bei .mov-Dateien regelmässig passt.
 */
export async function checkVideoLimits(file: File): Promise<VideoCheckResult> {
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, reason: 'size', actual: file.size };
  }
  const duration = await probeDuration(file);
  if (duration !== undefined && duration > MAX_VIDEO_SECONDS) {
    return { ok: false, reason: 'duration', actual: duration };
  }
  return { ok: true };
}
