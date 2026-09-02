/**
 * Shared Firebase connection state + circuit breaker.
 *
 * When Firestore is unreachable (rules not published, database not created,
 * offline…) every cloud call fails fast for the next BREAK_WINDOW_MS instead of
 * hanging on network timeouts. The pause is persisted in localStorage so a page
 * reload does not pay the timeout cost again. Any successful call clears it.
 */
import firebaseConfig from '../../firebase-applet-config.json';

export const CLOUD_TIMEOUT_MS = 4000;
const BREAK_WINDOW_MS = 90_000;
const LS_BREAKER = 'velora_cloud_breaker_until';

export class CloudError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

export interface CloudStatus {
  projectId: string;
  databaseId: string;
  connected: boolean;
  checkedAt: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  pausedUntil: number;
}

export const cloudStatus: CloudStatus = {
  projectId: firebaseConfig.projectId,
  databaseId: (firebaseConfig.firestoreDatabaseId || '').trim() || '(default)',
  connected: false,
  checkedAt: null,
  lastError: null,
  lastErrorCode: null,
  pausedUntil: 0,
};

const BREAKER_CODES = new Set([
  'permission-denied',
  'unauthenticated',
  'unavailable',
  'failed-precondition',
  'not-found',
  'timeout',
  'api-disabled',
  'database-missing',
]);

export function errorCode(err: unknown): string {
  if (err instanceof CloudError) return err.code;
  const maybe = err as { code?: unknown; message?: unknown } | null;
  const message = typeof maybe?.message === 'string' ? maybe.message : '';
  let code = 'unknown';
  if (maybe && typeof maybe.code === 'string' && maybe.code) {
    code = maybe.code.replace(/^firestore\//, '');
  }
  // Distinguish "project not set up yet" from a real rules denial
  if (code === 'permission-denied' && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    return 'api-disabled';
  }
  if (code === 'not-found' && /does not exist/i.test(message)) {
    return 'database-missing';
  }
  return code;
}

function storedUntil(): number {
  try {
    return Number(localStorage.getItem(LS_BREAKER)) || 0;
  } catch {
    return 0;
  }
}

export function isCloudPaused(): boolean {
  return Date.now() < Math.max(cloudStatus.pausedUntil, storedUntil());
}

export function resetCloudBreaker(): void {
  cloudStatus.pausedUntil = 0;
  try {
    localStorage.removeItem(LS_BREAKER);
  } catch {
    /* ignore */
  }
}

export function noteSuccess(): void {
  cloudStatus.connected = true;
  cloudStatus.checkedAt = new Date().toISOString();
  cloudStatus.lastError = null;
  cloudStatus.lastErrorCode = null;
  cloudStatus.pausedUntil = 0;
  try {
    localStorage.removeItem(LS_BREAKER);
  } catch {
    /* ignore */
  }
}

export function noteFailure(err: unknown): CloudError {
  const code = errorCode(err);
  const message = err instanceof Error ? err.message : String(err);
  cloudStatus.connected = false;
  cloudStatus.checkedAt = new Date().toISOString();
  cloudStatus.lastError = message;
  cloudStatus.lastErrorCode = code;
  if (BREAKER_CODES.has(code)) {
    cloudStatus.pausedUntil = Date.now() + BREAK_WINDOW_MS;
    try {
      localStorage.setItem(LS_BREAKER, String(cloudStatus.pausedUntil));
    } catch {
      /* ignore */
    }
  }
  console.warn(`[Velora cloud] ${code}: ${message}`);
  return err instanceof CloudError ? err : new CloudError(message, code);
}
