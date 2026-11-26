import { ModalController } from '@ionic/angular';

import { LocationModel, UserModel } from '@okr/shared-models';

/**
 * Opens the location editor on a new or existing record; returns what the user confirmed, or
 * undefined on cancel. It does not save — the caller creates or updates the record.
 *
 * `isNew` marks a pre-filled new location: the change-confirmation shows at once, so the user can
 * save the suggestion without first changing a field (spec 1.178 §6.1).
 *
 * Shared by the diary store (a tapped free-text place) and the diary import store (the repair
 * page's «add»). `@okr/location-feature` is imported dynamically: its editor carries the map card,
 * which must stay out of the diary's eager bundle.
 */
export async function openLocationEditor(
  mc: ModalController, location: LocationModel, user: UserModel | undefined, isNew: boolean,
): Promise<LocationModel | undefined> {
  const { LocationEditModal } = await import('@okr/location-feature');
  const modal = await mc.create({
    component: LocationEditModal,
    componentProps: { location, currentUser: user, readOnly: false, isNew },
  });
  await modal.present();
  const { data, role } = await modal.onWillDismiss<LocationModel>();
  return role === 'confirm' && data ? data : undefined;
}
