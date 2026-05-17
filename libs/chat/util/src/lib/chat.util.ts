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

const RECEIPT_COLORS = ['#e57373','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#ffb74d'];

export function buildReceiptAriaLabel(receipts: Array<{ displayName: string }>): string {
  if (receipts.length === 0) return '';
  if (receipts.length === 1) return `Gelesen von ${receipts[0].displayName}`;
  if (receipts.length === 2) return `Gelesen von ${receipts[0].displayName}, ${receipts[1].displayName}`;
  return `Gelesen von ${receipts[0].displayName}, ${receipts[1].displayName} (+${receipts.length - 2} weitere)`;
}

export function hashUserIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return RECEIPT_COLORS[Math.abs(hash) % RECEIPT_COLORS.length];
}

export function formatReceiptTime(ts: number): string {
  return `Gelesen ${new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
