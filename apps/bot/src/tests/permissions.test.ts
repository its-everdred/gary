import { describe, test, expect, mock, beforeEach } from 'bun:test';

const mockPermissionUtils = {
  validateModeratorPermission: mock(() => Promise.resolve({ isValid: true })),
  validateNominatorUser: mock(() => Promise.resolve({ isValid: true }))
};

mock.module('../lib/permissions.js', () => mockPermissionUtils);

const { validateModeratorPermission, validateNominatorUser } = await import('../lib/permissions.js');

describe('permissions utilities', () => {
  beforeEach(() => {
    mockPermissionUtils.validateModeratorPermission.mockReset();
    mockPermissionUtils.validateNominatorUser.mockReset();
  });

  describe('validateModeratorPermission', () => {
    test('exports validateModeratorPermission function', () => {
      expect(typeof validateModeratorPermission).toBe('function');
    });

    test('returns permission result structure', async () => {
      mockPermissionUtils.validateModeratorPermission.mockReturnValue(
        Promise.resolve({ isValid: true })
      );

      const result = await validateModeratorPermission({} as any, 'guild', 'user');
      
      expect(result).toHaveProperty('isValid');
      expect(typeof result.isValid).toBe('boolean');
    });

    test('can return error message when invalid', async () => {
      mockPermissionUtils.validateModeratorPermission.mockReturnValue(
        Promise.resolve({ 
          isValid: false, 
          errorMessage: 'No permission' 
        })
      );

      const result = await validateModeratorPermission({} as any, 'guild', 'user');
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('No permission');
    });
  });

  describe('validateNominatorUser', () => {
    test('exports validateNominatorUser function', () => {
      expect(typeof validateNominatorUser).toBe('function');
    });

    test('returns permission result structure', async () => {
      mockPermissionUtils.validateNominatorUser.mockReturnValue(
        Promise.resolve({ isValid: true })
      );

      const result = await validateNominatorUser({} as any, 'guild', 'user');
      
      expect(result).toHaveProperty('isValid');
      expect(typeof result.isValid).toBe('boolean');
    });

    test('can return error message when invalid', async () => {
      mockPermissionUtils.validateNominatorUser.mockReturnValue(
        Promise.resolve({ 
          isValid: false, 
          errorMessage: 'Invalid nominator' 
        })
      );

      const result = await validateNominatorUser({} as any, 'guild', 'user');
      
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Invalid nominator');
    });
  });
});