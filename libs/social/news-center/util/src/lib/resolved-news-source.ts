import { NewsChannelKind } from '@okr/shared-models';

/** The `newsResolve` response: what an admin or requester gets back for a pasted URL. */
export interface ResolvedNewsSource {
  kind: NewsChannelKind;
  feedUrl: string;
  siteUrl: string;
  name: string;
  avatarUrl: string;
  /** The feed text for a preview; '' for an image. */
  body: string;
  /** True for an `http:` webcam: it can only be shown through the newsImage relay. */
  viaRelay: boolean;
  /**
   * Whether the newsImage relay would serve this source (a JPEG/PNG/WebP image). Absent from an
   * older function: treated as false.
   */
  relayable?: boolean;
}

export interface NewsRelayState {
  /** What the «Über Server laden» switch shows and what is saved as `viaRelay`. */
  viaRelay: boolean;
  /** True when the curator cannot change it. */
  readOnly: boolean;
}

/**
 * The «Über Server laden» switch of the curator add flow (design §7.1). An `http:` camera can only
 * be shown through the relay (on, locked); an image the relay would refuse, or a feed, can never
 * be relayed (off, locked); an https JPEG/PNG/WebP is the curator's choice.
 */
export function newsRelayState(source: ResolvedNewsSource | undefined, choice: boolean | undefined): NewsRelayState {
  if (!source || source.kind !== 'image') return { viaRelay: false, readOnly: true };
  if (source.feedUrl.startsWith('http:')) return { viaRelay: true, readOnly: true };
  if (source.relayable !== true) return { viaRelay: false, readOnly: true };
  return { viaRelay: choice ?? source.viaRelay, readOnly: false };
}
