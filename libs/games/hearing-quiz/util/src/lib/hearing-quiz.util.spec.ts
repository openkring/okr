import { describe, expect, it } from 'vitest';

import { HearingQuizNodeModel, HearingQuizResultModel } from '@okr/shared-models';

import {
  HQ_MAX_SESSION_QUESTIONS,
  HQ_ORDER_STEP,
  answerOrder,
  audioExtension,
  canMoveTo,
  childrenOf,
  cloneSubtree,
  descendantKeys,
  flattenTree,
  getHearingQuizNodeIndex,
  hasDirectQuestions,
  hearingQuizFilePath,
  isAcceptedAudioType,
  isPlayable,
  lastSessionByFolder,
  newHearingQuizNode,
  nextOrder,
  pickRecorderMimeType,
  planDrop,
  planMove,
  questionCount,
  scoreOf,
  sessionQuestions,
  shuffle,
  targetFolders,
  topicKeyOf,
} from './hearing-quiz.util';

const T = 'test';

function folder(okey: string, parentKey = '', order = 0, title = okey): HearingQuizNodeModel {
  const n = newHearingQuizNode(T, 'folder', parentKey, order);
  n.okey = okey;
  n.title = title;
  return n;
}

function question(okey: string, parentKey: string, order = 0, playable = true): HearingQuizNodeModel {
  const n = newHearingQuizNode(T, 'question', parentKey, order);
  n.okey = okey;
  n.title = okey;
  n.answers = [{ text: 'a', caption: '', imageUrl: '' }, { text: 'b', caption: '', imageUrl: '' }];
  n.audioUrl = playable ? 'https://example/audio.mp3' : '';
  return n;
}

/*
 * topic (A)
 *   training (A1): q1, q2
 *   training (A2): q3
 * topic (B)
 */
function sampleTree(): HearingQuizNodeModel[] {
  return [
    folder('A', '', 1000),
    folder('B', '', 2000),
    folder('A1', 'A', 1000),
    folder('A2', 'A', 2000),
    question('q1', 'A1', 1000),
    question('q2', 'A1', 2000),
    question('q3', 'A2', 1000),
  ];
}

/** Deterministic "random" for shuffle tests. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('newHearingQuizNode', () => {
  it('creates a folder without answers', () => {
    const n = newHearingQuizNode(T, 'folder', 'p', 5);
    expect(n.type).toBe('folder');
    expect(n.parentKey).toBe('p');
    expect(n.order).toBe(5);
    expect(n.answers).toEqual([]);
    expect(n.tenants).toEqual([T]);
  });

  it('creates a question with two empty answers and the first marked correct', () => {
    const n = newHearingQuizNode(T, 'question');
    expect(n.answers).toHaveLength(2);
    expect(n.correctAnswer).toBe(0);
  });
});

describe('getHearingQuizNodeIndex', () => {
  it('indexes title and type', () => {
    expect(getHearingQuizNodeIndex(folder('x', '', 0, 'Vokale'))).toBe('n:Vokale t:folder');
  });
});

describe('childrenOf', () => {
  it('returns sorted direct children', () => {
    expect(childrenOf(sampleTree(), 'A').map(n => n.okey)).toEqual(['A1', 'A2']);
  });

  it('treats orphans as top level', () => {
    const nodes = [...sampleTree(), folder('orphan', 'gone', 3000)];
    expect(childrenOf(nodes, '').map(n => n.okey)).toEqual(['A', 'B', 'orphan']);
  });

  it('breaks order ties by title', () => {
    const nodes = [folder('z', '', 0, 'Zebra'), folder('a', '', 0, 'Affe')];
    expect(childrenOf(nodes, '').map(n => n.okey)).toEqual(['a', 'z']);
  });
});

describe('descendantKeys', () => {
  it('collects the whole subtree', () => {
    expect([...descendantKeys(sampleTree(), 'A')].sort()).toEqual(['A1', 'A2', 'q1', 'q2', 'q3']);
  });

  it('terminates on a cycle', () => {
    const nodes = [folder('x', 'y'), folder('y', 'x')];
    expect([...descendantKeys(nodes, 'x')]).toEqual(['y']);
  });
});

describe('canMoveTo', () => {
  const nodes = sampleTree();
  it('allows the top level', () => expect(canMoveTo(nodes, 'A1', '')).toBe(true));
  it('allows another folder', () => expect(canMoveTo(nodes, 'A1', 'B')).toBe(true));
  it('refuses the node itself', () => expect(canMoveTo(nodes, 'A', 'A')).toBe(false));
  it('refuses a descendant', () => expect(canMoveTo(nodes, 'A', 'A1')).toBe(false));
  it('refuses a question as target', () => expect(canMoveTo(nodes, 'q3', 'q1')).toBe(false));
  it('refuses an unknown target', () => expect(canMoveTo(nodes, 'q3', 'nope')).toBe(false));
});

describe('nextOrder', () => {
  it('appends after the last sibling', () => expect(nextOrder(sampleTree(), 'A')).toBe(2000 + HQ_ORDER_STEP));
  it('starts an empty folder at one step', () => expect(nextOrder(sampleTree(), 'B')).toBe(HQ_ORDER_STEP));
});

describe('topicKeyOf', () => {
  it('finds the top-level folder', () => expect(topicKeyOf(sampleTree(), 'q3')).toBe('A'));
  it('returns a top-level key itself', () => expect(topicKeyOf(sampleTree(), 'B')).toBe('B'));
  it('returns the key for an unknown node', () => expect(topicKeyOf(sampleTree(), 'nope')).toBe('nope'));
});

describe('questionCount / hasDirectQuestions', () => {
  it('counts questions at any depth', () => expect(questionCount(sampleTree(), 'A')).toBe(3));
  it('detects a training folder', () => {
    expect(hasDirectQuestions(sampleTree(), 'A1')).toBe(true);
    expect(hasDirectQuestions(sampleTree(), 'A')).toBe(false);
  });
});

describe('flattenTree', () => {
  it('shows only top level when nothing is open', () => {
    const rows = flattenTree(sampleTree(), new Set());
    expect(rows.map(r => r.node.okey)).toEqual(['A', 'B']);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[1].hasChildren).toBe(false);
  });

  it('expands open folders depth first with depth', () => {
    const rows = flattenTree(sampleTree(), new Set(['A', 'A1']));
    expect(rows.map(r => `${r.node.okey}:${r.depth}`)).toEqual(['A:0', 'A1:1', 'q1:2', 'q2:2', 'A2:1', 'B:0']);
  });
});

describe('targetFolders', () => {
  it('lists folders with their path', () => {
    expect(targetFolders(sampleTree()).map(t => t.label)).toEqual(['A', 'A / A1', 'A / A2', 'B']);
  });

  it('omits the moved node and its descendants', () => {
    expect(targetFolders(sampleTree(), 'A').map(t => t.key)).toEqual(['B']);
  });
});

describe('planMove', () => {
  it('moves into another folder and renumbers the target siblings', () => {
    const changes = planMove(sampleTree(), 'q3', 'A1', 1);
    expect(changes).toEqual([
      { key: 'q3', parentKey: 'A1', order: 2000 },
      { key: 'q2', parentKey: 'A1', order: 3000 },
    ]);
  });

  it('reorders within the same folder', () => {
    const changes = planMove(sampleTree(), 'q2', 'A1', 0);
    expect(changes).toEqual([
      { key: 'q2', parentKey: 'A1', order: 1000 },
      { key: 'q1', parentKey: 'A1', order: 2000 },
    ]);
  });

  it('clamps the index and ignores an unknown node', () => {
    expect(planMove(sampleTree(), 'q1', 'B', 99)).toEqual([{ key: 'q1', parentKey: 'B', order: 1000 }]);
    expect(planMove(sampleTree(), 'nope', 'B', 0)).toEqual([]);
  });
});

describe('planDrop', () => {
  // rows: A:0, A1:1, q1:2, q2:2, A2:1, B:0
  const rows = flattenTree(sampleTree(), new Set(['A', 'A1']));

  it('drops to the top of the list', () => {
    expect(planDrop(rows, 5, 0)).toEqual({ parentKey: '', insertIndex: 0 });
  });

  it('drops below an open folder as its first child', () => {
    expect(planDrop(rows, 5, 2)).toEqual({ parentKey: 'A1', insertIndex: 0 });
  });

  it('drops after a question as its next sibling', () => {
    // B dropped right after q1
    expect(planDrop(rows, 5, 3)).toEqual({ parentKey: 'A1', insertIndex: 1 });
  });

  it('drops after a closed folder as its sibling', () => {
    // q1 dropped right after A2 (closed)
    expect(planDrop(rows, 2, 4)).toEqual({ parentKey: 'A', insertIndex: 2 });
  });

  it('returns undefined for an unknown source row', () => {
    expect(planDrop(rows, 42, 0)).toBeUndefined();
  });
});

describe('cloneSubtree', () => {
  it('re-keys the subtree and hangs it under the new parent', () => {
    let i = 0;
    const copies = cloneSubtree(sampleTree(), 'A1', 'B', 500, () => `k${++i}`);
    expect(copies.map(c => c.okey)).toEqual(['k1', 'k2', 'k3']);
    expect(copies[0]).toMatchObject({ parentKey: 'B', order: 500, title: 'A1' });
    expect(copies[1].parentKey).toBe('k1');
    expect(copies[2].parentKey).toBe('k1');
  });

  it('does not mutate the originals', () => {
    const nodes = sampleTree();
    cloneSubtree(nodes, 'A1', 'B', 0, () => 'x');
    expect(nodes.find(n => n.okey === 'A1')?.parentKey).toBe('A');
  });

  it('returns [] for an unknown root', () => {
    expect(cloneSubtree(sampleTree(), 'nope', '', 0, () => 'x')).toEqual([]);
  });
});

describe('shuffle / answerOrder', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input, seq([0.1, 0.9, 0.5]));
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it('answerOrder is a permutation of the indexes', () => {
    expect([...answerOrder(5, seq([0.3, 0.7]))].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('isPlayable / sessionQuestions', () => {
  it('skips questions without audio', () => {
    expect(isPlayable(question('q', 'f', 0, false))).toBe(false);
    expect(isPlayable(folder('f'))).toBe(false);
  });

  it('keeps the authoring order when the folder says so', () => {
    const nodes = sampleTree();
    const a1 = nodes.find(n => n.okey === 'A1') as HearingQuizNodeModel;
    a1.keepOrder = true;
    expect(sessionQuestions(nodes, a1, () => 0).map(q => q.okey)).toEqual(['q1', 'q2']);
  });

  it('shuffles otherwise', () => {
    const nodes = sampleTree();
    const a1 = nodes.find(n => n.okey === 'A1') as HearingQuizNodeModel;
    // random 0 → j = 0 for i = 1: swaps the two
    expect(sessionQuestions(nodes, a1, () => 0).map(q => q.okey)).toEqual(['q2', 'q1']);
  });

  it('caps the session length', () => {
    const f = folder('f');
    f.keepOrder = true;
    const nodes = [f, ...Array.from({ length: 30 }, (_, i) => question(`q${i}`, 'f', i))];
    expect(sessionQuestions(nodes, f)).toHaveLength(HQ_MAX_SESSION_QUESTIONS);
  });
});

describe('scoreOf / lastSessionByFolder', () => {
  function attempt(chosen: number, correct: boolean): HearingQuizResultModel {
    const r = new HearingQuizResultModel(T);
    r.chosenAnswer = chosen;
    r.isCorrect = correct;
    return r;
  }

  it('counts correct, wrong and skipped', () => {
    expect(scoreOf([attempt(0, true), attempt(1, false), attempt(-1, false), attempt(2, true)]))
      .toEqual({ correct: 2, wrong: 1, skipped: 1 });
  });

  it('keeps the newest complete session per folder', () => {
    const mk = (nodeKey: string, timestamp: string, isComplete = true): HearingQuizResultModel => {
      const r = new HearingQuizResultModel(T);
      r.kind = 'session';
      r.nodeKey = nodeKey;
      r.timestamp = timestamp;
      r.isComplete = isComplete;
      return r;
    };
    const map = lastSessionByFolder([mk('f', '20260901'), mk('f', '20260903'), mk('f', '20260905', false), attempt(0, true)]);
    expect(map.get('f')?.timestamp).toBe('20260903');
    expect(map.size).toBe(1);
  });
});

describe('files', () => {
  it('accepts supported audio types, ignoring parameters', () => {
    expect(isAcceptedAudioType('audio/webm;codecs=opus')).toBe(true);
    expect(isAcceptedAudioType('audio/mpeg')).toBe(true);
    expect(isAcceptedAudioType('audio/flac')).toBe(false);
    expect(isAcceptedAudioType('')).toBe(false);
  });

  it('maps mime types to extensions', () => {
    expect(audioExtension('audio/mp4')).toBe('m4a');
    expect(audioExtension('audio/mpeg')).toBe('mp3');
    expect(audioExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
  });

  it('picks the first supported recorder format', () => {
    expect(pickRecorderMimeType(t => t === 'audio/webm')).toBe('audio/webm');
    expect(pickRecorderMimeType(() => true)).toBe('audio/mp4');
    expect(pickRecorderMimeType(() => false)).toBe('');
  });

  it('builds the storage path', () => {
    expect(hearingQuizFilePath('okr', 'n1', 'abc', 'm4a')).toBe('tenant/okr/hearing-quiz/n1/abc.m4a');
  });
});
