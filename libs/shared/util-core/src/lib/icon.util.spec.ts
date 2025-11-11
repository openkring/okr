import { describe, expect, it } from 'vitest';
import { getAvatarKey, getIconColor } from './icon.util';

describe('icon.util', () => {
  describe('getIconColor', () => {
    it('should return gold color when isValidated is true', () => {
      const result = getIconColor(true);
      expect(result).toBe('gold');
    });

    it('should return green color when isValidated is false', () => {
      const result = getIconColor(false);
      expect(result).toBe('#009D53');
    });

    it('should handle truthy values as true', () => {
      expect(getIconColor(1 as any)).toBe('gold');
      expect(getIconColor('true' as any)).toBe('gold');
      expect(getIconColor({} as any)).toBe('gold');
      expect(getIconColor([] as any)).toBe('gold');
    });

    it('should handle falsy values as false', () => {
      expect(getIconColor(0 as any)).toBe('#009D53');
      expect(getIconColor('' as any)).toBe('#009D53');
      expect(getIconColor(null as any)).toBe('#009D53');
      expect(getIconColor(undefined as any)).toBe('#009D53');
    });

    it('should return consistent colors for the same input', () => {
      expect(getIconColor(true)).toBe(getIconColor(true));
      expect(getIconColor(false)).toBe(getIconColor(false));
    });
  });

  describe('getAvatarKey', () => {
    describe('Resource model type with resourceType', () => {
      it('should format key for Resource with basic resourceType', () => {
        const result = getAvatarKey('resource', 'key123', 'rboat');
        expect(result).toBe('resource.rboat:key123');
      });

      it('should format key for Resource with RowingBoat resourceType and subType', () => {
        const result = getAvatarKey('resource', 'boat456', 'rboat', 'b1x');
        expect(result).toBe('resource.rboat_b1x:boat456');
      });

      it('should format key for Resource with RowingBoat resourceType and different subType', () => {
        const result = getAvatarKey('resource', 'skiff789', 'rboat', 'b4x');
        expect(result).toBe('resource.rboat_b4x:skiff789');
      });

      it('should format key for Resource with non-RowingBoat resourceType even with subType', () => {
        const result = getAvatarKey('resource', 'locker123', 'locker', 'male'); // Assuming 4 is a locker type
        expect(result).toBe('resource.locker_male:locker123');
      });

      it('should format key for Resource with resourceType but undefined subType', () => {
        const result = getAvatarKey('resource', 'resource456', 'key');
        expect(result).toBe('resource.key:resource456');
      });

      it('should format key for Resource with resourceType but null subType', () => {
        const result = getAvatarKey('resource', 'resource789', 'key', null as any);
        expect(result).toBe('resource.key:resource789');
      });
    });

    describe('Resource model type without resourceType', () => {
      it('should format key for Resource without resourceType', () => {
        const result = getAvatarKey('resource', 'basic123');
        expect(result).toBe('resource.basic123');
      });

      it('should format key for Resource with undefined resourceType', () => {
        const result = getAvatarKey('resource', 'undefined456');
        expect(result).toBe('resource.undefined456');
      });

 /*      it('should format key for Resource with null resourceType', () => {
        const result = getAvatarKey('resource', 'null789', null as any);
        expect(result).toBe('20.null789');
      }); */
    });

    describe('Non-Resource model types', () => {
      it('should format key for Person model type', () => {
        const result = getAvatarKey('person', 'person123');
        expect(result).toBe('person.person123');
      });

      it('should format key for Organization model type', () => {
        const result = getAvatarKey('org', 'org456');
        expect(result).toBe('org.org456');
      });

      it('should format key for User model type', () => {
        const result = getAvatarKey('user', 'user789');
        expect(result).toBe('user.user789');
      });

      it('should format key for Document model type', () => {
        const result = getAvatarKey('document', 'doc123');
        expect(result).toBe('document.doc123');
      });

      it('should ignore resourceType and subType for non-Resource models', () => {
        const result = getAvatarKey('person', 'person456', 'resourceType', 'subType');
        expect(result).toBe('person.person456');
      });

      it('should handle non-Resource models with undefined resourceType and subType', () => {
        const result = getAvatarKey('org', 'org789');
        expect(result).toBe('org.org789');
      });
    });

    describe('Edge cases with keys', () => {
      it('should handle empty string key', () => {
        const result = getAvatarKey('person', '');
        expect(result).toBe('person.');
      });

      it('should handle numeric string key', () => {
        const result = getAvatarKey('resource', '12345', 'rboat', 'b3x');
        expect(result).toBe('resource.rboat_b3x:12345');
      });

      it('should handle key with special characters', () => {
        const result = getAvatarKey('person', 'key-with-dashes_and_underscores');
        expect(result).toBe('person.key-with-dashes_and_underscores');
      });

      it('should handle key with spaces', () => {
        const result = getAvatarKey('org', 'key with spaces');
        expect(result).toBe('org.key with spaces');
      });

      it('should handle very long key', () => {
        const longKey = 'a'.repeat(100);
        const result = getAvatarKey('resource', longKey, 'key');
        expect(result).toBe(`resource.key:${longKey}`);
      });
    });

    describe('Edge cases with numeric parameters', () => {
      it('should handle zero values for resourceType and subType', () => {
        const result = getAvatarKey('resource', 'zero123', '0', '0');
        expect(result).toBe('resource.0_0:zero123');
      });

      it('should handle negative resourceType (if possible)', () => {
        const result = getAvatarKey('resource', 'negative123', '-1');
        expect(result).toBe('resource.-1:negative123');
      });

      it('should handle large numeric values (not RowingBoat)', () => {
        const result = getAvatarKey('resource', 'large123', '9999', '8888');
        expect(result).toBe('resource.9999:large123');
      });

      it('should handle large numeric values (it is a RowingBoat)', () => {
        const result = getAvatarKey('resource', 'large123', '0', '8888');
        expect(result).toBe('resource.0_8888:large123');
      });

      it('should handle RowingBoat with zero subType', () => {
        const result = getAvatarKey('resource', 'rowing123', 'rboat', '0');
        expect(result).toBe('resource.rboat_0:rowing123');
      });
    });

    describe('Real-world examples based on comments', () => {
      it('should format key for rowing boat (20.0) with key', () => {
        const result = getAvatarKey('resource', 'boat-key-123', 'rboat');
        expect(result).toBe('resource.rboat:boat-key-123');
      });

      it('should format key for locker (20.4) with key', () => {
        const result = getAvatarKey('resource', 'locker-key-456', 'locker');
        expect(result).toBe('resource.locker:locker-key-456');
      });

      it('should format key for skiff (20.0_0) with key', () => {
        const result = getAvatarKey('resource', 'skiff-key-789', 'rboat', 'b1x');
        expect(result).toBe('resource.rboat_b1x:skiff-key-789');
      });

      it('should demonstrate resource Type_SubType:key pattern', () => {
        const result = getAvatarKey('resource', 'example-key', 'rboat', 'key');
        expect(result).toBe('resource.rboat_key:example-key');
      });
    });

    describe('Type safety and consistency', () => {
      it('should handle all ModelType enum values consistently', () => {
        const key = 'test-key';
        const modelTypes = [
          'person',
          'org', 
          'resource',
          'user',
          'document'
        ];

        modelTypes.forEach(modelType => {
          const result = getAvatarKey(modelType, key);
          expect(result).toMatch(/^\d+\.test-key$/);
          expect(result).toContain(key);
        });
      });

      it('should maintain consistent format across different parameter combinations', () => {
        // Test format consistency
        expect(getAvatarKey('resource', 'key1', '5')).toMatch(/^\d+\.\d+:key1$/);
        expect(getAvatarKey('resource', 'key2', 'rboat', '3')).toMatch(/^\d+\.\d+_\d+:key2$/);
        expect(getAvatarKey('person', 'key3')).toMatch(/^\d+\.key3$/);
      });

      it('should handle ResourceType enum values', () => {
        // Assuming 'rboat' is 0, test with it specifically
        const result = getAvatarKey('resource', 'boat', 'rboat', '1');
        expect(result).toBe('resource.rboat_1:boat');
      });
    });

    describe('Integration scenarios', () => {
      it('should work in avatar generation workflow', () => {
        // Simulate typical usage in avatar/icon generation
        const scenarios = [
          { modelType: 'person', key: 'person-123', expected: /^\d+\.person-123$/ },
          { modelType: 'resource', key: 'resource-456', resourceType: '5', expected: /^\d+\.\d+:resource-456$/ },
          { modelType: 'resource', key: 'boat-789', resourceType: 'rboat', subType: '2', expected: /^\d+\.\d+_\d+:boat-789$/ }
        ];

        scenarios.forEach(scenario => {
          const result = getAvatarKey(
            scenario.modelType, 
            scenario.key, 
            scenario.resourceType, 
            scenario.subType
          );
          expect(result).toMatch(scenario.expected);
        });
      });

      it('should demonstrate typical service usage', () => {
        // Example of how this might be used in a service
        interface AvatarConfig {
          modelType: string;
          key: string;
          resourceType?: string;
          subType?: string;
          avatarKey: string;
          iconColor: string;
        }

        const configs: AvatarConfig[] = [
          {
            modelType: 'person',
            key: 'person1',
            avatarKey: getAvatarKey('person', 'person1'),
            iconColor: getIconColor(true)
          },
          {
            modelType: 'resource',
            key: 'boat1',
            resourceType: 'rboat',
            subType: '0',
            avatarKey: getAvatarKey('resource', 'boat1', 'rboat', '0'),
            iconColor: getIconColor(false)
          }
        ];

        expect(configs[0].avatarKey).toBe('person.person1');
        expect(configs[0].iconColor).toBe('gold');
        expect(configs[1].avatarKey).toBe('resource.rboat_0:boat1');
        expect(configs[1].iconColor).toBe('#009D53');
      });
    });
  });

  describe('Function interactions', () => {
    it('should use both functions together for avatar configuration', () => {
      const avatarKey = getAvatarKey('resource', 'test-resource', 'rboat', '1');
      const validatedColor = getIconColor(true);
      const unvalidatedColor = getIconColor(false);

      expect(avatarKey).toBe('resource.rboat_1:test-resource');
      expect(validatedColor).toBe('gold');
      expect(unvalidatedColor).toBe('#009D53');
    });

    it('should demonstrate complete avatar/icon workflow', () => {
      // Simulate generating avatar configurations for different entities
      const entities = [
        { type: 'person', key: 'john-doe', validated: true },
        { type: 'resource', key: 'rowing-boat-1', resourceType: 'rboat', subType: '0', validated: false },
        { type: 'org', key: 'company-abc', validated: true }
      ];

      const avatarConfigs = entities.map(entity => ({
        avatarKey: getAvatarKey(entity.type, entity.key, entity.resourceType, entity.subType),
        color: getIconColor(entity.validated),
        original: entity
      }));

      expect(avatarConfigs[0].avatarKey).toBe('person.john-doe');
      expect(avatarConfigs[0].color).toBe('gold');
      
      expect(avatarConfigs[1].avatarKey).toBe('resource.rboat_0:rowing-boat-1');
      expect(avatarConfigs[1].color).toBe('#009D53');
      
      expect(avatarConfigs[2].avatarKey).toBe('org.company-abc');
      expect(avatarConfigs[2].color).toBe('gold');
    });
  });
});