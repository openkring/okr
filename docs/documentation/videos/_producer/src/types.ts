// Shared types — no Node-only imports here, so this is safe to import from both
// the Remotion browser bundle (Root/Video/scenes) and the Node scripts (prepare/render).

export type Orientation = 'desktop' | 'mobile';

export type Brand = {
  /** Tenant display name (e.g. "Seeclub Stäfa"). */
  name: string;
  /** Brand primary colour (hex), from the app theme. */
  primary: string;
  /** Brand secondary colour (hex), from the app theme. */
  secondary: string;
  /** Staticfile-relative path to the staged logo svg, or null if unavailable. */
  logo: string | null;
};

export type SceneProps = {
  /** Storyboard id, e.g. "0", "A1", "C6". */
  id: string;
  /** Part / chapter label, e.g. "Teil B — Anmelden …". */
  part: string;
  /** Title text for a title card (scenes without a screenshot). */
  title?: string;
  /**
   * Staticfile-relative image paths (under public/), or a placeholder marker
   * "__placeholder__:<filename>" when the screenshot has not been captured yet.
   */
  images: string[];
  /** Aktion column (not rendered, kept for reference/debugging). */
  action: string;
  /** Spoken text (Sprechertext), markup-stripped. */
  narration: string;
  /** Plattform-Hinweis shown as a lower third, if any. */
  platformHint?: string;
  /** Staticfile-relative narration audio path, or null if not synthesized. */
  audio: string | null;
  /** Total on-screen seconds for this scene (narration + padding). */
  durationInSeconds: number;
  /** Lead-in silence before narration starts, in seconds. */
  padBefore: number;
};

export type VideoProps = {
  orientation: Orientation;
  brand: Brand;
  scenes: SceneProps[];
};

export const FPS = 30;
