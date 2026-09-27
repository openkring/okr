/**
 * A running duration as `m:ss`, or `h:mm:ss` once it passes an hour.
 *
 * Minutes are not zero-padded (a board takes single-digit minutes) but seconds always are, so
 * the reading never jumps width mid-game. A negative or non-finite input — a clock that moved
 * backwards, an unstarted board — reads as zero rather than throwing into the template.
 */
export function formatElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return '0:00';
  }

  const total = Math.floor(milliseconds / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  const padded = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${padded(minutes)}:${padded(seconds)}` : `${minutes}:${padded(seconds)}`;
}
