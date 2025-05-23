# social-feed-app

This is a test application to show:

- app-shell
- lazy-loading of libraries
- rxResource
- pattern with feature/ui/util/model and module boundary checks in nx

The application was generated with [Nx](https://nx.dev).

## Running unit tests

The application needs the server application social-feed-api which loads 
dummy data from faker and serves it on /api/feed.
You can start both applications with:

`pnpm nx run-many --parallel --target=serve --projects=social-feed-api,social-feed-app`

