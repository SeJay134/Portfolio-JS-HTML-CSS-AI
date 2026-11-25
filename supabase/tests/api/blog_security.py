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
    sql((Path(__file__).resolve().parents[2] / "test-fixtures" / "blog-api.sql").read_text())

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
    # Studio working copies are a separate private store; no public projection changes.
    draft = json.loads('{"id":"96000000-0000-0000-0000-000000000001","version":1,"title":"Private studio fixture","description":"Working copy","slug":"studio-fixture","category":"Test","tags":"SQL","author":"Fixture","seoTitle":"","seoDescription":"","blocks":[{"id":"97000000-0000-0000-0000-000000000001","kind":"paragraph","text":"","language":"","runs":[{"text":"Private body","bold":true,"href":"/blog/fixture/"}]}]}')
    args = {"p_id": draft["id"], "p_expected_revision": 0,
            "p_request_id": "98000000-0000-0000-0000-000000000001", "p_document": draft}
    check(request("rpc/list_studio_drafts", method="POST", body={})[0] in (401,403,404), "anonymous studio list denied")
    check(request("rpc/save_studio_draft", ordinary, "POST", args)[0] in (401,403), "ordinary studio write denied")
    check(request("rpc/list_studio_drafts", ordinary, "POST", {})[0] in (401,403), "ordinary studio list denied")
    status, saved = request("rpc/save_studio_draft", owner, "POST", args)
    check(status == 200 and saved["revision"] == 1, "admin saves private working copy")
    check(request("rpc/save_studio_draft", owner, "POST", args) == (200, saved), "idempotent retry")
    changed = {**args, "p_document": {**draft, "title": "Revision two"}, "p_expected_revision": 1,
               "p_request_id": "98000000-0000-0000-0000-000000000002"}
    check(request("rpc/save_studio_draft", owner, "POST", changed)[0] == 200, "second revision saved")
    stale = {**changed, "p_request_id": "98000000-0000-0000-0000-000000000003"}
    check(request("rpc/save_studio_draft", owner, "POST", stale)[0] >= 400, "stale update rejected")
    check(request("rpc/get_studio_draft", owner, "POST", {"p_id": draft["id"]})[1]["document"]["title"] == "Revision two", "current working copy restored")
    check(request("rpc/get_studio_draft", owner, "POST", {"p_id": draft["id"], "p_revision": 1})[1]["document"] == draft, "immutable previous revision restored")
    check(len(request("rpc/list_studio_revisions", owner, "POST", {"p_id": draft["id"]})[1]) == 2, "revision listing")
    check(len(request("rpc/list_studio_drafts", owner, "POST", {})[1]) == 1, "owner list")
    check(request("studio_drafts", owner, extra={"Accept-Profile": "private"})[0] >= 400, "private draft table not exposed")
    check(slugs() == {"api-live"}, "working copy absent from public blog")
    status, body = request("blog_posts", owner, "PATCH", {"status":"archived"},
                           {"slug":"eq.api-live"}, {"Prefer":"return=representation"})
    check(status == 200 and len(body) == 1, "admin archives through API")
    check(slugs() == set(), "archived post immediately disappears from anonymous API")
    # Real Storage gateway checks, not simulated storage.objects inserts.
    def storage(path, token=None, method="GET", data=None, mime=None, extra=None):
        headers = {"apikey": key, "Cache-Control": "no-store"}
        if token or legacy:
            headers["Authorization"] = "Bearer " + (token or key)
        if mime:
            headers["Content-Type"] = mime
        if extra:
            headers.update(extra)
        req = Request(origin + "/storage/v1/" + path, data=data, headers=headers, method=method)
        try:
            with opener.open(req, timeout=15) as response:
                return response.status
        except HTTPError as error:
            return error.code

    media_id = "99000000-0000-0000-0000-000000000001"
    media_args = {"p_id": media_id}
    check(request("rpc/reserve_studio_media", method="POST", body=media_args)[0] in (401,403,404), "anonymous media reservation denied")
    check(request("rpc/reserve_studio_media", ordinary, "POST", media_args)[0] in (401,403), "ordinary media reservation denied")
    status, reservation = request("rpc/reserve_studio_media", owner, "POST", media_args)
    check(status == 200 and reservation["state"] == "reserved" and reservation["max_bytes"] == 5000000, "admin reserves bounded media slot")
    media_key = "91000000-0000-0000-0000-000000000001/" + media_id + ".jpg"
    check(reservation["object_key"] == media_key, "server derives object key")
    check(request("rpc/reserve_studio_media", owner, "POST", media_args) == (200, reservation), "reservation idempotent")
    jpeg = base64.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDhaKKK9k8Y/9k=")
    quarantine = "object/studio-media-quarantine/" + media_key
    verified = "object/studio-media-verified/" + media_key
    check(storage(quarantine, method="POST", data=jpeg, mime="image/jpeg") >= 400, "anonymous quarantine write denied")
    check(storage(quarantine, ordinary, "POST", jpeg, "image/jpeg") >= 400, "ordinary quarantine write denied")
    check(storage("object/studio-media-quarantine/unknown.jpg", owner, "POST", jpeg, "image/jpeg") >= 400, "unreserved path denied")
    check(storage(verified, owner, "POST", jpeg, "image/jpeg") >= 400, "client verified bucket write denied")
    check(storage(quarantine, owner, "POST", jpeg, "image/jpeg") in (200,201), "reserved JPEG reaches quarantine")
    check(storage(quarantine, owner, "POST", jpeg, "image/jpeg", {"x-upsert":"true"}) >= 400, "overwrite denied")
    check(storage(quarantine, owner) >= 400, "quarantine cannot be downloaded even by owner")
    check(storage("object/public/studio-media-quarantine/" + media_key) >= 400, "public quarantine URL denied")
    check(storage("object/sign/studio-media-quarantine/" + media_key, owner, "POST", b'{"expiresIn":60}', "application/json") >= 400, "quarantine signed read denied")
    # Direct metadata updates are impossible. Byte verification belongs to 3D.2.
    check(request("studio_media_assets", owner, extra={"Accept-Profile":"private"})[0] >= 400, "private media table not exposed")
    # Promotion is exercised only in this disposable synthetic fixture suite.
    from local_media_promotion import FixtureStore
    from server.studio_media.promotion import promote, PromotionError
    from server.studio_media.validator import MediaValidationError
    from PIL import Image
    import io
    # Use a separately generated, truly decodable fixture for promotion.
    promotion_id = "99000000-0000-0000-0000-000000000004"
    status, promotion_slot = request("rpc/reserve_studio_media", owner, "POST", {"p_id":promotion_id})
    check(status == 200, "reserve promotion fixture")
    stream = io.BytesIO()
    with Image.new("RGB", (96,64), "steelblue") as image:
        image.save(stream, "JPEG", progressive=True)
    check(storage("object/studio-media-quarantine/"+promotion_slot["object_key"],owner,"POST",stream.getvalue(),"image/jpeg") in (200,201),"upload real JPEG for promotion")
    adapter = FixtureStore(settings, opener, request, owner)
    result = promote(adapter,promotion_id,300000)
    check(result.asset.state=="verified" and result.asset.width==96 and result.asset.height==64 and not result.cleanup_pending,"verified metadata and quarantine cleanup")
    retry = promote(adapter,promotion_id,300000)
    check(retry.asset==result.asset and not retry.cleanup_pending,"verified promotion retry idempotent")
    check(storage("object/studio-media-verified/"+promotion_slot["object_key"],owner)>=400,"verified object still private")
    check(storage("object/public/studio-media-verified/"+promotion_slot["object_key"])>=400,"public verified URL denied")
    try:
        promote(FixtureStore(settings,opener,request,ordinary),promotion_id)
    except PromotionError:
        check(True,"ordinary fixture cannot promote")
    else:
        raise AssertionError("ordinary fixture unexpectedly promoted")
    malformed_id = "99000000-0000-0000-0000-000000000005"
    status, malformed = request("rpc/reserve_studio_media",owner,"POST",{"p_id":malformed_id})
    check(status==200,"reserve malformed fixture")
    check(storage("object/studio-media-quarantine/"+malformed["object_key"],owner,"POST",b"<html>fixture</html>","image/jpeg") in (200,201),"quarantine MIME alone is not verification")
    try:
        promote(adapter,malformed_id)
    except MediaValidationError:
        check(adapter.authorized_asset(malformed_id).state=="reserved","invalid bytes not promoted")
    else:
        raise AssertionError("invalid bytes promoted")
    second_media_id = "99000000-0000-0000-0000-000000000002"
    status, second_media = request("rpc/reserve_studio_media", owner, "POST", {"p_id":second_media_id})
    check(status == 200, "reserve another slot before revocation")
    sql("delete from auth.sessions where id='92000000-0000-0000-0000-000000000001';")
    check(request("rpc/resolve_blog_admin", owner, "POST", {}) == (200, False),
          "same signed token denied after session deletion")
    check(slugs(owner) == set(), "revoked session cannot read private rows")
    check(request("blog_posts", owner, "POST", {"slug":"api-revoked","title":"Denied","author_name":"Fixture"})[0] in (401,403),
          "revoked session cannot write")
    check(request("rpc/get_studio_draft", owner, "POST", {"p_id": draft["id"]})[0] in (401,403), "revoked studio read denied")
    check(request("rpc/save_studio_draft", owner, "POST", args)[0] in (401,403), "revoked studio write denied")
    check(storage("object/studio-media-quarantine/" + second_media["object_key"], owner, "POST", jpeg, "image/jpeg") >= 400, "revoked session cannot use reserved upload")
    check(request("rpc/reserve_studio_media", owner, "POST", {"p_id":"99000000-0000-0000-0000-000000000003"})[0] in (401,403), "revoked reservation denied")
    try:
        promote(adapter,promotion_id)
    except PromotionError:
        check(True,"revoked token cannot retry promotion")
    else:
        raise AssertionError("revoked token promoted")
    print(f"Real local Data API checks: {checks} passed")


if __name__ == "__main__":
    run()
