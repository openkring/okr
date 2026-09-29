import { describe, expect, it } from 'vitest';

import { ghostById, ghostMode, isFlashing, newGame, step, targetOf } from './mampf.engine';
import { IDLE_RELEASE_TICKS } from './mampf.levels';
import { MAZE, SCATTER_CORNER } from './mampf.maze';
import { GameState, Ghost, MampfEvent, OPPOSITE } from './mampf.types';

function playing(seed = 1): GameState {
  const s = newGame(seed);
  s.status = 'playing';
  s.statusTicks = 0;
  // park the hero in a corner so it neither eats much nor meets a ghost by accident
  // (it faces the wall, so it stands still; its tile is emptied so it eats nothing)
  Object.assign(s.hero, { x: 1, y: 29, dir: 'left', want: null });
  s.dots[29 * MAZE.width + 1] = 0;
  s.dotsLeft--;
  return s;
}

function run(s: GameState, ticks: number): MampfEvent[] {
  const events: MampfEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...step(s, null));
  return events;
}

const types = (events: MampfEvent[]) => events.map(e => e.type);

describe('scatter / chase', () => {
  it('switches from scatter to chase after 7 s on level 1', () => {
    const s = playing();
    expect(ghostMode(s)).toBe('scatter');
    const before = run(s, 7 * 60 - 1);
    expect(types(before)).not.toContain('modeChange');
    expect(types(step(s, null))).toContain('modeChange');
    expect(ghostMode(s)).toBe('chase');
  });

  it('reverses active ghosts on a mode switch', () => {
    const s = playing();
    const chaser = ghostById(s, 'chaser');
    Object.assign(chaser, { x: 20.5, y: 1, dir: 'right' });
    s.modeTicks = 7 * 60 - 1;
    step(s, null);
    expect(chaser.dir).toBe('left');
  });

  it('never reverses on its own between mode switches', () => {
    const s = playing();
    s.ghosts = [ghostById(s, 'chaser')];
    const chaser = s.ghosts[0];
    for (let i = 0; i < 400; i++) {
      const dir = chaser.dir;
      step(s, null);
      expect(chaser.dir).not.toBe(OPPOSITE[dir]);
    }
  });

  it('targets the scatter corner in scatter and the personality target in chase', () => {
    const s = playing();
    const chaser = ghostById(s, 'chaser');
    expect(targetOf(s, chaser)).toEqual(SCATTER_CORNER.chaser);
    s.modeIndex = 1;
    expect(targetOf(s, chaser)).toEqual([1, 29]);
  });

  it('stops the mode clock while the ghosts are frightened', () => {
    const s = playing();
    s.frightTicks = 10;
    run(s, 5);
    expect(s.modeTicks).toBe(0);
  });
});

describe('tunnel', () => {
  it('slows a ghost to 40 % in the tunnel', () => {
    const s = playing();
    s.ghosts = [ghostById(s, 'chaser')];
    Object.assign(s.ghosts[0], { x: 3.5, y: 14, dir: 'left' });
    step(s, null);
    expect(s.ghosts[0].x).toBeCloseTo(3.5 - (9.5 * 0.4) / 60, 6);
  });
});

describe('fright', () => {
  it('ends with frightEnd and calms every ghost', () => {
    const s = playing();
    s.ghosts.forEach(g => (g.frightened = true));
    s.frightTicks = 1;
    expect(types(step(s, null))).toContain('frightEnd');
    expect(s.ghosts.some(g => g.frightened)).toBe(false);
  });

  it('flashes during the last 2 s', () => {
    const s = playing();
    s.frightTicks = 121;
    expect(isFlashing(s)).toBe(false);
    s.frightTicks = 120;
    expect(isFlashing(s)).toBe(true);
    s.frightTicks = 0;
    expect(isFlashing(s)).toBe(false);
  });

  it('scores 200, 400, 800, 1600 for the ghosts of one fright', () => {
    const s = playing();
    s.ghosts.forEach(g => Object.assign(g, { x: 1, y: 29, dir: 'right', state: 'active', frightened: true }));
    s.frightTicks = 300;
    const events = step(s, null).filter(e => e.type === 'ghostEaten');
    expect(events.map(e => e.points)).toEqual([200, 400, 800, 1600]);
    expect(s.score).toBe(3000);
    expect(s.ghosts.every(g => g.state === 'eaten')).toBe(true);
  });

  it('only reverses the ghosts from level 21 on', () => {
    const s = playing();
    s.level = 21;
    const chaser = ghostById(s, 'chaser');
    Object.assign(chaser, { x: 20.5, y: 1, dir: 'right' });
    Object.assign(s.hero, { x: 1, y: 3.2, dir: 'up', want: 'up' });
    step(s, null);
    expect(s.frightTicks).toBe(0);
    expect(chaser.frightened).toBe(false);
    expect(chaser.dir).toBe('left');
  });
});

describe('eaten ghost', () => {
  it('returns as eyes to the house and comes out again', () => {
    const s = playing();
    const g = ghostById(s, 'chaser');
    Object.assign(g, { x: 6, y: 20, dir: 'up', state: 'eaten', frightened: false });
    const seen: Ghost['state'][] = [];
    for (let i = 0; i < 900 && !(seen.includes('leaving') && g.state === 'active'); i++) {
      step(s, null);
      if (seen[seen.length - 1] !== g.state) seen.push(g.state);
    }
    expect(seen).toEqual(['eaten', 'entering', 'leaving', 'active']);
    expect([g.x, g.y]).not.toEqual([6, 20]);
  });
});

describe('house release', () => {
  it('lets the ambusher out at once, the fickle one at 30 dots, the shy one at 60', () => {
    const s = playing();
    step(s, null);
    expect(ghostById(s, 'ambusher').state).toBe('leaving');
    expect(ghostById(s, 'fickle').state).toBe('house');
    s.dotsEatenLevel = 30;
    step(s, null);
    expect(ghostById(s, 'fickle').state).toBe('leaving');
    s.dotsEatenLevel = 59;
    step(s, null);
    expect(ghostById(s, 'shy').state).toBe('house');
    s.dotsEatenLevel = 60;
    step(s, null);
    expect(ghostById(s, 'shy').state).toBe('leaving');
  });

  it('releases the next ghost after 4 s without a dot', () => {
    const s = playing();
    step(s, null);
    s.idleTicks = IDLE_RELEASE_TICKS - 1;
    step(s, null);
    expect(ghostById(s, 'fickle').state).toBe('leaving');
  });

  it('uses the shared counter (7 / 17 / 32) after a lost life', () => {
    const s = playing();
    s.globalRelease = true;
    s.globalDots = 6;
    step(s, null);
    expect(ghostById(s, 'ambusher').state).toBe('house');
    s.globalDots = 7;
    step(s, null);
    expect(ghostById(s, 'ambusher').state).toBe('leaving');
  });

  it('walks a leaving ghost out through the door and sends it left', () => {
    const s = playing();
    const g = ghostById(s, 'ambusher');
    run(s, 1);
    let guard = 0;
    while (g.state === 'leaving' && guard++ < 200) step(s, null);
    expect(g.state).toBe('active');
    expect(g.y).toBe(11);
  });
});
