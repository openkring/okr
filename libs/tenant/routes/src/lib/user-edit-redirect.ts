import { inject } from '@angular/core';
import type { RedirectFunction } from '@angular/router';
import { Router } from '@angular/router';

const USER_LIST_URL = '/user/all/c-users';

/**
 * Target of the retired `/user/:userKey` page (`UserEditPage`, spec 1.101 phase 4): the list
 * «Benutzer & Zugänge», which opens the user's modal for `?edit=<userKey>` and then clears it.
 */
export function userEditRedirectUrl(userKey: string | undefined): string {
  return userKey ? `${USER_LIST_URL}?edit=${encodeURIComponent(userKey)}` : USER_LIST_URL;
}

export const userEditRedirect: RedirectFunction = ({ params }) =>
  inject(Router).parseUrl(userEditRedirectUrl(params['userKey']));
