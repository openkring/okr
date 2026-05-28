import { DEFAULT_COUNTRY } from '@bk2/shared-constants';
import { ApplicationModel, ApplicationState, PersonModel } from '@bk2/shared-models';
import { addIndexElement, getAge } from '@bk2/shared-util-core';

export function newApplication(tenantId: string): ApplicationModel {
  const app = new ApplicationModel(tenantId);
  app.countryCode = DEFAULT_COUNTRY;
  app.state = 'applied';
  return app;
}

export function getApplicationIndex(app: ApplicationModel): string {
  let idx = '';
  idx = addIndexElement(idx, 'fn', app.firstName);
  idx = addIndexElement(idx, 'n', app.lastName);
  idx = addIndexElement(idx, 'z', app.zipCode);
  idx = addIndexElement(idx, 'c', app.city);
  idx = addIndexElement(idx, 'k', app.applicationAs);
  idx = addIndexElement(idx, 's', app.state);
  return idx;
}

export function needsSsn(app: ApplicationModel): boolean {
  if (app.applicationAs === 'youth') return true;
  const age = getAge(app.dateOfBirth);
  return age >= 0 && age < 20;
}

export function toPersonModel(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName   = app.firstName;
  p.lastName    = app.lastName;
  p.gender      = app.gender;
  p.dateOfBirth = app.dateOfBirth;
  p.ssnId       = app.ssnId;
  p.favEmail    = app.email;
  p.favPhone    = app.phone;
  p.favZipCode  = app.zipCode;
  return p;
}

export function newParentPerson(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName  = app.parentFirstName;
  p.lastName   = app.parentLastName;
  p.gender     = 'female';
  p.favEmail   = app.parentEmail;
  p.favPhone   = app.parentPhone;
  p.favZipCode = app.zipCode;
  return p;
}

export function matchesStateFilter(state: ApplicationState, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return state === 'applied' || state === 'reviewing';
  if (filter === 'closed') return state.startsWith('closed.');
  return state === filter;
}

export function stateColor(state: ApplicationState): 'warning' | 'primary' | 'success' | 'danger' | 'medium' {
  switch (state) {
    case 'applied':          return 'warning';
    case 'reviewing':        return 'primary';
    case 'closed.approved':  return 'success';
    case 'closed.denied':    return 'danger';
    case 'closed.cancelled': return 'medium';
  }
}

export function proposeMembershipCategory(app: ApplicationModel): 'junior' | 'active' | 'candidate' {
  const age = getAge(app.dateOfBirth);
  if (age < 20)                         return 'junior';
  if (app.applicationAs === 'transfer') return 'active';
  return 'candidate';
}
