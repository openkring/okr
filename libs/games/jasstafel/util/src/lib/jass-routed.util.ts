import type { DiaryConsent, DiaryPull } from '@okr/shared-models';

/**
 * Is the signed-in person one of the players? Only then does the result go into a diary: the
 * server writes into the diaries of the caller's own person, so a scorekeeper who did not play
 * must not get it. Guests typed by name (key '') never match. Pure.
 */
export function jassParticipant(game: { players: { avatar: { key?: string } }[] } | null | undefined, personKey: string | undefined): boolean {
  if (!game || !personKey) return false;
  return game.players.some((p) => p.avatar.key === personKey);
}

/**
 * Does a finished game go into the diary (spec 1.77 §12.5)? When this app's user allowed a diary to collect the
 * Jasstafel, or when this diary app pulls it from itself (`ownPull`). The date and the diary's own pull are checked on
 * the server only. Pure.
 */
export function jassRouted(
  user: { diaryConsents?: DiaryConsent[] } | undefined,
  ownPull: DiaryPull | undefined,
): boolean {
  const consented = (user?.diaryConsents ?? []).some((c) => (c.sources ?? []).includes('jasstafel'));
  return consented || (ownPull?.sources ?? []).includes('jasstafel');
}
