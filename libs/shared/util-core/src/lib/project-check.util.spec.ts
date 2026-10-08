import { describe, expect, it } from 'vitest';
import { isAssignableProject } from './project-check.util';

describe('isAssignableProject', () => {
  it('refuses an unknown project', () => expect(isAssignableProject(undefined, 'scs')).toBe(false));
  it('refuses an archived project', () => expect(isAssignableProject({ isArchived: true, tenants: ['scs'] }, 'scs')).toBe(false));
  it('refuses a project of another tenant', () => expect(isAssignableProject({ isArchived: false, tenants: ['kring'] }, 'scs')).toBe(false));
  it('refuses a project without tenants', () => expect(isAssignableProject({}, 'scs')).toBe(false));
  it('accepts an active project of the tenant', () => expect(isAssignableProject({ isArchived: false, tenants: ['kring', 'scs'] }, 'scs')).toBe(true));
  it('accepts a legacy project without isArchived', () => expect(isAssignableProject({ tenants: ['scs'] }, 'scs')).toBe(true));
});
