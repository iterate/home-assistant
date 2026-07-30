export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    work.catch(() => {});
  }
}

export function abortPromise(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError(signal)), {
      once: true,
    });
  });
}

export function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Operation aborted");
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError(signal));
      },
      { once: true },
    );
  });
}
