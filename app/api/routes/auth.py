"""Authentication endpoints."""

import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Response, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

router = APIRouter()
security = HTTPBasic()

# Store credentials in a file (generated on first run)
CREDENTIALS_FILE = Path(__file__).parent.parent.parent.parent / "data" / ".credentials"

# Session tokens (in-memory for simplicity, use Redis in production)
_sessions: dict[str, datetime] = {}
SESSION_DURATION = timedelta(hours=24)


class LoginRequest(BaseModel):
    """Login request body."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Login response."""
    success: bool
    message: str


class AuthStatus(BaseModel):
    """Auth status response."""
    authenticated: bool
    username: Optional[str] = None


def get_or_create_credentials() -> tuple[str, str]:
    """Get existing credentials or create new ones."""
    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)

    if CREDENTIALS_FILE.exists():
        content = CREDENTIALS_FILE.read_text().strip()
        if content:
            lines = content.split('\n')
            if len(lines) >= 2:
                return lines[0], lines[1]

    # Generate new secure password
    username = "admin"
    password = secrets.token_urlsafe(24)

    CREDENTIALS_FILE.write_text(f"{username}\n{password}")
    CREDENTIALS_FILE.chmod(0o600)  # Read/write only for owner

    # Print to console on first creation
    print("\n" + "=" * 60)
    print("ADMIN CREDENTIALS GENERATED")
    print("=" * 60)
    print(f"Username: {username}")
    print(f"Password: {password}")
    print("=" * 60)
    print("These credentials are stored in: data/.credentials")
    print("=" * 60 + "\n")

    return username, password


def verify_credentials(username: str, password: str) -> bool:
    """Verify username and password."""
    stored_user, stored_pass = get_or_create_credentials()
    return secrets.compare_digest(username, stored_user) and secrets.compare_digest(password, stored_pass)


def create_session_token() -> str:
    """Create a new session token."""
    token = secrets.token_urlsafe(32)
    _sessions[token] = datetime.utcnow() + SESSION_DURATION
    return token


def verify_session_token(token: str) -> bool:
    """Verify a session token is valid and not expired."""
    if token not in _sessions:
        return False
    if datetime.utcnow() > _sessions[token]:
        del _sessions[token]
        return False
    return True


def get_session_token(request: Request) -> Optional[str]:
    """Extract session token from cookie or header."""
    # Check cookie first
    token = request.cookies.get("session_token")
    if token:
        return token
    # Check Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


async def require_auth(request: Request):
    """Dependency to require authentication."""
    token = get_session_token(request)
    if not token or not verify_session_token(token):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, response: Response):
    """Login with username and password."""
    if not verify_credentials(request.username, request.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_session_token()
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=int(SESSION_DURATION.total_seconds()),
    )

    return LoginResponse(success=True, message="Login successful")


@router.post("/logout", response_model=LoginResponse)
async def logout(request: Request, response: Response):
    """Logout and invalidate session."""
    token = get_session_token(request)
    if token and token in _sessions:
        del _sessions[token]

    response.delete_cookie("session_token")
    return LoginResponse(success=True, message="Logged out")


@router.get("/status", response_model=AuthStatus)
async def auth_status(request: Request):
    """Check authentication status."""
    token = get_session_token(request)
    if token and verify_session_token(token):
        stored_user, _ = get_or_create_credentials()
        return AuthStatus(authenticated=True, username=stored_user)
    return AuthStatus(authenticated=False)


# Initialize credentials on module load
get_or_create_credentials()
