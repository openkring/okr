import { describe, expect, it } from 'vitest';

import { ghostById, newGame, step } from './mampf.engine';
import { DYING_TICKS, LEVEL_CLEAR_TICKS, READY_TICKS } from './mampf.levels';
import { DOT, MAZE } from './mampf.maze';
import { Dir, GameState, MampfEvent } from './mampf.types';

/** A game already past «Bereit!». */
function playing(seed = 1): GameState {
  const s = newGame(seed);
  s.status = 'playing';
  s.statusTicks = 0;
  return s;
}

/** The hero alone in the maze. */
function alone(): GameState {
  const s = playing();
  s.ghosts = [];
  return s;
}

function run(s: GameState, ticks: number, input: Dir | null = null): MampfEvent[] {
  const events: MampfEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(s, i === 0 ? input : null));
  return events;
}

const types = (events: MampfEvent[]) => events.map(e => e.type);

describe('newGame', () => {
  it('starts in ready with 3 lives, hero at the start, chaser outside and the others at home', () => {
    const s = newGame(7);
    expect(s.status).toBe('ready');
    expect(s.lives).toBe(3);
    expect([s.hero.x, s.hero.y, s.hero.dir]).toEqual([13.5, 23, 'left']);
    expect(s.ghosts.map(g => [g.id, g.state])).toEqual([
      ['chaser', 'active'], ['ambusher', 'house'], ['fickle', 'house'], ['shy', 'house'],
    ]);
    expect(s.dotsLeft).toBe(254);
  });

  it('holds still for READY_TICKS, buffers input meanwhile, then plays', () => {
    const s = newGame(7);
    step(s, 'up');
    expect(s.hero.want).toBe('up');
    run(s, READY_TICKS - 2);
    expect(s.status).toBe('ready');
    expect(s.hero.x).toBe(13.5);
    step(s, null);
    expect(s.status).toBe('playing');
  });
});

describe('hero movement', () => {
  it('moves at the level-1 speed (80 % of 9.5 tiles/s)', () => {
    const s = alone();
    run(s, 60);
    expect(s.hero.x).toBeCloseTo(13.5 - 7.6, 6);
    expect(s.hero.y).toBe(23);
  });

  it('stops against a wall', () => {
    const s = alone();
    run(s, 150);
    expect([s.hero.x, s.hero.y]).toEqual([1, 23]);
  });

  it('keeps a wanted turn buffered until the next open tile centre', () => {
    const s = alone();
    step(s, 'up');
    let guard = 0;
    while (s.hero.y === 23 && guard++ < 200) step(s, null);
    expect(s.hero.x).toBe(6);
    expect(s.hero.dir).toBe('up');
  });

  it('reverses in the middle of a tile', () => {
    const s = alone();
    run(s, 2);
    const x = s.hero.x;
    step(s, 'right');
    expect(s.hero.dir).toBe('right');
    expect(s.hero.x).toBeGreaterThan(x);
  });

  it('wraps through the tunnel', () => {
    const s = alone();
    Object.assign(s.hero, { x: 1, y: 14, dir: 'left', want: 'left' });
    run(s, 20);
    expect(s.hero.x).toBeGreaterThan(25);
    expect(s.hero.dir).toBe('left');
  });
});

describe('eating', () => {
  it('scores 10 for a dot', () => {
    const s = alone();
    const events = run(s, 15);
    expect(types(events)).toContain('dot');
    expect(s.score).toBe(10);
    expect(s.dotsLeft).toBe(253);
  });

  it('scores 50 for a pellet, frightens and reverses the active ghosts', () => {
    const s = playing();
    const chaser = ghostById(s, 'chaser');
    Object.assign(chaser, { x: 20.5, y: 1, dir: 'right' });
    Object.assign(s.hero, { x: 1, y: 3.2, dir: 'up', want: 'up' });
    const events = step(s, null);
    expect(types(events)).toContain('pellet');
    expect(s.score).toBe(50);
    expect(s.frightTicks).toBe(6 * 60 - 1);
    expect(chaser.frightened).toBe(true);
    expect(chaser.dir).toBe('left');
    expect(ghostById(s, 'fickle').frightened).toBe(false);
  });

  it('signals frightStart only when the ghosts really get frightened', () => {
    const early = playing();
    Object.assign(early.hero, { x: 1, y: 3.2, dir: 'up', want: 'up' });
    expect(types(step(early, null))).toEqual(expect.arrayContaining(['pellet', 'frightStart']));

    const late = playing();
    late.level = 17;
    Object.assign(late.hero, { x: 1, y: 3.2, dir: 'up', want: 'up' });
    const events = types(step(late, null));
    expect(events).toContain('pellet');
    expect(events).not.toContain('frightStart');
  });

  it('gives one extra life at 10 000 points, once', () => {
    const s = alone();
    s.score = 9_995;
    const events = run(s, 15);
    expect(types(events)).toContain('extraLife');
    expect(s.lives).toBe(4);
    s.score = 19_995;
    run(s, 10);
    expect(s.lives).toBe(4);
  });

  it('clears the level on the last dot and starts the next one with a full maze', () => {
    const s = alone();
    s.dots.fill(0);
    s.dots[23 * MAZE.width + 12] = DOT;
    s.dotsLeft = 1;
    const events = run(s, 15);
    expect(types(events)).toContain('levelClear');
    expect(s.status).toBe('levelClear');
    run(s, LEVEL_CLEAR_TICKS);
    expect(s.status).toBe('ready');
    expect(s.level).toBe(2);
    expect(s.dotsLeft).toBe(254);
    expect([s.hero.x, s.hero.y]).toEqual([13.5, 23]);
  });
});

describe('lives', () => {
  it('loses a life on touching a ghost and restarts with the global release counter', () => {
    const s = playing();
    Object.assign(ghostById(s, 'chaser'), { x: 13, y: 23, dir: 'right' });
    const events = step(s, null);
    expect(types(events)).toContain('died');
    expect(s.status).toBe('dying');
    expect(s.lives).toBe(2);
    run(s, DYING_TICKS);
    expect(s.status).toBe('ready');
    expect(s.globalRelease).toBe(true);
    expect([s.hero.x, s.hero.y]).toEqual([13.5, 23]);
    expect(ghostById(s, 'ambusher').state).toBe('house');
  });

  it('catches the hero across the tunnel wrap', () => {
    const s = playing();
    s.ghosts = [ghostById(s, 'chaser')];
    Object.assign(s.hero, { x: -0.3, y: 14, dir: 'left', want: 'left' });
    Object.assign(s.ghosts[0], { x: 27.3, y: 14, dir: 'right' });
    expect(types(step(s, null))).toContain('died');
  });

  it('ends the game when the last life is lost', () => {
    const s = playing();
    s.lives = 1;
    Object.assign(ghostById(s, 'chaser'), { x: 13, y: 23, dir: 'right' });
    step(s, null);
    const events = run(s, DYING_TICKS);
    expect(types(events)).toContain('gameOver');
    expect(s.status).toBe('gameOver');
    const hero = { ...s.hero };
    run(s, 30, 'up');
    expect(s.hero).toEqual(hero);
  });
});

describe('determinism', () => {
  it('replays identically for the same seed and inputs', () => {
    const play = () => {
      const s = playing(99);
      const inputs: Dir[] = ['left', 'up', 'right', 'down'];
      for (let i = 0; i < 3000; i++) step(s, i % 90 === 0 ? inputs[(i / 90) % 4] : null);
      return JSON.stringify({ ...s, dots: Array.from(s.dots) });
    };
    expect(play()).toBe(play());
  });
});
