"""Local-only trusted capability broker.

The user token is verified by the local Data API. The returned authorization
context is not a credential. Only a separately trusted signer can issue a
worker JWT. No signing secret is read here; no token is returned to a browser.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import hashlib
import re
import time
from typing import Callable
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler

from .promotion import PromotionError, UUID, promote, PromotionResult
from .scoped_store import ScopedStore, NoRedirect

Signer = Callable[[dict], str]


@dataclass(frozen=True)
class Grant:
    asset_id: str
    owner_id: str
    session_id: str
    action: str
    issued_at: int
    expires_at: int

    def claims(self) -> dict:
        return {"iss":"supabase","aud":"authenticated","role":"studio_media_worker",
            "sub":self.owner_id,"session_id":self.session_id,"iat":self.issued_at,
            "exp":self.expires_at,"studio_asset_id":self.asset_id,"studio_media_action":self.action,
            "app_metadata":{"provider":"google","providers":["google"]},
            "amr":[{"method":"oauth","timestamp":self.issued_at}]}


class CapabilityBroker:
    def __init__(self, origin: str, publishable_key: str, signer: Signer):
        if origin!="http://127.0.0.1:54321" or not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+",publishable_key):
            raise PromotionError("Only isolated local API enabled")
        self._origin,self._key,self._signer=origin,publishable_key,signer
        self._opener=build_opener(ProxyHandler({}),NoRedirect())

    def _authorize(self, user_token: str, asset_id: str, action: str) -> Grant:
        if (not isinstance(user_token,str) or len(user_token)>8000
            or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",user_token)
            or not isinstance(asset_id,str) or not UUID.fullmatch(asset_id) or action not in ("promote","cleanup","preview")):
            raise PromotionError("Invalid request")
        req=Request(self._origin+"/rest/v1/rpc/authorize_media_grant",method="POST",
          data=json.dumps({"p_id":asset_id,"p_action":action}).encode(),
          headers={"apikey":self._key,"Authorization":"Bearer "+user_token,"Content-Type":"application/json","Cache-Control":"no-store"})
        try:
            with self._opener.open(req,timeout=10) as response:
                raw=response.read(4097)
                if response.status!=200 or len(raw)>4096:
                    raise PromotionError("Authorization unavailable")
            grant=Grant(**json.loads(raw))
            if (grant.asset_id!=asset_id or grant.action!=action
                or not UUID.fullmatch(grant.owner_id) or not UUID.fullmatch(grant.session_id)
                or type(grant.issued_at) is not int or type(grant.expires_at) is not int
                or not 0<grant.expires_at-grant.issued_at<=120
                or grant.issued_at>int(time.time())+5 or grant.expires_at<=int(time.time())+5):
                raise PromotionError("Invalid authorization context")
            return grant
        except (OSError,ValueError,TypeError):
            raise PromotionError("Authorization unavailable") from None

    def _store(self, grant: Grant) -> ScopedStore:
        try:
            token=self._signer(grant.claims())
            return ScopedStore(self._origin,self._key,token,grant.asset_id)
        except (ValueError,TypeError,OSError):
            raise PromotionError("Capability issuance unavailable") from None

    def process(self,user_token: str,asset_id: str,target: int=300000) -> PromotionResult:
        if type(target) is not int or not 20000<=target<=5000000:
            raise PromotionError("Invalid target")
        grant=self._authorize(user_token,asset_id,"promote")
        return promote(self._store(grant),asset_id,target)

    def cleanup_expired(self,user_token: str,asset_id: str) -> bool:
        grant=self._authorize(user_token,asset_id,"cleanup")
        store=self._store(grant)
        key=grant.owner_id+"/"+grant.asset_id+".jpg"
        # Each deletion rechecks the scoped JWT, live user and rejected
        # tombstone in Storage RLS. No list, download or broad prefix.
        for bucket in ("studio-media-quarantine","studio-media-verified"):
            status,raw=store._request("/storage/v1/object/"+bucket,"DELETE",
                json.dumps({"prefixes":[key]}).encode())
            try:
                if status!=200 or not isinstance(json.loads(raw),list):
                    raise PromotionError("Cleanup pending")
            except ValueError:
                raise PromotionError("Cleanup pending") from None
        return True

    def preview(self,user_token: str,asset_id: str) -> bytes:
        grant=self._authorize(user_token,asset_id,"preview")
        store=self._store(grant)
        asset=store.authorized_asset(asset_id)
        if asset.state!="verified" or asset.owner_id!=grant.owner_id:
            raise PromotionError("Media unavailable")
        data=store.read_verified(asset)
        if len(data)!=asset.byte_size or hashlib.sha256(data).hexdigest()!=asset.sha256:
            raise PromotionError("Media integrity mismatch")
        if store.authorized_asset(asset_id)!=asset:
            raise PromotionError("Media unavailable")
        return data
