export function computeNextSendAt(frequency: string, time: string, dayOfWeek: number | null): string {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (frequency === "daily") {
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  // weekly
  const targetDay = dayOfWeek ?? now.getDay();
  let daysUntil = (targetDay - next.getDay() + 7) % 7;
  if (daysUntil === 0 && next <= now) daysUntil = 7;
  next.setDate(next.getDate() + daysUntil);
  return next.toISOString();
}
