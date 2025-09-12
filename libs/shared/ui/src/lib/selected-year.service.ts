import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

@Injectable({
  providedIn: 'root'
})
export class SelectedYearService {
  private readonly _selectedYear = new BehaviorSubject<number>(Number(getTodayStr(DateFormat.Year)));
  public selectedYear$ = this._selectedYear.asObservable();

  public changeYear(year: number): void {
    this._selectedYear.next(year);
  }

  public reset(): void {
    this._selectedYear.next(Number(getTodayStr(DateFormat.Year)));
  }
}