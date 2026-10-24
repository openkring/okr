// type-only: pmtiles is loaded in open(), so it stays out of the start bundle (the journal store loads eagerly)
import type { PMTiles, RangeResponse, Source } from 'pmtiles';

import { JournalPhotos } from './journal-photos.plugin';

/**
 * OpenStreetMap vector tiles for the offline map (spec 1.113 §9.4, plan 6b), read from the newest Protomaps
 * planet build. Neither the build nor its build list sends CORS headers, so every byte goes through the
 * native `fetchRange` (HTTP range requests); `pmtiles` reads only the directories and tiles of the area.
 * Protomaps documents area extracts from these builds, not live use: the map shows OSM only from tiles
 * stored on the iPad.
 */
const BUILDS_URL = 'https://build-metadata.protomaps.dev/builds.json';
const BUILD_BASE = 'https://build.protomaps.com/';
const BUILD_LIST_MAX = 1024 * 1024;

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** A pmtiles Source over the native range request. */
class NativeRangeSource implements Source {
  public constructor(private readonly url: string) {}

  public getKey(): string {
    return this.url;
  }

  public async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const { data } = await JournalPhotos.fetchRange({ url: this.url, offset, length });
    const bytes = fromBase64(data);
    return { data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  }
}

/** The newest planet build, e.g. `https://build.protomaps.com/20261023.pmtiles`. */
export async function latestPlanetBuild(): Promise<string> {
  const { data } = await JournalPhotos.fetchRange({ url: BUILDS_URL, offset: 0, length: BUILD_LIST_MAX });
  const builds = JSON.parse(new TextDecoder().decode(fromBase64(data))) as { key?: unknown }[];
  const keys = builds.map((b) => b.key).filter((k): k is string => typeof k === 'string' && /^\d{8}\.pmtiles$/.test(k)).sort();
  if (keys.length === 0) throw new Error('no Protomaps build listed');
  return BUILD_BASE + keys[keys.length - 1];
}

/** Reads single vector tiles (decompressed MVT) from one planet build. */
export class OsmExtract {
  private constructor(private readonly archive: PMTiles) {}

  public static async open(): Promise<OsmExtract> {
    const [{ PMTiles: Archive }, url] = await Promise.all([import('pmtiles'), latestPlanetBuild()]);
    return new OsmExtract(new Archive(new NativeRangeSource(url)));
  }

  /** The tile's bytes, or undefined where the build has none (open sea at high zoom). */
  public async tile(z: number, x: number, y: number): Promise<Uint8Array | undefined> {
    const response = await this.archive.getZxy(z, x, y);
    return response ? new Uint8Array(response.data) : undefined;
  }
}
