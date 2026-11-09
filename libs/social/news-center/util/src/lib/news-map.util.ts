import { NewsChannelModel } from '@okr/shared-models';
import { isPlaced } from './news-channel-place.util';

/** The channel-list entry «Kartenübersicht» (webcam tab only): a selection value next to 'all' and channel keys. */
export const NEWS_MAP_KEY = 'map';

/** One map pin per placed webcam (design 2026-11-09 §5.5); `id` is the channel okey, the image its current still. */
export interface NewsWebcamMarker {
  id: string;
  title: string;
  lat: number;
  lng: number;
  imageUrl: string;
}

export function webcamMarkers(channels: NewsChannelModel[], avatars: Record<string, string>): NewsWebcamMarker[] {
  return channels
    .filter((c) => isPlaced(c))
    .map((c) => ({ id: c.okey, title: c.name, lat: c.latitude, lng: c.longitude, imageUrl: avatars[c.okey] ?? '' }));
}
