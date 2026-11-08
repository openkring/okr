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
}
