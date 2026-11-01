import { describe, expect, it } from 'vitest';

import {
  buildJournalPosterArgs, buildJournalTranscodeArgs, isAcceptedContainer, isStaleSource, journalVideoName, parseFfmpegInfo, posterSecond,
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
    expect(parseFfmpegInfo(LANDSCAPE)).toEqual({ durationSec: 12.34, width: 1920, height: 1080, hdr: false, creationTime: '2026-12-29T09:30:15' });
  });
  it('reads a portrait HEVC MOV upright, with local creation date and position', () => {
    expect(parseFfmpegInfo(PORTRAIT_HEVC)).toEqual({
      durationSec: 7.5, width: 1080, height: 1920, rotation: 90, hdr: true,
      creationTime: '2026-12-30T14:05:00', latitude: 64.8, longitude: -62.9,
    });
  });
  it('reads a plain location tag', () => {
    expect(parseFfmpegInfo('    location        : +46.1234+008.5678/\n')).toMatchObject({ latitude: 46.1234, longitude: 8.5678 });
  });
  it('returns nothing for noise', () => {
    expect(parseFfmpegInfo('garbage')).toEqual({ hdr: false });
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

describe('isAcceptedContainer', () => {
  it('accepts mov/mp4 and matroska/webm demuxers only', () => {
    expect(isAcceptedContainer(LANDSCAPE)).toBe(true);
    expect(isAcceptedContainer(PORTRAIT_HEVC)).toBe(true);
    expect(isAcceptedContainer("Input #0, matroska,webm, from 'x.webm':\n")).toBe(true);
    expect(isAcceptedContainer("Input #0, hls, from 'x.m3u8':\n")).toBe(false);
    expect(isAcceptedContainer("Input #0, concat, from 'x':\n")).toBe(false);
    expect(isAcceptedContainer("Input #0, image2, from 'x':\n")).toBe(false);
    expect(isAcceptedContainer('garbage')).toBe(false);
  });
});

describe('untrusted stderr', () => {
  it('takes the duration of the container line, not of a metadata tag', () => {
    const spoof = LANDSCAPE.replace('  Metadata:\n', '  Metadata:\n    comment         : Duration: 00:00:05.00\n')
      .replace('Duration: 00:00:12.34', 'Duration: 00:02:00.00');
    expect(parseFfmpegInfo(spoof).durationSec).toBe(120);
  });
  it('limits the output to 60 s and refuses other protocols', () => {
    const t = buildJournalTranscodeArgs('in', 'out', 900);
    expect(t.slice(t.indexOf('-t'), t.indexOf('-t') + 2)).toEqual(['-t', '60']);
    expect(t.slice(t.indexOf('-protocol_whitelist'), t.indexOf('-protocol_whitelist') + 2)).toEqual(['-protocol_whitelist', 'file']);
    expect(t.indexOf('-protocol_whitelist')).toBeLessThan(t.indexOf('-i'));
    const p = buildJournalPosterArgs('in', 'a', 'b', 0);
    expect(p.indexOf('-protocol_whitelist')).toBeLessThan(p.indexOf('-i'));
  });
});

describe('HDR', () => {
  const HLG = PORTRAIT_HEVC;
  const PQ = LANDSCAPE.replace('yuv420p(progressive)', 'yuv420p10le(tv, bt2020nc/bt2020/smpte2084)');
  it('detects HLG and PQ, not SDR', () => {
    expect(parseFfmpegInfo(HLG).hdr).toBe(true);
    expect(parseFfmpegInfo(PQ).hdr).toBe(true);
    expect(parseFfmpegInfo(LANDSCAPE).hdr).toBe(false);
  });
  it('scales first, then tone maps to yuv420p, and always tags BT.709', () => {
    const hdr = buildJournalTranscodeArgs('i', 'o', 900, true).join(' ');
    expect(hdr).toContain('tonemap=tonemap=hable');
    expect(hdr.indexOf('scale=w=')).toBeLessThan(hdr.indexOf('zscale=t=linear'));
    expect(hdr.indexOf('tonemap')).toBeLessThan(hdr.indexOf('format=yuv420p'));
    const poster = buildJournalPosterArgs('i', 'a', 'b', 1, true).join(' ');
    expect(poster.indexOf("min(2048,iw)")).toBeLessThan(poster.indexOf('zscale=t=linear'));
    expect(hdr).toContain('-color_primaries bt709 -color_trc bt709 -colorspace bt709');
    const sdr = buildJournalTranscodeArgs('i', 'o', 900).join(' ');
    expect(sdr).not.toContain('tonemap');
    expect(sdr).toContain('-color_trc bt709');
  });
});

describe('isStaleSource', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const name = 'tenant/scs/journal/jk1/abc-source';
  it('is stale after 24 h only', () => {
    expect(isStaleSource(name, '2026-11-01T11:00:00Z', now)).toBe(true);
    expect(isStaleSource(name, '2026-11-02T00:00:00Z', now)).toBe(false);
  });
  it('never deletes on a missing or invalid time, or a foreign name', () => {
    expect(isStaleSource(name, undefined, now)).toBe(false);
    expect(isStaleSource(name, 'nonsense', now)).toBe(false);
    expect(isStaleSource('tenant/scs/journal/jk1/abc-video.mp4', '2020-01-01T00:00:00Z', now)).toBe(false);
  });
});
