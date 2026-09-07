import { UserModel } from '@okr/shared-models';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    debugData,
    debugFormErrors,
    debugFormModel,
    debugItemLoaded,
    debugListLoaded,
    debugMessage
} from './debug.util';

describe('debug.util', () => {
  // Re-created per test: the afterEach below calls vi.restoreAllMocks(), which used to detach this
  // spy after the FIRST test — from then on console.log was the real one and the spy recorded
  // nothing, so every `not.toHaveBeenCalled()` in this file passed vacuously.
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  // Helper function to create test user models
  const createUserModel = (showDebugInfo: boolean, additionalProps: Partial<UserModel> = {}): UserModel => ({
    key: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    showDebugInfo,
    roles: {
      registered: false,
      privileged: false,
      contentAdmin: false,
      resourceAdmin: false,
      eventAdmin: false,
      memberAdmin: false,
      treasurer: false,
      admin: false,
      groupAdmin: false
    },
    ...additionalProps
  } as UserModel);

  beforeEach(() => {
    vi.clearAllMocks();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debugFormErrors', () => {
    it('should log form errors when user has debug info enabled', () => {
      const user = createUserModel(true);
      const formName = 'loginForm';
      const errors = { username: 'required', password: 'too short' };

      debugFormErrors(formName, errors, user);

      expect(mockConsoleLog).toHaveBeenCalledWith('errors in form loginForm:', errors);
    });

    it('should not log form errors when user has debug info disabled', () => {
      const user = createUserModel(false);
      const formName = 'loginForm';
      const errors = { username: 'required' };

      debugFormErrors(formName, errors, user);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log form errors when user is undefined', () => {
      const formName = 'loginForm';
      const errors = { username: 'required' };

      debugFormErrors(formName, errors);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log form errors when user is null', () => {
      const formName = 'loginForm';
      const errors = { username: 'required' };

      debugFormErrors(formName, errors, null as any);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should debug function basic test', () => {
        const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
        
        const user = {
            showDebugInfo: true
        } as UserModel;
        
        debugFormErrors('testForm', 'test error', user);
        
        expect(mockConsoleLog).toHaveBeenCalledTimes(1);
        expect(mockConsoleLog).toHaveBeenCalledWith('errors in form testForm:', 'test error');
        
        mockConsoleLog.mockRestore();
    });
  });

  // debugListLoaded and debugItemLoaded are rxjs OPERATORS, not plain calls: each returns a `tap`
  // that logs on emission. They have to be piped and subscribed, otherwise nothing runs at all —
  // which is why these tests used to pass the stream as the second argument and assert nothing.
  describe('debugListLoaded', () => {
    it('should not log list data when user has debug info disabled', () => {
      const user = createUserModel(false);

      of(['item1', 'item2']).pipe(debugListLoaded<string>('userList', user)).subscribe();

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log list data when user is undefined', () => {
      of(['item1']).pipe(debugListLoaded<string>('userList')).subscribe();

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should log the item count when the user has debug info enabled', () => {
      const user = createUserModel(true);

      of(['item1', 'item2']).pipe(debugListLoaded<string>('userList', user)).subscribe();

      expect(mockConsoleLog).toHaveBeenCalledWith('userList: loaded 2 items.');
    });
  });

  describe('debugItemLoaded', () => {
    const testItem = { id: 1, name: 'Test Item' };

    it('should not log item data when user has debug info disabled', () => {
      const user = createUserModel(false);

      of(testItem).pipe(debugItemLoaded<typeof testItem>('userItem', user)).subscribe();

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log item data when user is undefined', () => {
      of(testItem).pipe(debugItemLoaded<typeof testItem>('userItem')).subscribe();

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should log the item when the user has debug info enabled', () => {
      const user = createUserModel(true);

      of(testItem).pipe(debugItemLoaded<typeof testItem>('userItem', user)).subscribe();

      expect(mockConsoleLog).toHaveBeenCalledWith('userItem loaded.', testItem);
    });
  });

  describe('debugMessage', () => {
    it('should not log message when user has debug info disabled', () => {
      const user = createUserModel(false);
      const message = 'This is a debug message';

      debugMessage(message, user);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log message when user is undefined', () => {
      const message = 'This is a debug message';

      debugMessage(message);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('debugFormModel', () => {
    it('should not log form model when user has debug info disabled', () => {
      const user = createUserModel(false);
      const formName = 'userForm';
      const model = { username: 'testuser' };

      debugFormModel(formName, model, user);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log form model when user is undefined', () => {
      const formName = 'userForm';
      const model = { username: 'testuser' };

      debugFormModel(formName, model);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('debugData', () => { 
    it('should not log data when user has debug info disabled', () => {
      const user = createUserModel(false);
      const message = 'API Response:';
      const data = { status: 'success' };

      debugData(message, data, user);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log data when user is undefined', () => {
      const message = 'API Response:';
      const data = { status: 'success' };

      debugData(message, data);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('edge cases and integration', () => {
    it('should handle user without showDebugInfo property', () => {
      const userWithoutDebugInfo = {
          key: 'test-user',
          name: 'Test User',
          email: 'test@example.com'
          // showDebugInfo property is missing
      } as unknown as UserModel;

      debugMessage('test message', userWithoutDebugInfo);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should handle user with showDebugInfo as falsy values', () => {
      const falsyValues = [false, 0, '', null, undefined];

      falsyValues.forEach((falsyValue, index) => {
        const user = createUserModel(falsyValue as boolean);
        debugMessage(`test message ${index}`, user);
      });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });
});