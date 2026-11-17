import { CONNECTIONS_CONFIG_SHAPE, ConnectionsConfig } from '@okr/shared-models';

/**
 * Completes a stored `ConnectionsConfig` with the timetable fields (spec 1.162 §5.1). Legacy
 * documents (spec 1.131) lack them, and reads skip the model defaults, so every field is coalesced.
 */
export function timetableConfigOf(props: Partial<ConnectionsConfig> | undefined): ConnectionsConfig {
  const d = CONNECTIONS_CONFIG_SHAPE;
  return {
    destinationKey: props?.destinationKey ?? d.destinationKey,
    sourceKey: props?.sourceKey ?? d.sourceKey,
    favoriteDefaultOrg: props?.favoriteDefaultOrg ?? d.favoriteDefaultOrg,
    favoriteHomeAddress: props?.favoriteHomeAddress ?? d.favoriteHomeAddress,
    favoriteLocationKeys: Array.isArray(props?.favoriteLocationKeys) ? [...props.favoriteLocationKeys] : [],
    anchor: props?.anchor === 'arriveBy' || props?.anchor === 'departAt' ? props.anchor : d.anchor,
    allowAddToCalendar: props?.allowAddToCalendar ?? d.allowAddToCalendar
  };
}
