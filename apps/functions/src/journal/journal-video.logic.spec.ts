import { describe, expect, it } from 'vitest';

import {
  buildJournalPosterArgs, buildJournalTranscodeArgs, journalVideoName, parseFfmpegInfo, posterSecond,
} from './journal-video.logic';

const LANDSCAPE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':
  Metadata:
    major_brand     : isom
    creation_time   : 2026-12-29T09:30:15.000000Z
  Duration: 00:00:12.34, start: 0.000000, bitrate: 4000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 3900 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
At least one output file must be specified`;

const PORTRAIT_HEVC = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'IMG_0001.MOV':
  Metadata:
    major_brand     : qt
    com.apple.quicktime.location.ISO6709: +64.8000-062.9000/
    com.apple.quicktime.creationdate: 2026-12-30T14:05:00+0100
    creation_time   : 2026-12-30T13:05:00.000000Z
  Duration: 00:00:07.50, start: 0.000000, bitrate: 15000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1920x1080, 14800 kb/s, 29.97 fps, 29.97 tbr, 600 tbn (default)
    Metadata:
      rotate          : 90
    Side data:
      displaymatrix: rotation of -90.00 degrees
At least one output file must be specified`;

describe('buildJournalTranscodeArgs', () => {
  const args = buildJournalTranscodeArgs('in.mov', 'out.mp4', 900).join(' ');
  it('carries the encoder targets', () => {
    for (const flag of ['-c:v libx264', '-b:v 900k', '-maxrate 900k', '-bufsize', '-c:a aac -b:a 64k -ac 1', '-movflags +faststart', '-y']) {
      expect(args).toContain(flag);
    }
    expect(args).toContain('960');
    expect(args).toContain('min(960,iw)');
  });
  it('uses the retry bitrate', () => {
    expect(buildJournalTranscodeArgs('a', 'b', 630).join(' ')).toContain('-b:v 630k');
  });
});

describe('buildJournalPosterArgs', () => {
  const args = buildJournalPosterArgs('in.mov', 'a.jpg', 'b.jpg', 1);
  it('seeks before the input and writes two outputs', () => {
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args.filter((a) => a.endsWith('.jpg'))).toEqual(['a.jpg', 'b.jpg']);
    expect(args.join(' ')).toContain('min(2048,iw)');
    expect(args.join(' ')).toContain('min(400,iw)');
  });
});

describe('parseFfmpegInfo', () => {
  it('reads a landscape H.264 MP4', () => {
    expect(parseFfmpegInfo(LANDSCAPE)).toEqual({ durationSec: 12.34, width: 1920, height: 1080, creationTime: '2026-12-29T09:30:15' });
  });
  it('reads a portrait HEVC MOV upright, with local creation date and position', () => {
    expect(parseFfmpegInfo(PORTRAIT_HEVC)).toEqual({
      durationSec: 7.5, width: 1080, height: 1920, rotation: 90,
      creationTime: '2026-12-30T14:05:00', latitude: 64.8, longitude: -62.9,
    });
  });
  it('reads a plain location tag', () => {
    expect(parseFfmpegInfo('    location        : +46.1234+008.5678/\n')).toMatchObject({ latitude: 46.1234, longitude: 8.5678 });
  });
  it('returns nothing for noise', () => {
    expect(parseFfmpegInfo('garbage')).toEqual({});
  });
});

describe('posterSecond / journalVideoName', () => {
  it('picks second 1, or the first frame of a shorter clip', () => {
    expect(posterSecond(0.6)).toBe(0);
    expect(posterSecond(1)).toBe(1);
    expect(posterSecond(30)).toBe(1);
  });
  it('accepts safe names only', () => {
    expect(journalVideoName('abc_DEF-1')).toBe(true);
    expect(journalVideoName('../x')).toBe(false);
    expect(journalVideoName('')).toBe(false);
    expect(journalVideoName('a'.repeat(81))).toBe(false);
    expect(journalVideoName(5)).toBe(false);
  });
});
