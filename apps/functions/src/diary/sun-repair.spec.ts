import { describe, expect, it } from 'vitest';
import { classifySunTimes } from './sun-repair';

const sun = (sunrise: string, sunset: string) => ({ sunrise, sunset });

describe('classifySunTimes', () => {
  it('repairs the same hour on both times, in either direction', () => {
    expect(classifySunTimes(sun('09:10', '17:30'), sun('08:10', '16:30'))).toBe('shifted');
    expect(classifySunTimes(sun('04:32', '20:25'), sun('05:32', '21:25'))).toBe('shifted');
    expect(classifySunTimes(sun('09:10', '17:30'), sun('08:09', '16:31'))).toBe('shifted');
    expect(classifySunTimes(sun('23:40', '12:00'), sun('00:40', '13:00'))).toBe('shifted');
  });

  it('leaves anything that is not one clear hour alone', () => {
    expect(classifySunTimes(sun('08:10', '16:30'), sun('08:10', '16:30'))).toBe('same');
    expect(classifySunTimes(sun('08:12', '16:30'), sun('08:10', '16:30'))).toBe('other');
    expect(classifySunTimes(sun('09:10', '16:30'), sun('08:10', '16:30'))).toBe('other');
    expect(classifySunTimes(sun('09:10', '15:30'), sun('08:10', '16:30'))).toBe('other');
  });

  it('recognises polar days and gaps', () => {
    expect(classifySunTimes(sun('00:00', '00:00'), sun('', ''))).toBe('polar');
    expect(classifySunTimes(sun('', ''), sun('08:10', '16:30'))).toBe('missing');
    expect(classifySunTimes(sun('08:10', '16:30'), sun('', ''))).toBe('other');
    expect(classifySunTimes(sun('', ''), sun('', ''))).toBe('same');
  });
});
