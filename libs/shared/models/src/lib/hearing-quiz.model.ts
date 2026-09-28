import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS, DEFAULT_TITLE } from '@okr/shared-constants';
import { OkrModel, SearchableModel } from './base.model';

/**
 * Hörtraining (spec `2026-09-28-hearing-quiz-spec.md`).
 *
 * One flat, tenant-owned collection holds the whole content tree: a node is either a FOLDER
 * (topic, training) or a QUESTION (a leaf), linked to its parent by `parentKey`. Flat rather than
 * sub-collections so a move is a single-field update and a tenant's whole tree loads with one query.
 * Written only by content admins (firestore.rules).
 */
export type HearingQuizNodeType = 'folder' | 'question';

export interface HearingQuizAnswer {
  text: string;      // e.g. '/ba/' or 'Hundegebell'
  caption: string;   // small line under the text, e.g. 'Konsonant'; '' = none
  imageUrl: string;  // phase 2: picture card for environmental sounds; '' = none
}

export class HearingQuizNodeModel implements OkrModel, SearchableModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;

  public type: HearingQuizNodeType = 'folder';
  public parentKey = DEFAULT_KEY;     // okey of the parent folder; '' = top level
  public order = 0;                   // sort order among siblings (gaps allowed)
  public title = DEFAULT_TITLE;

  // folder only
  public description = DEFAULT_NOTES; // shown above the start button
  public keepOrder = false;           // a session keeps the authoring order instead of shuffling

  // question only
  public question = '';               // the prompt, e.g. 'Welche Silbe hörst du?'
  public audioUrl = '';               // download URL of the clip
  public audioPath = '';              // storage path of the clip
  public answers: HearingQuizAnswer[] = [];
  public correctAnswer = 0;           // index into answers
  public hint = '';
  public hintImageUrl = '';           // static image of the mouth shape; '' = none

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const HearingQuizNodeCollection = 'hearingQuizNodes';
export const HearingQuizNodeModelName = 'hearingQuizNode';

/**
 * One training result of ONE user — health data (revDSG Art. 5 lit. c). Readable and writable only
 * by the user it belongs to (`userKey == request.auth.uid`), admin included: there is no admin view.
 *
 * `kind: 'attempt'` is one answered or skipped question, `kind: 'session'` the totals of a training
 * session. Both shapes share the class so the user's history loads with one query; fields that do
 * not apply keep their defaults (Firestore does not store `undefined`).
 */
export type HearingQuizResultKind = 'attempt' | 'session';

export class HearingQuizResultModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public userKey = DEFAULT_KEY;       // Firebase Auth uid — the owner
  public kind: HearingQuizResultKind = 'attempt';
  public nodeKey = DEFAULT_KEY;       // the question (attempt) or the folder (session)
  public topicKey = DEFAULT_KEY;      // top-level folder, denormalised for statistics
  public date = '';                   // StoreDate yyyyMMdd
  public timestamp = '';              // StoreDateTime, orders results within a day

  // attempt
  public chosenAnswer = -1;           // index into the question's answers; -1 = skipped
  public isCorrect = false;
  public replays = 0;
  public usedHint = false;

  // session
  public correct = 0;
  public wrong = 0;
  public skipped = 0;
  public durationSec = 0;
  public isComplete = false;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const HearingQuizResultCollection = 'hearingQuizResults';
export const HearingQuizResultModelName = 'hearingQuizResult';
