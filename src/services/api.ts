/**
 * Data layer for the VELORA storefront + admin suite.
 *
 * Firestore is the source of truth (shared across every device / visitor).
 * localStorage acts as an offline cache and as a fallback when Firestore is
 * unreachable (e.g. security rules not published yet). All write helpers keep
 * the local mirror in sync so the UI stays consistent either way.
 */
import {
  Product,
  Category,
  BannerSlide,
  StoreSettings,
  Order,
  AnalyticsSummary,
  OrderStatus,
  UserAccount,
  UserRole,
} from '../types';
import {
  INITIAL_PRODUCTS,
  INITIAL_CATEGORIES,
  INITIAL_BANNERS,
  INITIAL_SETTINGS,
  INITIAL_ORDERS,
  INITIAL_USERS,
  StoredUser,
  resolvePexelsUrl,
} from '../data/initialData';
import {
  COL,
  SETTINGS_DOC_ID,
  META_DOC_ID,
  CloudError,
  type CloudStatus,
  cloudStatus,
  fetchAll,
  fetchOne,
  fetchWhere,
  putDoc,
  putMany,
  removeDoc,
  clearCollection,
  hashPassword,
  verifyPassword,
  randomSalt,
  resetCloudBreaker,
} from './firestoreStore';

// ==========================================================
// Types & constants
// ==========================================================
type WithSort<T> = T & { sortIndex?: number };

interface CloudUser extends StoredUser {
  passwordHash?: string;
  passwordSalt?: string;
}

interface CatalogMeta {
  seeded: boolean;
  seededAt?: string;
  version?: number;
}

const PRIMARY_ADMIN_EMAILS = ['ariyantushar44@gmail.com', 'admin@velora.com'];
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=900&q=80';

const LS_KEYS = {
  USERS: 'velora_users_db',
  SESSION: 'velora_user_session',
  TOKEN: 'velora_auth_token',
  PRODUCTS: 'velora_products_db',
  ORDERS: 'velora_orders_db',
  SETTINGS: 'velora_settings_db',
  CATEGORIES: 'velora_categories_db',
  BANNERS: 'velora_banners_db',
};

const isStaffRole = (role?: UserRole): boolean => role === 'admin' || role === 'moderator';
const isPrimaryAdminUser = (u: { email: string; isPrimaryAdmin?: boolean }): boolean =>
  !!u.isPrimaryAdmin || PRIMARY_ADMIN_EMAILS.includes(u.email.toLowerCase());

const nowIso = () => new Date().toISOString();
const digitsOf = (v: string) => v.replace(/\D/g, '');
const last10 = (v: string) => {
  const d = digitsOf(v);
  return d.length >= 10 ? d.slice(-10) : d;
};
const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const shortId = () => Math.random().toString(36).slice(2, 7);

// ==========================================================
// localStorage cache helpers
// ==========================================================
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not persist ${key}:`, e);
  }
}

function getLocalUsers(): CloudUser[] {
  const parsed = readJson<CloudUser[]>(LS_KEYS.USERS);
  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  const defaults: CloudUser[] = INITIAL_USERS.map((u) => ({ ...u }));
  writeJson(LS_KEYS.USERS, defaults);
  return defaults;
}
const saveLocalUsers = (users: CloudUser[]) => writeJson(LS_KEYS.USERS, users);

function upsertLocalUser(user: CloudUser): void {
  const users = getLocalUsers();
  const record: CloudUser = { ...user };
  if (record.passwordHash) delete record.password; // never keep plain text next to a hash
  const idx = users.findIndex((u) => u.id === record.id || u.email.toLowerCase() === record.email.toLowerCase());
  if (idx >= 0) users[idx] = { ...users[idx], ...record };
  else users.push(record);
  saveLocalUsers(users);
}

function getLocalProducts(): Product[] {
  const parsed = readJson<Product[]>(LS_KEYS.PRODUCTS);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...INITIAL_PRODUCTS];
}
const saveLocalProducts = (list: Product[]) => writeJson(LS_KEYS.PRODUCTS, list);

function getLocalCategories(): Category[] {
  const parsed = readJson<Category[]>(LS_KEYS.CATEGORIES);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...INITIAL_CATEGORIES];
}
const saveLocalCategories = (list: Category[]) => writeJson(LS_KEYS.CATEGORIES, list);

function getLocalBanners(): BannerSlide[] {
  const parsed = readJson<BannerSlide[]>(LS_KEYS.BANNERS);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...INITIAL_BANNERS];
}
const saveLocalBanners = (list: BannerSlide[]) => writeJson(LS_KEYS.BANNERS, list);

function getLocalOrders(): Order[] {
  const parsed = readJson<Order[]>(LS_KEYS.ORDERS);
  return Array.isArray(parsed) ? parsed : [...INITIAL_ORDERS];
}
const saveLocalOrders = (list: Order[]) => writeJson(LS_KEYS.ORDERS, list);

// Store settings never carry the admin password (it lives in the users collection only)
function stripAdminPassword(settings: StoreSettings): StoreSettings {
  const { adminPassword: _omit, ...rest } = settings;
  return rest as StoreSettings;
}

function getLocalSettings(): StoreSettings {
  const parsed = readJson<Partial<StoreSettings>>(LS_KEYS.SETTINGS);
  return stripAdminPassword({ ...INITIAL_SETTINGS, ...(parsed || {}) });
}
const saveLocalSettings = (s: StoreSettings) => writeJson(LS_KEYS.SETTINGS, stripAdminPassword(s));

// ==========================================================
// Session helpers
// ==========================================================
const readSession = (): UserAccount | null => readJson<UserAccount>(LS_KEYS.SESSION);
function writeSession(user: UserAccount, token?: string): void {
  writeJson(LS_KEYS.SESSION, user);
  if (token) localStorage.setItem(LS_KEYS.TOKEN, token);
}
function clearSession(): void {
  localStorage.removeItem(LS_KEYS.SESSION);
  localStorage.removeItem(LS_KEYS.TOKEN);
  sessionStorage.removeItem('velora_admin_token');
}
const newToken = () => `velora_token_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
const hasStaffSession = (): boolean => isStaffRole(readSession()?.role);

function sanitizeUser(user: CloudUser | UserAccount): UserAccount {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isPrimaryAdmin: isPrimaryAdminUser(user),
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    avatar: user.avatar,
  };
}

// ==========================================================
// Cloud error → friendly message
// ==========================================================
function cloudErrorMessage(action: string, err: unknown): string {
  const code = err instanceof CloudError ? err.code : (err as { code?: string } | null)?.code || 'unknown';
  const kept = 'The change was kept on this device only.';
  if (code === 'api-disabled' || code === 'database-missing' || code === 'not-found') {
    return `${action} could not sync: the Firestore database has not been created in Firebase project "${cloudStatus.projectId}" yet. Open Firebase Console → Build → Firestore Database → Create database, then publish firestore.rules and try again. ${kept}`;
  }
  if (code === 'permission-denied') {
    return `${action} could not sync to Firebase: permission denied. Publish the Firestore security rules (firestore.rules) in the Firebase console (Firestore Database → Rules → Publish), then try again. ${kept}`;
  }
  if (code === 'timeout' || code === 'unavailable' || code === 'paused') {
    return `${action} could not reach Firebase (${code}). Check your internet connection and try again. ${kept}`;
  }
  return `${action} could not sync to Firebase (${code}). ${kept}`;
}

// ==========================================================
// Users (Firestore `users` collection)
// ==========================================================
async function loadCloudUsers(): Promise<CloudUser[] | null> {
  try {
    return await fetchAll<CloudUser>(COL.USERS);
  } catch {
    return null;
  }
}

/** Make sure the staff accounts from the seed data exist in Firestore (hashed). */
async function seedStaffAccounts(existing: CloudUser[]): Promise<CloudUser[]> {
  if (existing.some((u) => u.role === 'admin')) return existing;

  const toSeed: CloudUser[] = [];
  for (const seed of INITIAL_USERS) {
    if (seed.role === 'customer') continue;
    if (existing.some((u) => u.email.toLowerCase() === seed.email.toLowerCase())) continue;
    const passwordSalt = randomSalt();
    const passwordHash = await hashPassword(seed.password || 'admin123', passwordSalt);
    const { password: _pw, ...rest } = seed;
    toSeed.push({
      ...rest,
      email: rest.email.toLowerCase(),
      isPrimaryAdmin: isPrimaryAdminUser(rest),
      passwordHash,
      passwordSalt,
    });
  }
  if (toSeed.length === 0) return existing;
  await putMany(COL.USERS, toSeed, (u) => u.id);
  return [...existing, ...toSeed];
}

function findUserMatch<T extends { id: string; email: string; phone?: string; role: UserRole; isPrimaryAdmin?: boolean }>(
  users: T[],
  identifier: string
): T | undefined {
  const input = identifier.trim().toLowerCase();
  if (!input) return undefined;
  const phoneLookup = /^[\d\s+\-()]+$/.test(input) && digitsOf(input).length >= 10;

  return (
    users.find(
      (u) =>
        u.email.toLowerCase() === input ||
        u.id === identifier ||
        (phoneLookup && !!u.phone && last10(u.phone) === last10(input)) ||
        (input === 'admin' && isPrimaryAdminUser(u))
    ) || (input === 'admin' ? users.find((u) => u.role === 'admin') : undefined)
  );
}

async function checkPassword(user: CloudUser, raw: string): Promise<boolean> {
  if (!raw) return false;
  if (user.passwordHash && user.passwordSalt) return verifyPassword(raw, user.passwordSalt, user.passwordHash);
  if (typeof user.password === 'string' && user.password.length > 0) return user.password === raw;

  // No credential on record (account created by an older version): accept the seed default
  // for that email, or the password stored on this device.
  const seed = INITIAL_USERS.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
  if (seed?.password) return seed.password === raw;
  const local = getLocalUsers().find((u) => u.email.toLowerCase() === user.email.toLowerCase());
  if (local?.passwordHash && local.passwordSalt) return verifyPassword(raw, local.passwordSalt, local.passwordHash);
  if (local?.password) return local.password === raw;
  return false;
}

async function withNewPassword(user: CloudUser, raw: string): Promise<CloudUser> {
  const passwordSalt = randomSalt();
  const passwordHash = await hashPassword(raw, passwordSalt);
  const next: CloudUser = { ...user, passwordHash, passwordSalt };
  delete next.password;
  return next;
}

// ==========================================================
// Catalog (products / categories / banners / settings)
// ==========================================================
function sortBySortIndex<T extends { sortIndex?: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

/** Read a catalog collection from Firestore, mirroring it locally; fall back to the local cache. */
async function loadCollection<T extends object>(col: string, local: () => T[], save: (items: T[]) => void): Promise<T[]> {
  try {
    const items = await fetchAll<WithSort<T>>(col);
    if (items.length > 0) {
      const sorted = sortBySortIndex(items);
      save(sorted);
      return sorted;
    }
    const meta = await fetchOne<CatalogMeta>(COL.SETTINGS, META_DOC_ID).catch(() => null);
    if (meta?.seeded) return []; // genuinely empty (admin removed everything)
    return local(); // cloud not seeded yet → show the default catalog
  } catch {
    return local();
  }
}

async function loadSettings(): Promise<StoreSettings> {
  try {
    const cloud = await fetchOne<StoreSettings>(COL.SETTINGS, SETTINGS_DOC_ID);
    if (cloud) {
      const merged = stripAdminPassword({ ...INITIAL_SETTINGS, ...cloud });
      saveLocalSettings(merged);
      return merged;
    }
    return getLocalSettings();
  } catch {
    return getLocalSettings();
  }
}

interface CatalogSource {
  products: Product[];
  categories: Category[];
  banners: BannerSlide[];
  settings: StoreSettings;
}

async function seedCatalog(source: CatalogSource, force: boolean): Promise<void> {
  let prods: Product[] = [];
  let cats: Category[] = [];
  let bans: BannerSlide[] = [];
  let settings: StoreSettings | null = null;
  try {
    if (force) {
      settings = await fetchOne<StoreSettings>(COL.SETTINGS, SETTINGS_DOC_ID);
    } else {
      const r = await Promise.all([
        fetchAll<Product>(COL.PRODUCTS),
        fetchAll<Category>(COL.CATEGORIES),
        fetchAll<BannerSlide>(COL.BANNERS),
        fetchOne<StoreSettings>(COL.SETTINGS, SETTINGS_DOC_ID),
      ]);
      prods = r[0];
      cats = r[1];
      bans = r[2];
      settings = r[3];
    }
  } catch {
    return; // cannot inspect the cloud right now – leave it untouched
  }

  if (prods.length === 0) {
    await putMany(COL.PRODUCTS, source.products.map((p, i) => ({ ...p, sortIndex: i })), (p) => p.id);
  }
  if (cats.length === 0) {
    await putMany(COL.CATEGORIES, source.categories.map((c, i) => ({ ...c, sortIndex: i })), (c) => c.slug);
  }
  if (bans.length === 0) {
    await putMany(COL.BANNERS, source.banners.map((b, i) => ({ ...b, sortIndex: i })), (b) => b.id);
  }
  if (!settings) {
    await putDoc(COL.SETTINGS, SETTINGS_DOC_ID, stripAdminPassword(source.settings));
  }
  const meta: CatalogMeta = { seeded: true, seededAt: nowIso(), version: 1 };
  await putDoc(COL.SETTINGS, META_DOC_ID, meta);
}

let seedPromise: Promise<void> | null = null;

/** First time a staff member uses the cloud, copy the catalog (local cache or defaults) into Firestore. */
function ensureCatalogSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        // Never block writes on this check: cap the probe and swallow every error.
        const meta = await Promise.race([
          fetchOne<CatalogMeta>(COL.SETTINGS, META_DOC_ID),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        if (meta?.seeded) return;
        await seedCatalog(
          {
            products: getLocalProducts(),
            categories: getLocalCategories(),
            banners: getLocalBanners(),
            settings: getLocalSettings(),
          },
          false
        );
      } catch (err) {
        console.warn('Catalog seeding skipped (cloud unavailable):', err);
        seedPromise = null; // allow a retry on the next staff action
      }
    })();
  }
  return seedPromise;
}

// ==========================================================
// Orders
// ==========================================================
const sortOrdersDesc = (list: Order[]): Order[] =>
  [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

async function loadOrders(): Promise<Order[]> {
  if (!hasStaffSession()) return getLocalOrders();
  try {
    const cloud = await fetchAll<Order>(COL.ORDERS);
    const sorted = sortOrdersDesc(cloud);
    saveLocalOrders(sorted);
    return sorted;
  } catch {
    return sortOrdersDesc(getLocalOrders());
  }
}

const generateOrderId = () => `VEL-${String(Date.now()).slice(-6)}`;

// ==========================================================
// Public API
// ==========================================================
export const api = {
  // ------------------------------------------------------
  // CLOUD STATUS
  // ------------------------------------------------------
  getCloudStatus(): CloudStatus {
    return { ...cloudStatus };
  },

  /** Instant offline-first snapshot so the storefront paints without waiting for the network. */
  localSnapshot(): {
    products: Product[];
    categories: Category[];
    banners: BannerSlide[];
    settings: StoreSettings;
    orders: Order[];
  } {
    return {
      products: getLocalProducts(),
      categories: getLocalCategories(),
      banners: getLocalBanners(),
      settings: getLocalSettings(),
      orders: getLocalOrders(),
    };
  },

  async checkCloud(): Promise<CloudStatus> {
    resetCloudBreaker();
    try {
      await fetchOne<CatalogMeta>(COL.SETTINGS, META_DOC_ID);
    } catch {
      /* status recorded by the store layer */
    }
    return { ...cloudStatus };
  },

  // ------------------------------------------------------
  // AUTHENTICATION & SESSION
  // ------------------------------------------------------
  async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; token: string; user: UserAccount; message: string }> {
    const identifier = email.trim();
    const raw = password.trim();
    if (!identifier || !raw) throw new Error('Please enter your email or phone number and password.');

    let cloudUsers = await loadCloudUsers();
    if (cloudUsers) {
      try {
        cloudUsers = await seedStaffAccounts(cloudUsers);
      } catch (err) {
        console.warn('Staff account seeding skipped:', err);
      }
    }

    let matched: CloudUser | undefined = cloudUsers ? findUserMatch(cloudUsers, identifier) : undefined;
    if (!matched) matched = findUserMatch(getLocalUsers(), identifier);
    if (!matched) {
      throw new Error('No account found with this email or phone number. Please create an account or verify your details.');
    }

    if (!(await checkPassword(matched, raw))) {
      throw new Error('Incorrect password. Please verify your password and try again.');
    }

    let user: CloudUser = { ...matched, email: matched.email.toLowerCase(), lastLogin: nowIso() };
    if (!user.passwordHash || !user.passwordSalt) {
      user = await withNewPassword(user, raw); // upgrade legacy plain-text credentials to a salted hash
    }
    upsertLocalUser(user);
    if (cloudUsers) {
      try {
        await putDoc(COL.USERS, user.id, user);
      } catch (err) {
        console.warn('Could not sync the user record to Firestore:', err);
      }
    }

    const sanitized = sanitizeUser(user);
    const token = newToken();
    writeSession(sanitized, token);

    if (isStaffRole(sanitized.role)) {
      await ensureCatalogSeeded().catch(() => {});
    }

    return { success: true, token, user: sanitized, message: `Welcome back, ${sanitized.name}!` };
  },

  async register(
    name: string,
    email: string,
    password: string,
    phone?: string
  ): Promise<{ success: boolean; token: string; user: UserAccount; message: string }> {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const raw = password.trim();
    const cleanPhone = (phone || '').trim();

    if (!cleanName || !cleanEmail || !raw) throw new Error('Name, email and password are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Please enter a valid email address.');
    if (raw.length < 5) throw new Error('Password must be at least 5 characters long.');

    const cloudUsers = await loadCloudUsers();
    const pool: CloudUser[] = cloudUsers ?? getLocalUsers();
    const existing =
      pool.find((u) => u.email.toLowerCase() === cleanEmail) ||
      (digitsOf(cleanPhone).length >= 10
        ? pool.find((u) => !!u.phone && last10(u.phone) === last10(cleanPhone))
        : undefined);

    let user: CloudUser;
    if (existing) {
      const hasCredential = !!(existing.passwordHash || existing.password);
      if (hasCredential || isStaffRole(existing.role)) {
        throw new Error('An account with this email or phone number already exists. Please sign in instead.');
      }
      // Legacy customer account without a password → let the owner claim it
      user = await withNewPassword(
        { ...existing, name: existing.name || cleanName, phone: existing.phone || cleanPhone || undefined, lastLogin: nowIso() },
        raw
      );
    } else {
      user = await withNewPassword(
        {
          id: `usr_${Date.now()}_${shortId()}`,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone || undefined,
          role: 'customer',
          createdAt: nowIso(),
          lastLogin: nowIso(),
        },
        raw
      );
    }

    upsertLocalUser(user);
    if (cloudUsers) {
      try {
        await putDoc(COL.USERS, user.id, user);
      } catch (err) {
        console.warn('Could not sync the new account to Firestore:', err);
      }
    }

    const sanitized = sanitizeUser(user);
    const token = newToken();
    writeSession(sanitized, token);
    return { success: true, token, user: sanitized, message: 'Account created successfully!' };
  },

  getCurrentUser(): UserAccount | null {
    return readSession();
  },

  async fetchCurrentUser(): Promise<UserAccount | null> {
    const session = readSession();
    if (!session) return null;

    let cloudUsers = await loadCloudUsers();
    if (!cloudUsers) return session; // offline → trust the cached session
    try {
      cloudUsers = await seedStaffAccounts(cloudUsers);
    } catch {
      /* ignore */
    }

    const live =
      cloudUsers.find((u) => u.id === session.id) ||
      cloudUsers.find((u) => u.email.toLowerCase() === session.email.toLowerCase());

    if (!live) {
      const local = getLocalUsers().find(
        (u) => u.id === session.id || u.email.toLowerCase() === session.email.toLowerCase()
      );
      if (local) {
        // Account only exists on this device (older version) → push it to the cloud
        try {
          await putDoc(COL.USERS, local.id, local);
        } catch {
          /* ignore */
        }
        return session;
      }
      clearSession(); // account was removed by an administrator
      return null;
    }

    const refreshed = sanitizeUser(live);
    writeSession(refreshed);
    if (isStaffRole(refreshed.role)) ensureCatalogSeeded().catch(() => {});
    return refreshed;
  },

  logout(): void {
    clearSession();
  },

  async changePassword(
    email: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const next = newPassword.trim();
    if (next.length < 5) throw new Error('New password must be at least 5 characters long.');

    const cloudUsers = await loadCloudUsers();
    const pool = cloudUsers ?? getLocalUsers();
    const target = findUserMatch(pool, email);
    if (!target) throw new Error('User not found');

    // An administrator may reset another (non-primary) user's password without knowing it
    const session = readSession();
    const adminReset = session?.role === 'admin' && session.id !== target.id && !isPrimaryAdminUser(target);
    if (!adminReset && !(await checkPassword(target, currentPassword.trim()))) {
      throw new Error('Current password does not match.');
    }

    const updated = await withNewPassword(target, next);
    upsertLocalUser(updated);
    try {
      await putDoc(COL.USERS, updated.id, updated);
    } catch (err) {
      throw new Error(cloudErrorMessage('Password change', err));
    }
    return { success: true, message: 'Password updated successfully!' };
  },

  /** Master admin password – applies to every administrator account, on every device. */
  async setAdminPassword(newPassword: string): Promise<{ success: boolean; message: string }> {
    const pass = (newPassword || '').trim();
    if (pass.length < 5) throw new Error('Admin password must be at least 5 characters long.');

    let cloudUsers = await loadCloudUsers();
    if (cloudUsers) {
      try {
        cloudUsers = await seedStaffAccounts(cloudUsers);
      } catch {
        /* ignore */
      }
    }
    const pool = cloudUsers ?? getLocalUsers();

    let admins = pool.filter((u) => u.role === 'admin' || isPrimaryAdminUser(u));
    if (admins.length === 0) {
      admins = [
        {
          id: 'usr_admin_default',
          name: 'Store Owner',
          email: PRIMARY_ADMIN_EMAILS[1],
          role: 'admin',
          isPrimaryAdmin: true,
          createdAt: nowIso(),
        },
      ];
    }

    const updated: CloudUser[] = [];
    for (const admin of admins) updated.push(await withNewPassword(admin, pass));
    updated.forEach(upsertLocalUser);

    try {
      await putMany(COL.USERS, updated, (u) => u.id);
    } catch (err) {
      throw new Error(cloudErrorMessage('Admin password update', err));
    }

    return {
      success: true,
      message: `Admin password updated for ${updated.length} administrator account${updated.length === 1 ? '' : 's'}.`,
    };
  },

  // ------------------------------------------------------
  // PRODUCTS
  // ------------------------------------------------------
  async getProducts(params?: {
    category?: string;
    search?: string;
    tag?: string;
    sort?: string;
    stockOnly?: boolean;
    maxPrice?: number;
    flash?: boolean;
  }): Promise<{ total: number; products: Product[] }> {
    let list = await loadCollection<Product>(COL.PRODUCTS, getLocalProducts, saveLocalProducts);

    if (params?.flash) list = list.filter((p) => p.flashSale);
    if (params?.category && params.category !== 'all') list = list.filter((p) => p.cat === params.category);
    if (params?.tag && params.tag !== 'all') list = list.filter((p) => p.tags.includes(String(params.tag)));
    if (params?.stockOnly) list = list.filter((p) => p.stock > 0);
    if (params?.maxPrice && !isNaN(params.maxPrice)) list = list.filter((p) => p.price <= Number(params.maxPrice));
    if (params?.search) {
      const s = params.search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.bn.toLowerCase().includes(s) ||
          p.tags.some((t) => t.toLowerCase().includes(s))
      );
    }

    if (params?.sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
    else if (params?.sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
    else if (params?.sort === 'new') list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));

    return { total: list.length, products: list };
  },

  async getProduct(slugOrId: string): Promise<Product> {
    const list = await loadCollection<Product>(COL.PRODUCTS, getLocalProducts, saveLocalProducts);
    const p = list.find((item) => item.slug === slugOrId || item.id === slugOrId);
    if (!p) throw new Error('Product not found');
    return p;
  },

  async createProduct(product: Partial<Product>): Promise<Product> {
    const rawImgs = Array.isArray(product.imgs) && product.imgs.length > 0 ? product.imgs : [FALLBACK_IMAGE];
    const newP: WithSort<Product> = {
      id: `p_${Date.now()}`,
      slug: slugify(product.name || 'item'),
      name: product.name || 'New Boutique Item',
      bn: product.bn || product.name || 'নতুন আইটেম',
      price: product.price || 1000,
      was: product.was,
      cat: product.cat || 'ethnic',
      stock: product.stock !== undefined ? product.stock : 20,
      imgs: rawImgs,
      img: rawImgs.map(resolvePexelsUrl),
      tags: product.tags || ['boutique', 'luxury'],
      sizes: product.sizes || ['Standard'],
      colors: product.colors || [{ n: 'Classic', h: '#000000' }],
      rating: 5.0,
      rc: 1,
      d: product.d || 'Handcrafted luxury piece with artisan detailing.',
      db: product.db || 'অভিজাত কারুকাজের প্রিমিয়াম কোয়ালিটি পোশাক।',
      featured: !!product.featured,
      flashSale: !!product.flashSale,
      flashSaleDiscountPercent: product.flashSaleDiscountPercent,
      flashSaleEndsAt: product.flashSaleEndsAt,
      createdAt: nowIso(),
      sortIndex: -Date.now(), // newest products first
    };

    const list = getLocalProducts();
    list.unshift(newP);
    saveLocalProducts(list);

    try {
      await ensureCatalogSeeded();
      await putDoc(COL.PRODUCTS, newP.id, newP);
    } catch (err) {
      throw new Error(cloudErrorMessage('Saving the product', err));
    }
    return newP;
  },

  async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
    const list = getLocalProducts();
    const idx = list.findIndex((p) => p.id === id || p.slug === id);
    let base: Product | null = idx >= 0 ? list[idx] : null;
    if (!base) {
      try {
        const cloudList = await fetchAll<Product>(COL.PRODUCTS);
        base = cloudList.find((p) => p.id === id || p.slug === id) || null;
      } catch {
        /* ignore */
      }
    }
    if (!base) throw new Error('Product not found');

    const merged: Product = { ...base, ...product };
    if (product.imgs && !product.img) merged.img = product.imgs.map(resolvePexelsUrl);

    if (idx >= 0) list[idx] = merged;
    else list.unshift(merged);
    saveLocalProducts(list);

    try {
      await ensureCatalogSeeded();
      await putDoc(COL.PRODUCTS, merged.id, merged);
    } catch (err) {
      throw new Error(cloudErrorMessage('Updating the product', err));
    }
    return merged;
  },

  async deleteProduct(id: string): Promise<void> {
    const list = getLocalProducts();
    const target = list.find((p) => p.id === id || p.slug === id);
    const docId = target?.id || id;
    saveLocalProducts(list.filter((p) => p.id !== docId && p.slug !== id));

    try {
      await ensureCatalogSeeded();
      await removeDoc(COL.PRODUCTS, docId);
    } catch (err) {
      throw new Error(cloudErrorMessage('Deleting the product', err));
    }
  },

  // ------------------------------------------------------
  // CATEGORIES
  // ------------------------------------------------------
  async getCategories(): Promise<Category[]> {
    return loadCollection<Category>(COL.CATEGORIES, getLocalCategories, saveLocalCategories);
  },

  async createCategory(cat: Partial<Category>): Promise<Category> {
    const newCat: WithSort<Category> = {
      slug: cat.slug ? slugify(cat.slug) : slugify(cat.name || 'cat'),
      name: cat.name || 'New Category',
      bn: cat.bn || cat.name || 'নতুন ক্যাটাগরি',
      d: cat.d || '',
      img: cat.img || 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=900&q=80',
      sortIndex: Date.now(), // new categories go last
    };

    const list = getLocalCategories().filter((c) => c.slug !== newCat.slug);
    list.push(newCat);
    saveLocalCategories(list);

    try {
      await ensureCatalogSeeded();
      await putDoc(COL.CATEGORIES, newCat.slug, newCat);
    } catch (err) {
      throw new Error(cloudErrorMessage('Saving the category', err));
    }
    return newCat;
  },

  async deleteCategory(slug: string): Promise<void> {
    saveLocalCategories(getLocalCategories().filter((c) => c.slug !== slug));
    try {
      await ensureCatalogSeeded();
      await removeDoc(COL.CATEGORIES, slug);
    } catch (err) {
      throw new Error(cloudErrorMessage('Deleting the category', err));
    }
  },

  // ------------------------------------------------------
  // BANNERS
  // ------------------------------------------------------
  async getBanners(): Promise<BannerSlide[]> {
    return loadCollection<BannerSlide>(COL.BANNERS, getLocalBanners, saveLocalBanners);
  },

  async createBanner(banner: Partial<BannerSlide>): Promise<BannerSlide> {
    const newBanner: WithSort<BannerSlide> = {
      id: banner.id || `b_${Date.now()}`,
      t: banner.t || 'New Collection',
      bn: banner.bn || banner.t || 'নতুন কালেকশন',
      s: banner.s || '',
      img: banner.img || 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1600&q=80',
      cta: banner.cta || 'Shop Now',
      href: banner.href || 'shop',
      sortIndex: Date.now(),
    };

    const list = getLocalBanners().filter((b) => b.id !== newBanner.id);
    list.push(newBanner);
    saveLocalBanners(list);

    try {
      await ensureCatalogSeeded();
      await putDoc(COL.BANNERS, newBanner.id, newBanner);
    } catch (err) {
      throw new Error(cloudErrorMessage('Saving the banner', err));
    }
    return newBanner;
  },

  async deleteBanner(id: string): Promise<void> {
    saveLocalBanners(getLocalBanners().filter((b) => b.id !== id));
    try {
      await ensureCatalogSeeded();
      await removeDoc(COL.BANNERS, id);
    } catch (err) {
      throw new Error(cloudErrorMessage('Deleting the banner', err));
    }
  },

  // ------------------------------------------------------
  // ORDERS
  // ------------------------------------------------------
  async getOrders(params?: { status?: string; search?: string }): Promise<{ total: number; orders: Order[] }> {
    let list = await loadOrders();
    if (params?.status && params.status !== 'all') list = list.filter((o) => o.status === params.status);
    if (params?.search) {
      const s = params.search.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(s) ||
          o.customerName.toLowerCase().includes(s) ||
          o.customerPhone.includes(s)
      );
    }
    return { total: list.length, orders: list };
  },

  async createOrder(orderData: Partial<Order>): Promise<Order> {
    const items = orderData.items || [];
    const subtotal = orderData.subtotal ?? items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const shippingFee = orderData.shippingFee ?? 0;
    const discount = orderData.discount || 0;
    const timestamp = nowIso();

    const order: Order = {
      id: orderData.id || generateOrderId(),
      customerName: orderData.customerName || 'Guest Customer',
      customerPhone: orderData.customerPhone || '',
      customerEmail: orderData.customerEmail,
      deliveryZone: orderData.deliveryZone || 'dhaka',
      address: orderData.address || '',
      city: orderData.city,
      note: orderData.note,
      items,
      subtotal,
      shippingFee,
      discount: orderData.discount,
      total: orderData.total ?? Math.max(0, subtotal + shippingFee - discount),
      paymentMethod: orderData.paymentMethod || 'cod',
      status: orderData.status || 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      trackingNumber: orderData.trackingNumber,
    };

    const local = getLocalOrders();
    local.unshift(order);
    saveLocalOrders(local);

    // Customers must never be blocked by a cloud hiccup – the WhatsApp flow still carries the order.
    try {
      await putDoc(COL.ORDERS, order.id, order);
    } catch (err) {
      console.warn('Order stored on this device only:', err);
    }
    return order;
  },

  async updateOrderStatus(id: string, status: OrderStatus, trackingNumber?: string): Promise<Order> {
    const local = getLocalOrders();
    const idx = local.findIndex((o) => o.id === id);
    let base: Order | null = idx >= 0 ? local[idx] : null;
    if (!base) {
      try {
        base = await fetchOne<Order>(COL.ORDERS, id);
      } catch {
        /* ignore */
      }
    }
    if (!base) throw new Error('Order not found');

    const patch: Partial<Order> = { status, updatedAt: nowIso() };
    if (trackingNumber !== undefined) patch.trackingNumber = trackingNumber;
    const updated: Order = { ...base, ...patch };

    if (idx >= 0) local[idx] = updated;
    else local.unshift(updated);
    saveLocalOrders(local);

    try {
      await putDoc(COL.ORDERS, id, patch, true);
    } catch (err) {
      throw new Error(cloudErrorMessage('Order status update', err));
    }
    return updated;
  },

  async deleteOrder(id: string): Promise<void> {
    saveLocalOrders(getLocalOrders().filter((o) => o.id !== id));
    try {
      await removeDoc(COL.ORDERS, id);
    } catch (err) {
      throw new Error(cloudErrorMessage('Deleting the order', err));
    }
  },

  async trackOrder(queryText: string): Promise<Order[]> {
    const term = queryText.trim();
    if (!term) return [];
    const upper = term.toUpperCase();
    const digits = digitsOf(term);
    const results = new Map<string, Order>();

    try {
      const byId = await fetchOne<Order>(COL.ORDERS, upper);
      if (byId) results.set(byId.id, byId);

      if (digits.length >= 10) {
        const tail = digits.slice(-10);
        const variants = Array.from(new Set([term, digits, `0${tail}`, `880${tail}`, `+880${tail}`]));
        const found = await Promise.all(variants.map((v) => fetchWhere<Order>(COL.ORDERS, 'customerPhone', '==', v)));
        found.flat().forEach((o) => results.set(o.id, o));
      }
    } catch {
      /* fall back to the local cache below */
    }

    if (results.size === 0) {
      getLocalOrders()
        .filter(
          (o) =>
            o.id.toUpperCase() === upper ||
            (digits.length >= 6 && digitsOf(o.customerPhone).endsWith(digits.slice(-10)))
        )
        .forEach((o) => results.set(o.id, o));
    }

    return sortOrdersDesc(Array.from(results.values()));
  },

  // ------------------------------------------------------
  // ANALYTICS
  // ------------------------------------------------------
  async getAnalytics(): Promise<AnalyticsSummary> {
    const [orders, products] = await Promise.all([
      loadOrders(),
      loadCollection<Product>(COL.PRODUCTS, getLocalProducts, saveLocalProducts),
    ]);

    const activeOrders = orders.filter((o) => o.status !== 'cancelled');
    const totalRevenue = activeOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'processing').length;
    const deliveredOrders = orders.filter((o) => o.status === 'delivered').length;
    const totalProducts = products.length;
    const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= 10).length;
    const outOfStockProducts = products.filter((p) => p.stock === 0).length;
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const categoryBreakdown: Record<string, number> = {};
    products.forEach((p) => {
      categoryBreakdown[p.cat] = (categoryBreakdown[p.cat] || 0) + 1;
    });

    // Real revenue per category from order line items
    const categoryBySlug = new Map(products.map((p) => [p.slug, p.cat]));
    const categoryRevenue: Record<string, number> = {};
    activeOrders.forEach((o) => {
      o.items.forEach((item) => {
        const cat = categoryBySlug.get(item.slug) || 'other';
        categoryRevenue[cat] = (categoryRevenue[cat] || 0) + item.price * item.quantity;
      });
    });

    const statuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    const statusBreakdown = statuses.map((status) => ({
      status,
      count: orders.filter((o) => o.status === status).length,
    }));

    return {
      totalRevenue,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalProducts,
      lowStockProducts,
      outOfStockProducts,
      averageOrderValue,
      flashSaleProductsCount: products.filter((p) => p.flashSale).length,
      categoryBreakdown,
      categorySales: Object.keys(categoryBreakdown).map((k) => ({
        category: k,
        count: categoryBreakdown[k],
        revenue: categoryRevenue[k] || 0,
      })),
      statusBreakdown,
      recentOrders: sortOrdersDesc(orders).slice(0, 8),
    };
  },

  // ------------------------------------------------------
  // STORE SETTINGS
  // ------------------------------------------------------
  async getSettings(): Promise<StoreSettings> {
    return loadSettings();
  },

  async updateSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
    const current = await loadSettings();
    const updated = stripAdminPassword({ ...current, ...settings } as StoreSettings);
    saveLocalSettings(updated);

    try {
      await putDoc(COL.SETTINGS, SETTINGS_DOC_ID, updated);
    } catch (err) {
      throw new Error(cloudErrorMessage('Saving the settings', err));
    }
    return updated;
  },

  // ------------------------------------------------------
  // AI PRODUCT GENERATION (template-based – no server required)
  // ------------------------------------------------------
  async generateProductWithAI(prompt: string, category?: string): Promise<Partial<Product>> {
    const title = prompt.trim().slice(0, 40) || 'Signature';
    return {
      name: `${title} Exclusive Collection`,
      bn: `${title} এক্সক্লুসিভ কালেকশন`,
      price: 2490,
      was: 3200,
      cat: category || 'ethnic',
      stock: 25,
      tags: ['luxury', 'artisan', 'new-arrival'],
      sizes: ['M (40)', 'L (42)', 'XL (44)'],
      colors: [
        { n: 'Boutique Gold', h: '#ca8a04' },
        { n: 'Midnight Obsidian', h: '#0f172a' },
      ],
      d: 'Handcrafted boutique masterwork tailored with refined precision and premium fabric. Features bespoke stitching and authentic artisan detailing.',
      db: 'প্রিমিয়াম কাপড়ের উপর অত্যন্ত নিখুঁত কারুকাজে তৈরি ফ্যাশন কালেকশন। প্রতিটি পার্টি বা উৎসবের জন্য অসাধারণ।',
      imgs: [FALLBACK_IMAGE],
    };
  },

  // ------------------------------------------------------
  // USER & ROLE MANAGEMENT
  // ------------------------------------------------------
  async getUsers(): Promise<{
    users: UserAccount[];
    primaryAdminEmail: string;
    totalUsers: number;
    adminsCount: number;
    moderatorsCount: number;
    customersCount: number;
  }> {
    let cloudUsers = await loadCloudUsers();
    if (cloudUsers) {
      try {
        cloudUsers = await seedStaffAccounts(cloudUsers);
      } catch {
        /* ignore */
      }
    }
    const source = cloudUsers ?? getLocalUsers();
    const rank: Record<UserRole, number> = { admin: 0, moderator: 1, customer: 2 };
    const users = source
      .map(sanitizeUser)
      .sort((a, b) => rank[a.role] - rank[b.role] || (b.createdAt || '').localeCompare(a.createdAt || ''));

    const primary = users.find((u) => u.isPrimaryAdmin);
    return {
      users,
      primaryAdminEmail: primary?.email || PRIMARY_ADMIN_EMAILS[0],
      totalUsers: users.length,
      adminsCount: users.filter((u) => u.role === 'admin').length,
      moderatorsCount: users.filter((u) => u.role === 'moderator').length,
      customersCount: users.filter((u) => u.role === 'customer').length,
    };
  },

  async assignUserRole(
    identifier: string,
    role: 'admin' | 'moderator' | 'customer'
  ): Promise<{ success: boolean; message: string; user: UserAccount }> {
    const cloudUsers = await loadCloudUsers();
    const pool = cloudUsers ?? getLocalUsers();
    const target = findUserMatch(pool, identifier);
    if (!target) throw new Error('User not found. Check the email, phone number or user ID.');
    if (isPrimaryAdminUser(target) && role !== 'admin') {
      throw new Error('The primary administrator cannot be demoted.');
    }

    const updated: CloudUser = { ...target, role };
    upsertLocalUser(updated);
    try {
      await putDoc(COL.USERS, updated.id, updated);
    } catch (err) {
      throw new Error(cloudErrorMessage('Role update', err));
    }

    const session = readSession();
    if (session && session.id === updated.id) writeSession(sanitizeUser(updated));

    return { success: true, message: `${updated.name} is now ${role}.`, user: sanitizeUser(updated) };
  },

  async createStaffUser(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: 'moderator' | 'customer';
  }): Promise<{ success: boolean; message: string; user: UserAccount }> {
    const cleanName = data.name.trim();
    const cleanEmail = data.email.trim().toLowerCase();
    const raw = data.password.trim();
    if (!cleanName || !cleanEmail || !raw) throw new Error('Name, email and password are required.');
    if (raw.length < 5) throw new Error('Password must be at least 5 characters long.');

    const cloudUsers = await loadCloudUsers();
    const pool = cloudUsers ?? getLocalUsers();
    if (pool.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('A user with this email already exists.');
    }

    const user = await withNewPassword(
      {
        id: `usr_${Date.now()}_${shortId()}`,
        name: cleanName,
        email: cleanEmail,
        phone: data.phone?.trim() || undefined,
        role: data.role,
        createdAt: nowIso(),
      },
      raw
    );

    upsertLocalUser(user);
    try {
      await putDoc(COL.USERS, user.id, user);
    } catch (err) {
      throw new Error(cloudErrorMessage('Creating the user', err));
    }
    return { success: true, message: `${user.name} added as ${user.role}.`, user: sanitizeUser(user) };
  },

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    const cloudUsers = await loadCloudUsers();
    const pool = cloudUsers ?? getLocalUsers();
    const target = pool.find((u) => u.id === id) || findUserMatch(pool, id);
    if (!target) throw new Error('User not found');
    if (isPrimaryAdminUser(target)) throw new Error('The primary administrator account cannot be deleted.');
    if (readSession()?.id === target.id) throw new Error('You cannot delete the account you are signed in with.');

    saveLocalUsers(getLocalUsers().filter((u) => u.id !== target.id));
    try {
      await removeDoc(COL.USERS, target.id);
    } catch (err) {
      throw new Error(cloudErrorMessage('Deleting the user', err));
    }
    return { success: true, message: `${target.name} has been removed.` };
  },

  // ------------------------------------------------------
  // RESET
  // ------------------------------------------------------
  async resetData(): Promise<void> {
    [LS_KEYS.PRODUCTS, LS_KEYS.CATEGORIES, LS_KEYS.BANNERS, LS_KEYS.ORDERS].forEach((k) =>
      localStorage.removeItem(k)
    );
    try {
      await Promise.all([
        clearCollection(COL.PRODUCTS),
        clearCollection(COL.CATEGORIES),
        clearCollection(COL.BANNERS),
        clearCollection(COL.ORDERS),
      ]);
      await seedCatalog(
        {
          products: INITIAL_PRODUCTS,
          categories: INITIAL_CATEGORIES,
          banners: INITIAL_BANNERS,
          settings: INITIAL_SETTINGS,
        },
        true
      );
      seedPromise = Promise.resolve();
    } catch (err) {
      throw new Error(cloudErrorMessage('Reset', err));
    }
  },
};
