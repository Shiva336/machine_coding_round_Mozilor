"""
Pydantic request / response schemas for the auth module.

Validation is intentionally strict:
  - Emails are validated by ``pydantic[email-validator]``.
  - Passwords must satisfy multiple strength rules (length, character
    classes) enforced by a single Pydantic field-validator.
"""

import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


# Requests


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        """Enforce minimum password-strength rules.

        Requirements:
          - At least 8 characters
          - At least one uppercase letter
          - At least one lowercase letter
          - At least one digit
          - At least one special character
        """
        errors: list[str] = []
        if len(value) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", value):
            errors.append("at least one uppercase letter")
        if not re.search(r"[a-z]", value):
            errors.append("at least one lowercase letter")
        if not re.search(r"\d", value):
            errors.append("at least one digit")
        if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]", value):
            errors.append("at least one special character")
        if errors:
            raise ValueError("Password must contain: " + ", ".join(errors) + ".")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


# Responses 


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    detail: str
