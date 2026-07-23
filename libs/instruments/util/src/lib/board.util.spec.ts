import { describe, expect, it } from 'vitest';
import { InstrumentTopic } from '@okr/shared-models';
import { SWOT_GRID } from './grid-definitions';
import { assignMissingRanks, groupTopicsByCell, rankForInsertion, sortTopicsByRank } from './board.util';

function topic(partial: Partial<InstrumentTopic> & Pick<InstrumentTopic, 'key' | 'cell'>): InstrumentTopic {
  return { rank: '', label: '', description: '', color: '', score: { impact: 0, horizon: 0 }, sourceType: '', sourceKey: '', ...partial };
}

describe('sortTopicsByRank', () => {
  it('orders ranked topics before unranked ones, ranked in rank order', () => {
    const topics = [
      topic({ key: 'c', cell: 'strengths' }),                 // unranked
      topic({ key: 'a', cell: 'strengths', rank: 'M' }),
      topic({ key: 'b', cell: 'strengths', rank: 'G' }),
    ];
    expect(sortTopicsByRank(topics).map(t => t.key)).toEqual(['b', 'a', 'c']);
  });

  it('breaks ties (equal / missing rank) by key, deterministically', () => {
    const topics = [
      topic({ key: 'z', cell: 'strengths' }),
      topic({ key: 'a', cell: 'strengths' }),
    ];
    expect(sortTopicsByRank(topics).map(t => t.key)).toEqual(['a', 'z']);
  });

  it('treats an undefined rank (legacy doc) as unranked without crashing', () => {
    const legacy = { key: 'x', cell: 'strengths', label: '', description: '', color: '', sourceType: '', sourceKey: '' } as InstrumentTopic;
    const ranked = topic({ key: 'y', cell: 'strengths', rank: 'G' });
    expect(sortTopicsByRank([legacy, ranked]).map(t => t.key)).toEqual(['y', 'x']);
  });

  it('does not mutate its input', () => {
    const topics = [topic({ key: 'a', cell: 's', rank: 'M' }), topic({ key: 'b', cell: 's', rank: 'G' })];
    const before = topics.map(t => t.key);
    sortTopicsByRank(topics);
    expect(topics.map(t => t.key)).toEqual(before);
  });
});

describe('groupTopicsByCell', () => {
  it('produces one BoardCell per grid cell, in definition order', () => {
    const board = groupTopicsByCell([], SWOT_GRID);
    expect(board.map(b => b.cell.id)).toEqual(['strengths', 'weaknesses', 'opportunities', 'threats']);
  });

  it('places each topic in its cell, sorted', () => {
    const topics = [
      topic({ key: 'w1', cell: 'weaknesses', rank: 'G' }),
      topic({ key: 's1', cell: 'strengths', rank: 'M' }),
      topic({ key: 's2', cell: 'strengths', rank: 'G' }),
    ];
    const board = groupTopicsByCell(topics, SWOT_GRID);
    expect(board[0].topics.map(t => t.key)).toEqual(['s2', 's1']);
    expect(board[1].topics.map(t => t.key)).toEqual(['w1']);
    expect(board[2].topics).toEqual([]);
  });

  it('drops a topic whose cell is not in the definition', () => {
    const board = groupTopicsByCell([topic({ key: 'orphan', cell: 'does-not-exist' })], SWOT_GRID);
    expect(board.flatMap(b => b.topics)).toEqual([]);
  });
});

describe('assignMissingRanks', () => {
  it('returns nothing when every topic already has a rank', () => {
    const topics = [topic({ key: 'a', cell: 's', rank: 'G' }), topic({ key: 'b', cell: 's', rank: 'M' })];
    expect(assignMissingRanks(topics)).toEqual([]);
  });

  it('assigns strictly increasing ranks and returns only changed topics', () => {
    const topics = [topic({ key: 'a', cell: 's' }), topic({ key: 'b', cell: 's' })];
    const changed = assignMissingRanks(topics);
    expect(changed).toHaveLength(2);
    expect(topics[0].rank < topics[1].rank).toBe(true);
    expect(topics[0].rank.length).toBeGreaterThan(0);
  });
});

describe('rankForInsertion', () => {
  const ranked = [
    topic({ key: 'a', cell: 's', rank: 'G' }),
    topic({ key: 'b', cell: 's', rank: 'M' }),
    topic({ key: 'c', cell: 's', rank: 'T' }),
  ];

  it('mints a rank at the top that sorts before the first', () => {
    const r = rankForInsertion(ranked, 0);
    expect(r < ranked[0].rank).toBe(true);
  });

  it('mints a rank in the middle strictly between neighbours', () => {
    const r = rankForInsertion(ranked, 1);
    expect(ranked[0].rank < r && r < ranked[1].rank).toBe(true);
  });

  it('mints a rank at the end that sorts after the last', () => {
    const r = rankForInsertion(ranked, ranked.length);
    expect(r > ranked[ranked.length - 1].rank).toBe(true);
  });

  it('mints a valid first rank for an empty cell', () => {
    expect(rankForInsertion([], 0).length).toBeGreaterThan(0);
  });
});
