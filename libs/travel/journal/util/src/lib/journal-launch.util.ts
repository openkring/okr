/**
 * Whether a cold start should open the travel journal (spec 1.113, spike S3 finding): offline on iOS
 * the normal start page (a CMS page from app-config) cannot load and shows 404, while the journal
 * works from SQLite. Only then, and never over a deep link or a route the user already chose.
 */
export interface LaunchInput {
  native: boolean;
  online: boolean;
  hasJournal: boolean;
  launchUrl?: string;
  currentUrl?: string;
}

export function shouldOpenJournalOnLaunch(input: LaunchInput): boolean {
  if (!input.native || input.online || !input.hasJournal) return false;
  if (input.launchUrl) return false;
  if (input.currentUrl?.startsWith('/journal')) return false;
  return true;
}
