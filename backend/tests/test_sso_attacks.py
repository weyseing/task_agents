"""Attacker-simulation regression tests for the SSO flow.

Each test plays the role of a hacker trying one specific attack against
the auth surface. If any of these start passing the attacker's request
(2xx instead of 4xx), security has regressed.

Threat model covered:
  - Random / forged / tampered / expired `state` on the OAuth callback
  - Drive-by access to authenticated endpoints without a valid session

Out of scope here (covered elsewhere or requires Postgres):
  - Login CSRF where the attacker uses their OWN legitimately-issued
    state+code against a victim. Our current implementation does NOT
    fully block this — fix is browser-binding via a `__Host-` nonce
    cookie. Once that lands, add a test here that asserts a callback
    with state-from-flow-A and nonce-cookie-from-flow-B is rejected.
  - Cross-user conversation access (User A reading User B's data).
    Belongs in a `test_sso_authz.py` once we wire a test DB.

Run:
  cd backend && pytest tests/test_sso_attacks.py -v
"""

import hashlib
import hmac
import secrets
import time

import pytest

# Every test in this file is both a regression test (locks in a fix/defense)
# and a security test (validates an auth boundary). Individual tests add
# `unit` or `integration` to distinguish how they exercise the code.
pytestmark = [pytest.mark.regression, pytest.mark.security]


# --- Helpers ---------------------------------------------------------------


STATE_SECRET = b"test-state-secret"  # matches conftest.py


def sign(ts: int, nonce: str, secret: bytes = STATE_SECRET) -> str:
    """Reproduce sso._sign_state with caller-controlled ts / nonce / secret."""
    payload = f"{ts}|{nonce}"
    sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}|{sig}"


def fresh_state() -> str:
    return sign(int(time.time()), secrets.token_urlsafe(16))


CALLBACK = "/api/gmail/oauth/callback"


# --- Group 1: Callback rejection (state attacks) ---------------------------


@pytest.mark.integration
def test_attack_no_state(client):
    """Drive-by: hit callback with just a code, no state at all."""
    res = client.get(f"{CALLBACK}?code=any_code")
    assert res.status_code == 400
    assert "state" in res.text.lower()


@pytest.mark.integration
def test_attack_no_code(client):
    """State present but no code — should still fail."""
    res = client.get(f"{CALLBACK}?state={fresh_state()}")
    assert res.status_code == 400


@pytest.mark.integration
def test_attack_forged_signature(client):
    """Attacker invents a state without knowing STATE_SECRET."""
    ts = int(time.time())
    forged = f"{ts}|some_nonce|deadbeef" + "0" * 56  # length-matched garbage
    res = client.get(f"{CALLBACK}?code=any_code&state={forged}")
    assert res.status_code == 400
    assert "signature" in res.text.lower()


@pytest.mark.integration
def test_attack_tampered_timestamp(client):
    """Take a real state, bump ts forward to dodge expiry — sig must break."""
    real = fresh_state()
    ts, nonce, sig = real.split("|", 2)
    tampered = f"{int(ts) + 99999}|{nonce}|{sig}"
    res = client.get(f"{CALLBACK}?code=any_code&state={tampered}")
    assert res.status_code == 400
    assert "signature" in res.text.lower()


@pytest.mark.integration
def test_attack_tampered_nonce(client):
    """Modify the nonce while keeping the original signature."""
    real = fresh_state()
    ts, _, sig = real.split("|", 2)
    tampered = f"{ts}|attacker_nonce|{sig}"
    res = client.get(f"{CALLBACK}?code=any_code&state={tampered}")
    assert res.status_code == 400
    assert "signature" in res.text.lower()


@pytest.mark.integration
def test_attack_expired_state(client):
    """State signed >10 min ago — HMAC valid but past TTL."""
    old_ts = int(time.time()) - 601  # STATE_MAX_AGE_SECONDS is 600
    expired = sign(old_ts, "any_nonce")
    res = client.get(f"{CALLBACK}?code=any_code&state={expired}")
    assert res.status_code == 400
    assert "expired" in res.text.lower()


@pytest.mark.integration
def test_attack_state_signed_with_different_secret(client):
    """Attacker guessed wrong secret (or we rotated ours)."""
    wrong = sign(int(time.time()), "any_nonce", secret=b"not-our-secret")
    res = client.get(f"{CALLBACK}?code=any_code&state={wrong}")
    assert res.status_code == 400
    assert "signature" in res.text.lower()


@pytest.mark.integration
@pytest.mark.parametrize(
    "garbage",
    [
        "totally-not-a-state",     # zero separators
        "only|one-separator",      # one separator
        "",                        # empty
        "||",                      # three empty segments
    ],
)
def test_attack_malformed_state(client, garbage):
    """Random/empty/half-formed strings in the state param."""
    res = client.get(f"{CALLBACK}?code=any_code&state={garbage}")
    assert res.status_code == 400


@pytest.mark.integration
def test_attack_google_error_param(client):
    """User denied consent — Google redirects with ?error=access_denied.
    Should render the popup HTML with a 400 status, not crash."""
    res = client.get(f"{CALLBACK}?error=access_denied")
    assert res.status_code == 400
    assert "access_denied" in res.text


# --- Group 2: Authenticated endpoints without a valid session --------------


@pytest.mark.integration
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/auth/me"),
        ("GET", "/api/conversations"),
        ("GET", "/api/conversations/00000000-0000-0000-0000-000000000000"),
        ("PATCH", "/api/conversations/00000000-0000-0000-0000-000000000000"),
        ("DELETE", "/api/conversations/00000000-0000-0000-0000-000000000000"),
        ("POST", "/api/chat"),
        ("GET", "/api/gmail/status"),
        ("POST", "/api/gmail/disconnect"),
    ],
)
def test_attack_unauthenticated_access(client, method, path):
    """No cookie set — every protected endpoint must 401."""
    res = client.request(method, path, json={})
    assert res.status_code == 401, (
        f"{method} {path} returned {res.status_code} without a session — "
        f"this endpoint is unauthenticated!"
    )


@pytest.mark.integration
def test_attack_garbage_session_cookie(client):
    """Attacker guesses a session token — DB lookup must return None → 401."""
    res = client.get(
        "/api/auth/me",
        cookies={"session": "obviously-not-a-real-session-token"},
    )
    assert res.status_code == 401


@pytest.mark.integration
def test_attack_empty_session_cookie(client):
    """Empty cookie value — treated as missing, must 401."""
    res = client.get("/api/auth/me", cookies={"session": ""})
    assert res.status_code == 401


# --- Group 3: State signature unit properties ------------------------------


@pytest.mark.unit
def test_sign_verify_roundtrip():
    """A state we just signed must verify cleanly."""
    from sso import _sign_state, _verify_state

    state = _sign_state()
    _verify_state(state)  # raises if invalid


@pytest.mark.unit
def test_single_byte_flip_in_signature_rejected():
    """Flipping any byte of the HMAC must invalidate it (avalanche check)."""
    from fastapi import HTTPException
    from sso import _sign_state, _verify_state

    state = _sign_state()
    ts, nonce, sig = state.split("|", 2)
    flipped_char = "f" if sig[-1] != "f" else "0"
    bad_sig = sig[:-1] + flipped_char
    bad_state = f"{ts}|{nonce}|{bad_sig}"

    with pytest.raises(HTTPException) as exc:
        _verify_state(bad_state)
    assert exc.value.status_code == 400


@pytest.mark.unit
def test_two_states_have_different_nonces():
    """Sanity: nonce makes back-to-back states distinct, even at the same ts."""
    from sso import _sign_state

    a = _sign_state()
    b = _sign_state()
    assert a != b, "States issued back-to-back should differ by nonce"
