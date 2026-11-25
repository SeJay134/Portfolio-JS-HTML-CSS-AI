"""Real local gateway/RLS integration. Never connects to a hosted project."""
import base64
import hashlib
import hmac
import json
import subprocess
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def run():
    # Exact local origin and container; do not accept arbitrary URL/key input.
    settings = json.loads(subprocess.check_output(
        ["supabase", "status", "-o", "json"], text=True))
    origin = settings.get("API_URL", "")
    parsed = urlparse(origin)
    if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost")
            or parsed.port != 54321 or parsed.path not in ("", "/")
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise RuntimeError("Expected disposable loopback Supabase API")
    origin = "http://127.0.0.1:54321"
    key = settings.get("PUBLISHABLE_KEY")
    legacy = False
    if not key:
        key = settings.get("ANON_KEY")
        legacy = True
    secret = settings.get("JWT_SECRET")
    if not key or not secret:
        raise RuntimeError("Local API credentials unavailable; no hosted fallback")
    if not legacy and not key.startswith("sb_publishable_"):
        raise RuntimeError("Expected local publishable key")
    print("Local API key mode:", "legacy anon (local only)" if legacy else "publishable")
    def sql(statement):
        subprocess.run(["docker", "exec", "-i", "supabase_db_sergei-portfolio-local",
                        "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
                       input=statement, text=True, check=True, stdout=subprocess.DEVNULL)
    sql(Path(__file__).with_name("fixtures.sql").read_text())

    def jwt(n, session=None, exp=None):
        now = int(time.time())
        payload = {"iss": "supabase", "aud": "authenticated", "role": "authenticated",
                   "sub": f"91000000-0000-0000-0000-00000000000{n}",
                   "session_id": session or f"92000000-0000-0000-0000-00000000000{n}",
                   "iat": now, "exp": exp if exp is not None else now + 300,
                   "app_metadata": {"provider": "google", "providers": ["google"]},
                   "user_metadata": {"role": "admin"}, "amr": [{"method": "oauth", "timestamp": now}]}
        def enc(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")
        data = enc({"alg": "HS256", "typ": "JWT"}) + b"." + enc(payload)
        return (data + b"." + base64.urlsafe_b64encode(
            hmac.new(secret.encode(), data, hashlib.sha256).digest()).rstrip(b"=")).decode()

    opener = build_opener(ProxyHandler({}), NoRedirect())
    checks = 0

    def request(path, token=None, method="GET", body=None, params=None, extra=None):
        headers = {"apikey": key, "Accept": "application/json", "Cache-Control": "no-store"}
        if token or legacy:
            headers["Authorization"] = "Bearer " + (token or key)
        if extra:
            headers.update(extra)
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = Request(origin + "/rest/v1/" + path + ("?" + urlencode(params) if params else ""),
                      data=data, headers=headers, method=method)
        try:
            with opener.open(req, timeout=10) as response:
                raw = response.read(2_000_000)
                return response.status, json.loads(raw) if raw else None
        except HTTPError as error:
            return error.code, None

    def check(condition, label):
        nonlocal checks
        if not condition:
            raise AssertionError(label)
        checks += 1
        print("PASS:", label)

    def rows(token=None, params=None):
        status, body = request("blog_posts", token, params=params or {"select": "slug"})
        check(status == 200 and isinstance(body, list), "post read succeeds")
        return body

    def slugs(token=None):
        return {row["slug"] for row in rows(token)}

    ordinary, owner = jwt(2), jwt(1)
    check(slugs() == {"api-live"}, "anonymous unfiltered read hides drafts, archive and future")
    embedded = rows(params={"select": "slug,blog_categories(name),blog_post_tags(blog_tags(name))"})
    check(embedded == [{"slug": "api-live", "blog_categories": {"name": "Public API category"},
                        "blog_post_tags": [{"blog_tags": {"name": "Public API tag"}}]}],
          "real PostgREST nested relation shape matches public reader")
    for table in ("blog_categories", "blog_tags", "blog_post_tags"):
        status, result = request(table)
        check(status == 200 and len(result) == 1, "anonymous taxonomy hides private rows: " + table)
    check(rows(params={"select": "slug,content", "slug": "eq.api-draft"}) == [],
          "direct draft slug cannot expose body")
    check(request("admin_allowlist", extra={"Accept-Profile": "private"})[0] >= 400,
          "private schema not exposed")
    check(request("blog_posts", method="POST", body={"slug":"api-attack","title":"Denied","author_name":"Fixture"})[0] in (401,403),
          "anonymous write denied")
    check(request("rpc/resolve_blog_admin", method="POST", body={})[0] in (401,403,404),
          "anonymous enrollment denied")
    check(slugs(ordinary) == {"api-live"}, "ordinary signed token cannot read drafts")
    check(request("rpc/resolve_blog_admin", ordinary, "POST", {}) == (200, False),
          "ordinary user with spoofed metadata cannot enroll")
    check(request("profiles", ordinary, "PATCH", {"role":"admin"},
                  {"id":"eq.91000000-0000-0000-0000-000000000002"})[0] in (401,403),
          "direct role escalation denied")
    check(request("blog_posts", ordinary, "POST", {"slug":"api-attack","title":"Denied","author_name":"Fixture"})[0] in (401,403),
          "ordinary insert denied")
    check(request("rpc/resolve_blog_admin", jwt(1, session="92000000-0000-0000-0000-000000000002"), "POST", {}) == (200, False),
          "wrong session owner denied")
    check(request("rpc/resolve_blog_admin", jwt(1, exp=int(time.time())-120), "POST", {})[0] in (401,403),
          "expired signed token denied by gateway")
    check(request("rpc/resolve_blog_admin", owner, "POST", {}) == (200, True),
          "verified synthetic owner enrolls through real API")
    check(slugs(owner) == {"api-live","api-draft","api-archive","api-future"},
          "bound admin can read all fixture posts")
    status, body = request("blog_posts", owner, "PATCH", {"status":"archived"},
                           {"slug":"eq.api-live"}, {"Prefer":"return=representation"})
    check(status == 200 and len(body) == 1, "admin archives through API")
    check(slugs() == set(), "archived post immediately disappears from anonymous API")
    sql("delete from auth.sessions where id='92000000-0000-0000-0000-000000000001';")
    check(request("rpc/resolve_blog_admin", owner, "POST", {}) == (200, False),
          "same signed token denied after session deletion")
    check(slugs(owner) == set(), "revoked session cannot read private rows")
    check(request("blog_posts", owner, "POST", {"slug":"api-revoked","title":"Denied","author_name":"Fixture"})[0] in (401,403),
          "revoked session cannot write")
    print(f"Real local Data API checks: {checks} passed")


if __name__ == "__main__":
    run()
