import { describe, expect, it } from 'vitest';
import { ResolvedNewsSource, newsRelayState } from './resolved-news-source';

const src = (o: Partial<ResolvedNewsSource> = {}): ResolvedNewsSource => ({
  kind: 'image', feedUrl: 'https://cam.example.ch/live.jpg', siteUrl: '', name: 'cam', avatarUrl: '', body: '',
  viaRelay: false, relayable: true, ...o,
});

describe('newsRelayState', () => {
  it('nothing resolved, or a feed: off and not switchable', () => {
    expect(newsRelayState(undefined, true)).toEqual({ viaRelay: false, readOnly: true });
    expect(newsRelayState(src({ kind: 'rss', relayable: false }), true)).toEqual({ viaRelay: false, readOnly: true });
  });

  it('an http: camera can only be shown through the relay: on and locked', () => {
    expect(newsRelayState(src({ feedUrl: 'http://cam.example.ch:8080/snap.jpg', viaRelay: true }), false)).toEqual({ viaRelay: true, readOnly: true });
  });

  it('an https image newsImage would refuse (e.g. GIF): off and locked, whatever was chosen', () => {
    expect(newsRelayState(src({ relayable: false }), true)).toEqual({ viaRelay: false, readOnly: true });
    // an older function that sends no flag counts as not relayable
    expect(newsRelayState(src({ relayable: undefined }), true)).toEqual({ viaRelay: false, readOnly: true });
  });

  it('an https JPEG/PNG/WebP: the curator chooses, defaulting to what resolve said', () => {
    expect(newsRelayState(src(), undefined)).toEqual({ viaRelay: false, readOnly: false });
    expect(newsRelayState(src(), true)).toEqual({ viaRelay: true, readOnly: false });
  });
});
