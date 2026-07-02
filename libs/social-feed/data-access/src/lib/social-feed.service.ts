import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { SocialPostModel } from "@okr/shared-models";

@Injectable({ providedIn: 'root' })
export class SocialFeedService {
  private readonly http = inject(HttpClient);
  getFeed(): Observable<SocialPostModel[]> {
    return this.http.get<SocialPostModel[]>('http://localhost:3333/api/feed');
  }
}
