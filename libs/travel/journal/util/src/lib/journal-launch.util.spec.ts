import { describe, expect, it } from 'vitest';
import { shouldOpenJournalOnLaunch } from './journal-launch.util';

describe('shouldOpenJournalOnLaunch', () => {
  const base = { native: true, online: false, hasJournal: true };

  it('opens the journal when offline with a local journal', () => {
    expect(shouldOpenJournalOnLaunch(base)).toBe(true);
  });

  it('no redirect without a local journal', () => {
    expect(shouldOpenJournalOnLaunch({ ...base, hasJournal: false })).toBe(false);
  });

  it('no redirect when online', () => {
    expect(shouldOpenJournalOnLaunch({ ...base, online: true })).toBe(false);
  });

  it('no redirect when launched by a deep link', () => {
    expect(shouldOpenJournalOnLaunch({ ...base, launchUrl: 'org.bkaiser.bkg://dev/journal-spike' })).toBe(false);
  });

  it('no redirect on the web', () => {
    expect(shouldOpenJournalOnLaunch({ ...base, native: false })).toBe(false);
  });

  it('no redirect when already on a journal route', () => {
    expect(shouldOpenJournalOnLaunch({ ...base, currentUrl: '/journal/j1' })).toBe(false);
  });
});
