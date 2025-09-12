// These imports must be at the very top to properly patch the async environment
import 'zone.js';
import 'zone.js/testing';

// This import is for the custom matchers like .toBeInTheDocument()
import '@testing-library/jest-dom/vitest';

// By importing 'zone.js/testing' above, the Angular test environment is
// automatically initialized. The manual getTestBed().initTestEnvironment()
// call is deprecated and should be removed.