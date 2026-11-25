"""Optional loopback-only staging HTTP service. Never deploy this module.

The local issuer uses the disposable stack signing secret. The secret is
privileged and is supplied only over stdin by the isolated launcher, never
by a browser or in an environment variable. A hosted issuer is NOT provided.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import re
import sys
from typing import Callable

from .capability_broker import CapabilityBroker
from .promotion import PromotionError, UUID
from .validator import MediaValidationError

APP_ORIGIN = "http://127.0.0.1:5511"
API_ORIGIN = "http://127.0.0.1:54321"
PORT = 5512
MAX_BODY = 1024


def local_signer(secret: str) -> Callable[[dict], str]:
    if not isinstance(secret, str) or not 32 <= len(secret) <= 1024:
        raise ValueError("Invalid disposable signing secret")
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")
    def sign(claims):
        # Internal call only: never accept claims from an HTTP request.
        if (claims.get("role") != "studio_media_worker"
                or claims.get("studio_media_action") not in ("promote", "cleanup", "preview")
                or not 0 < claims["exp"]-claims["iat"] <= 120):
            raise PromotionError("Invalid local capability")
        data = encode({"alg":"HS256","typ":"JWT"}) + b"." + encode(claims)
        return (data+b"."+base64.urlsafe_b64encode(hmac.new(secret.encode(),data,hashlib.sha256).digest()).rstrip(b"=")).decode()
    return sign


class LocalMediaServer(HTTPServer):
    # Serial request handling: only one image decode at once, bounded socket
    # reads. This is not a hardened internet-facing HTTP service.
    allow_reuse_address = False
    def __init__(self, broker: CapabilityBroker, port: int = PORT):
        self.broker = broker
        super().__init__(("127.0.0.1", port), LocalMediaHandler)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address

    def handle_error(self, request, client_address):
        # Do not log user tokens, object names or upstream exceptions.
        pass


class LocalMediaHandler(BaseHTTPRequestHandler):
    server_version = "StudioLocal"
    sys_version = ""
    def log_message(self, format, *args):
        pass

    def _trusted_origin(self):
        return (self.headers.get_all("Host")==[f"127.0.0.1:{self.server.server_port}"]
                and self.headers.get_all("Origin")==[APP_ORIGIN])

    def _reply(self, status, value=None, mime="application/json"):
        raw = value if mime=="image/jpeg" else json.dumps(value,separators=(",",":")).encode() if value is not None else b""
        self.send_response(status)
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Type",mime)
        self.send_header("Content-Length",str(len(raw)))
        self.send_header("Connection","close")
        if self._trusted_origin():
            self.send_header("Access-Control-Allow-Origin",APP_ORIGIN)
            self.send_header("Vary","Origin")
            self.send_header("Access-Control-Allow-Methods","POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers","Authorization, Content-Type")
        self.end_headers()
        self.close_connection=True
        if raw:
            self.wfile.write(raw)

    def do_OPTIONS(self):
        if (not self._trusted_origin() or self.path not in ("/promote","/cleanup","/preview")
            or self.headers.get("Access-Control-Request-Method")!="POST"):
            return self._reply(403,{"error":"Request denied"})
        requested={x.strip().lower() for x in self.headers.get("Access-Control-Request-Headers","").split(",") if x.strip()}
        if not requested.issubset({"authorization","content-type"}):
            return self._reply(403,{"error":"Request denied"})
        return self._reply(204)

    def do_GET(self):
        return self._reply(405,{"error":"Method not allowed"})

    def do_POST(self):
        if not self._trusted_origin() or self.path not in ("/promote","/cleanup","/preview"):
            return self._reply(403,{"error":"Request denied"})
        if self.headers.get("Transfer-Encoding") or self.headers.get_all("Content-Type")!=["application/json"]:
            return self._reply(400,{"error":"Invalid request"})
        lengths=self.headers.get_all("Content-Length") or []
        auth=self.headers.get_all("Authorization") or []
        if len(lengths)!=1 or not re.fullmatch(r"[0-9]{1,4}",lengths[0]) or not 1<=int(lengths[0])<=MAX_BODY:
            return self._reply(400,{"error":"Invalid request"})
        if len(auth)!=1 or len(auth[0])>8007 or not re.fullmatch(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",auth[0]):
            return self._reply(401,{"error":"Authorization required"})
        try:
            raw=self.rfile.read(int(lengths[0]))
            if len(raw)!=int(lengths[0]):
                raise ValueError()
            payload=json.loads(raw)
            if not isinstance(payload,dict) or set(payload)!=( {"asset_id","target_bytes"} if self.path=="/promote" else {"asset_id"} ):
                raise ValueError()
            asset_id=payload["asset_id"]
            if not isinstance(asset_id,str) or not UUID.fullmatch(asset_id):
                raise ValueError()
            if self.path=="/promote":
                target=payload["target_bytes"]
                if type(target) is not int or not 20000<=target<=5000000:
                    raise ValueError()
                result=self.server.broker.process(auth[0][7:],asset_id,target)
                asset=result.asset
                return self._reply(200,{"id":asset.id,"state":asset.state,"byte_size":asset.byte_size,
                    "width":asset.width,"height":asset.height,"sha256":asset.sha256,"cleanup_pending":result.cleanup_pending})
            if self.path=="/preview":
                return self._reply(200,self.server.broker.preview(auth[0][7:],asset_id),"image/jpeg")
            self.server.broker.cleanup_expired(auth[0][7:],asset_id)
            return self._reply(200,{"id":asset_id,"state":"rejected","cleanup_complete":True})
        except (UnicodeError,ValueError) as error:
            if isinstance(error,MediaValidationError):
                return self._reply(422,{"error":"JPEG validation failed"})
            return self._reply(400,{"error":"Invalid request"})
        except PromotionError:
            return self._reply(409,{"error":"Media unavailable or operation incomplete; retry with current authorization"})
        except OSError:
            return self._reply(503,{"error":"Local media service unavailable"})


def main():
    # This module is only launched explicitly by the local OAuth launcher.
    # No CLI argument, HTTP endpoint or environment variable accepts a key.
    try:
        if sys.argv[1:]!=["--isolated-staging"] or sys.version_info[:2]!=(3,12):
            raise ValueError()
        from PIL import __version__ as pillow_version
        if pillow_version!="13.0.0":
            raise ValueError()
        config=json.loads(sys.stdin.buffer.read(8193))
        if set(config)!={"publishable_key","jwt_secret","project","api_origin"} or config["project"]!="sergei-portfolio-oauth-staging" or config["api_origin"]!=API_ORIGIN:
            raise ValueError()
        broker=CapabilityBroker(API_ORIGIN,config["publishable_key"],local_signer(config["jwt_secret"]))
        del config
        with LocalMediaServer(broker) as service:
            service.serve_forever(poll_interval=.2)
    except (ValueError,TypeError,KeyError,OSError,ImportError,PromotionError):
        return 2
    return 0


if __name__=="__main__":
    raise SystemExit(main())
