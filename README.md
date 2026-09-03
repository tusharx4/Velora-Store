# VELORA — Luxury Boutique & Admin Suite

Luxury boutique storefront for Bangladesh with WhatsApp ordering, cash on delivery,
flash sales, order tracking, Firebase live chat and a full admin panel.

Built with **React 19 + Vite 7 + Tailwind CSS v4 + TypeScript**. Fully static —
no server needed. **Firestore is the database** (products, categories, banners,
settings, orders, user accounts, live chat, reviews, inquiries). `localStorage`
is only used as an offline cache / fallback.

---

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm run preview    # preview the production build
```

> Requires Node.js **20.19+** or **22.x** (Vite 7 requirement).

Admin panel: click **Staff / Admin Portal** in the footer (or open `#/admin`).
Default credentials until you change them from *Admin → Settings*:
`admin@velora.com` / `admin123`

---

## ⚠️ Required one-time Firebase setup (project `velora-store-7b13e`)

The app talks to **Cloud Firestore** directly from the browser (it does *not*
use Realtime Database). **Until Firestore exists and its rules are published,
every Firebase feature (catalog sync, orders, accounts, live chat) falls back to
this-device-only mode.**

1. Open <https://console.firebase.google.com/> → project **velora-store-7b13e**.
2. Left menu **Build → Firestore Database** → **Create database**.
   - Location: pick one close to Bangladesh, e.g. `asia-south1 (Mumbai)` or
     `asia-southeast1 (Singapore)`. The location cannot be changed later.
   - Mode: *production* or *test* — either is fine, the next step replaces the rules.
3. Open the **Rules** tab, replace everything with the contents of
   [`firestore.rules`](./firestore.rules) and click **Publish**.
4. Sign in to the admin panel once — the default catalog is copied into
   Firestore automatically. Verify in Firebase Console → Firestore Database that
   the `products`, `categories`, `banners`, `settings` and `users` collections
   appear. If the database or its rules are missing, every change is kept on the
   current device only and the failing action shows a short explanation.

The first time a staff member signs in after that, the default catalog is
copied into Firestore automatically. From then on every change made in the admin
panel is visible to all visitors on all devices.

> The Realtime Database that already exists in the project is unused by the app;
> you can leave it or delete it.

### Security note

The shipped rules are intentionally open (`allow read, write: if true`) so the
app works without a backend. Passwords are stored as salted PBKDF2 hashes, never
in plain text, but anyone who extracts the Firebase config from the page could
still read/modify data directly. Use a strong admin password, and when the store
grows consider moving to Firebase Authentication with role-based rules.

---

## Deploy to Vercel (via GitHub)

### 1. Push the code to GitHub

Either upload the files through the GitHub web UI (**Add file → Upload files**,
drag the project files + the `src` folder — *not* `node_modules` or `dist`), or:

```bash
git init
git add .
git commit -m "Velora storefront + admin suite"
git branch -M main
git remote add origin https://github.com/<your-username>/Velora.git
git push -u origin main
```

### 2. Import the repo on Vercel

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Click **Import** next to the `Velora` repository.
3. Vercel auto-detects the settings from `vercel.json`:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. No environment variables are required.
5. Click **Deploy**. In ~1 minute you get a live URL like `https://velora.vercel.app`.

Every future push / upload to `main` triggers an automatic redeploy.

### Alternative: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel            # first deploy (preview)
vercel --prod     # production deploy
```

---

## Firebase notes

- The web config lives in `firebase-applet-config.json`. Firebase web API keys
  are safe to commit; access is governed by the Firestore rules.
- If you restricted the API key in Google Cloud Console (HTTP referrers), add your
  Vercel domain (`*.vercel.app` and any custom domain) to the allow-list.
- To point the app at your own Firebase project, replace the values in
  `firebase-applet-config.json`, publish the rules there and redeploy.
- **Reset catalog** (Admin → Dashboard) wipes products, categories, banners and
  orders in Firestore and re-seeds the default catalog. Settings and accounts stay.

---

## Project structure

```
src/
  App.tsx                    # routing (hash-based), cart, auth & admin shell
  components/                # storefront UI (Navbar, ShopPage, CartDrawer, ...)
  components/admin/          # admin panel (Dashboard, Products, Orders, Settings, ...)
  services/api.ts            # data layer: Firestore first, localStorage fallback
  services/firestoreStore.ts # Firestore CRUD helpers, timeouts, password hashing
  services/firebase.ts       # Firebase init + live chat / reviews / inquiries
  data/initialData.ts        # default catalog, categories, banners, settings, staff
  types.ts                   # shared TypeScript types
```
