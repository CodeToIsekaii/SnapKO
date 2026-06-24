export async function runInventorySaveOperation(
  operation: () => Promise<void>,
  onError: (error: unknown) => void | Promise<void>,
  onFinally: () => void,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    await onError(error);
  } finally {
    onFinally();
  }
}
