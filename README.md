# Alt Text Checker

A full-stack web application that lets authenticated users scan any public URL and audit its images for WCAG-compliant alt text. Results are saved to a per-user history with charts.

## Features

- **User auth** — register, login, logout with JWT access tokens (30 min) and rotating refresh tokens (7 days)
- **URL scanning** — async background scan using httpx + BeautifulSoup; returns immediately with a pending status while the backend fetches and parses the page
- **Alt text audit** — detects every `<img>` tag and reports whether the `alt` attribute is present (WCAG-correct: `alt=""` counts as present)
- **Scan history** — paginated sidebar listing all past scans with status badges and image counts
- **Charts** — bar chart of recent scan results on the dashboard; pie chart breakdown on each scan detail page
- **Responsive layout** — persistent sidebar on desktop, collapsible drawer on mobile
- **WCAG / ARIA** — skip-to-content link, semantic landmarks, `aria-live` status regions, `aria-current="page"` on active nav items, visible focus rings throughout

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, Recharts, React Router 7 |
| Backend | FastAPI 0.135, Python 3.12, asyncpg, httpx, BeautifulSoup4 + lxml |
| Database | PostgreSQL 16 |
| Auth | JWT (PyJWT), bcrypt, refresh token rotation |
| Infrastructure | Docker, Docker Compose |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (v2)
- Git

## Local setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd machine_coding_round_Mozilor
```

### 2. Create the environment file

```bash
cp .env.example .env
```

Open `.env` and set a strong `SECRET_KEY` (used to sign JWTs). Everything else can stay as-is for local development:

```env
POSTGRES_USER=mozilor
POSTGRES_PASSWORD=mozilor_secret
POSTGRES_DB=mozilor_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

SECRET_KEY=change-me-to-a-random-64-char-hex-string
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

Generate a secure key with:

```bash
python3 -c "import secrets; print(secrets.token_hex(64))"
```

### 3. Start all services

```bash
docker compose up --build
```

This starts three containers:

| Container | Purpose | Port |
|---|---|---|
| `db` | PostgreSQL 16 | `5433` (host) → `5432` (container) |
| `server` | FastAPI (uvicorn, hot-reload) | `8000` |
| `client` | React / Vite dev server (hot-reload) | `5173` |

The backend automatically runs `CREATE TABLE IF NOT EXISTS` on startup — no manual migrations needed.

### 4. Open the app

Visit **http://localhost:5173** in your browser, register an account, and start scanning URLs.

The FastAPI interactive docs are available at **http://localhost:8000/docs**.

## Development workflow

The `server/` and `client/` directories are bind-mounted into their respective containers, so code changes are picked up automatically (uvicorn `--reload` for the backend, Vite HMR for the frontend).

### Adding new npm packages

Because `node_modules` lives in an anonymous Docker volume, you need to rebuild after adding dependencies:

```bash
docker compose down -v          # remove the stale node_modules volume
docker compose up --build       # reinstall and restart
```

### Running TypeScript type-check manually

```bash
docker compose exec client npx tsc --noEmit
```

### Connecting to the database directly

```bash
psql -h localhost -p 5433 -U mozilor -d mozilor_db
# password: mozilor_secret
```

## Project structure

```
.
├── docker-compose.yml
├── .env.example
├── server/                        # FastAPI backend
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                # App entry point, CORS, lifespan
│       ├── config.py              # Pydantic settings
│       ├── db.py                  # asyncpg pool + get_connection dependency
│       ├── schema.sql             # Table definitions (applied on startup)
│       ├── auth/                  # Register, login, refresh, logout, /me
│       │   ├── router.py
│       │   ├── service.py
│       │   ├── dao.py
│       │   ├── schemas.py
│       │   ├── security.py        # JWT encode/decode, bcrypt hashing
│       │   └── dependencies.py    # get_current_user FastAPI dependency
│       └── scan/                  # URL scanning feature
│           ├── router.py          # POST /api/scans, GET /api/scans, GET /api/scans/{id}
│           ├── service.py         # Business logic + background scraping task
│           ├── dao.py             # Raw SQL queries (asyncpg)
│           └── schemas.py
└── client/                        # React frontend
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── main.tsx
        ├── navigator.tsx          # Route tree (React Router nested routes)
        ├── api/
        │   ├── axios.ts           # Shared axios instance + token refresh interceptor
        │   ├── auth.ts
        │   └── scan.ts
        ├── context/
        │   └── AuthContext.tsx
        ├── hooks/
        │   ├── useAuth.ts
        │   └── usePolling.ts      # Polls scan status until completed/failed
        ├── components/
        │   ├── AppLayout.tsx      # Header + sidebar + <Outlet>
        │   ├── AuthForm.tsx
        │   ├── ScanForm.tsx
        │   ├── ScanHistory.tsx
        │   ├── ScanResults.tsx
        │   └── ScanChart.tsx
        ├── pages/
        │   ├── LoginPage.tsx
        │   ├── RegisterPage.tsx
        │   ├── DashboardPage.tsx  # URL input + recent scans bar chart
        │   └── ScanDetailPage.tsx # Single scan results + polling
        └── utils/
            └── parseApiError.ts
```

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Create a new account |
| `POST` | `/api/auth/login` | No | Login, returns access + refresh tokens |
| `POST` | `/api/auth/refresh` | No | Exchange refresh token for new token pair |
| `POST` | `/api/auth/logout` | Yes | Revoke refresh token |
| `GET` | `/api/auth/me` | Yes | Current user info |
| `POST` | `/api/scans` | Yes | Submit a URL for scanning |
| `GET` | `/api/scans` | Yes | Paginated scan history (`?limit=&offset=`) |
| `GET` | `/api/scans/{id}` | Yes | Full scan detail including image list |
| `GET` | `/health` | No | Health check |

## Password requirements

Passwords must be at least 8 characters and contain at least one uppercase letter and one special character.

## Stopping the app

```bash
docker compose down          # stop containers, keep database volume
docker compose down -v       # stop containers and delete all data
```
