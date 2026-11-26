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
    check(status in (401,403), "admin cannot archive via direct projection API")
    check(slugs()=={"api-live"},"direct mutation has no effect")
    # Legacy fixture-only state change for isolation of the rest of the suite.
    sql("update public.blog_posts set status='archived' where slug='api-live';")
    check(slugs()==set(),"archived fixture hidden")
    publish_args={"p_id":draft["id"],"p_expected_revision":2,"p_expected_generation":0,
      "p_request_id":"98000000-0000-0000-0000-000000000020","p_action":"publish"}
    check(request("rpc/change_studio_publication",ordinary,"POST",publish_args)[0]>=400,"ordinary publication denied")
    check(request("rpc/change_studio_publication",method="POST",body=publish_args)[0]>=400,"anonymous publication denied")
    check(request("rpc/change_studio_publication",owner,"POST",{**publish_args,"p_expected_revision":1})[0]>=400,"stale revision cannot publish")
    status,published=request("rpc/change_studio_publication",owner,"POST",publish_args)
    check(status==200 and published["generation"]==1 and published["source_revision"]==2 and published["status"]=="published","saved revision published atomically")
    check(request("rpc/change_studio_publication",owner,"POST",publish_args)==(200,published),"publication retry exact receipt")
    check(request("rpc/change_studio_publication",owner,"POST",{**publish_args,"p_action":"archive"})[0]>=400,"publication request key cannot be repurposed")
    public_rows=rows(params={"select":"id,slug,title,content,blog_categories(name),blog_post_tags(blog_tags(name))"})
    check(len(public_rows)==1 and public_rows[0]["slug"]=="studio-fixture" and public_rows[0]["title"]=="Revision two","published projection visible")
    check(public_rows[0]["id"]!=draft["id"] and public_rows[0]["content"]==[{"type":"rich-paragraph","version":1,"runs":draft["blocks"][0]["runs"]}],"public projection excludes private draft ID")
    check(public_rows[0]["blog_categories"]=={"name":"Test"} and public_rows[0]["blog_post_tags"]==[{"blog_tags":{"name":"SQL"}}],"public taxonomy atomically linked")
    third={**changed,"p_expected_revision":2,"p_request_id":"98000000-0000-0000-0000-000000000021","p_document":{**draft,"title":"Unsaved-to-public revision three"}}
    check(request("rpc/save_studio_draft",owner,"POST",third)[0]==200,"private edit after publish")
    check(rows(params={"select":"title"})==[{"title":"Revision two"}],"private edit does not change publication")
    check(request("rpc/change_studio_publication",owner,"POST",{**publish_args,"p_expected_revision":3,"p_request_id":"98000000-0000-0000-0000-000000000022"})[0]>=400,"stale publication generation rejected")
    updated_args={**publish_args,"p_expected_revision":3,"p_expected_generation":1,"p_request_id":"98000000-0000-0000-0000-000000000023"}
    status,updated_pub=request("rpc/change_studio_publication",owner,"POST",updated_args)
    check(status==200 and updated_pub["source_revision"]==3 and updated_pub["generation"]==2,"explicit republish updates snapshot")
    check(rows(params={"select":"title"})==[{"title":"Unsaved-to-public revision three"}],"republished snapshot visible")
    unpublish={**updated_args,"p_expected_generation":2,"p_request_id":"98000000-0000-0000-0000-000000000024","p_action":"unpublish"}
    status,hidden=request("rpc/change_studio_publication",owner,"POST",unpublish)
    check(status==200 and hidden["status"]=="draft" and slugs()==set(),"unpublish removes anonymous projection")
    archive={**unpublish,"p_expected_generation":3,"p_request_id":"98000000-0000-0000-0000-000000000025","p_action":"archive"}
    status,archived=request("rpc/change_studio_publication",owner,"POST",archive)
    check(status==200 and archived["status"]=="archived" and slugs()==set(),"archive keeps projection private")
    check(request("rpc/get_studio_publication",owner,"POST",{"p_id":draft["id"]})==(200,archived),"owner publication state")
    check(request("studio_publication_events",owner,extra={"Accept-Profile":"private"})[0]>=400,"private publication history not exposed")
    # Accelerate the bounded lifecycle edge in the disposable fixture only.
    # The public RPC must never spend the final removal slots on publishing.
    sql("update private.studio_publications set generation=197 where draft_id='96000000-0000-0000-0000-000000000001';")
    last_publish={**updated_args,"p_expected_generation":197,"p_request_id":"98000000-0000-0000-0000-000000000028"}
    status,last_receipt=request("rpc/change_studio_publication",owner,"POST",last_publish)
    check(status==200 and last_receipt["generation"]==198 and slugs()=={"studio-fixture"},"last allowed publish retains removal budget")
    rejected={**last_publish,"p_expected_generation":198,"p_request_id":"98000000-0000-0000-0000-000000000029"}
    check(request("rpc/change_studio_publication",owner,"POST",rejected)[0]==400,"publish cannot exhaust removal budget")
    check(request("rpc/get_studio_publication",owner,"POST",{"p_id":draft["id"]})==(200,last_receipt),"limit rejection leaves projection unchanged")
    final_unpublish={**rejected,"p_action":"unpublish","p_request_id":"98000000-0000-0000-0000-000000000030"}
    status,final_hidden=request("rpc/change_studio_publication",owner,"POST",final_unpublish)
    check(status==200 and final_hidden["generation"]==199 and final_hidden["status"]=="draft" and slugs()==set(),"unpublish remains possible at limit")
    final_archive={**final_unpublish,"p_action":"archive","p_expected_generation":199,"p_request_id":"98000000-0000-0000-0000-000000000031"}
    status,final_archived=request("rpc/change_studio_publication",owner,"POST",final_archive)
    check(status==200 and final_archived["generation"]==200 and final_archived["status"]=="archived","archive remains possible at limit")
    check(request("rpc/change_studio_publication",owner,"POST",final_archive)==(200,final_archived),"final operation remains exactly retryable")
    check(request("rpc/change_studio_publication",owner,"POST",last_publish)==(200,last_receipt) and slugs()==set(),"old retry cannot republish archived content")
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
    # Scope proof uses ONLY a CI-generated short-lived local JWT. The runtime
    # adapter gets neither the local JWT signing secret nor service-role key.
    from server.studio_media.scoped_store import ScopedStore
    scoped_id = "99000000-0000-0000-0000-000000000006"
    status, scoped_slot = request("rpc/reserve_studio_media",owner,"POST",{"p_id":scoped_id})
    check(status==200,"reserve scoped worker fixture")
    scoped_q="object/studio-media-quarantine/"+scoped_slot["object_key"]
    scoped_v="object/studio-media-verified/"+scoped_slot["object_key"]
    check(storage(scoped_q,owner,"POST",stream.getvalue(),"image/jpeg") in (200,201),"upload scoped worker fixture")
    def worker_token(asset_id, ttl=120, user=1):
        # Sign only synthetic fixtures inside the isolated CI stack.
        now=int(time.time())
        claims={"iss":"supabase","aud":"authenticated","role":"studio_media_worker",
          "sub":f"91000000-0000-0000-0000-00000000000{user}",
          "session_id":f"92000000-0000-0000-0000-00000000000{user}",
          "iat":now,"exp":now+ttl,"studio_asset_id":asset_id,"studio_media_action":"promote",
          "app_metadata":{"provider":"google","providers":["google"]},"amr":[{"method":"oauth","timestamp":now}]}
        def enc(value):
            return base64.urlsafe_b64encode(json.dumps(value,separators=(",",":")).encode()).rstrip(b"=")
        message=enc({"alg":"HS256","typ":"JWT"})+b"."+enc(claims)
        return (message+b"."+base64.urlsafe_b64encode(hmac.new(secret.encode(),message,hashlib.sha256).digest()).rstrip(b"=")).decode()
    capability=worker_token(scoped_id)
    scoped=ScopedStore(origin,key,capability,scoped_id)
    check(request("rpc/get_media_worker_asset",owner,"POST",{"p_id":scoped_id})[0]>=400,"ordinary administrator cannot call worker RPC")
    check(request("rpc/get_media_worker_asset",capability,"POST",{"p_id":promotion_id})[0]>=400,"worker cannot access another asset ID")
    check(request("rpc/get_media_worker_asset",worker_token(scoped_id,ttl=180),"POST",{"p_id":scoped_id})[0]>=400,"worker overlong token denied")
    check(request("rpc/get_media_worker_asset",worker_token(scoped_id,user=2),"POST",{"p_id":scoped_id})[0]>=400,"worker wrong owner denied")
    check(storage(quarantine,capability)>=400,"worker cannot read other quarantine object")
    check(storage(scoped_q,capability)==200,"worker reads exact quarantine object")
    check(storage("object/sign/studio-media-quarantine/"+scoped_slot["object_key"],capability,"POST",b'{"expiresIn":60}',"application/json")>=400,"worker cannot sign quarantine URL")
    check(storage("object/studio-media-quarantine/"+scoped_slot["object_key"],capability,"POST",stream.getvalue(),"image/jpeg",{"x-upsert":"true"})>=400,"worker cannot overwrite quarantine")
    check(request("rpc/commit_media_worker_asset",capability,"POST",{"p_id":scoped_id,"p_sha256":"a"*64,"p_byte_size":42,"p_width":1,"p_height":1})[0]>=400,"metadata cannot be committed without verified object")
    scoped_result=promote(scoped,scoped_id,300000)
    check(scoped_result.asset.state=="verified" and not scoped_result.cleanup_pending,"scoped worker promotes without service role or postgres")
    check(promote(scoped,scoped_id,300000)==scoped_result,"scoped worker retry idempotent")
    check(storage(scoped_v,owner)>=400,"browser admin cannot read verified object")
    check(storage("object/sign/studio-media-verified/"+scoped_slot["object_key"],capability,"POST",b'{"expiresIn":60}',"application/json")>=400,"worker cannot sign verified URL")
    check(storage(scoped_v,capability,"DELETE")>=400,"worker cannot delete verified object")
    check(storage(scoped_v,capability,"POST",stream.getvalue(),"image/jpeg",{"x-upsert":"true"})>=400,"worker cannot overwrite verified object")
    # The broker uses authorization returned by the real authenticated RPC;
    # only CI has the local signing key. No signing secret is passed to the worker.
    from server.studio_media.capability_broker import CapabilityBroker
    issued=[]
    def local_signer(claims):
        issued.append(claims.copy())
        def enc(value):
            return base64.urlsafe_b64encode(json.dumps(value,separators=(",",":")).encode()).rstrip(b"=")
        message=enc({"alg":"HS256","typ":"JWT"})+b"."+enc(claims)
        return (message+b"."+base64.urlsafe_b64encode(hmac.new(secret.encode(),message,hashlib.sha256).digest()).rstrip(b"=")).decode()
    broker=CapabilityBroker(origin,key,local_signer)
    broker_id="99000000-0000-0000-0000-000000000007"
    status, broker_slot=request("rpc/reserve_studio_media",owner,"POST",{"p_id":broker_id})
    check(status==200,"reserve broker fixture")
    check(storage("object/studio-media-quarantine/"+broker_slot["object_key"],owner,"POST",stream.getvalue(),"image/jpeg") in (200,201),"upload broker fixture")
    for token in (ordinary,jwt(1,session="92000000-0000-0000-0000-000000000002"),jwt(1,exp=int(time.time())-120)):
        try:
            broker.process(token,broker_id)
        except PromotionError:
            check(not issued,"denied token never reaches signer")
        else:
            raise AssertionError("broker authorized denied user")
    broker_result=broker.process(owner,broker_id)
    check(broker_result.asset.state=="verified" and not broker_result.cleanup_pending,"broker authorizes and promotes through scoped adapter")
    check(issued[-1]["sub"]=="91000000-0000-0000-0000-000000000001" and issued[-1]["studio_asset_id"]==broker_id and issued[-1]["exp"]-issued[-1]["iat"]<=120,"grant binds trusted owner, asset and expiry")
    for protected_id in (broker_id,malformed_id):
        try:
            broker.cleanup_expired(owner,protected_id)
        except PromotionError:
            check(True,"verified or active reservation cannot be cleaned")
        else:
            raise AssertionError("protected media cleanup granted")
    # Test-only fixture ages a failed reservation. The application never
    # directly alters storage.objects or client-controlled expiry.
    sql("update private.studio_media_assets set expires_at=now()-interval '16 minutes' where id='"+malformed_id+"'::uuid;")
    check(broker.cleanup_expired(owner,malformed_id),"expired quarantine cleanup authorized")
    check(broker.cleanup_expired(owner,malformed_id),"expired cleanup retry idempotent")
    cleanup_token=local_signer(issued[-1])
    check(storage("object/studio-media-quarantine/"+malformed["object_key"],cleanup_token)>=400,"cleanup capability cannot download")
    check(request("rpc/get_media_worker_asset",cleanup_token,"POST",{"p_id":malformed_id})[0]>=400,"cleanup capability cannot read promotion metadata")
    check(request("rpc/reserve_studio_media",owner,"POST",{"p_id":malformed_id})[0]>=400,"expired tombstone cannot be reused")
    check(storage("object/studio-media-verified/"+broker_slot["object_key"],cleanup_token,"DELETE")>=400,"cleanup scope cannot delete verified media")
    # Actual HTTP boundary, with real broker/Storage and disposable signer.
    from server.studio_media.local_service import LocalMediaServer, APP_ORIGIN
    import threading
    http_id="99000000-0000-0000-0000-000000000008"
    status,http_slot=request("rpc/reserve_studio_media",owner,"POST",{"p_id":http_id})
    check(status==200,"reserve local HTTP service fixture")
    check(storage("object/studio-media-quarantine/"+http_slot["object_key"],owner,"POST",stream.getvalue(),"image/jpeg") in (200,201),"upload local HTTP fixture")
    with LocalMediaServer(broker,0) as service:
        thread=threading.Thread(target=service.serve_forever,daemon=True)
        thread.start()
        try:
            def local_http(token, browser_origin=APP_ORIGIN):
                req=Request(f"http://127.0.0.1:{service.server_port}/promote",method="POST",
                    headers={"Origin":browser_origin,"Authorization":"Bearer "+token,"Content-Type":"application/json"},
                    data=json.dumps({"asset_id":http_id,"target_bytes":300000}).encode())
                try:
                    with opener.open(req,timeout=30) as response:
                        return response.status,json.loads(response.read(4096)),response.headers.get("Access-Control-Allow-Origin")
                except HTTPError as error:
                    return error.code,None,error.headers.get("Access-Control-Allow-Origin")
            before=len(issued)
            check(local_http(owner,"https://example.invalid")==(403,None,None),"local HTTP foreign origin refused")
            check(local_http(ordinary)[0]==409 and len(issued)==before,"local HTTP nonadmin denied before issuance")
            status,receipt,cors=local_http(owner)
            check(status==200 and receipt["state"]=="verified" and receipt["id"]==http_id and cors==APP_ORIGIN and not receipt["cleanup_pending"],"local HTTP real promotion")
            check("token" not in receipt and "owner_id" not in receipt,"local HTTP returns no capability")
            check(local_http(owner)[1]==receipt,"local HTTP retry idempotent")
        finally:
            service.shutdown()
            thread.join(timeout=3)
    # Persistent owner-only library and exact read-only preview.
    status,library=request("rpc/list_studio_media",owner,"POST",{})
    check(status==200 and isinstance(library,list) and len(library)<=20,"owner media library loads")
    check(any(a["id"]==http_id and a["state"]=="verified" for a in library),"verified asset survives separate library request")
    check(all(set(a)=={"id","state","created_at","expires_at","byte_size","width","height","sha256"} for a in library),"library excludes owner IDs and storage paths")
    check(request("rpc/list_studio_media",ordinary,"POST",{})[0]>=400,"ordinary library denied")
    check(request("rpc/list_studio_media",method="POST",body={})[0]>=400,"anonymous library denied")
    check(request("rpc/list_studio_media",capability,"POST",{})[0]>=400,"worker cannot list library")
    check(request("rpc/authorize_media_grant",owner,"POST",{"p_id":malformed_id,"p_action":"preview"})[0]>=400,"rejected asset cannot preview")
    preview_data=broker.preview(owner,http_id)
    check(hashlib.sha256(preview_data).hexdigest()==receipt["sha256"],"verified preview bytes match digest")
    preview_token=local_signer(issued[-1])
    check(storage("object/studio-media-verified/"+http_slot["object_key"],preview_token)==200,"preview worker can read exact verified object")
    check(storage(scoped_v,preview_token)>=400,"preview worker cannot read different verified object")
    check(storage("object/studio-media-quarantine/"+http_slot["object_key"],preview_token)>=400,"preview worker cannot read quarantine")
    check(storage("object/sign/studio-media-verified/"+http_slot["object_key"],preview_token,"POST",b'{"expiresIn":60}',"application/json")>=400,"preview worker cannot sign URL")
    check(storage("object/studio-media-verified/"+http_slot["object_key"],preview_token,"POST",stream.getvalue(),"image/jpeg",{"x-upsert":"true"})>=400,"preview worker cannot write")
    check(request("rpc/commit_media_worker_asset",preview_token,"POST",{"p_id":http_id,"p_sha256":receipt["sha256"],"p_byte_size":receipt["byte_size"],"p_width":96,"p_height":64})[0]>=400,"preview worker cannot commit")
    with LocalMediaServer(broker,0) as service:
        thread=threading.Thread(target=service.serve_forever,daemon=True)
        thread.start()
        try:
            req=Request(f"http://127.0.0.1:{service.server_port}/preview",method="POST",
                headers={"Origin":APP_ORIGIN,"Authorization":"Bearer "+owner,"Content-Type":"application/json"},
                data=json.dumps({"asset_id":http_id}).encode())
            with opener.open(req,timeout=30) as response:
                check(response.status==200 and response.headers.get("Content-Type")=="image/jpeg" and response.headers.get("Cache-Control")=="no-store" and response.read()==preview_data,"HTTP private JPEG preview verified")
        finally:
            service.shutdown()
            thread.join(timeout=3)
    # Save media in immutable v2 revisions; reject missing or unverified references atomically.
    media_draft={**draft,"id":"98000000-0000-0000-0000-000000000009","version":2,"slug":"media-reference-fixture",
        "cover":{"assetId":http_id,"alt":"Fixture cover","caption":"Cover caption"},
        "blocks":[{"id":"97000000-0000-0000-0000-000000000009","kind":"gallery","text":"","language":"","runs":[{"text":""}],
            "images":[{"assetId":scoped_id,"alt":"First","caption":""},{"assetId":broker_id,"alt":"Second","caption":"Fixture"}]}]}
    media_args={"p_id":media_draft["id"],"p_expected_revision":0,"p_request_id":"96000000-0000-0000-0000-000000000009","p_document":media_draft}
    status,media_saved=request("rpc/save_studio_draft",owner,"POST",media_args)
    check(status==200 and media_saved["revision"]==1,"v2 cover and gallery saved atomically")
    check(request("rpc/change_studio_publication",owner,"POST",{"p_id":media_draft["id"],"p_expected_revision":1,"p_expected_generation":0,"p_request_id":"98000000-0000-0000-0000-000000000026","p_action":"publish"})[0]>=400,"media publication fails closed until public route exists")
    check(request("rpc/save_studio_draft",owner,"POST",media_args)==(200,media_saved),"v2 save retry idempotent")
    check(request("rpc/get_studio_draft",owner,"POST",{"p_id":media_draft["id"],"p_revision":1})[1]["document"]==media_draft,"v2 revision preserves media references and captions")
    invalid_media={**media_draft,"cover":{"assetId":malformed_id,"alt":"","caption":""}}
    check(request("rpc/save_studio_draft",owner,"POST",{**media_args,"p_expected_revision":1,"p_request_id":"96000000-0000-0000-0000-000000000010","p_document":invalid_media})[0]>=400,"unverified asset reference denied")
    missing_media={**media_draft,"cover":{"assetId":"99000000-0000-0000-0000-000000000099","alt":"","caption":""}}
    check(request("rpc/save_studio_draft",owner,"POST",{**media_args,"p_expected_revision":1,"p_request_id":"96000000-0000-0000-0000-000000000011","p_document":missing_media})[0]>=400,"missing asset reference denied")
    check(request("rpc/get_studio_draft",owner,"POST",{"p_id":media_draft["id"]})[1]["revision"]==1,"failed reference save rolls back working copy")
    no_media={**media_draft,"cover":None,"blocks":[]}
    check(request("rpc/save_studio_draft",owner,"POST",{**media_args,"p_expected_revision":1,"p_request_id":"96000000-0000-0000-0000-000000000012","p_document":no_media})[0]==200,"remove references creates new revision")
    check(request("rpc/get_studio_draft",owner,"POST",{"p_id":media_draft["id"],"p_revision":1})[1]["document"]==media_draft,"old media references survive removal")
    check(request("studio_revision_media",owner,extra={"Accept-Profile":"private"})[0]>=400,"private reference table inaccessible")
    # Scoped public delivery proof is mandatory in every disposable API run.
    def public_token(asset_id, ttl=60, action="read", subject="a9000000-0000-0000-0000-000000000001"):
        now=int(time.time())
        return local_signer({"iss":"supabase","aud":"authenticated","role":"studio_public_media_reader",
            "sub":subject,"iat":now,"exp":now+ttl,"studio_public_asset_id":asset_id,"studio_public_action":action})
    rpc="rpc/resolve_public_media"
    token=public_token(scoped_id)
    body={"p_id":scoped_id}
    check(request(rpc,owner,"POST",body)[0]>=400,"owner cannot invoke public delivery resolver")
    check(request(rpc,method="POST",body=body)[0]>=400,"anon cannot invoke public delivery resolver")
    check(request(rpc,token,"POST",body)==(200,None),"verified draft has no public eligibility")
    check(storage(scoped_v,token)>=400,"draft bytes denied even with scoped delivery capability")
    # Synthetic projection only, through postgres in disposable CI. Real
    # publication RPC remains fail-closed. Use a fresh saved revision.
    clean={**media_draft,"cover":{**media_draft["cover"],"caption":""}}
    status,saved_media=request("rpc/save_studio_draft",owner,"POST",{**media_args,
        "p_expected_revision":2,"p_request_id":"96000000-0000-0000-0000-000000000013","p_document":clean})
    check(status==200 and saved_media["revision"]==3,"delivery fixture saved revision")
    sql("""
    begin;
    insert into public.blog_categories(id,slug,name) values('93000000-0000-0000-0000-000000000099','media-delivery-fixture','Media delivery fixture');
    insert into public.blog_posts(id,author_name,category_id,slug,title,description,content,cover_image,cover_alt,cover_width,cover_height,status,published_at)
    select '95000000-0000-0000-0000-000000000099','Fixture','93000000-0000-0000-0000-000000000099',
      'media-delivery-fixture','Fixture','Fixture',m->'blocks',m->'cover'->>'src',m->'cover'->>'alt',
      (m->'cover'->>'width')::int,(m->'cover'->>'height')::int,'published',now()
    from private.prepare_studio_publication_media('98000000-0000-0000-0000-000000000009',3) m;
    insert into private.studio_publications(draft_id,post_id,source_revision,generation)
      values('98000000-0000-0000-0000-000000000009','95000000-0000-0000-0000-000000000099',3,1);
    insert into private.studio_publication_events(draft_id,generation,request_id,action,expected_revision,source_revision,receipt)
      values('98000000-0000-0000-0000-000000000009',1,'98000000-0000-0000-0000-000000000099','publish',3,3,'{}');
    select private.bind_studio_publication_media('98000000-0000-0000-0000-000000000009',1);
    commit;
    """)
    token=public_token(scoped_id)
    status,meta=request(rpc,token,"POST",body)
    check(status==200 and meta=={"id":scoped_id,"key":scoped_slot["object_key"],
        "byte_size":scoped_result.asset.byte_size,"sha256":scoped_result.asset.sha256},"scoped resolver returns exact verified metadata")
    check(storage(scoped_v,token)==200,"real published JPEG scoped GET")
    def prove_public_http(expected_status, digest=None):
        subprocess.run(["node", str(Path(__file__).with_name("public_media_http.mjs"))],
            input=json.dumps({"key":key,"token":public_token(scoped_id),"assetId":scoped_id,
                "expectedStatus":expected_status,"sha256":digest}),text=True,check=True,timeout=30)
        check(True,"real public media HTTP route status "+str(expected_status))
    prove_public_http(200,meta["sha256"])
    check(storage(scoped_v)>=400 and storage(scoped_v,owner)>=400,"anon and owner still denied direct Storage")
    check(storage("object/public/studio-media-verified/"+scoped_slot["object_key"])>=400,"public bucket URL denied")
    check(storage("object/studio-media-verified/"+http_slot["object_key"],token)>=400,"capability cannot read another published asset")
    check(storage("object/studio-media-quarantine/"+scoped_slot["object_key"],token)>=400,"quarantine denied")
    check(request(rpc,token,"POST",{"p_id":http_id})[0]>=400,"other resolver identity denied")
    for invalid in (public_token(scoped_id,ttl=61),public_token(scoped_id,ttl=-120),
                    public_token(scoped_id,action="sign"),public_token(scoped_id,subject="91000000-0000-0000-0000-000000000001")):
        check(request(rpc,invalid,"POST",body)[0]>=400 and storage(scoped_v,invalid)>=400,"invalid delivery capability denied")
    check(storage("object/sign/studio-media-verified/"+scoped_slot["object_key"],token,"POST",b'{"expiresIn":60}',"application/json")>=400,"delivery cannot sign URL")
    check(storage(scoped_v,token,"POST",jpeg,"image/jpeg",{"x-upsert":"true"})>=400,"delivery cannot overwrite")
    check(storage(scoped_v,token,"DELETE")>=400,"delivery cannot delete")
    status_list=storage("object/list/studio-media-verified",token,"POST",b'{"prefix":"","limit":100,"offset":0}',"application/json")
    # Storage list can return 200 with zero visible rows. Inspect body in that case.
    if status_list==200:
        req=Request(origin+"/storage/v1/object/list/studio-media-verified",method="POST",
            headers={"apikey":key,"Authorization":"Bearer "+token,"Content-Type":"application/json"},
            data=b'{"prefix":"","limit":100,"offset":0}')
        with opener.open(req,timeout=10) as response:
            check(json.loads(response.read())==[],"delivery listing returns no rows")
    else:
        check(status_list>=400,"delivery listing denied")
    sql("update public.blog_posts set status='draft',published_at=null where id='95000000-0000-0000-0000-000000000099';")
    check(request(rpc,token,"POST",body)==(200,None),"same capability loses eligibility on withdrawal")
    check(storage(scoped_v,token)>=400,"same capability cannot GET withdrawn bytes")
    prove_public_http(404)
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
    check(request("rpc/get_media_worker_asset",capability,"POST",{"p_id":scoped_id})[0]>=400,"revoked scoped capability cannot read metadata")
    check(storage(scoped_v,capability)>=400,"revoked scoped capability cannot read verified bytes")
    issued_before=len(issued)
    try:
        broker.process(owner,broker_id)
    except PromotionError:
        check(len(issued)==issued_before,"revoked session cannot obtain new capability")
    else:
        raise AssertionError("revoked broker authorization")
    check(request("rpc/list_studio_media",owner,"POST",{})[0]>=400,"revoked library access denied")
    check(storage("object/studio-media-verified/"+http_slot["object_key"],preview_token)>=400,"revoked preview token denied")
    check(request("rpc/change_studio_publication",owner,"POST",last_publish)[0] in (401,403),"revoked session cannot replay publication receipt")
    check(request("rpc/change_studio_publication",owner,"POST",{**final_archive,"p_request_id":"98000000-0000-0000-0000-000000000027","p_action":"publish"})[0] in (401,403),"revoked session cannot publish")
    print(f"Real local Data API checks: {checks} passed")


if __name__ == "__main__":
    run()
