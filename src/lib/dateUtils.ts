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

export function getStatusColor(daysLeft: number) {
  if (daysLeft < 14) {
    return {
      name: "red",
      strip: "bg-red-500",
      badge: "bg-red-50 text-red-700 ring-red-200",
      text: "text-red-700"
    };
  }
  if (daysLeft <= 28) {
    return {
      name: "yellow",
      strip: "bg-amber-400",
      badge: "bg-amber-50 text-amber-700 ring-amber-200",
      text: "text-amber-700"
    };
  }
  return {
    name: "green",
    strip: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    text: "text-emerald-700"
  };
}
