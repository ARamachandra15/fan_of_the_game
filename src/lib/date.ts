import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';

export function buildMonthGrid(currentDate: Date) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  return eachDayOfInterval({ start: gridStart, end: gridEnd });
}

export function formatMonthLabel(date: Date) {
  return format(date, 'MMMM yyyy');
}

// Plain "yyyy-MM-dd" key for a calendar grid date. Uses date-fns `format`
// (local field extraction) instead of `toISOString()`, which would shift
// the date if the browser's local UTC offset is positive.
export function formatDateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function isCurrentMonth(date: Date, reference: Date) {
  return isSameMonth(date, reference);
}

export function isTodayDate(date: Date) {
  return isToday(date);
}

export function goToPrevMonth(date: Date) {
  return addMonths(date, -1);
}

export function goToNextMonth(date: Date) {
  return addMonths(date, 1);
}
