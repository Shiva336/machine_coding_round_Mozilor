-- Users
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hashed    VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Scans
CREATE TABLE IF NOT EXISTS scans (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url                 TEXT NOT NULL,
    total_images        INTEGER NOT NULL DEFAULT 0,
    images_with_alt     INTEGER NOT NULL DEFAULT 0,
    images_without_alt  INTEGER NOT NULL DEFAULT 0,
    scanned_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);

-- Refresh tokens  (for JWT refresh-token rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_jti   VARCHAR(64) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(token_jti);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
