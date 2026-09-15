// This is static mock data for the MM Padel Academy scheduling system
// In the future this would come from a backend API.
//
// NOTE: The schedule demo data was given across 5 days (Sun 30/8, Mon 31/8,
// Tue 8/9, Wed 2/9, Thu 3/9). These dates appear to be from different weeks,
// so for the demo we group them all in a single "schedule week".
//
// For Wednesday 2/9 and Thursday 3/9, only one court's worth of bookings was
// provided. We have ASSUMED those bookings belong to Court 1 and left Court 2
// as "Available" for every slot. THIS IS AN ASSUMPTION — flagging it here so it
// can be corrected once real data is available.

export const SCHEDULE_WEEK = [
  {
    dayKey: 'sunday',
    label: 'Sunday',
    date: '2026-08-30',
    slots: [
      { time: '15:00', label: '3:00–4:00', court1: '', court2: '' },
      { time: '16:00', label: '4:00–5:00', court1: '', court2: 'Farida Fathallah / Hassan Medhat' },
      { time: '17:00', label: '5:00–6:00', court1: 'Ahmed Salah / Zein', court2: '' },
      { time: '18:00', label: '6:00–7:00', court1: 'Aley / Ismail', court2: '' },
      { time: '19:00', label: '7:00–8:00', court1: '', court2: 'Yasin Mahmoud / Totos' },
      { time: '20:00', label: '8:00–9:00', court1: 'Alaa / Sharaf', court2: 'Yasin Fathallah' },
      { time: '21:00', label: '9:00–10:00', court1: 'Eyad Dawish / Youssef Dawish', court2: 'Dima' },
      { time: '22:00', label: '10:00–11:00', court1: 'Hashad', court2: 'Titos' },
      { time: '23:00', label: '11:00–12:00', court1: 'Halawany / Zein', court2: 'Ashraf' },
    ],
  },
  {
    dayKey: 'monday',
    label: 'Monday',
    date: '2026-08-31',
    slots: [
      { time: '15:00', label: '3:00–4:00', court1: '', court2: '' },
      { time: '16:00', label: '4:00–5:00', court1: 'Zain', court2: 'Hassan Medhat' },
      { time: '17:00', label: '5:00–6:00', court1: 'Hassan Medhat', court2: 'Omar Ismail / Aley' },
      { time: '18:00', label: '6:00–7:00', court1: 'Sharaf', court2: 'Magdy' },
      { time: '19:00', label: '7:00–8:00', court1: 'Hamoksha / Selim', court2: 'Haitham' },
      { time: '20:00', label: '8:00–9:00', court1: 'Ammar Abd El Ghany / Adham', court2: 'Halawany / Zein' },
      { time: '21:00', label: '9:00–10:00', court1: 'Yasin Fathallah', court2: 'Ashraf' },
      { time: '22:00', label: '10:00–11:00', court1: 'Totos', court2: 'Farida Fathallah' },
      { time: '23:00', label: '11:00–12:00', court1: '', court2: '' },
    ],
  },
  {
    dayKey: 'tuesday',
    label: 'Tuesday',
    date: '2026-09-08',
    slots: [
      { time: '15:00', label: '3:00–4:00', court1: 'Zain', court2: 'Totos' },
      { time: '16:00', label: '4:00–5:00', court1: 'Aley / Ismail', court2: 'Farida Fathala' },
      { time: '17:00', label: '5:00–6:00', court1: 'Ahmed Saleh', court2: 'Hassan Medhat' },
      { time: '18:00', label: '6:00–7:00', court1: 'Sharaf', court2: 'Ashraf' },
      { time: '19:00', label: '7:00–8:00', court1: 'Hashad', court2: 'Kenzy' },
      { time: '20:00', label: '8:00–9:00', court1: 'Yasin Fathallah', court2: 'Titos' },
      { time: '21:00', label: '9:00–10:00', court1: 'Eyad Dawish / Youssef Dawish', court2: '' },
      { time: '22:00', label: '10:00–11:00', court1: '', court2: '' },
      { time: '23:00', label: '11:00–12:00', court1: '', court2: '' },
    ],
  },
  {
    dayKey: 'wednesday',
    label: 'Wednesday',
    date: '2026-09-02',
    // ASSUMPTION: Only one court's worth of bookings was provided for this day.
    // We have assigned them all to Court 1, and Court 2 is left "Available" for
    // every slot. To be corrected once real data is available.
    slots: [
      { time: '15:00', label: '3:00–4:00', court1: 'Ismail / Aley', court2: '' },
      { time: '16:00', label: '4:00–5:00', court1: 'Hassan Medhat', court2: '' },
      { time: '17:00', label: '5:00–6:00', court1: 'Yassin Mahmoud / Sharaf', court2: '' },
      { time: '18:00', label: '6:00–7:00', court1: 'Magdy', court2: '' },
      { time: '19:00', label: '7:00–8:00', court1: 'Ammar Abd El Ghany / Adham', court2: '' },
      { time: '20:00', label: '8:00–9:00', court1: 'Farida Fathala / Alaa', court2: '' },
      { time: '21:00', label: '9:00–10:00', court1: 'Eyad / Youssef', court2: '' },
      { time: '22:00', label: '10:00–11:00', court1: 'Yasin Fathallah / Totos', court2: '' },
      { time: '23:00', label: '11:00–12:00', court1: 'Halawany / Zein', court2: '' },
    ],
  },
  {
    dayKey: 'thursday',
    label: 'Thursday',
    date: '2026-09-03',
    // ASSUMPTION: Same as Wednesday — single column. Bookings assigned to
    // Court 1, Court 2 left "Available". To be corrected later.
    slots: [
      { time: '14:00', label: '2:00–3:00', court1: 'Farida Fathallah', court2: '' },
      { time: '15:00', label: '3:00–4:00', court1: 'Hassan / Alaa', court2: '' },
      { time: '16:00', label: '4:00–5:00', court1: 'Totos', court2: '' },
      { time: '17:00', label: '5:00–6:00', court1: 'Yassin Mahmoud / Sharaf', court2: '' },
      { time: '18:00', label: '6:00–7:00', court1: 'Ahmed Saleh', court2: '' },
      { time: '19:00', label: '7:00–8:00', court1: 'Aley / Ismail', court2: '' },
    ],
  },
]

// Helper: flattened list of every booked (date, time, court) combination,
// used by the booking page to disable already-booked slots.
export function buildBookedMap() {
  const map = new Map() // key: `${date}|${time}|court`
  for (const day of SCHEDULE_WEEK) {
    for (const slot of day.slots) {
      if (slot.court1) map.set(`${day.date}|${slot.time}|1`, slot.court1)
      if (slot.court2) map.set(`${day.date}|${slot.time}|2`, slot.court2)
    }
  }
  return map
}

export function isTimeBooked(date, time, court, bookedMap) {
  return bookedMap.has(`${date}|${time}|${court}`)
}
