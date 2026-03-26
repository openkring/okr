# Social Feed Domain

## Overview

The Social Feed domain provides an infinite-scrolling feed of social posts. It is a prototype/demo feature — the data is fetched from an external REST API (`http://localhost:3333/api/feed`) rather than Firestore, and `SocialPostModel` is a plain TypeScript interface (not a Firestore-backed `BkModel`).

The feed uses a `linkedSignal` accumulation pattern so that each infinite-scroll load appends new posts to the existing list without replacing it.

## No Firestore Collection

Social posts are not stored in Firestore. They are fetched via HTTP from a local API server. The `SocialFeedService` uses Angular's `HttpClient`.

## Data Type

### SocialPostModel

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique post identifier |
| `title` | string | Post title |
| `subtitle` | string | Post subtitle |
| `content` | string | Post body text |
| `image` | string | Image URL |
| `likes` | number | Like count |

## SocialFeedFeatureComponent (`bk-social-feed-feature`)

Standalone component. Key behaviour:

- `socialFeedService.getFeed()` returns an `Observable<SocialPostModel[]>` backed by HTTP GET.
- `postsResource` is an `rxResource` whose stream pipes through a `tap` that completes the `IonInfiniteScroll` spinner.
- `posts` is a `linkedSignal` that accumulates pages: each new emission from `postsResource` is appended to the existing list (`[...(posts?.value ?? []), ...newPosts]`).
- `loadPosts()` calls `postsResource.reload()` to trigger the next page fetch.

## Social Feed Routes

`social-feed.routes.ts` defines the lazy-loaded route configuration for the social feed page.

## Data Access

`SocialFeedService` (`@bk2/social-feed-data-access`):

```
GET http://localhost:3333/api/feed → SocialPostModel[]
```

This endpoint is expected to be a local development server (NestJS or similar). The API base URL is hardcoded and should be moved to environment configuration before production use.

## Related Libraries

| Library | Path |
|---|---|
| `@bk2/social-feed-data-access` | `SocialFeedService` — HTTP client wrapper |
| `@bk2/social-feed-ui` | `SocialPostComponent` — presentational post card component |

## Library Path

`@bk2/social-feed-feature` (`libs/social-feed/feature/src/lib/`)
