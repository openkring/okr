import { Attendee, BkModel, CalEventModel, InvitationModel } from '@bk2/shared-models';
import { sortAscending, SortCriteria, sortDescending, SortDirection } from './sort.util';

/*-------------------------SORT --------------------------------------------*/
export function sortModels(models: BkModel[], sortCriteria: SortCriteria): BkModel[] {
  switch(sortCriteria.direction) {
    case SortDirection.Ascending: return sortAscending(models, sortCriteria.field, sortCriteria.typeIsString);
    case SortDirection.Descending: return sortDescending(models, sortCriteria.field, sortCriteria.typeIsString);
    default: return models;
  }
}

/* ---------------------- Index operations -------------------------------*/
export function addIndexElement(index: string, key: string, value: string | number | boolean): string {
  if (!key || key.length === 0) {
    return index;
  }
  if (typeof (value) === 'string') {
    if (value.length === 0 || (value.length === 1 && value.startsWith(' '))) {
      return index;
    }
  }
  return `${index} ${key}:${value}`;
}


  /**
   * For each event, returns a map of (calevent.bkey, attendance state) for the current user (personKey).
   * If the user is not listed as an attendee, returns 'invited' by default.
   * use like this:  
   *     const states = calendarStore.getAttendanceStates(filteredEvents(), currentUser.personKey);
   *     const state = states[calevent.bkey] ?? 'invited';
   * for closed calevents, state is undefined (ie the calevent is not listed in the result)
   * @param calevents Array of CalEventModel
   * @param personKey Person key, typically of the current user
   * @returns Map of [calevent.bkey, state] for all attendances
   */
  export function getAttendanceStates(calevents: CalEventModel[], personKey: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const event of calevents) {
      const state = getAttendanceState(event, personKey);
      if (state) {
        result[event.bkey] = state;
      }
    }
    return result;
  }

  export function getAttendanceState(calevent: CalEventModel, personKey: string): string | undefined {
    if (calevent.isOpen) {
      if (personKey && calevent.attendees) {
        const attendee = calevent.attendees.find((a: any) => a.person.key === personKey);
        if (attendee && attendee.state) {
          return attendee.state;
        }
      }
      return 'invited'; // default state
    }
    return undefined;
  }

  export function getAttendee(calevent: CalEventModel, personKey: string): Attendee | undefined {
    if (calevent.attendees) {
      return calevent.attendees.find((a: any) => a.person.key === personKey);
    }
    return undefined;
  }


  export function getAttendanceIcon(state: string): string {
    switch (state) {
      case 'accepted':
        return 'checkbox-circle';
      case 'declined':
        return 'close_cancel_circle';
      default:
        return 'help-circle';
    }
  }

  export function getAttendanceColor(state: string): string {
    switch (state) {
      case 'accepted':
        return 'success';
      case 'declined':
        return 'danger';
      default:
        return '';
    }
  }

  /**
   * For each event, returns a map of (calevent.bkey, invitation state).
   * Matches invitations to events by caleventKey.
   * @param calevents Array of CalEventModel
   * @returns Map of calevent.bkey to invitation state (string)
   */
  export function getInvitationStates(calevents: CalEventModel[], invitations: InvitationModel[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const event of calevents) {
      const invitation = invitations.find(inv => inv.caleventKey === event.bkey);
      if (invitation) {
        result[event.bkey] = invitation.state ?? 'pending';
      }
    }
    return result;
  }

  /**
   * A generic function to convert an object to a data row (array of strings) for export, based on the specified keys.
   * 
   * @param data the data object to convert.
   * @param keys the keys of the object to include in the data row. The order of keys determines the order of values in the row.
   * @returns An array of strings representing the data row.
   */
  export function getDataRow<T>(data: T, keys: (keyof T)[]): string[] {
  return keys.map(key => {
    const value = data[key];
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}