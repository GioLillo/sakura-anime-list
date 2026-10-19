# Sakura Shelf

A minimal dark anime library. The app is written in plain HTML, CSS and JavaScript. There is no build step. It has a sidebar avatar, subtle sakura petals, automatic title/cover/category lookup, ratings and category statistics.

## What the app does

- Sign in or create an account using Supabase Auth.
- Search external anime catalogues and choose the exact title. The app automatically fills the title, cover and broad category.
- Rate the anime from 1 to 10 and save it to your private library.
- Search/filter your own library and view simple statistics.
- Change only your display username and password in Account. The avatar is fixed and is not editable.
- Sync the same library across phones, tablets and computers through Supabase.

The library is cloud-first: there are no demo anime records and no fake local-only login. You need to configure Supabase before signing in.

## 1. Create the backend (Supabase)

1. Create a project at <https://supabase.com/>.
2. In the project, open **SQL Editor**, create a query, paste the contents of `supabase-schema.sql`, and run it. This creates the profile and anime tables plus row-level security policies.
3. Open **Project Settings → API Keys** (or the project's **Connect** panel). Copy the **Project URL** and the **publishable key**. A legacy `anon` key can also be used. Do **not** copy a `service_role` or secret key into the website.
4. Open `config.js` and fill in the two values:

```js
window.SAKURA_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'sb_publishable_...'
};
```

The publishable key is meant to be used by a browser frontend. Row Level Security is what restricts each signed-in account to its own rows. Never expose a service-role/secret key in `config.js` or any frontend file.

## 2. Test locally

Run a local web server in this folder:

```bash
python -m http.server 8080
```

Open <http://localhost:8080>. Create your account. If Supabase email confirmation is enabled, confirm the email, then sign in. The first account starts with an empty library; added titles are saved to Supabase, not only to this browser.

## 3. Deploy with GitHub Pages

GitHub Pages works for Sakura Shelf because the frontend is static HTML/CSS/JavaScript. Supabase provides the hosted authentication and database; GitHub Pages does not run a private server/backend itself.

1. In your GitHub profile, create a repository named `sakura-shelf`.
2. Upload the **contents** of this folder to the root of the repository: `index.html`, `app.js`, `styles.css`, `config.js`, `supabase-schema.sql`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, and the `assets/` folder.
3. Commit and push the files. Make sure `config.js` contains your Supabase project URL and publishable key before the commit. Those are public frontend values; never commit a service-role/secret key.
4. On GitHub, open the repository's **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
6. Wait for GitHub Pages to publish the site. The URL will look like `https://YOUR-USERNAME.github.io/sakura-shelf/`.
7. In Supabase, open **Authentication → URL Configuration**. Add the GitHub Pages URL to **Site URL** or **Redirect URLs** (keep the trailing slash for the project URL if shown). Also keep `http://localhost:8080/` in the redirect allow-list for local testing.
8. Open the deployed URL, create/sign into the same account on each device. The database is shared, so anime added on one device will appear when you sign in on another.

GitHub Pages only hosts the frontend files. Authentication and saved library data live in Supabase. API calls for anime data go directly from the browser to the public Jikan, Kitsu and AniList catalogues.

## 4. How the backend works — simple explanation

Think of the project as three parts:

- **GitHub Pages** is the shelf/storefront: it serves `index.html`, `styles.css` and `app.js` to every device.
- **Supabase Auth** manages sign-up, sign-in, sessions and password changes. Sakura Shelf never saves the password in its own `profiles` table.
- **Supabase Database** stores your username and the anime records (title, cover URL, category, rating, date added). Every record is associated with your Supabase user ID.

When you sign in, the app asks Supabase for only that account's profile and anime. Row Level Security (RLS) enforces the same rule in the database, so the public frontend key does not allow people to read another account's library. Keep RLS enabled and use only a publishable/anon key in the browser.

## 5. Notes about automatic search

Search queries Jikan, Kitsu and AniList in parallel, merges duplicate results, and prefers a real catalogue genre when assigning one of the app's broad categories. If the catalogue does not supply a matching genre, the category is set to `Other`. Public catalogues can occasionally rate-limit requests or be temporarily unavailable; retrying normally helps.

## Files

- `index.html`: login and app shell.
- `styles.css`: design and responsive layout.
- `app.js`: search, category mapping, library, stats and Supabase operations.
- `config.js`: public Supabase Project URL and publishable key.
- `supabase-schema.sql`: tables, permissions and row-level security.
- `sw.js`: lightweight PWA cache.
- `assets/`: fixed avatar and flower icon.
