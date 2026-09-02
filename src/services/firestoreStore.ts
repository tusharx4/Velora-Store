/**
 * Low-level Firestore access layer.
 *
 * - Every call goes through `cloud()` which adds a timeout, records the
 *   connection status and trips a short "circuit breaker" after hard failures
 *   (rules denied / offline) so the UI never hangs waiting for Firebase.
 * - Password hashing helpers (PBKDF2-SHA256 via Web Crypto) live here too so
 *   plain-text passwords are never written to Firestore or localStorage.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  type WhereFilterOp,
} from 'firebase/firestore';
import { firestoreDb } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

// ------------------------------------------------------------------
// Collections & document ids
// ------------------------------------------------------------------
export const COL = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  BANNERS: 'banners',
  SETTINGS: 'settings',
  ORDERS: 'orders',
  USERS: 'users',
} as const;

export const SETTINGS_DOC_ID = 'store';
export const META_DOC_ID = 'catalog_meta';

// ------------------------------------------------------------------
// Connection status + circuit breaker
// ------------------------------------------------------------------
const TIMEOUT_MS = 7000;
const BREAKER_MS = 45_000;
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

export class CloudError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

export const isCloudPaused = (): boolean => Date.now() < cloudStatus.pausedUntil;
export const resetCloudBreaker = (): void => {
  cloudStatus.pausedUntil = 0;
};

function errorCode(err: unknown): string {
  if (err instanceof CloudError) return err.code;
  const maybe = err as { code?: unknown; message?: unknown } | null;
  const message = typeof maybe?.message === 'string' ? maybe.message : '';
  let code = 'unknown';
  if (maybe && typeof maybe.code === 'string' && maybe.code) {
    code = maybe.code.replace(/^firestore\//, '');
  }
  // Distinguish "project not set up yet" from a real rules denial so the UI can show the right fix
  if (code === 'permission-denied' && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    return 'api-disabled'; // Cloud Firestore API never enabled → no database created yet
  }
  if (code === 'not-found' && /does not exist/i.test(message)) {
    return 'database-missing'; // API enabled but the database itself was never created
  }
  return code;
}

function markOk(): void {
  cloudStatus.connected = true;
  cloudStatus.checkedAt = new Date().toISOString();
  cloudStatus.lastError = null;
  cloudStatus.lastErrorCode = null;
  cloudStatus.pausedUntil = 0;
}

function markFail(err: unknown): CloudError {
  const code = errorCode(err);
  const message = err instanceof Error ? err.message : String(err);
  cloudStatus.connected = false;
  cloudStatus.checkedAt = new Date().toISOString();
  cloudStatus.lastError = message;
  cloudStatus.lastErrorCode = code;
  if (BREAKER_CODES.has(code)) {
    cloudStatus.pausedUntil = Date.now() + BREAKER_MS;
  }
  console.warn(`[Velora cloud] ${code}: ${message}`);
  return err instanceof CloudError ? err : new CloudError(message, code);
}

/** Run a Firestore operation with timeout + status bookkeeping. */
export async function cloud<T>(op: () => Promise<T>, timeoutMs: number = TIMEOUT_MS): Promise<T> {
  if (isCloudPaused()) {
    throw new CloudError(
      `Cloud sync paused after a recent failure (${cloudStatus.lastErrorCode || 'unknown'})`,
      cloudStatus.lastErrorCode || 'paused'
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new CloudError(`Firestore request timed out after ${timeoutMs}ms`, 'timeout')),
      timeoutMs
    );
  });

  try {
    const result = await Promise.race([op(), timeout]);
    markOk();
    return result;
  } catch (err) {
    throw markFail(err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Firestore rejects `undefined` values – strip them via a JSON round-trip. */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ------------------------------------------------------------------
// CRUD helpers
// ------------------------------------------------------------------
const inflight = new Map<string, Promise<unknown>>();

/** Fetch every document of a collection (parallel callers share one request). */
export function fetchAll<T>(col: string): Promise<T[]> {
  const key = `all:${col}`;
  const existing = inflight.get(key) as Promise<T[]> | undefined;
  if (existing) return existing;

  const request = cloud(async () => {
    const snap = await getDocs(collection(firestoreDb, col));
    return snap.docs.map((d) => d.data() as T);
  }).finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}

export function fetchOne<T>(col: string, id: string): Promise<T | null> {
  return cloud(async () => {
    const snap = await getDoc(doc(firestoreDb, col, id));
    return snap.exists() ? (snap.data() as T) : null;
  });
}

export function fetchWhere<T>(col: string, field: string, op: WhereFilterOp, value: unknown): Promise<T[]> {
  return cloud(async () => {
    const snap = await getDocs(query(collection(firestoreDb, col), where(field, op, value)));
    return snap.docs.map((d) => d.data() as T);
  });
}

/** Create or overwrite a document (pass `merge = true` for a partial update). */
export function putDoc<T extends object>(col: string, id: string, data: T, merge: boolean = false): Promise<void> {
  return cloud(() => setDoc(doc(firestoreDb, col, id), toPlain(data), { merge }));
}

export function removeDoc(col: string, id: string): Promise<void> {
  return cloud(() => deleteDoc(doc(firestoreDb, col, id)));
}

/** Write many documents in batches of 400 (Firestore limit is 500 per batch). */
export function putMany<T extends object>(col: string, items: T[], idOf: (item: T) => string): Promise<void> {
  return cloud(async () => {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(firestoreDb);
      items.slice(i, i + 400).forEach((item) => {
        batch.set(doc(firestoreDb, col, idOf(item)), toPlain(item));
      });
      await batch.commit();
    }
  }, 20_000);
}

/** Delete every document in a collection. Returns the number of deleted docs. */
export function clearCollection(col: string): Promise<number> {
  return cloud(async () => {
    const snap = await getDocs(collection(firestoreDb, col));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(firestoreDb);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return snap.size;
  }, 30_000);
}

// ------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, 120k iterations, per-user salt)
// ------------------------------------------------------------------
const PBKDF2_ITERATIONS = 120_000;

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt(bytes: number = 16): string {
  const arr = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return toHex(arr);
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const encoder = new TextEncoder();
  const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

/** Weak non-cryptographic fallback – only used when Web Crypto is unavailable (plain http on a LAN IP). */
function fnv1a(input: string): string {
  const seeds = [0x811c9dc5, 0x9747b28c, 0x2f6b4a1d, 0x1b873593];
  const lanes = seeds.map((s) => s >>> 0);
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    for (let l = 0; l < lanes.length; l++) {
      lanes[l] = Math.imul(lanes[l] ^ c ^ l, 16777619) >>> 0;
    }
  }
  return lanes.map((h) => h.toString(16).padStart(8, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    return `pbkdf2$${PBKDF2_ITERATIONS}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
  }
  return `fnv$${fnv1a(`${salt}:${password}`)}`;
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const parts = expected.split('$');
  if (parts[0] === 'pbkdf2' && parts.length === 3) {
    if (!globalThis.crypto?.subtle) return false;
    const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
    return (await pbkdf2(password, salt, iterations)) === parts[2];
  }
  if (parts[0] === 'fnv' && parts.length === 2) {
    return fnv1a(`${salt}:${password}`) === parts[1];
  }
  return false;
}
