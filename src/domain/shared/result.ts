export type Result<T, E extends Error = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ success: true, value });
export const fail = <E extends Error>(error: E): Result<never, E> => ({ success: false, error });

export function isOk<T>(result: Result<T>): result is { success: true; value: T } {
  return result.success === true;
}

export function isFail<E extends Error>(result: Result<unknown, E>): result is { success: false; error: E } {
  return result.success === false;
}
