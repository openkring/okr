// gather.ts pulls in @okr/shared-util-core's convertDateFormatToString/DateFormat,
// whose barrel also re-exports platform.util.ts (`@angular/common`'s
// isPlatformBrowser). That transitively touches an `@Injectable` (PlatformLocation)
// that needs the Angular JIT compiler to be loaded before anything constructs it —
// see the `testing` skill's "@angular/compiler is not available" note.
import '@angular/compiler';

export {};
