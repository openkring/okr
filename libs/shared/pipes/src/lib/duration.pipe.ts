import { Pipe, PipeTransform } from '@angular/core';
import { getDuration } from '@bk2/shared-util-core';

@Pipe({
  name: 'duration',
  standalone: true
})
export class DurationPipe implements PipeTransform {

  transform(storeDateFrom: string, storeDateTo: string): string {
    let _from = storeDateFrom;

    // the following is needed to handle relLog data (yyyyMMdd:K,A1,P)
    if (storeDateFrom.includes(':')) {
      const parts = storeDateFrom.split(':');
      if (parts[0].length >= 4) _from = parts[0].substring(0, 4);
    }
    return getDuration(_from, storeDateTo);
  }
}

/**
 * This pipe displays the history of a relationship.
 * It takes a rellog entry and presents it nicely.
 * The rellog entry is a string in the format "yyyyMMdd:K,yyyyMMdd:A1,yyyyMMdd:P" where:
 * - all entries are separated by commas
 * - each entry has a date (yyyyMMdd) and a type (K, A1, P), special type T = gest. (death) and X = EX (exit)
 * 
 * example:  "20200101:K,20220201:A1,20240301:P,20251231:X"
 * The pipe would display this as:
 * "2020/K -> 2022/A1 -> 2024/P -> 2025/EX"
 */
@Pipe({
  name: 'rellog',
  standalone: true
})
export class RellogPipe implements PipeTransform {

  transform(rellog: string): string {
    const temp: string[] = [];
    const parts = rellog.split(',');
    for (const part of parts) {
      let [date, cat] = part.split(':');
      if (date && date.length >= 4) {
        date = date.substring(0, 4);
        if (cat?.trim()) {
          if (cat === 'T') cat = 'gest.';
          else if (cat === 'X') cat = 'EX';
          temp.push(`${date}/${cat}`);
        }
      }
    }
    return temp.join(' -> ');
  }
}