import { Signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions } from '@ionic/angular';

import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { MUTE_DURATIONS, MuteDuration } from '@okr/chat-util';

/** The labels the duration sheet shows (spec 1.109 §9). */
export interface MuteDurationLabels {
  mute_tile: Signal<string>;
  mute_1h: Signal<string>;
  mute_8h: Signal<string>;
  mute_1w: Signal<string>;
  mute_forever: Signal<string>;
  mute_unmute: Signal<string>;
  cancel: Signal<string>;
}

const DURATION_LABEL: Record<MuteDuration, keyof MuteDurationLabels> = {
  '1h': 'mute_1h',
  '8h': 'mute_8h',
  '1w': 'mute_1w',
  forever: 'mute_forever',
};

const ACTION_PREFIX = 'mute.';

/**
 * Asks for a mute duration (1 Stunde · 8 Stunden · 1 Woche · Bis ich es wieder einschalte),
 * plus «Wieder einschalten» when the room (or everything) is muted already. Shared by the
 * Chat-Details tile and the «Alle stummschalten» bell. `undefined` = cancelled.
 */
export async function pickMuteDuration(
  actionSheetController: ActionSheetController,
  labels: MuteDurationLabels,
  imgixBaseUrl: string,
  muted: boolean,
): Promise<MuteDuration | 'unmute' | undefined> {
  const opts = createActionSheetOptions(labels.mute_tile());
  if (muted) opts.buttons.push(createActionSheetButton(`${ACTION_PREFIX}unmute`, labels.mute_unmute(), imgixBaseUrl, 'alarm'));
  for (const d of MUTE_DURATIONS) {
    opts.buttons.push(createActionSheetButton(`${ACTION_PREFIX}${d}`, labels[DURATION_LABEL[d]](), imgixBaseUrl, 'time'));
  }
  opts.buttons.push(createActionSheetButton('cancel', labels.cancel(), imgixBaseUrl, 'cancel'));

  const sheet = await actionSheetController.create(opts as ActionSheetOptions);
  await sheet.present();
  const { data } = await sheet.onDidDismiss();
  const action = typeof data?.action === 'string' ? data.action : '';
  if (!action.startsWith(ACTION_PREFIX)) return undefined;
  const choice = action.slice(ACTION_PREFIX.length);
  if (choice === 'unmute') return muted ? 'unmute' : undefined;
  return (MUTE_DURATIONS as readonly string[]).includes(choice) ? (choice as MuteDuration) : undefined;
}
