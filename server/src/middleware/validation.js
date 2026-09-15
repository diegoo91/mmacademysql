// Input length limits — prevents oversized payloads abuse
export const LIMITS = {
  name: 100,
  email: 254,
  phone: 20,
  notes: 1000,
  commentText: 2000,
  playerText: 200,
  dob: 10,
  string256: 256,
}

export function validateLength(field, value, max) {
  if (typeof value === 'string' && value.length > max) {
    return `${field} must be at most ${max} characters`
  }
  return null
}
