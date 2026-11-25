"""Disposable synthetic-fixture adapter ONLY. Not a hosted/runtime adapter.

Use the existing loopback integration suite, never expose this as an endpoint.
No SQL writes to storage.objects. The local service key and postgres privileges
are test-runner capabilities only; hosted promotion requires a reviewed adapter.
"""
import base64
import hashlib
import hmac
import json
import subprocess
import time
from urllib.request import Request
from urllib.error import HTTPError

from server.studio_media.promotion import Asset, PromotionError, UUID, promote, DIGEST
from server.studio_media.validator import MAX_BYTES


class FixtureStore:
    def __init__(self, settings, opener, request, token):
        if settings.get("API_URL") not in ("http://127.0.0.1:54321", "http://localhost:54321"):
            raise PromotionError("Local fixture stack required")
        self.opener, self.request, self.token = opener, request, token
        self.service_key = settings.get("SERVICE_ROLE_KEY")
        self.secret = settings.get("JWT_SECRET")
        if not self.service_key or not self.secret:
            raise PromotionError("Local test credentials unavailable")
        self.claims = self._verified_claims(token)
        self.owner = self.claims["sub"]
        if self.owner not in ("91000000-0000-0000-0000-000000000001", "91000000-0000-0000-0000-000000000002"):
            raise PromotionError("Only synthetic fixture identities allowed")

    def _verified_claims(self, token):
        try:
            a, b, c = token.split(".")
            def decode(s):
                return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
            if json.loads(decode(a)).get("alg") != "HS256":
                raise ValueError()
            expected = hmac.new(self.secret.encode(), (a+"."+b).encode(), hashlib.sha256).digest()
            if not hmac.compare_digest(expected, decode(c)):
                raise ValueError()
            claims = json.loads(decode(b))
            if (claims.get("role") != "authenticated" or claims.get("aud") != "authenticated"
                    or type(claims.get("exp")) is not int or claims["exp"] <= time.time()
                    or not UUID.fullmatch(claims["sub"])):
                raise ValueError()
            return claims
        except (ValueError, TypeError, KeyError):
            raise PromotionError("Invalid local fixture token") from None

    def _db(self, statement):
        self._verified_claims(self.token)
        # Literal is base64, never SQL from JWT strings or untrusted filenames.
        claims = base64.b64encode(json.dumps(self.claims).encode()).decode()
        sql = ("begin; select set_config('request.jwt.claims',convert_from(decode('"+claims
               +"','base64'),'UTF8'),true);\n"+statement+";\ncommit;")
        try:
            result = subprocess.check_output(["docker","exec","-i","supabase_db_sergei-portfolio-local",
                "psql","-U","postgres","-d","postgres","-X","-qAt","-v","ON_ERROR_STOP=1"],
                input=sql, text=True, stderr=subprocess.DEVNULL, timeout=15)
            rows = result.strip().splitlines()
            if len(rows) < 2:
                raise PromotionError("Media unavailable")
            return Asset(**json.loads(rows[-1]))
        except (subprocess.SubprocessError, ValueError, TypeError):
            raise PromotionError("Media unavailable") from None

    @staticmethod
    def _fields():
        return "id,owner_id,state,sha256,byte_size,width,height"

    def authorized_asset(self, asset_id):
        if not UUID.fullmatch(asset_id):
            raise PromotionError("Invalid asset ID")
        status, _ = self.request("rpc/list_studio_drafts", self.token, "POST", {})
        if status != 200:
            raise PromotionError("Denied")
        return self._db("select row_to_json(t) from (select "+self._fields()+
            " from private.studio_media_assets where id='"+asset_id+"'::uuid and owner_id=auth.uid()"
            " and private.is_blog_admin() and (state='verified' or (state='reserved' and expires_at>now()))) t")

    def _storage(self, bucket, asset, method="GET", data=None):
        if bucket not in ("studio-media-quarantine","studio-media-verified") or asset.owner_id != self.owner:
            raise PromotionError("Invalid storage scope")
        req = Request("http://127.0.0.1:54321/storage/v1/object/"+bucket+"/"+asset.key,
            method=method, data=data, headers={"apikey":self.service_key,
            "Authorization":"Bearer "+self.service_key,"Content-Type":"image/jpeg","Cache-Control":"no-store"})
        try:
            with self.opener.open(req, timeout=15) as response:
                content = response.read(MAX_BYTES+1)
                if len(content)>MAX_BYTES:
                    raise PromotionError("Oversize storage response")
                return response.status,content
        except HTTPError as error:
            return error.code,b""
        except OSError:
            raise PromotionError("Storage unavailable") from None

    def _same(self, asset):
        if self.authorized_asset(asset.id) != asset:
            raise PromotionError("Asset changed")

    def read_quarantine(self, asset):
        self._same(asset)
        status,data = self._storage("studio-media-quarantine",asset)
        if status!=200:
            raise PromotionError("Quarantine unavailable")
        return data

    def put_verified_immutable(self, asset, content):
        self._same(asset)
        status,_ = self._storage("studio-media-verified",asset,"POST",content)
        if status not in (200,201):
            # Reconcile only byte-for-byte identical existing data.
            status,existing = self._storage("studio-media-verified",asset)
            if status!=200 or existing!=content:
                raise PromotionError("Immutable write failed")

    def read_verified(self, asset):
        self._same(asset)
        status,data = self._storage("studio-media-verified",asset)
        if status!=200:
            raise PromotionError("Verified media unavailable")
        return data

    def commit_verified(self, asset, image):
        self._same(asset)
        if (not DIGEST.fullmatch(image.sha256) or image.sha256!=hashlib.sha256(image.content).hexdigest()
            or type(image.byte_size) is not int or image.byte_size!=len(image.content)
            or not 1<=image.byte_size<=MAX_BYTES or type(image.width) is not int
            or type(image.height) is not int or not 1<=image.width<=2200 or not 1<=image.height<=2200):
            raise PromotionError("Invalid receipt")
        # Local metadata only. The owner and live session predicate are in the
        # same UPDATE as the reservation CAS. No client state transition RPC.
        return self._db("with changed as (update private.studio_media_assets set state='verified',"
            "verified_key=quarantine_key,byte_size="+str(image.byte_size)+",width="+str(image.width)+
            ",height="+str(image.height)+",sha256='"+image.sha256+"' where id='"+asset.id+
            "'::uuid and owner_id=auth.uid() and private.is_blog_admin() and state='reserved'"
            " and expires_at>now() returning "+self._fields()+") select row_to_json(changed) from changed")

    def cleanup_quarantine(self, asset):
        self._same(asset)
        if asset.state!="verified":
            raise PromotionError("Not committed")
        # Use the exact-path bulk removal contract used by Storage SDK.
        # A missing object is an empty successful removal, not a single
        # object DELETE error. Never treat arbitrary HTTP 400 as success.
        req = Request("http://127.0.0.1:54321/storage/v1/object/studio-media-quarantine",
            method="DELETE", data=json.dumps({"prefixes":[asset.key]}).encode(),
            headers={"apikey":self.service_key,"Authorization":"Bearer "+self.service_key,
                     "Content-Type":"application/json","Cache-Control":"no-store"})
        try:
            with self.opener.open(req, timeout=15) as response:
                raw = response.read(65537)
                if response.status != 200 or len(raw)>65536 or not isinstance(json.loads(raw),list):
                    raise PromotionError("Cleanup unavailable")
        except (OSError, ValueError):
            raise PromotionError("Cleanup unavailable") from None
