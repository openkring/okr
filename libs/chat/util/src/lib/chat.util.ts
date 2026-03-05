import { bkTranslate } from '@bk2/shared-i18n';

/**
 * Format a Matrix timestamp (ms since epoch) into a human-readable string.
 * Today → time, yesterday → "Yesterday", this week → weekday, older → date.
 */
export function formatMatrixTimestamp(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Returns true if the given URL is an HTTP or blob URL (i.e. directly renderable as <img>).
 * mxc:// URIs and icon names return false.
 */
export function isMatrixPhotoUrl(url: string): boolean {
  return url.startsWith('blob:') || url.startsWith('http');
}

/**
 * Returns a human-readable "is typing" label for a list of Matrix user IDs.
 */
export function getMatrixTypingText(userIds: string[]): string {
  if (userIds.length === 0) return '';
  if (userIds.length === 1) return bkTranslate('@chat.fields.isTypeing');
  if (userIds.length === 2) return `${userIds.length} ${bkTranslate('@chat.fields.areTypeing')}`;
  return bkTranslate('@chat.fields.severalTypeing');
}
