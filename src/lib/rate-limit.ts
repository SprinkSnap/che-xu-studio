export interface RateLimitBinding {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
}

export async function enforceRateLimit(
  limiter: RateLimitBinding | undefined,
  key: string,
): Promise<boolean> {
  if (!limiter) {
    // Local/dev without binding: allow, but log once in callers if needed.
    return true;
  }
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch {
    // Fail open on binding/infrastructure errors so contact/chat are not bricked.
    // Actual limit denials still return success: false above.
    return true;
  }
}
