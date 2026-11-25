"""HTTP-only adapter using a scoped server capability, never a service key.

This adapter accepts a previously issued trusted capability. It does not mint
JWTs or expose a network endpoint. Local proof only until issuer, hosted
settings, process sandbox, concurrency and cleanup policy are approved.
"""
from __future__ import annotations

import hashlib
import json
import re
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler

from .promotion import Asset, PromotionError, UUID, DIGEST, check_asset
from .validator import MAX_BYTES, VerifiedJPEG


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class ScopedStore:
    def __init__(self, origin: str, publishable_key: str, capability: str, asset_id: str):
        if origin != "http://127.0.0.1:54321":
            raise PromotionError("Only the isolated local API is enabled")
        if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", publishable_key):
            raise PromotionError("Expected publishable key")
        if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", capability) or len(capability)>8000:
            raise PromotionError("Invalid capability")
        if not UUID.fullmatch(asset_id):
            raise PromotionError("Invalid asset identity")
        self._origin = origin
        self._key = publishable_key
        self._token = capability
        self._id = asset_id
        self._opener = build_opener(ProxyHandler({}), NoRedirect())

    def _request(self, path, method="GET", data=None, mime="application/json", limit=65536):
        req = Request(self._origin+path, data=data, method=method, headers={
            "apikey":self._key,"Authorization":"Bearer "+self._token,
            "Content-Type":mime,"Cache-Control":"no-store","x-upsert":"false"})
        try:
            with self._opener.open(req,timeout=12) as response:
                payload=response.read(limit+1)
                if len(payload)>limit:
                    raise PromotionError("Oversize upstream response")
                return response.status,payload
        except HTTPError as exc:
            return exc.code,b""
        except OSError:
            raise PromotionError("Media service unavailable") from None

    def _rpc(self, name, body):
        status, raw = self._request("/rest/v1/rpc/"+name,"POST",json.dumps(body).encode())
        if status!=200:
            raise PromotionError("Media unavailable")
        try:
            asset=Asset(**json.loads(raw))
            check_asset(asset,self._id)
            return asset
        except (ValueError,TypeError):
            raise PromotionError("Invalid metadata response") from None

    def authorized_asset(self, asset_id):
        if asset_id!=self._id:
            raise PromotionError("Outside capability scope")
        return self._rpc("get_media_worker_asset",{"p_id":asset_id})

    def _same(self, asset):
        if self.authorized_asset(asset.id)!=asset:
            raise PromotionError("Asset changed")

    def _object(self, bucket, asset):
        if bucket not in ("studio-media-quarantine","studio-media-verified") or asset.id!=self._id:
            raise PromotionError("Outside capability scope")
        return "/storage/v1/object/"+bucket+"/"+asset.key

    def read_quarantine(self, asset):
        self._same(asset)
        status,content=self._request(self._object("studio-media-quarantine",asset),limit=MAX_BYTES)
        if status!=200:
            raise PromotionError("Quarantine unavailable")
        return content

    def put_verified_immutable(self, asset, content):
        self._same(asset)
        if asset.state!="reserved" or not isinstance(content,bytes) or not 1<=len(content)<=MAX_BYTES:
            raise PromotionError("Invalid immutable write")
        path=self._object("studio-media-verified",asset)
        status,_=self._request(path,"POST",content,"image/jpeg")
        if status not in (200,201):
            status,existing=self._request(path,limit=MAX_BYTES)
            if status!=200 or existing!=content:
                raise PromotionError("Immutable write refused")

    def read_verified(self, asset):
        self._same(asset)
        status,content=self._request(self._object("studio-media-verified",asset),limit=MAX_BYTES)
        if status!=200:
            raise PromotionError("Verified media unavailable")
        return content

    def commit_verified(self, asset, image: VerifiedJPEG):
        self._same(asset)
        if (not DIGEST.fullmatch(image.sha256) or hashlib.sha256(image.content).hexdigest()!=image.sha256
            or len(image.content)!=image.byte_size or not 1<=image.byte_size<=MAX_BYTES
            or not 1<=image.width<=2200 or not 1<=image.height<=2200):
            raise PromotionError("Invalid receipt")
        if self.read_verified(asset)!=image.content:
            raise PromotionError("Verified bytes mismatch")
        return self._rpc("commit_media_worker_asset",{"p_id":asset.id,"p_sha256":image.sha256,
            "p_byte_size":image.byte_size,"p_width":image.width,"p_height":image.height})

    def cleanup_quarantine(self, asset):
        self._same(asset)
        if asset.state!="verified":
            raise PromotionError("Not committed")
        status,raw=self._request("/storage/v1/object/studio-media-quarantine","DELETE",
            json.dumps({"prefixes":[asset.key]}).encode())
        try:
            if status!=200 or not isinstance(json.loads(raw),list):
                raise PromotionError("Cleanup unavailable")
        except ValueError:
            raise PromotionError("Cleanup unavailable") from None
