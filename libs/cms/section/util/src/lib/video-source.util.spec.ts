import { describe, expect, it } from 'vitest';
import { VIDEO_CONFIG_SHAPE, VideoConfig } from '@okr/shared-models';

import {
  applyVideoSource, parseVideoSource, VIMEO_EMBED_BASE, videoAspectRatioCss, videoAspectRatioOf, videoSourceLink, videoSourceOf, YOUTUBE_EMBED_BASE,
} from './video-source.util';

const ID = 'XSu0f8rh2w4';
const ORIGINS = ['https://app.seeclub.org', 'http://localhost:4200'];

describe('parseVideoSource', () => {
  it.each([
    [ID],
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=42s&list=abc`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}?si=share`],
    [`youtu.be/${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/embed/${ID}?feature=oembed`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/live/${ID}`],
    [`  ${ID}  `],
  ])('reads a YouTube video from %s', (text) => {
    expect(parseVideoSource(text, ORIGINS)).toEqual({ kind: 'youtube', id: ID });
  });

  it('refuses a YouTube link without a valid id', () => {
    expect(parseVideoSource('https://www.youtube.com/watch?v=short')).toBeUndefined();
    expect(parseVideoSource('https://www.youtube.com/@channel')).toBeUndefined();
    expect(parseVideoSource('https://youtu.be/')).toBeUndefined();
  });

  it('reads a Vimeo video, a private one with its hash', () => {
    expect(parseVideoSource('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(parseVideoSource('https://vimeo.com/channels/staffpicks/76979871')).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(parseVideoSource('https://player.vimeo.com/video/76979871')).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(parseVideoSource('https://vimeo.com/76979871/abcdef1234')).toEqual({ kind: 'vimeo', id: '76979871?h=abcdef1234' });
    expect(parseVideoSource('https://player.vimeo.com/video/76979871?h=abcdef1234')).toEqual({ kind: 'vimeo', id: '76979871?h=abcdef1234' });
    expect(parseVideoSource('https://vimeo.com/about')).toBeUndefined();
  });

  it('reads the app\'s album video link and a bare album key', () => {
    expect(parseVideoSource('https://app.seeclub.org/video/abcDEF123_xyz-0987654', ORIGINS)).toEqual({ kind: 'album', documentKey: 'abcDEF123_xyz-0987654' });
    expect(parseVideoSource('abcDEF123_xyz-0987654', ORIGINS)).toEqual({ kind: 'album', documentKey: 'abcDEF123_xyz-0987654' });
  });

  it('refuses an album link of another origin and anything else', () => {
    expect(parseVideoSource('https://evil.example/video/abcDEF123_xyz-0987654', ORIGINS)).toBeUndefined();
    expect(parseVideoSource('https://example.com/movie.mp4', ORIGINS)).toBeUndefined();
    expect(parseVideoSource('javascript:alert(1)', ORIGINS)).toBeUndefined();
    expect(parseVideoSource('two words', ORIGINS)).toBeUndefined();
    expect(parseVideoSource('', ORIGINS)).toBeUndefined();
    expect(parseVideoSource(undefined, ORIGINS)).toBeUndefined();
  });
});

describe('videoSourceOf', () => {
  const config = (props: Partial<VideoConfig>) => ({ ...VIDEO_CONFIG_SHAPE, ...props });

  it('reads what a section stores', () => {
    expect(videoSourceOf(config({ url: ID }))).toEqual({ kind: 'youtube', id: ID });
    expect(videoSourceOf(config({ url: ID, baseUrl: 'https://www.youtube.com/embed/' }))).toEqual({ kind: 'youtube', id: ID });
    expect(videoSourceOf(config({ url: '76979871', baseUrl: VIMEO_EMBED_BASE }))).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(videoSourceOf(config({ url: ID, documentKey: 'abc' }))).toEqual({ kind: 'album', documentKey: 'abc' });
    expect(videoSourceOf(config({ url: '' }))).toBeUndefined();
    expect(videoSourceOf(undefined)).toBeUndefined();
  });

  it('reads a full YouTube url stored in url', () => {
    expect(videoSourceOf(config({ url: `https://www.youtube.com/embed/${ID}` }))).toEqual({ kind: 'youtube', id: ID });
  });
});

describe('applyVideoSource', () => {
  const base: VideoConfig = { ...VIDEO_CONFIG_SHAPE, aspectRatio: '9:16', documentKey: 'old' };

  it('writes the player fields and keeps the rest', () => {
    expect(applyVideoSource(base, { kind: 'youtube', id: ID })).toEqual({ ...base, baseUrl: YOUTUBE_EMBED_BASE, url: ID, documentKey: '' });
    expect(applyVideoSource(base, { kind: 'vimeo', id: '1' })).toEqual({ ...base, baseUrl: VIMEO_EMBED_BASE, url: '1', documentKey: '' });
    expect(applyVideoSource({ ...base, url: ID }, { kind: 'album', documentKey: 'k' })).toEqual({ ...base, url: '', documentKey: 'k' });
    expect(applyVideoSource({ ...base, url: ID }, undefined)).toEqual({ ...base, url: '', documentKey: '' });
  });
});

describe('videoSourceLink', () => {
  it('shows the stored video as a link that reads back to the same video', () => {
    const sources = [{ kind: 'youtube', id: ID }, { kind: 'vimeo', id: '76979871' }, { kind: 'vimeo', id: '76979871?h=abcdef1234' },
      { kind: 'album', documentKey: 'abcDEF123_xyz-0987654' }] as const;
    for (const source of sources) {
      expect(parseVideoSource(videoSourceLink(source, ORIGINS[0]), ORIGINS)).toEqual(source);
    }
    expect(videoSourceLink(undefined)).toBe('');
  });
});

describe('aspect ratio', () => {
  it('defaults to 16:9 and writes CSS', () => {
    expect(videoAspectRatioOf({})).toBe('16:9');
    expect(videoAspectRatioOf({ aspectRatio: 'x' as never })).toBe('16:9');
    expect(videoAspectRatioOf({ aspectRatio: '9:16' })).toBe('9:16');
    expect(videoAspectRatioCss('4:3')).toBe('4 / 3');
    expect(videoAspectRatioCss(undefined)).toBe('16 / 9');
  });
});
