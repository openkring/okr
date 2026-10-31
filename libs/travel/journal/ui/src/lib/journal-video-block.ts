import { Component, input } from '@angular/core';

/** One clip of a video block: its poster, and the mp4 when it is on this device (undefined or empty: not loaded yet). */
export interface VideoClip { key: string; poster: string; src?: string; videoPath?: string; durationSec?: number }

/**
 * A video block (phase 5): the caption (sanitised html, bound with `[innerHTML]`) above the player of every clip.
 * Nothing autoplays and nothing preloads. A clip whose mp4 is not here yet (another author's clip in «Nur hochladen»,
 * download pending) shows its poster and a note instead of a broken player. Presentational: the parent resolves the URLs.
 */
@Component({
  selector: 'okr-journal-video-block',
  standalone: true,
  styles: [`
    :host { display: block; }
    .caption { margin: 4px 0; }
    .clip { display: block; width: 100%; max-height: 70vh; margin: 6px 0; border-radius: 6px; background: #000; }
    .pending { position: relative; margin: 6px 0; }
    .pending img { display: block; width: 100%; max-height: 70vh; object-fit: contain; border-radius: 6px; background: #000; }
    .pending span { position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 8px; font-size: 0.8rem;
      background: rgba(0, 0, 0, 0.6); color: #fff; }
  `],
  template: `
    @if (caption()) {
      <div class="caption" [innerHTML]="caption()"></div>
    }
    @for (clip of clips(); track clip.key) {
      @if (clip.src) {
        <video class="clip" controls playsinline preload="none" [poster]="clip.poster" [src]="clip.src"></video>
      } @else {
        <div class="pending">
          @if (clip.poster) {
            <img [src]="clip.poster" alt="" />
          }
          <span>{{ i18n().notLoaded }}</span>
        </div>
      }
    }
  `,
})
export class JournalVideoBlock {
  public readonly clips = input<VideoClip[]>([]);
  public readonly caption = input<string>('');
  public readonly i18n = input.required<{ notLoaded: string }>();
}
