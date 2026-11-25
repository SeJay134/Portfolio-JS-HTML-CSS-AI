import json
import threading
import unittest
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError
from unittest.mock import Mock
from server.studio_media.local_service import LocalMediaServer, APP_ORIGIN, local_signer
from server.studio_media.promotion import Asset, PromotionResult, PromotionError
from server.studio_media.validator import MediaValidationError

ID="99000000-0000-0000-0000-000000000001"
OWNER="91000000-0000-0000-0000-000000000001"


class LocalServiceTests(unittest.TestCase):
    def setUp(self):
        self.broker=Mock()
        self.broker.process.return_value=PromotionResult(Asset(ID,OWNER,"verified","a"*64,500,96,64),False)
        self.server=LocalMediaServer(self.broker,0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.origin=f"http://127.0.0.1:{self.server.server_port}"
        self.opener=build_opener(ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def call(self, path="/promote", body=None, method="POST", headers=None):
        request_headers={"Origin":APP_ORIGIN,"Authorization":"Bearer a.b.c","Content-Type":"application/json"}
        request_headers.update(headers or {})
        req=Request(self.origin+path,method=method,headers=request_headers,
            data=json.dumps(body if body is not None else {"asset_id":ID,"target_bytes":300000}).encode() if method=="POST" else None)
        try:
            with self.opener.open(req,timeout=5) as response:
                raw=response.read()
                return response.status,json.loads(raw) if raw else None,response.headers
        except HTTPError as error:
            return error.code,json.loads(error.read()),error.headers

    def test_receipt_no_secrets_and_origin(self):
        status,body,headers=self.call()
        self.assertEqual(status,200)
        self.assertEqual(body["id"],ID)
        self.assertNotIn("owner_id",body)
        self.assertNotIn("token",body)
        self.assertEqual(headers["Cache-Control"],"no-store")
        self.assertEqual(headers["Access-Control-Allow-Origin"],APP_ORIGIN)
        self.broker.process.assert_called_once_with("a.b.c",ID,300000)

    def test_rejects_cross_origin_and_host_before_broker(self):
        for headers in ({"Origin":"https://example.com"},{"Origin":"null"},{"Host":"evil.example:5512"}):
            status,_,response=self.call(headers=headers)
            self.assertEqual(status,403)
            self.assertIsNone(response.get("Access-Control-Allow-Origin"))
        self.broker.process.assert_not_called()

    def test_strict_body_route_and_bearer(self):
        for body in ({"asset_id":ID,"target_bytes":True},{"asset_id":ID,"target_bytes":300000,"role":"service_role"},{"asset_id":"../x","target_bytes":300000},{"asset_id":ID,"target_bytes":5000001}):
            self.assertEqual(self.call(body=body)[0],400)
        self.assertEqual(self.call(headers={"Authorization":"Bearer malformed"})[0],401)
        self.assertEqual(self.call(path="/promote?x=1")[0],403)
        self.assertEqual(self.call(body={"x":"a"*2048})[0],400)
        self.broker.process.assert_not_called()

    def test_preflight_and_cleanup(self):
        status,_,headers=self.call(method="OPTIONS",headers={"Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type"})
        self.assertEqual(status,204)
        self.assertEqual(headers["Access-Control-Allow-Origin"],APP_ORIGIN)
        self.assertEqual(self.call(path="/cleanup",body={"asset_id":ID})[0],200)
        self.broker.cleanup_expired.assert_called_once_with("a.b.c",ID)

    def test_generic_errors(self):
        self.broker.process.side_effect=PromotionError("private fixture detail")
        status,body,_=self.call()
        self.assertEqual(status,409)
        self.assertNotIn("private fixture",body["error"])
        self.broker.process.side_effect=MediaValidationError("private codec detail")
        self.assertEqual(self.call()[0],422)

    def test_local_signer_cannot_sign_other_role(self):
        signer=local_signer("x"*40)
        with self.assertRaises(PromotionError):
            signer({"role":"service_role","studio_media_action":"promote","iat":0,"exp":120})
