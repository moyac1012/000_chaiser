export const REPLAY_SPOILER_DELAY_MS = 3 * 60 * 1000;

export function getReplayAvailableAt(value: string | number | Date): string {
  const createdAt = new Date(value);
  return new Date(createdAt.getTime() + REPLAY_SPOILER_DELAY_MS).toISOString();
}

export function isReplayVisible(value: string | number | Date): boolean {
  return Date.now() >= new Date(getReplayAvailableAt(value)).getTime();
}
