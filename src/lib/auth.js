export const authReady = false

export function getUserSession() {
  return null
}

export function requireAuthForMvp() {
  return false
}

export function buildRlsPolicySummary() {
  return {
    status: 'ready-for-later-auth',
    note: 'The deals table is RLS-enabled and prepared for future per-user policies once auth is added.',
  }
}
