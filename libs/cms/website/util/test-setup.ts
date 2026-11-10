// Importing models from @okr/shared-models transitively pulls in @angular/common
// injectables (PlatformLocation) that fall back to JIT; load the compiler for Vitest.
import '@angular/compiler';
