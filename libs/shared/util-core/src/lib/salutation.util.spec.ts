import { describe, expect, it } from 'vitest';
import { personGreeting } from './salutation.util';

describe('personGreeting', () => {
  it('greets a woman with Liebe', () => expect(personGreeting('Anna', 'female')).toBe('Liebe Anna'));
  it('greets a man with Lieber', () => expect(personGreeting('Peter', 'male')).toBe('Lieber Peter'));
  it('uses the neutral greeting for other, empty and unknown gender', () => {
    expect(personGreeting('Kim', 'other')).toBe('Guten Tag Kim');
    expect(personGreeting('Kim', '')).toBe('Guten Tag Kim');
    expect(personGreeting('Kim', undefined)).toBe('Guten Tag Kim');
  });
  it('without first name only says Guten Tag', () => expect(personGreeting('', 'female')).toBe('Guten Tag'));
});
