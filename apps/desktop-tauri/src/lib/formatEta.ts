export function formatEta(seconds: number): string {
  const totalSeconds = Math.max(0, seconds);
  if (totalSeconds < 60 * 60) return `${Math.round(totalSeconds / 60)}m`;

  if (totalSeconds < 24 * 60 * 60) {
    return `${Math.round(totalSeconds / 60 / 60)}h`;
  }

  return `${Math.round(totalSeconds / 60 / 60 / 24)}d`;
}

/**
 * Compact two-unit duration for elapsed / reset-remaining display:
 * `49m`, `1h 30m`, `2d 4h`. Returns null for missing or negative input.
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}
