import { describe, expect, it } from 'vitest';

import { ResourceModel } from '@okr/shared-models';

import { resourceValidations } from './resource.validations';
import { setUsageFromYear } from './boat-usage.util';

function makeBoat(): ResourceModel {
  const boat = new ResourceModel('scs');
  boat.okey = 'boat1';
  boat.name = 'Seelöwe';
  boat.type = 'rboat';
  boat.subType = 'b1x';
  boat.usage = 'breitensport';
  boat.tenants = ['scs'];
  boat.tags = '';
  return boat;
}

describe('resourceValidations', () => {
  it('accepts a plain rowing boat', () => {
    const result = resourceValidations(makeBoat(), 'scs', '');
    expect(result.isValid()).toBe(true);
  });

  it('stays valid for a multi-season usage string', () => {
    // setUsageFromYear writes one entry per season of the planning window, which is far longer
    // than WORD_LENGTH — capping `usage` invalidated the whole form and hid the save banner.
    const boat = makeBoat();
    boat.usage = setUsageFromYear(boat.usage, 2026, 'leistungssport');
    expect(boat.usage.length).toBeGreaterThan(20);

    const result = resourceValidations(boat, 'scs', '');
    expect(result.isValid()).toBe(true);
  });

  it('accepts a short boat subType — the catalogue decides, not a character count', () => {
    // subType is picked from the rboat_type category, so a minLength/maxLength here could only
    // ever reject a perfectly good catalogue item that somebody added later.
    const boat = makeBoat();
    boat.subType = 'b2';
    expect(resourceValidations(boat, 'scs', '').isValid()).toBe(true);
  });

  it('still requires a boat subType', () => {
    const boat = makeBoat();
    boat.subType = '';
    const result = resourceValidations(boat, 'scs', '');

    expect(result.isValid()).toBe(false);
    expect(result.getErrors('subType')).toContain('required');
  });

  it('does not apply the boat subType rule to another resource type', () => {
    const resource = makeBoat();
    resource.type = 'other';
    resource.subType = '';
    expect(resourceValidations(resource, 'scs', '').isValid()).toBe(true);
  });

  it('accepts a short locker gender for the same reason', () => {
    const locker = makeBoat();
    locker.type = 'locker';
    locker.subType = 'm';
    expect(resourceValidations(locker, 'scs', '').isValid()).toBe(true);
  });
});
