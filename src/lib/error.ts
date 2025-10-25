// Represents a type with success and error values
type Result<T, E> = { value: T; success: true } | { value: E; success: false };

/**
 * Try catch wrapper for async functions
 */
export async function tryCatch<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  try {
    return {
      value: await promise,
      success: true,
    };
  } catch (error) {
    return {
      value: error as E,
      success: false,
    };
  }
}

export function tryCatchSync<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    return {
      value: fn(),
      success: true,
    };
  } catch (error) {
    return {
      value: error as E,
      success: false,
    };
  }
}