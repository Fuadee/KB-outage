const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseLocalDate(dateString: string) {
  return new Date(`${dateString}T00:00:00`);
}

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(start: Date, end: Date) {
  const startDay = startOfDay(start).getTime();
  const endDay = startOfDay(end).getTime();
  return Math.round((endDay - startDay) / MS_PER_DAY);
}

export function getStatusLabel(daysLeft: number) {
  if (daysLeft < 0) {
    return `เลยกำหนด ${Math.abs(daysLeft)} วัน`;
  }
  if (daysLeft === 0) {
    return "วันนี้";
  }
  if (daysLeft === 1) {
    return "พรุ่งนี้";
  }
  return `เหลือ ${daysLeft} วัน`;
}

export function getJobCountdown(outageDate: string, now = new Date()) {
  const todayStart = startOfDay(now);
  const outageDateStart = startOfDay(parseLocalDate(outageDate));
  const daysLeft = daysBetween(todayStart, outageDateStart);
  return { daysLeft, label: getStatusLabel(daysLeft) };
}
