import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface ZefixSearchResult {
  name: string;
  legalSeat: string;
  uid: string;
}

export interface ZefixCompanyDetails {
  name: string;
  taxId: string;
  streetName: string;
  streetNumber: string;
  countryCode: string;
  zipCode: string;
  city: string;
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class ZefixService {
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  async searchCompany(name: string): Promise<ZefixSearchResult[]> {
    const fn = httpsCallable<{ name: string }, { results: ZefixSearchResult[] }>(
      this.functions,
      'zefixSearch'
    );
    const result = await fn({ name });
    return result.data.results;
  }

  async getCompanyDetails(uid: string): Promise<ZefixCompanyDetails> {
    const fn = httpsCallable<{ uid: string }, ZefixCompanyDetails>(
      this.functions,
      'zefixGetByUid'
    );
    const result = await fn({ uid });
    return result.data;
  }
}
