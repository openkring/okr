import { Pipe, PipeTransform } from '@angular/core';

/**
 * Takes a person string in the form of [personKey]@[personLabel]
 * and converts it into a human readable label.
 * The label may consist of several person names, but the whole key is shown as is.
 */
@Pipe({
  name: 'personLabel',
  standalone: true
})
export class PersonLabelPipe implements PipeTransform {
  transform(name: string): string {
    if (name.indexOf('@') === -1) return name;
    const parts = name.split('@');
    if (parts.length !== 2) return name;
    return parts[1] ?? '';
  }
}
