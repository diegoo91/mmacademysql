export const TIME_LABELS = {
  '14:00': '2:00–3:00', '15:00': '3:00–4:00', '16:00': '4:00–5:00',
  '17:00': '5:00–6:00', '18:00': '6:00–7:00', '19:00': '7:00–8:00',
  '20:00': '8:00–9:00', '21:00': '9:00–10:00', '22:00': '10:00–11:00',
  '23:00': '11:00–12:00',
}

export function canonTime(t) {
  if (t == null) return ''
  const s = String(t).trim()
  const m = s.match(/^(\d{1,2}:\d{2})/)
  return m ? m[1] : s
}

function to12(h, min) {
  const hh = ((Number(h) % 24) + 24) % 24
  return `${(hh % 12) || 12}:${min}`
}

export function formatSlotTime(t) {
  if (t == null || t === '') return ''
  const s = String(t).trim()
  if (TIME_LABELS[s]) return TIME_LABELS[s]
  const range = s.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/)
  if (range) return `${to12(range[1], range[2])}–${to12(range[3], range[4])}`
  const single = s.match(/^(\d{1,2}):(\d{2})/)
  if (single) {
    const endH = (Number(single[1]) + 1) % 24
    return `${to12(single[1], single[2])}–${to12(endH, single[2])}`
  }
  return s
}
