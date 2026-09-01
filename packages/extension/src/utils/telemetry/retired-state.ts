type StorageRemover = {
  remove(keys: string[]): Promise<void>;
};

type CleanupErrorReporter = (message: string, context: { error: unknown }) => void;

export const RETIRED_TELEMETRY_KEYS = [
  'telemetryEnabled',
  'telemetryGatewayUrl',
  'telemetryGatewayToken',
  'telemetry.installId',
] as const;

export async function clearRetiredTelemetryState(
  storage: StorageRemover,
  databases?: Pick<IDBFactory, 'deleteDatabase'>,
  onError?: CleanupErrorReporter,
): Promise<void> {
  try {
    await storage.remove([...RETIRED_TELEMETRY_KEYS]);
    if (!databases) return;

    await new Promise<void>((resolve, reject) => {
      const request = databases.deleteDatabase('proso_usage');
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error('telemetry database cleanup failed'));
      request.onblocked = () => reject(new Error('telemetry database cleanup was blocked'));
    });
  } catch (error) {
    onError?.('Retired telemetry cleanup failed', { error });
  }
}
