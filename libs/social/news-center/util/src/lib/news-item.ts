/** One entry of a channel feed, normalised so the UI does not care where it came from. */
export interface NewsItem {
  id: string;
  channelKey: string;
  title: string;
  /** ISO date-time; '' when the feed gives none. */
  publishedAt: string;
  thumbnailUrl?: string;
  /** youtube/vimeo: the video id; podcast: the audio url; image: the still image url. */
  mediaUrl?: string;
  durationSec?: number;
  summary?: string;
  link?: string;
}
