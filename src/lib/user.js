// Display helpers — nickname is an optional alias shown instead of the
// full name wherever a person is displayed (fallback keeps old data intact).

export function displayName(user) {
  if (!user) return ''
  return user.nickname || user.name || ''
}
