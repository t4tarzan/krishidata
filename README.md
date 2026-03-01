# KrishiData — Field Data Collection Platform

A mobile-first Progressive Web App for collecting, managing, and analysing agricultural field data. Built for deployment on **Vercel** with a Python serverless backend and a fully static frontend.

---

## What is KrishiData?

KrishiData helps agricultural organisations (government agencies, NGOs, agri-tech companies) collect structured data from rural field workers with or without internet connectivity. It features:

- **Offline-first** data collection — submissions queue locally and sync when back online
- **Role-based access** — four tiers control what each user can see and do
- **Dynamic form builder** — admins design forms with 8 field types; workers fill them in the field
- **Semantic search** — TF-IDF vector engine lets you search submission content in plain language
- **Correlation discovery** — automatic statistical analysis (Pearson, eta-squared, Cramér's V) surfaces hidden patterns in field data
- **Dashboard analytics** — submission trends, top collectors, regional breakdown with Chart.js visualisations

---

## Architecture

```
krishidata-vercel/
├── public/               # Static frontend (served by Vercel CDN)
│   ├── index.html        # Single-page app shell
│   ├── base.css          # Design tokens & reset
│   ├── style.css         # Component styles
│   ├── app.js            # Full SPA — routing, views, API calls
│   └── sw.js             # Service worker for offline support
│
├── api/
│   └── index.py          # Python serverless function (catch-all)
│
├── vercel.json           # Routing rules & function config
├── requirements.txt      # No external deps — stdlib only
└── README.md
```

**Backend**: A single Python 3.12 serverless function handles all `/api/*` routes. It uses:
- `sqlite3` — data storage in `/tmp/krishidata.db` (ephemeral; re-seeded on cold start)
- `http.server.BaseHTTPRequestHandler` — Vercel's Python runtime format
- `hashlib`, `math`, `re`, `collections` — all Python stdlib

**Frontend**: Pure HTML/CSS/JS — no build step, no framework, no npm.

---

## Deploy to Vercel

### Prerequisites
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- Or connect your GitHub repo in the [Vercel dashboard](https://vercel.com/new)

### One-command deploy

```bash
cd krishidata-vercel
vercel --prod
```

Vercel auto-detects the `vercel.json` configuration and:
1. Serves everything in `public/` as static files
2. Routes `/api/*` requests to `api/index.py` as a Python 3.12 serverless function

### Environment

No environment variables are required. The SQLite database is created automatically in `/tmp/` on every cold start and seeded with demo data.

> **Note on persistence**: Vercel serverless functions are stateless. The `/tmp/` directory persists only within a single function instance's lifetime. Data written during one invocation may not be visible in another. This is intentional for a demo — all seed data is always available. For production use, replace SQLite with a persistent database (e.g. [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres), PlanetScale, Supabase).

---

## Demo Credentials

| Username     | Password   | Role       | Region | Area       |
|-------------|------------|------------|--------|------------|
| `admin`      | `admin123` | Admin      | All    | All        |
| `mgr_north`  | `pass123`  | Manager    | North  |            |
| `mgr_south`  | `pass123`  | Manager    | South  |            |
| `sup_delhi`  | `pass123`  | Supervisor | North  | Delhi NCR  |
| `sup_chennai`| `pass123`  | Supervisor | South  | Chennai    |
| `fw_ravi`    | `pass123`  | Worker     | North  | Delhi NCR  |
| `fw_meena`   | `pass123`  | Worker     | North  | Delhi NCR  |
| `fw_kumar`   | `pass123`  | Worker     | South  | Chennai    |

---

## Features

### 4-Tier RBAC

| Capability              | Admin | Manager | Supervisor | Worker |
|-------------------------|:-----:|:-------:|:----------:|:------:|
| View all submissions    | ✓     |         |            |        |
| View region submissions |       | ✓       |            |        |
| View area submissions   |       |         | ✓          |        |
| View own submissions    |       |         |            | ✓      |
| Create / edit forms     | ✓     | ✓       |            |        |
| Archive forms           | ✓     |         |            |        |
| Collect data            | ✓     | ✓       | ✓          | ✓      |
| Manage users            | ✓     | ✓ *     |            |        |
| Run correlation discovery | ✓   | ✓       |            |        |
| View correlations       | ✓     | ✓       |            |        |

_* Managers can only manage users of lower rank within their region._

### API Routes

| Method | Path                        | Description                          |
|--------|-----------------------------|--------------------------------------|
| POST   | `/api/auth/login`           | Authenticate and return user object  |
| GET    | `/api/health`               | Health check                         |
| GET    | `/api/stats`                | Dashboard statistics                 |
| GET    | `/api/forms`                | List forms                           |
| POST   | `/api/forms`                | Create form                          |
| PUT    | `/api/forms?id=N`           | Update form                          |
| DELETE | `/api/forms?id=N`           | Archive form                         |
| GET    | `/api/submissions`          | List submissions (RBAC filtered)     |
| POST   | `/api/submissions`          | Create submission                    |
| PUT    | `/api/submissions?id=N`     | Update submission                    |
| DELETE | `/api/submissions?id=N`     | Delete submission                    |
| GET    | `/api/search?q=...`         | TF-IDF semantic search               |
| GET    | `/api/correlations`         | List discovered correlations         |
| POST   | `/api/correlations/discover`| Run correlation analysis             |
| GET    | `/api/users`                | List users (RBAC filtered)           |
| POST   | `/api/users`                | Create user                          |
| PUT    | `/api/users?id=N`           | Update user                          |
| DELETE | `/api/users?id=N`           | Deactivate user                      |

Authentication is passed via `user_id` query parameter or request body (demo-grade; replace with JWT for production).

### Offline Support

The service worker (`sw.js`) caches static assets for offline use. Submissions made while offline are queued in `localStorage` and automatically synced when connectivity is restored.

---

## Local Development

No build step needed. Serve the `public/` folder with any static server:

```bash
# Python
cd public && python3 -m http.server 3000

# Node
npx serve public
```

For the API, run via Vercel CLI locally:

```bash
vercel dev
```

This starts both the static server and the Python function with hot reload.

---

## Tech Stack

- **Frontend**: Vanilla JS (ES2020+), CSS custom properties, Chart.js (CDN)
- **Backend**: Python 3.12, sqlite3, stdlib only
- **Hosting**: Vercel (static CDN + serverless functions)
- **PWA**: Service Worker, Web App Manifest
