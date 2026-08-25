// apps/functions/src/matrix-simple/post-policy.ts
//
// Reine Ableitungen fuer die Broadcast-Raeume
// (planning/specs/2026-08-25-broadcast-rooms-design.md §2).
//
// Kein Netz, kein Firestore — damit die Regeln aus §8 ohne einen einzigen Mock
// pruefbar sind. Der Schreibpfad nach Synapse liegt in post-policy-sync.ts.

/** Der Ist-Zustand von `m.room.power_levels`, so wie Synapse ihn liefert. */
export interface CurrentPowerLevels {
  events_default?: number;
  events?: Record<string, number>;
  users?: Record<string, number>;
}

/** Der Soll-Zustand, den wir zurueckschreiben. */
export interface PowerLevelPatch {
  events_default: number;
  events: Record<string, number>;
  users: Record<string, number>;
}

/** Ausschnitt aus `users/{uid}`, den wir fuer die Rechte brauchen. */
export interface PrivilegeUserDoc {
  personKey?: string;
  tenants?: string[];
  isArchived?: boolean;
  roles?: Record<string, boolean>;
}

const POWER_ADMIN = 100;
const POWER_POST = 50;

/**
 * Der Soll-Zustand der Power Levels fuer einen Gruppenraum.
 *
 * `undefined` heisst AUSDRUECKLICH «nichts anfassen» — nicht «auf 0 setzen». Ein Raum, der
 * nie Power Levels gesetzt bekommen hat, bleibt dadurch unberuehrt, und der Abgleich am
 * Bestand ist ein No-op (§1, §3.2a der Spec).
 *
 * Der einzige Fall, in dem bei 'all' doch geschrieben wird: der Raum ist gerade stumm
 * (`events_default >= POWER_POST`), die Gruppe wurde also von 'privileged' zurueckgestellt.
 * Diesen Rueckweg traegt allein der Gruppen-Trigger, weil nur er Vor- und Nachzustand kennt.
 */
export function buildPowerLevels(
  postPolicy: 'all' | 'privileged' | undefined,
  current: CurrentPowerLevels,
  privilegedMatrixIds: string[],
  adminMatrixIds: string[],
): PowerLevelPatch | undefined {
  const policy = postPolicy ?? 'all';

  if (policy === 'all') {
    if ((current.events_default ?? 0) < POWER_POST) return undefined; // nichts anfassen
    return {
      events_default: 0,
      events: { ...(current.events ?? {}) },
      users: { ...(current.users ?? {}) },
    };
  }

  // Vereinigung mit dem Ist-Zustand: eine bestehende hoehere Power wird NIE gesenkt,
  // sonst nimmt der erste Lauf dem Raum-Erzeuger die 100, mit denen der zweite laufen muss.
  const users: Record<string, number> = { ...(current.users ?? {}) };
  const raise = (id: string, level: number) => {
    users[id] = Math.max(users[id] ?? 0, level);
  };
  adminMatrixIds.forEach((id) => raise(id, POWER_ADMIN));
  privilegedMatrixIds.forEach((id) => raise(id, POWER_POST));

  return {
    events_default: POWER_POST,
    events: { ...(current.events ?? {}), 'm.reaction': 0 },
    users,
  };
}

/**
 * Die Schreibberechtigten eines Mandanten, ausschliesslich aus `users/{uid}.roles`.
 *
 * NIE aus `group.admins[]` — §3.2b der Teilnehmer-Kommunikations-Spec begruendet das am
 * Bestand: wer eine grosse Gruppe ansprechen koennen soll, IST damit privilegiert. Eine
 * Quelle, ein Widerrufsweg.
 */
export function privilegedPersonKeys(
  users: PrivilegeUserDoc[],
  tenantId: string,
): { adminKeys: string[]; privilegedKeys: string[] } {
  const eligible = users.filter(
    (u) => !!u.personKey && !u.isArchived && (u.tenants ?? []).includes(tenantId),
  );
  return {
    adminKeys: eligible.filter((u) => u.roles?.['admin']).map((u) => u.personKey as string),
    privilegedKeys: eligible
      .filter((u) => !u.roles?.['admin'] && u.roles?.['privileged'])
      .map((u) => u.personKey as string),
  };
}
