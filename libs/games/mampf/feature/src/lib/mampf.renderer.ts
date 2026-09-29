import {
  DIR_VEC,
  DYING_TICKS,
  Dir,
  GameState,
  Ghost,
  GhostId,
  MAZE,
  PELLET,
  contrastRatio,
  isFlashing,
  parseCssColor,
} from '@okr/games-mampf-util';

/** Where an actor stood before the last tick — the renderer smooths between the two. */
export interface Pose { x: number; y: number }

/** Hero first, then the ghosts in `game.ghosts` order. */
export function poses(game: GameState): Pose[] {
  return [game.hero, ...game.ghosts].map(a => ({ x: a.x, y: a.y }));
}

/** Fixed and clearly distinct, so the four stay recognisable in every tenant's colours. */
export const GHOST_COLORS: Record<GhostId, string> = {
  chaser: '#e53935',
  ambusher: '#ec6fb4',
  fickle: '#1fc3d6',
  shy: '#ff9f1c',
};
const FRIGHT = '#3949ab';
const FRIGHT_FLASH = '#f5f5f5';
const EYE = '#ffffff';
const PUPIL = '#1a237e';
const ROT: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

interface Colors { wall: string; text: string; hero: string }

/**
 * Draws a `GameState` onto one canvas. Walls and the door are drawn once per colour into an
 * offscreen layer and blitted; dots, hero and ghosts are drawn every frame.
 *
 * Colours come from the tenant's Ionic theme on the page host: walls `--ion-color-primary`
 * (or `--ion-text-color` when primary has less than 3:1 contrast to the background), hero
 * `--ion-color-secondary`, dots and door `--ion-text-color`. The canvas itself stays
 * transparent, so the page background (light or dark) shows through.
 */
export class MampfRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  /** Backing-store pixels per tile. */
  private size = 0;
  private colors: Colors | null = null;
  private readonly layers = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {}

  /** Fits the maze into a `width` × `height` CSS-px box, with whole-pixel tiles. */
  public resize(width: number, height: number): void {
    const tile = Math.max(4, Math.floor(Math.min(width / MAZE.width, height / MAZE.height)));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${tile * MAZE.width}px`;
    this.canvas.style.height = `${tile * MAZE.height}px`;
    this.canvas.width = Math.round(tile * MAZE.width * dpr);
    this.canvas.height = Math.round(tile * MAZE.height * dpr);
    this.size = tile * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.invalidate();
  }

  /** Forgets the colours and the cached maze layers — after a theme change or a resize. */
  public invalidate(): void {
    this.colors = null;
    this.layers.clear();
  }

  public draw(game: GameState, prev: Pose[] | null, alpha: number, reduced: boolean, now: number): void {
    const ctx = this.ctx;
    if (!ctx || this.size === 0) return;
    const colors = (this.colors ??= this.readColors(ctx));
    const flashWalls = game.status === 'levelClear' && !reduced && Math.floor(now / 250) % 2 === 1;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.layer(flashWalls ? colors.text : colors.wall, colors.text), 0, 0);
    this.drawDots(ctx, game, colors, reduced, now);

    const at = (i: number, a: Pose): Pose => {
      const p = prev?.[i];
      // no smoothing across a teleport (tunnel wrap, reset after a lost life)
      if (!p || Math.abs(p.x - a.x) > 1 || Math.abs(p.y - a.y) > 1) return a;
      return { x: p.x + (a.x - p.x) * alpha, y: p.y + (a.y - p.y) * alpha };
    };
    if (game.status === 'playing' || game.status === 'ready') {
      game.ghosts.forEach((g, i) => this.drawGhost(ctx, g, at(i + 1, g), game, reduced, now));
    }
    if (game.status !== 'gameOver') this.drawHero(ctx, game, at(0, game.hero), colors, reduced);
  }

  private readColors(ctx: CanvasRenderingContext2D): Colors {
    const css = getComputedStyle(this.host);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const primary = v('--ion-color-primary', '#0054e9');
    const text = v('--ion-text-color', '#000000');
    const background = v('--ion-background-color', '#ffffff');
    // let the canvas normalise any CSS colour to #rrggbb / rgba() before parsing it
    const rgb = (color: string) => {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = color;
      return parseCssColor(String(ctx.fillStyle));
    };
    const p = rgb(primary);
    const b = rgb(background);
    const wall = p && b && contrastRatio(p, b) < 3 ? text : primary;
    return { wall, text, hero: v('--ion-color-secondary', '#0163aa') };
  }

  private layer(wall: string, door: string): HTMLCanvasElement {
    const cached = this.layers.get(wall);
    if (cached) return cached;
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d');
    if (!ctx) return layer;
    const s = this.size;
    const isWall = (x: number, y: number) =>
      x < 0 || x >= MAZE.width || y < 0 || y >= MAZE.height || MAZE.rows[y][x] === '#';

    ctx.fillStyle = wall;
    ctx.globalAlpha = 0.18;
    for (let y = 0; y < MAZE.height; y++) {
      for (let x = 0; x < MAZE.width; x++) if (MAZE.rows[y][x] === '#') ctx.fillRect(x * s, y * s, s, s);
    }

    // an outline wherever a wall tile borders something that is not wall
    ctx.globalAlpha = 1;
    ctx.strokeStyle = wall;
    ctx.lineWidth = Math.max(1, s * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = 0; y < MAZE.height; y++) {
      for (let x = 0; x < MAZE.width; x++) {
        if (MAZE.rows[y][x] !== '#') continue;
        if (!isWall(x, y - 1)) { ctx.moveTo(x * s, y * s); ctx.lineTo((x + 1) * s, y * s); }
        if (!isWall(x, y + 1)) { ctx.moveTo(x * s, (y + 1) * s); ctx.lineTo((x + 1) * s, (y + 1) * s); }
        if (!isWall(x - 1, y)) { ctx.moveTo(x * s, y * s); ctx.lineTo(x * s, (y + 1) * s); }
        if (!isWall(x + 1, y)) { ctx.moveTo((x + 1) * s, y * s); ctx.lineTo((x + 1) * s, (y + 1) * s); }
      }
    }
    ctx.stroke();

    ctx.strokeStyle = door;
    ctx.lineWidth = Math.max(1, s * 0.2);
    ctx.beginPath();
    for (let y = 0; y < MAZE.height; y++) {
      for (let x = 0; x < MAZE.width; x++) {
        if (MAZE.rows[y][x] !== '-') continue;
        ctx.moveTo(x * s, (y + 0.5) * s);
        ctx.lineTo((x + 1) * s, (y + 0.5) * s);
      }
    }
    ctx.stroke();

    this.layers.set(wall, layer);
    return layer;
  }

  private drawDots(ctx: CanvasRenderingContext2D, game: GameState, colors: Colors, reduced: boolean, now: number): void {
    const s = this.size;
    const pulse = reduced ? 1 : 0.8 + 0.2 * Math.sin(now / 150);
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    for (let i = 0; i < game.dots.length; i++) {
      const kind = game.dots[i];
      if (!kind) continue;
      const x = ((i % MAZE.width) + 0.5) * s;
      const y = (Math.floor(i / MAZE.width) + 0.5) * s;
      const r = kind === PELLET ? s * 0.34 * pulse : s * 0.11;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private drawHero(ctx: CanvasRenderingContext2D, game: GameState, pos: Pose, colors: Colors, reduced: boolean): void {
    const s = this.size;
    const hero = game.hero;
    const cx = (pos.x + 0.5) * s;
    const cy = (pos.y + 0.5) * s;
    const r = s * 0.78;
    // mouth half-opening as a fraction of π
    let mouth = reduced ? 0.2 : 0.04 + 0.22 * Math.abs(Math.sin(hero.travelled * Math.PI));
    let opacity = 1;
    if (game.status === 'dying') {
      const t = 1 - game.statusTicks / DYING_TICKS;
      if (reduced) opacity = 1 - t;
      else mouth += (1 - mouth) * t;
    }
    const rot = ROT[hero.dir];
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = colors.hero;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, rot + mouth * Math.PI, rot + 2 * Math.PI - mouth * Math.PI);
    ctx.closePath();
    ctx.fill();
    if (mouth < 0.9) {
      // one eye, above the mouth on the side the hero faces (mirrored when it faces left)
      const ey = hero.dir === 'left' ? 0.45 : -0.45;
      const ex = Math.cos(rot) * 0.15 * r - Math.sin(rot) * ey * r;
      const eyy = Math.sin(rot) * 0.15 * r + Math.cos(rot) * ey * r;
      ctx.fillStyle = PUPIL;
      ctx.beginPath();
      ctx.arc(cx + ex, cy + eyy, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, pos: Pose, game: GameState, reduced: boolean, now: number): void {
    const s = this.size;
    const r = s * 0.78;
    const bob = g.state === 'house' && !reduced ? Math.sin(now / 200 + pos.x) * 0.15 * s : 0;
    const cx = (pos.x + 0.5) * s;
    const cy = (pos.y + 0.5) * s + bob;
    if (g.state !== 'eaten' && g.state !== 'entering') {
      const flashing = g.frightened && isFlashing(game);
      const blink = flashing && !reduced && Math.floor(now / 200) % 2 === 1;
      ctx.fillStyle = g.frightened ? (blink ? FRIGHT_FLASH : FRIGHT) : GHOST_COLORS[g.id];
      this.ghostBody(ctx, cx, cy, r, reduced ? 0 : now);
      ctx.fill();
      if (flashing && reduced) {
        // no blinking under reduced motion: a steady outline marks the ending fright instead
        ctx.strokeStyle = FRIGHT_FLASH;
        ctx.lineWidth = Math.max(1, s * 0.12);
        ctx.stroke();
      }
      if (g.frightened) {
        this.frightFace(ctx, cx, cy, r, blink ? FRIGHT : FRIGHT_FLASH);
        return;
      }
    }
    this.eyes(ctx, cx, cy, r, g.dir);
  }

  private ghostBody(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, phase: number): void {
    const top = cy - r * 0.1;
    const bottom = cy + r * 0.85;
    const left = cx - r;
    const right = cx + r;
    const waves = 3;
    const w = (right - left) / waves;
    const shift = Math.sin(phase / 120) * r * 0.12;
    ctx.beginPath();
    ctx.arc(cx, top, r, Math.PI, 0);
    ctx.lineTo(right, bottom);
    for (let i = 0; i < waves; i++) {
      const x0 = right - i * w;
      ctx.quadraticCurveTo(x0 - w / 2, bottom - r * 0.35 + shift, x0 - w, bottom);
    }
    ctx.closePath();
  }

  private eyes(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, dir: Dir): void {
    const [dx, dy] = DIR_VEC[dir];
    for (const side of [-1, 1]) {
      const ex = cx + side * r * 0.36;
      const ey = cy - r * 0.2;
      ctx.fillStyle = EYE;
      ctx.beginPath();
      ctx.ellipse(ex, ey, r * 0.24, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PUPIL;
      ctx.beginPath();
      ctx.arc(ex + dx * r * 0.1, ey + dy * r * 0.12, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private frightFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.fillStyle = color;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * r * 0.3, cy - r * 0.2, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    const y = cy + r * 0.35;
    const n = 4;
    const w = (r * 1.2) / n;
    ctx.moveTo(cx - r * 0.6, y);
    for (let i = 1; i <= n; i++) ctx.lineTo(cx - r * 0.6 + i * w, y + (i % 2 ? -r * 0.12 : 0));
    ctx.stroke();
  }
}
