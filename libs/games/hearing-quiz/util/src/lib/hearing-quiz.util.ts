import {
  HearingQuizAnswer,
  HearingQuizNodeModel,
  HearingQuizNodeType,
  HearingQuizResultModel,
} from '@okr/shared-models';
import { addIndexElement } from '@okr/shared-util-core';

/*-------------------------- routes --------------------------------*/
/** The tree page; `all` is the (unused) listId, `c-hearing-quiz` its context menu. */
export const HQ_TREE_URL = '/hearing-quiz/all/c-hearing-quiz';
export function hqQuestionUrl(nodeKey: string): string { return `/hearing-quiz/q/${nodeKey}`; }
export function hqSessionUrl(folderKey: string): string { return `/hearing-quiz/session/${folderKey}`; }

/*-------------------------- limits (spec §4, §6) --------------------------------*/
export const HQ_MIN_ANSWERS = 2;
export const HQ_MAX_ANSWERS = 6;
/** A session never holds more questions than this, however large the folder is. */
export const HQ_MAX_SESSION_QUESTIONS = 20;
/** Gap between sibling `order` values, so a single insert rarely has to renumber anything. */
export const HQ_ORDER_STEP = 1000;
export const HQ_MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const HQ_MAX_AUDIO_SECONDS = 30;
export const HQ_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Firestore batch limit — a copy larger than this is refused rather than split. */
export const HQ_MAX_COPY_NODES = 500;

/**
 * Audio formats accepted for upload. All of them play in current Chrome, Firefox and Safari
 * (Safari: webm since iOS 17.4). There is no transcoding (spec §11.4), so this list IS the
 * compatibility guarantee.
 */
export const HQ_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'];
export const HQ_AUDIO_ACCEPT = HQ_AUDIO_MIME_TYPES.join(',') + ',.mp3,.m4a,.wav,.webm,.ogg,.aac';
export const HQ_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * MediaRecorder formats in order of preference. `audio/mp4` first: it is the one format every
 * browser can PLAY back, so a clip recorded in Chrome still works on an older iPhone.
 */
export const HQ_RECORDER_MIME_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/*-------------------------- factories --------------------------------*/
export function newHearingQuizNode(tenantId: string, type: HearingQuizNodeType, parentKey = '', order = 0): HearingQuizNodeModel {
  const node = new HearingQuizNodeModel(tenantId);
  node.type = type;
  node.parentKey = parentKey;
  node.order = order;
  if (type === 'question') {
    node.answers = [newHearingQuizAnswer(), newHearingQuizAnswer()];
    node.correctAnswer = 0;
  }
  return node;
}

export function newHearingQuizAnswer(text = ''): HearingQuizAnswer {
  return { text, caption: '', imageUrl: '' };
}

export function newHearingQuizResult(tenantId: string, userKey: string): HearingQuizResultModel {
  const result = new HearingQuizResultModel(tenantId);
  result.userKey = userKey;
  return result;
}

/*-------------------------- search index --------------------------------*/
export function getHearingQuizNodeIndex(node: HearingQuizNodeModel): string {
  let index = '';
  index = addIndexElement(index, 'n', node.title);
  index = addIndexElement(index, 't', node.type);
  return index;
}

/*-------------------------- tree --------------------------------*/
/** Legacy/partial docs may lack fields (Firestore reads skip model defaults). */
function parentOf(node: HearingQuizNodeModel): string {
  return node.parentKey ?? '';
}

export function isFolder(node: HearingQuizNodeModel | undefined): boolean {
  return node?.type === 'folder';
}

export function isQuestion(node: HearingQuizNodeModel | undefined): boolean {
  return node?.type === 'question';
}

/** Siblings in display order: `order`, then title, then key — deterministic on ties. */
export function compareNodes(a: HearingQuizNodeModel, b: HearingQuizNodeModel): number {
  return (a.order ?? 0) - (b.order ?? 0)
    || (a.title ?? '').localeCompare(b.title ?? '')
    || a.okey.localeCompare(b.okey);
}

/** The direct children of `parentKey` ('' = top level), sorted. Orphans count as top level. */
export function childrenOf(nodes: HearingQuizNodeModel[], parentKey: string): HearingQuizNodeModel[] {
  const keys = new Set(nodes.map(n => n.okey));
  return nodes
    .filter(n => {
      const p = parentOf(n);
      if (parentKey === '') return p === '' || !keys.has(p);
      return p === parentKey;
    })
    .sort(compareNodes);
}

/** Every key below `key` (not including `key` itself). Cycle-safe. */
export function descendantKeys(nodes: HearingQuizNodeModel[], key: string): Set<string> {
  const result = new Set<string>();
  const stack = [key];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const n of nodes) {
      if (parentOf(n) === current && !result.has(n.okey) && n.okey !== key) {
        result.add(n.okey);
        stack.push(n.okey);
      }
    }
  }
  return result;
}

/**
 * May `nodeKey` be moved into `targetParentKey`? The target must be the top level or a folder,
 * and never the node itself or one of its descendants (that would detach a cycle from the tree).
 * Firestore rules cannot walk the tree, so this is the only guard (spec §9.1).
 */
export function canMoveTo(nodes: HearingQuizNodeModel[], nodeKey: string, targetParentKey: string): boolean {
  if (targetParentKey === '') return true;
  if (targetParentKey === nodeKey) return false;
  const target = nodes.find(n => n.okey === targetParentKey);
  if (!isFolder(target)) return false;
  return !descendantKeys(nodes, nodeKey).has(targetParentKey);
}

/** The `order` value that appends a new child at the end of `parentKey`. */
export function nextOrder(nodes: HearingQuizNodeModel[], parentKey: string): number {
  const siblings = childrenOf(nodes, parentKey);
  const last = siblings[siblings.length - 1];
  return last ? (last.order ?? 0) + HQ_ORDER_STEP : HQ_ORDER_STEP;
}

/** The top-level folder above `key` (the "topic"), or `key` itself when it is top level. */
export function topicKeyOf(nodes: HearingQuizNodeModel[], key: string): string {
  const byKey = new Map(nodes.map(n => [n.okey, n]));
  let current = byKey.get(key);
  const seen = new Set<string>();
  while (current && parentOf(current) !== '' && byKey.has(parentOf(current)) && !seen.has(current.okey)) {
    seen.add(current.okey);
    current = byKey.get(parentOf(current));
  }
  return current?.okey ?? key;
}

/** Number of questions anywhere below a folder. */
export function questionCount(nodes: HearingQuizNodeModel[], folderKey: string): number {
  const below = descendantKeys(nodes, folderKey);
  return nodes.filter(n => below.has(n.okey) && isQuestion(n)).length;
}

/** A folder that directly holds questions is a training: it gets a start button. */
export function hasDirectQuestions(nodes: HearingQuizNodeModel[], folderKey: string): boolean {
  return nodes.some(n => parentOf(n) === folderKey && isQuestion(n));
}

export interface HearingQuizTreeRow {
  node: HearingQuizNodeModel;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
}

/** The visible rows of the tree: depth-first, children only under open folders. */
export function flattenTree(nodes: HearingQuizNodeModel[], openKeys: ReadonlySet<string>): HearingQuizTreeRow[] {
  const rows: HearingQuizTreeRow[] = [];
  const visit = (parentKey: string, depth: number, path: Set<string>): void => {
    for (const node of childrenOf(nodes, parentKey)) {
      if (path.has(node.okey)) continue; // defensive: a cycle in bad data must not hang the page
      const children = childrenOf(nodes, node.okey);
      const isOpen = openKeys.has(node.okey);
      rows.push({ node, depth, hasChildren: children.length > 0, isOpen });
      if (isOpen && children.length > 0) {
        visit(node.okey, depth + 1, new Set([...path, node.okey]));
      }
    }
  };
  visit('', 0, new Set());
  return rows;
}

/** Folders a node may be moved/copied into, as (key, label) with the path as label. */
export function targetFolders(nodes: HearingQuizNodeModel[], nodeKey?: string): { key: string; label: string }[] {
  const result: { key: string; label: string }[] = [];
  const visit = (parentKey: string, prefix: string): void => {
    for (const node of childrenOf(nodes, parentKey).filter(isFolder)) {
      if (nodeKey && !canMoveTo(nodes, nodeKey, node.okey)) continue;
      const label = prefix ? `${prefix} / ${node.title}` : node.title;
      result.push({ key: node.okey, label });
      visit(node.okey, label);
    }
  };
  visit('', '');
  return result;
}

/*-------------------------- move / copy --------------------------------*/
export interface HearingQuizPlacement {
  key: string;
  parentKey: string;
  order: number;
}

/**
 * Place `movedKey` under `newParentKey` at position `insertIndex` among the other children, and
 * renumber that sibling list with `HQ_ORDER_STEP` gaps. Returns only the nodes whose parent or
 * order actually changes — each is one Firestore update.
 */
export function planMove(nodes: HearingQuizNodeModel[], movedKey: string, newParentKey: string, insertIndex: number): HearingQuizPlacement[] {
  const moved = nodes.find(n => n.okey === movedKey);
  if (!moved) return [];
  const siblings = childrenOf(nodes, newParentKey).filter(n => n.okey !== movedKey);
  const index = Math.max(0, Math.min(insertIndex, siblings.length));
  siblings.splice(index, 0, moved);
  const changes: HearingQuizPlacement[] = [];
  siblings.forEach((node, i) => {
    const order = (i + 1) * HQ_ORDER_STEP;
    if (node.order !== order || parentOf(node) !== newParentKey) {
      changes.push({ key: node.okey, parentKey: newParentKey, order });
    }
  });
  return changes;
}

/**
 * Interpret a drop in the flat, depth-indented row list (CDK drop list semantics: the row
 * moved from `previousIndex` to `currentIndex`). The row directly above the drop point decides:
 * - an OPEN folder above → the dropped node becomes its first child;
 * - any other row above → the dropped node becomes that row's next sibling;
 * - nothing above → first node at the top level.
 * Dropping INTO a closed folder is done with "Verschieben nach…" instead (spec §4.2).
 */
export function planDrop(rows: HearingQuizTreeRow[], previousIndex: number, currentIndex: number): { parentKey: string; insertIndex: number } | undefined {
  const moved = rows[previousIndex];
  if (!moved) return undefined;
  const reordered = rows.slice();
  reordered.splice(previousIndex, 1);
  const above = reordered[currentIndex - 1];
  if (!above) return { parentKey: '', insertIndex: 0 };
  if (above.node.type === 'folder' && above.isOpen) {
    return { parentKey: above.node.okey, insertIndex: 0 };
  }
  const parentKey = above.node.parentKey ?? '';
  // position among the siblings of `above`, as they appear in the list (the moved node removed)
  const siblingsAbove = reordered
    .slice(0, currentIndex)
    .filter(r => (r.node.parentKey ?? '') === parentKey && r.node.okey !== moved.node.okey);
  return { parentKey, insertIndex: siblingsAbove.length };
}

/**
 * Deep copy of `rootKey` and everything below it, re-keyed with `newKey()` and hung under
 * `newParentKey`. Audio and images are shared with the original: files are never deleted when
 * a node is archived (spec §4.5), so a shared file cannot be pulled from under a copy.
 */
export function cloneSubtree(
  nodes: HearingQuizNodeModel[],
  rootKey: string,
  newParentKey: string,
  order: number,
  newKey: () => string,
): HearingQuizNodeModel[] {
  const root = nodes.find(n => n.okey === rootKey);
  if (!root) return [];
  const below = descendantKeys(nodes, rootKey);
  const keyMap = new Map<string, string>();
  const originals = [root, ...nodes.filter(n => below.has(n.okey))];
  originals.forEach(n => keyMap.set(n.okey, newKey()));
  return originals.map(n => {
    const copy: HearingQuizNodeModel = structuredClone(n);
    copy.okey = keyMap.get(n.okey) as string;
    if (n.okey === rootKey) {
      copy.parentKey = newParentKey;
      copy.order = order;
    } else {
      copy.parentKey = keyMap.get(parentOf(n)) ?? newParentKey;
    }
    copy.index = getHearingQuizNodeIndex(copy);
    return copy;
  });
}

/*-------------------------- session --------------------------------*/
/** Fisher–Yates on a copy; `random` is injectable for tests. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A playable question: has a clip and at least two answers. Incomplete drafts are skipped. */
export function isPlayable(node: HearingQuizNodeModel): boolean {
  return isQuestion(node) && !!node.audioUrl && (node.answers?.length ?? 0) >= HQ_MIN_ANSWERS;
}

/**
 * The questions of a training session: the folder's direct, playable questions — shuffled
 * unless the folder keeps its order (spec §11.5) — capped at `HQ_MAX_SESSION_QUESTIONS`.
 */
export function sessionQuestions(nodes: HearingQuizNodeModel[], folder: HearingQuizNodeModel, random: () => number = Math.random): HearingQuizNodeModel[] {
  const questions = childrenOf(nodes, folder.okey).filter(isPlayable);
  const ordered = folder.keepOrder ? questions : shuffle(questions, random);
  return ordered.slice(0, HQ_MAX_SESSION_QUESTIONS);
}

/** The display order of a question's answer cards: a permutation of the answer indexes. */
export function answerOrder(count: number, random: () => number = Math.random): number[] {
  return shuffle(Array.from({ length: count }, (_, i) => i), random);
}

export interface HearingQuizScore {
  correct: number;
  wrong: number;
  skipped: number;
}

export function scoreOf(attempts: HearingQuizResultModel[]): HearingQuizScore {
  return attempts.reduce<HearingQuizScore>((score, a) => {
    if (a.chosenAnswer < 0) score.skipped++;
    else if (a.isCorrect) score.correct++;
    else score.wrong++;
    return score;
  }, { correct: 0, wrong: 0, skipped: 0 });
}

/** The newest complete session result per folder key, for the "Zuletzt 8 von 10" line. */
export function lastSessionByFolder(results: HearingQuizResultModel[]): Map<string, HearingQuizResultModel> {
  const map = new Map<string, HearingQuizResultModel>();
  for (const r of results) {
    if (r.kind !== 'session' || !r.isComplete) continue;
    const current = map.get(r.nodeKey);
    if (!current || (r.timestamp ?? '') > (current.timestamp ?? '')) map.set(r.nodeKey, r);
  }
  return map;
}

/*-------------------------- files --------------------------------*/
export function isAcceptedAudioType(mimeType: string): boolean {
  const base = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  return HQ_AUDIO_MIME_TYPES.includes(base);
}

/** File extension for a recorded or uploaded clip's mime type. */
export function audioExtension(mimeType: string): string {
  const base = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'audio/mpeg': return 'mp3';
    case 'audio/mp4':
    case 'audio/x-m4a':
    case 'audio/aac': return 'm4a';
    case 'audio/wav':
    case 'audio/x-wav': return 'wav';
    case 'audio/ogg': return 'ogg';
    default: return 'webm';
  }
}

/** The first recorder format this browser supports, or '' to let the browser choose. */
export function pickRecorderMimeType(isSupported: (mimeType: string) => boolean): string {
  return HQ_RECORDER_MIME_TYPES.find(t => isSupported(t)) ?? '';
}

/** Storage path of a node's file: `tenant/<tenant>/hearing-quiz/<nodeKey>/<name>.<ext>`. */
export function hearingQuizFilePath(tenantId: string, nodeKey: string, name: string, extension: string): string {
  return `tenant/${tenantId}/hearing-quiz/${nodeKey}/${name}.${extension}`;
}
