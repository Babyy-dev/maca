import argparse
import json
import urllib.error
import urllib.request
from uuid import uuid4


def post_json(url: str, payload: dict, timeout: float = 5.0) -> tuple[int, str]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        return exc.code, body
    except urllib.error.URLError as exc:
        return 0, str(exc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Security smoke checks for Project MACA API")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--attempts", type=int, default=30)
    args = parser.parse_args()

    register_url = f"{args.base_url}/auth/register"
    login_url = f"{args.base_url}/auth/login"
    marker = uuid4().hex[:8]
    email = f"security_{marker}@example.com"
    password = "StrongPass123!"
    username = f"security_{marker}"

    print("Running security smoke tests...")

    status, body = post_json(
        register_url,
        {
            "email": email,
            "username": username,
            "password": password,
        },
    )
    print(f"register_status={status}")
    if status not in {201, 409}:
        print(f"register_body={body}")

    inj_status, inj_body = post_json(
        login_url,
        {
            "email": email,
            "password": "' OR 1=1 --",
        },
    )
    print(f"sql_injection_login_status={inj_status}")
    if inj_status == 200:
        print("warning=sql_injection_style_password unexpectedly succeeded")
    else:
        print("ok=sql_injection_style_password_rejected")
        if inj_body:
            print(f"response={inj_body[:160]}")

    rate_limited = False
    locked = False
    for index in range(max(1, args.attempts)):
        status, _ = post_json(
            login_url,
            {
                "email": email,
                "password": "WrongPassword!",
            },
        )
        if status == 429:
            rate_limited = True
            print(f"rate_limit_triggered_at_attempt={index + 1}")
            break
        if status == 423:
            locked = True
            print(f"lockout_triggered_at_attempt={index + 1}")
            break

    if not rate_limited and not locked:
        print("warning=no_rate_limit_or_lockout_observed")
    print("done=true")


if __name__ == "__main__":
    main()
