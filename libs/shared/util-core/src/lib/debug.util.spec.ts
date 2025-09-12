import { UserModel } from '@bk2/shared-models';
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
  // Mock console.log
  const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

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

  describe('debugListLoaded', () => {
    it('should not log list data when user has debug info disabled', () => {
      const user = createUserModel(false);
      const testData = ['item1', 'item2'];
      const data$ = of(testData);

      debugListLoaded('userList', data$, user);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log list data when user is undefined', () => {
      const testData = ['item1'];
      const data$ = of(testData);

      debugListLoaded('userList', data$);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });

  describe('debugItemLoaded', () => {
    it('should not log item data when user has debug info disabled', () => {
      const user = createUserModel(false);
      const testItem = { id: 1, name: 'Test Item' };
      const data$ = of(testItem);

      debugItemLoaded('userItem', data$, user);

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should not log item data when user is undefined', () => {
      const testItem = { id: 1, name: 'Test Item' };
      const data$ = of(testItem);

      debugItemLoaded('userItem', data$);

      expect(mockConsoleLog).not.toHaveBeenCalled();
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