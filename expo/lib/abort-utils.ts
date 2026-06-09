export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
}

export function isAbortLikeError(error: unknown): boolean {
  const name = error instanceof Error ? error.name.toLowerCase() : '';
  const message = toErrorMessage(error).toLowerCase();

  return name === 'aborterror'
    || message.includes('signal is aborted')
    || message.includes('aborted')
    || message.includes('aborterror')
    || message.includes('timed out');
}

export async function runWithAbortTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMessage?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error(timeoutMessage ?? `Request timed out after ${timeoutMs}ms`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(toErrorMessage(error));
  } finally {
    clearTimeout(timeout);
  }
}
