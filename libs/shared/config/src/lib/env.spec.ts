import { InjectionToken } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { ENV } from './env';

describe('ENV InjectionToken', () => {
  it('should be defined', () => {
    expect(ENV).toBeDefined();
  });

  it('should be an instance of InjectionToken', () => {
    expect(ENV instanceof InjectionToken).toBe(true);
  });

  it('should have the correct description', () => {
    expect(ENV.toString()).toContain('environment');
  });
});
