import type { GoogleMapType, GoogleTiles } from '@okr/shared-data-access';

/** The Map Tiles URL templates on offer; a type is present only while its session is proven (phase 4 design §1). */
export type GoogleTemplates = Partial<Record<GoogleMapType, string>>;

const GOOGLE_TYPES: GoogleMapType[] = ['roadmap', 'satellite'];
/** A session is re-created after a tile error at most once per 5 minutes per type (loop guard). */
const RENEW_MIN_MS = 5 * 60 * 1000;

const browserOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * The Google sessions of one map host (the author's JournalStore, the guest page), shared so both behave alike.
 *
 * A cached token is no proof the network works: a ship's Wi-Fi without an uplink reports «connected». A Google type is
 * therefore offered only after one successful Google request in this app session — the create of a new session, or a
 * viewport probe with the cached token. The proof is repeated after every offline → online transition (`drop` clears
 * it) and on resume (`refresh(true)`). When a renewal fails, both types are dropped until the next successful proof.
 *
 * Never throws, never blocks: every method returns at once and works in the background.
 */
export class JournalGoogleSessions {
  private sessions: Partial<Record<GoogleMapType, string>> = {};
  private templates: GoogleTemplates = {};
  private readonly proven = new Set<GoogleMapType>();
  private readonly runs: Record<GoogleMapType, number> = { roadmap: 0, satellite: 0 };
  private readonly lastRenew: Record<GoogleMapType, number> = { roadmap: 0, satellite: 0 };

  /**
   * @param tiles the Map Tiles API client
   * @param language the app language code (de, fr, ...)
   * @param online false while the host knows the device is offline: nothing is requested and nothing is offered
   * @param publish receives the offered templates whenever they change
   */
  public constructor(
    private readonly tiles: GoogleTiles,
    private readonly language: () => string,
    private readonly online: () => boolean,
    private readonly publish: (templates: GoogleTemplates) => void,
  ) {}

  /** The proven session of a type, for the viewport copyright; undefined while it is not offered. */
  public session(type: GoogleMapType): string | undefined {
    return this.sessions[type];
  }

  /**
   * Both types in the background. An unproven type is proven first; `reprove` (resume) proves the offered ones again,
   * keeping them on offer meanwhile and dropping both when the network does not reach Google.
   */
  public refresh(reprove = false): void {
    if (!this.online()) return;
    for (const type of GOOGLE_TYPES) void this.refreshType(type, reprove);
  }

  /** Offline (or unreachable): nothing is offered and every proof is forgotten. A request on its way is ignored. */
  public drop(): void {
    for (const type of GOOGLE_TYPES) this.runs[type]++;
    this.proven.clear();
    this.sessions = {};
    this.set({});
  }

  /**
   * Google refused a type's tiles (expired session): one new session, at most every 5 minutes per type. The cached token
   * stays until the new one exists. Without a new session both types are dropped until the next successful proof.
   */
  public renew(type: GoogleMapType): void {
    const now = Date.now();
    if (!this.online() || browserOffline() || now - this.lastRenew[type] < RENEW_MIN_MS) return;
    this.lastRenew[type] = now;
    const run = ++this.runs[type];
    void this.tiles.renew(type, this.language()).then((session) => {
      if (run !== this.runs[type] || !this.online()) return;
      if (!session) return this.drop();
      this.offer(type, session);
    });
  }

  private async refreshType(type: GoogleMapType, reprove: boolean): Promise<void> {
    const run = ++this.runs[type];
    const language = this.language();
    const stale = (): boolean => run !== this.runs[type] || !this.online(); // went offline (or a newer request) meanwhile
    const cached = this.tiles.cached(type, language); // without a cached token, session() creates one: that proves itself
    let session = await this.tiles.session(type, language);
    if (stale()) return;
    if (session && cached === session && (reprove || !this.proven.has(type))) {
      const probe = await this.tiles.probe(session);
      if (stale()) return;
      if (probe === 'refused') {
        session = await this.tiles.renew(type, language);
        if (stale()) return;
      } else if (probe === 'failed') {
        return this.drop(); // the network does not reach Google: no type is offered
      }
    }
    if (session) this.offer(type, session);
    else this.withdraw(type);
  }

  private offer(type: GoogleMapType, session: string): void {
    this.proven.add(type);
    this.sessions = { ...this.sessions, [type]: session };
    this.set({ ...this.templates, [type]: this.tiles.tileUrl(session) });
  }

  private withdraw(type: GoogleMapType): void {
    this.proven.delete(type);
    const sessions = { ...this.sessions };
    const templates = { ...this.templates };
    delete sessions[type];
    delete templates[type];
    this.sessions = sessions;
    this.set(templates);
  }

  private set(templates: GoogleTemplates): void {
    const same = GOOGLE_TYPES.every((t) => templates[t] === this.templates[t]);
    this.templates = templates;
    if (!same) this.publish(templates);
  }
}
