export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

export function usernameEmail(username) {
  return `${username}@users.splitsmart.local`;
}
