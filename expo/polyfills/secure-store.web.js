const KEY_PREFIX = 'ivx_secure_store_';

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const ALWAYS = 2;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3;
export const ALWAYS_THIS_DEVICE_ONLY = 4;
export const WHEN_UNLOCKED = 5;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6;

function storageKey(key) {
  return `${KEY_PREFIX}${key}`;
}

export async function isAvailableAsync() {
  return typeof localStorage !== 'undefined';
}

export async function getItemAsync(key) {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(storageKey(key));
}

export async function setItemAsync(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(key), String(value));
}

export async function deleteItemAsync(key) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(key));
}

export function getItem(key) {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(storageKey(key));
}

export function setItem(key, value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(key), String(value));
}

export function canUseBiometricAuthentication() {
  return false;
}
