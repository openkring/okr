// Importing models from @bk2/shared-models transitively pulls in @angular/common
// injectables (e.g. PlatformLocation) that are partially compiled and fall back to
// JIT. Loading the compiler here lets those modules evaluate under Vitest.
import '@angular/compiler';
