// Input length limits — prevents oversized payloads abuse
export const LIMITS = {
  name: 100,
  nickname: 30,
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

// Nickname: optional, 3-30 chars, letters/digits/._- and spaces (no @ so it
// can never be mistaken for an email during login lookup).
const NICKNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/
export function validateNickname(value) {
  if (value === undefined || value === null) return null
  const v = String(value).trim()
  if (v === '') return null
  if (v.length < 3) return 'Nickname must be at least 3 characters'
  if (v.length > LIMITS.nickname) return `Nickname must be at most ${LIMITS.nickname} characters`
  if (!NICKNAME_RE.test(v)) return 'Nickname may only contain letters, numbers, spaces and . _ -'
  return null
}

// Normalize a phone number for storage/matching: keep a leading +, drop
// spaces / dashes / dots / parentheses. `010 1234-5678` → `01012345678`.
export function normalizePhone(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const plus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  return plus ? `+${digits}` : digits
}

// Does this login identifier look like a phone number (not an email)?
// Requires 8-15 digits and only phone-ish characters.
export function isPhoneIdentifier(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v || v.includes('@')) return false
  if (!/^[+\d][\d\s.()\-]+$/.test(v)) return false
  const digits = v.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

// Format-independent comparison key: last 10 digits.
// "010 9988-7766" → 1099887766 and "+20 10 9988 7766" → 1099887766 match,
// so an Egyptian local number equals its international form.
export function phoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length <= 10) return digits
  return digits.slice(-10)
}

export function validatePassword(password) {
  if (typeof password !== 'string') return 'Password must be a string'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 72) return 'Password must not exceed 72 characters (bcrypt limit)'
  return null
}
