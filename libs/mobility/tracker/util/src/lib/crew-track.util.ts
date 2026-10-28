import type { CrewTrackSection } from './crew-track.model';
import { decodeTrack } from './track-polyline.util';
import type { LocalSection } from './track-sections.util';
import { decodeStrokeTimes, strokeTimesBase } from './track-strokes.util';

/**
 * The crew track's sections as returned by `getLogbuchTrack` (spec 1.123 §5.2) in the local shape `buildGpx` and the
 * map take: points decoded, stroke times decoded against the section's first point. Never detected (the crew sees
 * the recorder's final sections); `strokeTimes` only when the section has any.
 */
export function crewToLocalSections(sections: CrewTrackSection[]): LocalSection[] {
  return sections.map((s) => {
    const points = decodeTrack(s.encoded);
    const out: LocalSection = { mode: s.mode, detected: false, points };
    if (s.strokeTimes) out.strokeTimes = decodeStrokeTimes(s.strokeTimes, strokeTimesBase(points));
    return out;
  });
}
