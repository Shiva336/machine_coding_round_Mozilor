"""
Low-level security utilities.

This module is *stateless* – it never touches the database.  It provides:
  - Password hashing / verification  (bcrypt – used directly, not via passlib)
  - JWT access-token creation / decoding  (PyJWT)
  - JWT refresh-token creation (includes a unique ``jti`` for DB tracking)
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import bcrypt
import jwt

from app.config import settings

# Password hashing

def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of *plain_password*."""
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return ``True`` if *plain_password* matches *hashed_password*."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


# JWT helpers
_ALGORITHM = "HS256"


def create_access_token(user_id: int) -> str:
    """Create a short-lived access token for the given user."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def create_refresh_token(user_id: int) -> tuple[str, str, datetime]:
    """Create a refresh token with a unique ``jti``.

    Returns:
        A 3-tuple of ``(encoded_token, jti, expires_at)`` so the caller
        can persist the ``jti`` in the database for later revocation.
    """
    now = datetime.now(timezone.utc)
    jti = uuid4().hex
    expires_at = now + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)
    return token, jti, expires_at


def decode_token(token: str) -> dict:
    """Decode and validate a JWT.

    Raises:
        jwt.ExpiredSignatureError: if the token has expired.
        jwt.InvalidTokenError: for any other validation failure.
    """
    return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
