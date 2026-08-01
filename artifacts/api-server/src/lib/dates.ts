// Calendar-safe month addition: clamps to the last day of the target month
// (e.g. Jan 31 + 1 month = Feb 28/29, not Mar 2/3).
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}
