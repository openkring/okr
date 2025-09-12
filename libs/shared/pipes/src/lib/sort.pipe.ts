import { Pipe, PipeTransform } from '@angular/core';
import { sortAscending, sortDescending } from '@bk2/shared-util-core';

@Pipe({
    name: 'sort',
    standalone: true
})
export class SortPipe implements PipeTransform{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform(items:[], direction:string, column:string): any[] {
        let sortedItems=[];
        sortedItems = direction ===  'asc' ? sortAscending(items,column): sortDescending(items,column)
        return sortedItems;
    }
}

