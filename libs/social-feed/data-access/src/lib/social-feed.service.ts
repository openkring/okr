import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { SocialPostModel } from "@bk2/social-feed/model";

@Injectable({ providedIn: 'root' })
export class SocialFeedService {
  private readonly http = inject(HttpClient);

  getFeed() {
    return this.http.get<SocialPostModel[]>('http://localhost:3333/api/feed');
  }
}