import { describe, expect, it } from 'vitest';

import { chaseTarget, chooseDir } from './mampf.ghosts';

describe('chaseTarget', () => {
  it('chaser targets the hero tile', () => {
    expect(chaseTarget('chaser', [10, 23], 'left', [1, 1], [1, 1])).toEqual([10, 23]);
  });

  it('ambusher targets 4 tiles ahead of the hero', () => {
    expect(chaseTarget('ambusher', [10, 23], 'left', [1, 1], [1, 1])).toEqual([6, 23]);
    expect(chaseTarget('ambusher', [10, 23], 'up', [1, 1], [1, 1])).toEqual([10, 19]);
  });

  it('fickle doubles the vector from the chaser to 2 tiles ahead of the hero', () => {
    expect(chaseTarget('fickle', [10, 20], 'right', [1, 1], [6, 20])).toEqual([18, 20]);
  });

  it('shy chases from afar and retreats to its corner within 8 tiles', () => {
    expect(chaseTarget('shy', [10, 20], 'left', [1, 1], [0, 0])).toEqual([10, 20]);
    expect(chaseTarget('shy', [10, 20], 'left', [10, 25], [0, 0])).toEqual([0, 31]);
  });
});

describe('chooseDir', () => {
  it('picks the neighbour closest to the target', () => {
    expect(chooseDir(['left', 'right'], [5, 5], [9, 5])).toBe('right');
  });

  it('breaks ties up → left → down → right', () => {
    expect(chooseDir(['right', 'down', 'left', 'up'], [5, 5], [5, 5])).toBe('up');
    expect(chooseDir(['right', 'down', 'left'], [5, 5], [5, 5])).toBe('left');
    expect(chooseDir(['right', 'down'], [5, 5], [5, 5])).toBe('down');
  });
});
