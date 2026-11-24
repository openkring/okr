import '@angular/compiler';

import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

// the app is zoneless, so the environment is initialized without zone.js
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
