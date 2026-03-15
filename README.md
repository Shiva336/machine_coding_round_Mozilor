# Alt Text Checker

A production-grade full-stack web application that scans any public URL and audits its images for WCAG-compliant alt text. Built with FastAPI, React, and PostgreSQL.

---

## Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd machine_coding_round_Mozilor

# 2. Create your environment file
cp .env.example .env
# Open .env and replace SECRET_KEY with a strong random value:
# python3 -c "import secrets; print(secrets.token_hex(64))"

# 3. Start all services
docker compose up --build
```

Visit **http://localhost:5173** — register an account and start scanning.

Interactive API docs: **http://localhost:8000/docs**

---

## Project Overview

Alt Text Checker lets authenticated users submit any public URL and instantly audit every image on the page for WCAG-compliant alt text. The backend scrapes the page asynchronously in the background, and the frontend polls for results in real time.

**Features**

- **Authentication** — Register, login, and logout with short-lived JWT access tokens (30 min) stored in HttpOnly cookies. Refresh tokens (7 days) use single-use rotation with reuse detection: if a stolen refresh token is replayed, all sessions for that user are immediately revoked.
- **URL scanning** — Submit any public URL. The API returns immediately with a `pending` scan; a background task fetches and parses the page, then updates the scan to `completed` or `failed`.
- **Alt text audit** — Detects every `<img>` tag and checks for the presence of the `alt` attribute. Follows the WCAG rule correctly: `alt=""` (decorative image) counts as valid; only a missing `alt` attribute entirely is flagged.
- **Scan history** — Paginated sidebar showing all past scans with status badges, timestamps, and image counts. Automatically polls while any scan is pending.
- **Delete scans** — Remove any completed or failed scan. Pending scans are protected from deletion while the background task is still running.
- **Charts** — Bar chart of recent scan results on the dashboard; pie chart alt-text breakdown on each scan detail page.
- **Responsive layout** — Persistent sidebar on desktop (`md+`), collapsible overlay drawer on mobile.
- **WCAG / ARIA compliance** — Skip-to-content link, semantic HTML landmarks (`<header>`, `<main>`, `<aside>`, `<nav>`), `aria-live` regions for status updates, `aria-current="page"` on active nav items, `role="alert"` on error messages, visible focus rings, and WCAG AA colour contrast throughout.

---

## Architecture

### Backend — Strict Layered Architecture

```
HTTP Request
    │
    ▼
┌─────────────┐
│   Router    │  Thin HTTP layer. Deserialises requests, calls service,
│  (router.py)│  sets/clears cookies, returns responses. No SQL or logic.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Service   │  Business logic layer. Owns auth rules, access-control
│ (service.py)│  checks, orchestration, error semantics (raises HTTPException).
└──────┬──────┘
       │
       ▼
┌─────────────┐
│     DAO     │  Data access layer. One function = one raw parameterised
│   (dao.py)  │  SQL query ($1, $2…). No business logic, no HTTP concepts.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  PostgreSQL │  asyncpg connection pool (min 5, max 20 connections).
│  (asyncpg)  │  Connection injected per-request via FastAPI Depends().
└─────────────┘
```

**Key backend decisions:**

- **No ORM.** Every query is hand-written raw SQL using asyncpg's parameterised `$1, $2` syntax — full control, no N+1 surprises.
- **HttpOnly cookie auth.** Tokens are stored in `HttpOnly; SameSite=Lax` cookies. JavaScript can never read them, eliminating XSS token-theft entirely. The `refresh_token` cookie path is restricted to `/api/auth`, so it is never sent to scan endpoints.
- **Background task processing.** `POST /api/scans` creates a `pending` row synchronously and returns immediately (201). The actual URL fetch + parse runs as a FastAPI `BackgroundTask` after the response is sent, acquiring its own DB connection from the pool.
- **Refresh token rotation.** Every use of a refresh token issues a new pair and revokes the old one. If a revoked token is reused (replay attack), all of that user's refresh tokens are wiped.
- **Dependency injection.** Database connections flow through `Depends(get_connection)`. The `get_current_user` dependency validates the access token cookie and returns the user dict — any route can declare it and be protected.

### Frontend — Component Architecture

```
src/
├── api/          # Axios instance + typed API functions (auth.ts, scan.ts)
├── context/      # AuthContext — global auth state (user, isLoading, login, logout)
├── hooks/        # useAuth, usePolling, useHistoryPolling
├── components/   # Reusable UI: AppLayout, ScanHistory, ScanResults, ScanChart…
├── pages/        # Full pages: Dashboard, ScanDetail, Login, Register
├── navigator.tsx # Route tree with ProtectedRoute / PublicRoute guards
└── utils/        # parseApiError — normalises API error responses
```

**Key frontend decisions:**

- **Axios interceptors.** A response interceptor catches 401s, silently calls `POST /api/auth/refresh` (cookie sent automatically), and retries the original request. Concurrent 401s are queued — only one refresh call is made. On `/login` and `/register`, the redirect is suppressed to prevent an infinite loop.
- **No token in JS.** With HttpOnly cookies the client cannot inspect tokens. On mount, `AuthContext` always calls `GET /api/auth/me` as the sole source of truth for session state.
- **Polling with `setTimeout` chains.** Rather than `setInterval`, each poll tick schedules the next one only after the previous fetch completes — preventing overlapping requests under slow networks.
- **Silent history refresh.** `AppLayout` compares only `id` and `status` between polls — if nothing changed, `setState` is skipped entirely, preventing unnecessary sidebar re-renders.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React + TypeScript | 19 / 5.9 |
| Build tool | Vite | 8 |
| Styling | Tailwind CSS | 4 |
| Charts | Recharts | 3 |
| Routing | React Router | 7 |
| HTTP client | Axios | 1.13 |
| Backend framework | FastAPI | 0.135 |
| Language | Python | 3.12 |
| Database driver | asyncpg | 0.31 |
| HTTP scraping | httpx | 0.28 |
| HTML parsing | BeautifulSoup4 + lxml | 4.13 / 5.4 |
| Database | PostgreSQL | 16 |
| Auth tokens | PyJWT + bcrypt | 2.10 / 4.3 |
| Config | pydantic-settings | 2.9 |
| Infrastructure | Docker + Docker Compose | — |

---

## Project Structure

```
.
├── docker-compose.yml               # Orchestrates db, server, and client services
├── .env.example                     # Environment variable template
│
├── server/                          # FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # App entry point: CORS middleware, lifespan, router mounts
│       ├── config.py                # Centralised settings via pydantic-settings (reads .env)
│       ├── db.py                    # asyncpg pool lifecycle + get_connection Depends()
│       ├── schema.sql               # All table definitions, run on startup (idempotent)
│       │
│       ├── auth/                    # Authentication module
│       │   ├── router.py            # POST /register /login /refresh /logout, GET /me
│       │   ├── service.py           # register_user, login_user, refresh_access_token, logout_user
│       │   ├── dao.py               # Raw SQL: users + refresh_tokens tables
│       │   ├── schemas.py           # RegisterRequest, LoginRequest, AuthResponse, UserResponse…
│       │   ├── security.py          # create_access_token, create_refresh_token, decode_token, bcrypt
│       │   └── dependencies.py      # get_current_user — reads access_token cookie, validates JWT
│       │
│       └── scan/                    # URL scanning module
│           ├── router.py            # POST /api/scans, GET /api/scans, GET/DELETE /api/scans/{id}
│           ├── service.py           # create_pending_scan, process_scan (BG task), get_scan_detail, delete_user_scan
│           ├── dao.py               # Raw SQL: scans + scan_images tables
│           └── schemas.py           # ScanRequest, ScanSummaryResponse, ScanResponse, ImageDetail…
│
└── client/                          # React + TypeScript frontend
    ├── Dockerfile
    ├── package.json
    ├── postcss.config.js            # Tailwind v4 via @tailwindcss/postcss
    ├── .env                         # Frontend env vars (VITE_API_BASE_URL)
    └── src/
        ├── main.tsx                 # App bootstrap: BrowserRouter + AuthProvider
        ├── App.tsx                  # Renders <Navigator />
        ├── navigator.tsx            # Route tree: ProtectedRoute, PublicRoute, AppLayout layout
        │
        ├── api/
        │   ├── axios.ts             # Shared axios instance (withCredentials, VITE_API_BASE_URL) + silent refresh interceptor
        │   ├── auth.ts              # registerUser, loginUser, logoutUser, refreshToken, getMe
        │   └── scan.ts              # scanUrl, getScanHistory, getScanDetail, deleteScan
        │
        ├── context/
        │   └── AuthContext.tsx      # Auth state provider: user, isLoading, login, register, logout
        │
        ├── hooks/
        │   ├── useAuth.ts           # useContext(AuthContext) with outside-provider guard
        │   ├── usePolling.ts        # Polls a single scan every 2.5s until settled (max 30 attempts)
        │   └── useHistoryPolling.ts # Polls scan history list while any scan is pending
        │
        ├── components/
        │   ├── AppLayout.tsx        # Persistent shell: header + sidebar + <Outlet> with context
        │   ├── AuthForm.tsx         # Shared login/register form with full WCAG compliance
        │   ├── ScanForm.tsx         # URL input form
        │   ├── ScanHistory.tsx      # Paginated sidebar scan list with status pills
        │   ├── ScanResults.tsx      # Status badge, stats grid, image detail table
        │   └── ScanChart.tsx        # Recharts bar chart (dashboard) + pie chart (scan detail)
        │
        ├── pages/
        │   ├── LoginPage.tsx        # /login
        │   ├── RegisterPage.tsx     # /register
        │   ├── DashboardPage.tsx    # /dashboard — URL input + recent scans bar chart
        │   └── ScanDetailPage.tsx   # /scans/:scanId — full results + polling + delete
        │
        └── utils/
            └── parseApiError.ts     # Normalises Pydantic 422 and string error responses
```

---

## Setup Instructions

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose v2](https://docs.docker.com/compose/install/)
- Git

### 1. Clone the repository

```bash
git clone <repo-url>
cd machine_coding_round_Mozilor
```

### 2. Configure environment variables

**Backend** — copy the template and set a strong `SECRET_KEY`:

```bash
cp .env.example .env
```

Edit `.env` and replace `SECRET_KEY` with a strong random value:

```bash
python3 -c "import secrets; print(secrets.token_hex(64))"
```

Full `.env` reference:

```env
# Database
POSTGRES_USER=mozilor
POSTGRES_PASSWORD=mozilor_secret
POSTGRES_DB=mozilor_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

# JWT signing secret — required, app will not start without this
SECRET_KEY=your-64-char-hex-string-here

# Token lifetimes
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Cookie security — set to true in production (requires HTTPS)
COOKIE_SECURE=false
```

**Frontend** — `client/.env` is already committed with a working default:

```env
# Base URL of the FastAPI backend.
# Override this when deploying to a non-localhost environment.
VITE_API_BASE_URL=http://localhost:8000
```

Vite exposes any variable prefixed with `VITE_` to the browser bundle via `import.meta.env.VITE_*`. Change this value if your backend runs on a different host or port.

### 3. Build and start

```bash
docker compose up --build
```

The first build downloads base images and installs dependencies — subsequent starts are fast.

### 4. Access the app

| URL | Description |
|---|---|
| http://localhost:5173 | React frontend |
| http://localhost:8000/docs | FastAPI Swagger UI |
| http://localhost:8000/redoc | FastAPI ReDoc |
| http://localhost:8000/health | Health check endpoint |

### 5. Database connection (direct)

```bash
psql -h localhost -p 5433 -U mozilor -d mozilor_db
# password: mozilor_secret
```

### Development workflow

Both the `server/` and `client/` directories are bind-mounted into their containers. Code changes are picked up automatically — uvicorn `--reload` for the backend, Vite HMR for the frontend.

**Adding new Python packages:**

```bash
# Add to server/requirements.txt, then rebuild
docker compose up --build server
```

**Adding new npm packages:**

`node_modules` lives in an anonymous Docker volume. When adding dependencies, the volume must be recreated:

```bash
docker compose down -v        # removes stale node_modules volume
docker compose up --build     # reinstalls all packages and restarts
```

**Running the TypeScript type-check:**

```bash
docker compose exec client npx tsc --noEmit
```

---

## Docker Instructions

### Services

```yaml
services:
  db       # PostgreSQL 16 — host port 5433, container port 5432
  server   # FastAPI via uvicorn — port 8000, hot-reload enabled
  client   # React via Vite dev server — port 5173, HMR enabled
```

**Start-up order:** `db` must pass its health check before `server` starts. `server` must be running before `client` starts.

**Database health check:**

```bash
pg_isready -U mozilor -d mozilor_db   # runs every 5s, 5 retries
```

**Volumes:**

| Volume | Purpose |
|---|---|
| `pgdata` (named) | PostgreSQL data — persists between `down` and `up` |
| `/app/node_modules` (anonymous) | Isolates container node_modules from the host bind mount |

### Common commands

```bash
# Start all services (build if needed)
docker compose up --build

# Start in detached mode
docker compose up -d --build

# View logs for a specific service
docker compose logs -f server
docker compose logs -f client

# Stop containers, keep database data
docker compose down

# Stop containers and delete all volumes (wipes database)
docker compose down -v

# Rebuild a single service
docker compose up --build server

# Open a shell inside a container
docker compose exec server bash
docker compose exec client sh

# Run a one-off command
docker compose exec server python -c "import app; print('ok')"
```

### Production considerations

- Set `COOKIE_SECURE=true` in `.env` (requires HTTPS)
- Replace `allow_origins` in `main.py` with your actual production domain
- Set `VITE_API_BASE_URL` in `client/.env` to your production backend URL before running `npm run build`
- Use a secrets manager instead of a plain `.env` file for `SECRET_KEY` and `POSTGRES_PASSWORD`
- Swap the Vite dev server for a proper static build (`npm run build`) served by nginx or a CDN

---

## API Endpoints

All endpoints are prefixed relative to `http://localhost:8000`.  
Authenticated endpoints require a valid `access_token` HttpOnly cookie (set automatically on login/register).

### Auth — `/api/auth`

| Method | Path | Auth | Status | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | No | 201 | Create a new account. Sets `access_token` + `refresh_token` cookies. Returns `{ user }`. |
| `POST` | `/api/auth/login` | No | 200 | Login with email + password. Sets both cookies. Returns `{ user }`. |
| `POST` | `/api/auth/refresh` | Cookie | 200 | Rotate the refresh token. Issues a new token pair via cookies. Single-use — old token is revoked. |
| `POST` | `/api/auth/logout` | Yes | 200 | Revoke the refresh token in the database and expire both cookies. |
| `GET` | `/api/auth/me` | Yes | 200 | Return the current authenticated user's profile. |

**Register / Login request body:**

```json
{
  "email": "user@example.com",
  "password": "StrongPass1!"
}
```

**Password requirements:** minimum 8 characters, at least one uppercase letter, one lowercase letter, one digit, and one special character.

**Register / Login response body:**

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2026-03-16T10:00:00Z"
  }
}
```

### Scans — `/api/scans`

| Method | Path | Auth | Status | Description |
|---|---|---|---|---|
| `POST` | `/api/scans` | Yes | 201 | Submit a URL for scanning. Returns immediately with `status: "pending"`. |
| `GET` | `/api/scans` | Yes | 200 | Paginated scan history. Query params: `limit` (1–100, default 20), `offset` (default 0). |
| `GET` | `/api/scans/{scan_id}` | Yes | 200 | Full scan detail including the image list. |
| `DELETE` | `/api/scans/{scan_id}` | Yes | 200 | Delete a scan and all its image records. Returns 409 if the scan is still `pending`. |

**POST /api/scans request body:**

```json
{ "url": "https://example.com" }
```

**Scan status values:** `pending` → `completed` or `failed`

**GET /api/scans response shape:**

```json
{
  "scans": [
    {
      "id": 1,
      "url": "https://example.com",
      "status": "completed",
      "total_images": 12,
      "images_with_alt": 9,
      "images_without_alt": 3,
      "error_message": null,
      "scanned_at": "2026-03-16T10:00:00Z"
    }
  ],
  "total": 42
}
```

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Returns `{ "status": "ok" }` |

---

## Database Schema

Four tables, all created automatically on startup via `CREATE TABLE IF NOT EXISTS`.

### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY |
| `email` | `VARCHAR(255)` | UNIQUE NOT NULL |
| `password_hashed` | `VARCHAR(255)` | NOT NULL |
| `created_at` | `TIMESTAMPTZ` | DEFAULT NOW() |

### `scans`

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY |
| `user_id` | `INTEGER` | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `url` | `TEXT` | NOT NULL |
| `total_images` | `INTEGER` | NOT NULL DEFAULT 0 |
| `images_with_alt` | `INTEGER` | NOT NULL DEFAULT 0 |
| `images_without_alt` | `INTEGER` | NOT NULL DEFAULT 0 |
| `status` | `VARCHAR(20)` | NOT NULL DEFAULT `'pending'` |
| `error_message` | `TEXT` | nullable |
| `scanned_at` | `TIMESTAMPTZ` | DEFAULT NOW() |

Index: `idx_scans_user_id` on `user_id`.

### `scan_images`

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY |
| `scan_id` | `INTEGER` | NOT NULL, FK → `scans(id)` ON DELETE CASCADE |
| `src` | `TEXT` | NOT NULL |
| `alt` | `TEXT` | nullable (NULL = attribute entirely absent) |
| `has_alt` | `BOOLEAN` | NOT NULL |

Index: `idx_scan_images_scan_id` on `scan_id`.

Deleting a `scan` row automatically deletes all its `scan_images` rows via `ON DELETE CASCADE`.

### `refresh_tokens`

| Column | Type | Constraints |
|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY |
| `user_id` | `INTEGER` | NOT NULL, FK → `users(id)` ON DELETE CASCADE |
| `token_jti` | `VARCHAR(64)` | UNIQUE NOT NULL |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL |
| `revoked` | `BOOLEAN` | DEFAULT FALSE |
| `created_at` | `TIMESTAMPTZ` | DEFAULT NOW() |

Indexes: `idx_refresh_tokens_jti` on `token_jti`, `idx_refresh_tokens_user_id` on `user_id`.

A "revoked" refresh token is represented by a **deleted row**, not a `revoked=true` flag. The `revoked` column exists as a schema artifact and is not used at runtime.

---

## Background Processing

URL scanning is the core feature of the app. Here is the full processing pipeline:

### 1. Request Phase (synchronous, in-request)

1. The authenticated user calls `POST /api/scans` with a URL.
2. The router calls `service.create_pending_scan()` which inserts a row with `status='pending'` into the `scans` table and returns it.
3. The endpoint schedules `service.process_scan(pool, scan_id, url)` as a **FastAPI BackgroundTask**.
4. The HTTP response (201 with the pending scan) is sent to the client **immediately** — no waiting for the scrape.

### 2. Processing Phase (background, after response)

Background tasks execute after the response is sent. The request-scoped DB connection has already been released, so `process_scan` receives the **pool** and acquires its own connection:

```
process_scan(pool, scan_id, url)
    │
    ├─ httpx.AsyncClient.get(url)
    │    Timeout:      connect=5s, read=10s, write=5s, pool=5s
    │    Redirects:    max 5
    │    User-Agent:   MozilorAltChecker/1.0 (accessibility scanner)
    │    Size limit:   10 MB
    │
    ├─ Validate response
    │    status >= 400  →  _ScanError
    │    non-HTML       →  _ScanError
    │    > 10 MB        →  _ScanError
    │
    ├─ BeautifulSoup(response.text, "lxml")
    │    Find all <img> tags
    │    Resolve relative src → absolute URL via urljoin
    │    alt=None  →  has_alt=False  (attribute missing entirely)
    │    alt=""    →  has_alt=True   (decorative, WCAG-valid)
    │
    └─ DB transaction
         UPDATE scans SET status='completed', counts…
         INSERT INTO scan_images (batch via executemany)
```

**On any failure**, the scan is marked `status='failed'` with the error message stored in `error_message`. Handled errors: `httpx.TimeoutException`, `httpx.ConnectError`, `httpx.TooManyRedirects`, bad HTTP status, non-HTML content, response too large, and any unexpected exception.

### 3. Polling Phase (frontend)

The frontend never receives a WebSocket push. Instead it polls:

- **`usePolling`** — polls `GET /api/scans/{id}` every 2.5 seconds using `setTimeout` chains (not `setInterval`) until the scan status is `completed` or `failed`, or 30 attempts are exhausted.
- **`useHistoryPolling`** — polls `GET /api/scans` on a 3-second cycle while any scan in the sidebar list is `pending`. Uses a high-water mark to detect genuinely new scans (avoids resetting the counter when an existing scan completes). Skips fetches when `document.hidden` is true (tab not visible). Stops after 3 consecutive server errors.

---

## Future Improvements

- **Rate limiting** — Limit scan submissions per user per minute to prevent abuse. FastAPI middleware or a Redis-backed token bucket.
- **WebSocket / SSE push** — Replace polling with server-sent events so the frontend receives scan completion instantly instead of checking every 2.5 seconds.
- **Bulk scanning** — Accept a list of URLs in a single request and process them as parallel background tasks.
- **Export results** — Allow users to download scan results as CSV or PDF.
- **Scheduled scans** — Let users configure recurring scans (e.g. daily) with email alerts when new accessibility issues are introduced.
- **Scan diffing** — Compare two scans of the same URL and highlight what changed between runs.
- **Caching** — Cache recent scan results for identical URLs to reduce redundant scraping.
- **Production deployment** — Switch `COOKIE_SECURE=true`, set up HTTPS, restrict CORS origins to the real domain, serve the React build via nginx or a CDN, and use a managed PostgreSQL instance.
- **Test suite** — Unit tests for service and DAO layers using pytest with an in-memory test database; Playwright end-to-end tests for critical user flows.

---

## AI Tools Used

**Claude (Anthropic)** — accessed via the [OpenCode](https://opencode.ai) CLI agent.

Used throughout the project for:
- Architecture design and decision-making (auth strategy, layered backend structure, HttpOnly cookie migration)
- Code generation for boilerplate-heavy areas (DAO functions, Pydantic schemas, React hooks)
- Debugging (infinite loop on `/login`, Tailwind v4 PostCSS configuration, asyncpg pool issues)
- Code review and security analysis (XSS token-theft risk in localStorage, CSRF implications of SameSite cookies, refresh token reuse detection)
- WCAG compliance review (colour contrast ratios, ARIA attribute correctness)

---

## Author

**Shiva Sundar R.**
