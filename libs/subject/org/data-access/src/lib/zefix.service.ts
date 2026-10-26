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
    const fn = httpsCallable<{ name: string; op: string }, { data: { results: ZefixSearchResult[] } }>(
      this.functions,
      'zefix'
    );
    const result = await fn({ name, op: 'zefixSearch' });
    return result.data.data.results;
  }

  async getCompanyDetails(uid: string): Promise<ZefixCompanyDetails> {
    const fn = httpsCallable<{ uid: string; op: string }, { data: ZefixCompanyDetails }>(
      this.functions,
      'zefix'
    );
    const result = await fn({ uid, op: 'zefixGetByUid' });
    return result.data.data;
  }
}
