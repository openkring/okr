import { ModelType, ResourceType } from '@bk2/shared-models';
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
        const result = getAvatarKey(ModelType.Resource, 'key123', 20);
        expect(result).toBe('20.20:key123');
      });

      it('should format key for Resource with RowingBoat resourceType and subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'boat456', ResourceType.RowingBoat, 0);
        expect(result).toBe('20.0_0:boat456');
      });

      it('should format key for Resource with RowingBoat resourceType and different subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'skiff789', ResourceType.RowingBoat, 4);
        expect(result).toBe('20.0_4:skiff789');
      });

      it('should format key for Resource with non-RowingBoat resourceType even with subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'locker123', 4, 2); // Assuming 4 is a locker type
        expect(result).toBe('20.4:locker123');
      });

      it('should format key for Resource with resourceType but undefined subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'resource456', 5);
        expect(result).toBe('20.5:resource456');
      });

      it('should format key for Resource with resourceType but null subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'resource789', 3, null as any);
        expect(result).toBe('20.3:resource789');
      });
    });

    describe('Resource model type without resourceType', () => {
      it('should format key for Resource without resourceType', () => {
        const result = getAvatarKey(ModelType.Resource, 'basic123');
        expect(result).toBe('20.basic123');
      });

      it('should format key for Resource with undefined resourceType', () => {
        const result = getAvatarKey(ModelType.Resource, 'undefined456');
        expect(result).toBe('20.undefined456');
      });

 /*      it('should format key for Resource with null resourceType', () => {
        const result = getAvatarKey(ModelType.Resource, 'null789', null as any);
        expect(result).toBe('20.null789');
      }); */
    });

    describe('Non-Resource model types', () => {
      it('should format key for Person model type', () => {
        const result = getAvatarKey(ModelType.Person, 'person123');
        expect(result).toBe('17.person123');
      });

      it('should format key for Organization model type', () => {
        const result = getAvatarKey(ModelType.Org, 'org456');
        expect(result).toBe('14.org456');
      });

      it('should format key for User model type', () => {
        const result = getAvatarKey(ModelType.User, 'user789');
        expect(result).toBe('25.user789');
      });

      it('should format key for Document model type', () => {
        const result = getAvatarKey(ModelType.Document, 'doc123');
        expect(result).toBe('6.doc123');
      });

      it('should ignore resourceType and subType for non-Resource models', () => {
        const result = getAvatarKey(ModelType.Person, 'person456', 20, 5);
        expect(result).toBe('17.person456');
      });

      it('should handle non-Resource models with undefined resourceType and subType', () => {
        const result = getAvatarKey(ModelType.Org, 'org789');
        expect(result).toBe('14.org789');
      });
    });

    describe('Edge cases with keys', () => {
      it('should handle empty string key', () => {
        const result = getAvatarKey(ModelType.Person, '');
        expect(result).toBe('17.');
      });

      it('should handle numeric string key', () => {
        const result = getAvatarKey(ModelType.Resource, '12345', ResourceType.RowingBoat, 0);
        expect(result).toBe('20.0_0:12345');
      });

      it('should handle key with special characters', () => {
        const result = getAvatarKey(ModelType.Person, 'key-with-dashes_and_underscores');
        expect(result).toBe('17.key-with-dashes_and_underscores');
      });

      it('should handle key with spaces', () => {
        const result = getAvatarKey(ModelType.Org, 'key with spaces');
        expect(result).toBe('14.key with spaces');
      });

      it('should handle very long key', () => {
        const longKey = 'a'.repeat(100);
        const result = getAvatarKey(ModelType.Resource, longKey, 5);
        expect(result).toBe(`20.5:${longKey}`);
      });
    });

    describe('Edge cases with numeric parameters', () => {
      it('should handle zero values for resourceType and subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'zero123', 0, 0);
        expect(result).toBe('20.0_0:zero123');
      });

      it('should handle negative resourceType (if possible)', () => {
        const result = getAvatarKey(ModelType.Resource, 'negative123', -1);
        expect(result).toBe('20.-1:negative123');
      });

      it('should handle large numeric values (not RowingBoat)', () => {
        const result = getAvatarKey(ModelType.Resource, 'large123', 9999, 8888);
        expect(result).toBe('20.9999:large123');
      });

      it('should handle large numeric values (it is a RowingBoat)', () => {
        const result = getAvatarKey(ModelType.Resource, 'large123', 0, 8888);
        expect(result).toBe('20.0_8888:large123');
      });

      it('should handle RowingBoat with zero subType', () => {
        const result = getAvatarKey(ModelType.Resource, 'rowing123', ResourceType.RowingBoat, 0);
        expect(result).toBe('20.0_0:rowing123');
      });
    });

    describe('Real-world examples based on comments', () => {
      it('should format key for rowing boat (20.0) with key', () => {
        const result = getAvatarKey(ModelType.Resource, 'boat-key-123', ResourceType.RowingBoat);
        expect(result).toBe('20.0:boat-key-123');
      });

      it('should format key for locker (20.4) with key', () => {
        const result = getAvatarKey(ModelType.Resource, 'locker-key-456', 4);
        expect(result).toBe('20.4:locker-key-456');
      });

      it('should format key for skiff (20.0_0) with key', () => {
        const result = getAvatarKey(ModelType.Resource, 'skiff-key-789', ResourceType.RowingBoat, 0);
        expect(result).toBe('20.0_0:skiff-key-789');
      });

      it('should demonstrate ModelType.ResourceType_SubType:key pattern', () => {
        const result = getAvatarKey(ModelType.Resource, 'example-key', ResourceType.RowingBoat, 5);
        expect(result).toBe('20.0_5:example-key');
      });
    });

    describe('Type safety and consistency', () => {
      it('should handle all ModelType enum values consistently', () => {
        const key = 'test-key';
        const modelTypes = [
          ModelType.Person,
          ModelType.Org, 
          ModelType.Resource,
          ModelType.User,
          ModelType.Document
        ];

        modelTypes.forEach(modelType => {
          const result = getAvatarKey(modelType, key);
          expect(result).toMatch(/^\d+\.test-key$/);
          expect(result).toContain(key);
        });
      });

      it('should maintain consistent format across different parameter combinations', () => {
        // Test format consistency
        expect(getAvatarKey(ModelType.Resource, 'key1', 5)).toMatch(/^\d+\.\d+:key1$/);
        expect(getAvatarKey(ModelType.Resource, 'key2', ResourceType.RowingBoat, 3)).toMatch(/^\d+\.\d+_\d+:key2$/);
        expect(getAvatarKey(ModelType.Person, 'key3')).toMatch(/^\d+\.key3$/);
      });

      it('should handle ResourceType enum values', () => {
        // Assuming ResourceType.RowingBoat is 0, test with it specifically
        const result = getAvatarKey(ModelType.Resource, 'boat', ResourceType.RowingBoat, 1);
        expect(result).toBe('20.0_1:boat');
      });
    });

    describe('Integration scenarios', () => {
      it('should work in avatar generation workflow', () => {
        // Simulate typical usage in avatar/icon generation
        const scenarios = [
          { modelType: ModelType.Person, key: 'person-123', expected: /^\d+\.person-123$/ },
          { modelType: ModelType.Resource, key: 'resource-456', resourceType: 5, expected: /^\d+\.\d+:resource-456$/ },
          { modelType: ModelType.Resource, key: 'boat-789', resourceType: ResourceType.RowingBoat, subType: 2, expected: /^\d+\.\d+_\d+:boat-789$/ }
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
          modelType: ModelType;
          key: string;
          resourceType?: number;
          subType?: number;
          avatarKey: string;
          iconColor: string;
        }

        const configs: AvatarConfig[] = [
          {
            modelType: ModelType.Person,
            key: 'person1',
            avatarKey: getAvatarKey(ModelType.Person, 'person1'),
            iconColor: getIconColor(true)
          },
          {
            modelType: ModelType.Resource,
            key: 'boat1',
            resourceType: ResourceType.RowingBoat,
            subType: 0,
            avatarKey: getAvatarKey(ModelType.Resource, 'boat1', ResourceType.RowingBoat, 0),
            iconColor: getIconColor(false)
          }
        ];

        expect(configs[0].avatarKey).toBe('17.person1');
        expect(configs[0].iconColor).toBe('gold');
        expect(configs[1].avatarKey).toBe('20.0_0:boat1');
        expect(configs[1].iconColor).toBe('#009D53');
      });
    });
  });

  describe('Function interactions', () => {
    it('should use both functions together for avatar configuration', () => {
      const avatarKey = getAvatarKey(ModelType.Resource, 'test-resource', ResourceType.RowingBoat, 1);
      const validatedColor = getIconColor(true);
      const unvalidatedColor = getIconColor(false);

      expect(avatarKey).toBe('20.0_1:test-resource');
      expect(validatedColor).toBe('gold');
      expect(unvalidatedColor).toBe('#009D53');
    });

    it('should demonstrate complete avatar/icon workflow', () => {
      // Simulate generating avatar configurations for different entities
      const entities = [
        { type: ModelType.Person, key: 'john-doe', validated: true },
        { type: ModelType.Resource, key: 'rowing-boat-1', resourceType: ResourceType.RowingBoat, subType: 0, validated: false },
        { type: ModelType.Org, key: 'company-abc', validated: true }
      ];

      const avatarConfigs = entities.map(entity => ({
        avatarKey: getAvatarKey(entity.type, entity.key, entity.resourceType, entity.subType),
        color: getIconColor(entity.validated),
        original: entity
      }));

      expect(avatarConfigs[0].avatarKey).toBe('17.john-doe');
      expect(avatarConfigs[0].color).toBe('gold');
      
      expect(avatarConfigs[1].avatarKey).toBe('20.0_0:rowing-boat-1');
      expect(avatarConfigs[1].color).toBe('#009D53');
      
      expect(avatarConfigs[2].avatarKey).toBe('14.company-abc');
      expect(avatarConfigs[2].color).toBe('gold');
    });
  });
});