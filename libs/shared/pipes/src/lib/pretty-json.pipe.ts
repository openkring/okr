import { Pipe, PipeTransform } from '@angular/core';
import { jsonPrettyPrint } from '@bk2/shared/util-core';

/**
 * Pretty print JSON code.
 * Needs to be applied inside an innerHTML.
 * <div [innerHTML]="data | prettyjson"></div
 * or use
 * JSON.stringify(displayValue, null, 2
 * source: https://stackoverflow.com/questions/37308420/angular-2-pipe-that-transforms-json-object-to-pretty-printed-json
 */
@Pipe({
    name: 'prettyjson',
})
export class PrettyjsonPipe implements PipeTransform {

    transform(value: unknown): string {
      if (!value) return 'undefined';
      return jsonPrettyPrint(value);
    }
}
