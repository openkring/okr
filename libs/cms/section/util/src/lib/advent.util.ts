import { AdventDoor, IMAGE_CONFIG_SHAPE, ImageConfig } from '@okr/shared-models';

/** Advent calendar section (spec 1.119): doors 1..25, door n opens on n December. */
export const ADVENT_DOOR_COUNT = 25;
export const ADVENT_MIN_YEAR = 2020;
export const ADVENT_MAX_YEAR = 2100;

/** Door n is unlocked from n December of `year`, 00:00 device-local time. */
export function isDoorUnlocked(day: number, year: number, today: Date): boolean {
  return today.getTime() >= new Date(year, 11, day).getTime();
}

/** localStorage key holding the highest door the user has opened (one per tenant, section, year and user). */
export function adventStorageKey(tenantId: string, sectionKey: string, year: number, uid?: string): string {
  return `okr.advent.${tenantId}.${sectionKey}.${year}.${uid || 'anon'}`;
}

/** Parses the stored value; anything that is not a day 1..25 counts as "nothing opened yet". */
export function parseOpenedUpTo(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isInteger(n) && n >= 1 && n <= ADVENT_DOOR_COUNT ? n : 0;
}

/** The doors to show open on load: every unlocked door up to the highest one the user has opened. */
export function openDoorsOnLoad(openedUpTo: number, year: number, today: Date): Set<number> {
  const open = new Set<number>();
  for (let day = 1; day <= Math.min(openedUpTo, ADVENT_DOOR_COUNT); day++) {
    if (isDoorUnlocked(day, year, today)) open.add(day);
  }
  return open;
}

/** Small deterministic PRNG (mulberry32), so the same seed always gives the same layout. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AdventDoorPosition = Pick<AdventDoor, 'day' | 'x' | 'y' | 'w' | 'h'>;

// safe area in percent of the section: the top band stays free for the title
const AREA = { left: 4, top: 18, width: 92, height: 78 };
const GRID = 5;

/**
 * A 5 × 5 grid inside the safe area, cells shuffled by the seed, each door jittered inside its cell.
 * Doors 24 and 25 are a little larger, as on a real calendar. All values are percent, rounded to 0.1.
 */
export function generateAdventLayout(seed: number): AdventDoorPosition[] {
  const random = seededRandom(seed);
  const cells = Array.from({ length: GRID * GRID }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const cellW = AREA.width / GRID;
  const cellH = AREA.height / GRID;
  const round = (v: number) => Math.round(v * 10) / 10;
  return cells.slice(0, ADVENT_DOOR_COUNT).map((cell, i) => {
    const day = i + 1;
    const big = day >= 24;
    const w = big ? cellW * 0.9 : cellW * 0.72;
    const h = big ? cellH * 0.9 : cellH * 0.72;
    const col = cell % GRID;
    const row = Math.floor(cell / GRID);
    return {
      day,
      x: round(AREA.left + col * cellW + random() * (cellW - w)),
      y: round(AREA.top + row * cellH + random() * (cellH - h)),
      w: round(w),
      h: round(h),
    };
  });
}

/** 25 doors without images, laid out by the seed. */
export function createAdventDoors(seed: number): AdventDoor[] {
  return generateAdventLayout(seed).map(pos => ({ ...pos, image: { ...IMAGE_CONFIG_SHAPE, label: String(pos.day) } }));
}

/** New positions from a new seed; every door keeps its image, overlay and link. Missing days are added. */
export function rearrangeAdventDoors(doors: AdventDoor[], seed: number): AdventDoor[] {
  const byDay = new Map(doors.map(door => [door.day, door]));
  return generateAdventLayout(seed).map(pos => ({
    ...pos,
    image: byDay.get(pos.day)?.image ?? { ...IMAGE_CONFIG_SHAPE, label: String(pos.day) },
  }));
}

/** A fresh seed for a layout (positive 31-bit integer). */
export function newAdventSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/** The chosen background (by url), else the first one; undefined without any background. */
export function resolveAdventBackground(backgrounds: ImageConfig[] | undefined, backgroundUrl: string | undefined): ImageConfig | undefined {
  const list = (backgrounds ?? []).filter(img => !!img.url);
  return list.find(img => img.url === backgroundUrl) ?? list[0];
}

/** The name the background select shows: the label, else the file name of the url. */
export function adventImageName(image: ImageConfig): string {
  return image.label?.trim() || (image.url ?? '').split('/').pop() || '';
}

export interface CoverBox {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

/** Size and offset of an image scaled to cover a container (CSS `background-size: cover`, centred). */
export function coverBox(containerW: number, containerH: number, imageW: number, imageH: number): CoverBox | undefined {
  if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) return undefined;
  const scale = Math.max(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return { width, height, offsetX: (containerW - width) / 2, offsetY: (containerH - height) / 2 };
}

/** What a tap on an open door's thumbnail does with its link. */
export function adventLinkKind(actionUrl: string | undefined): 'none' | 'internal' | 'external' {
  const url = actionUrl?.trim() ?? '';
  if (!url) return 'none';
  if (/^https?:\/\//i.test(url)) return 'external';
  return url.startsWith('/') ? 'internal' : 'none';
}
