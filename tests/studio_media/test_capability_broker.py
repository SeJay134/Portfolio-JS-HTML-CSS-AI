import json
import time
import unittest
from unittest.mock import Mock
from server.studio_media.capability_broker import CapabilityBroker, Grant
from server.studio_media.promotion import PromotionError

ASSET="99000000-0000-0000-0000-000000000001"
OWNER="91000000-0000-0000-0000-000000000001"
SESSION="92000000-0000-0000-0000-000000000001"


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.signer=Mock(return_value="fixture.payload.signature")
        self.broker=CapabilityBroker("http://127.0.0.1:54321","sb_publishable_fixture",self.signer)

    def test_rejects_hosted_and_service_keys(self):
        for origin,key in (("https://example.supabase.co","sb_publishable_fixture"),("http://127.0.0.1:54321","sb_secret_fixture")):
            with self.assertRaises(PromotionError):
                CapabilityBroker(origin,key,self.signer)

    def test_invalid_input_does_not_call_signer(self):
        for token,asset,target in (("invalid",ASSET,300000),("a.b.c","invalid",300000),("a.b.c",ASSET,0)):
            with self.assertRaises(PromotionError):
                self.broker.process(token,asset,target)
        self.signer.assert_not_called()

    def test_grant_shape_and_action(self):
        now=int(time.time())
        grant=Grant(ASSET,OWNER,SESSION,"cleanup",now,now+120)
        claims=grant.claims()
        self.assertEqual(claims["role"],"studio_media_worker")
        self.assertEqual(claims["studio_asset_id"],ASSET)
        self.assertEqual(claims["studio_media_action"],"cleanup")
        self.assertEqual(claims["session_id"],SESSION)

    def test_malformed_gateway_context_fails_before_signing(self):
        now=int(time.time())
        for body in ({"unexpected":True},dict(asset_id=ASSET,owner_id=OWNER,session_id=SESSION,action="cleanup",issued_at=now,expires_at=now+120),
                     dict(asset_id=ASSET,owner_id=OWNER,session_id=SESSION,action="promote",issued_at=now,expires_at=now+121)):
            response=Mock(status=200)
            response.read.return_value=json.dumps(body).encode()
            context=Mock()
            context.__enter__=Mock(return_value=response)
            context.__exit__=Mock(return_value=False)
            self.broker._opener=Mock()
            self.broker._opener.open.return_value=context
            with self.assertRaises(PromotionError):
                self.broker.process("a.b.c",ASSET)
        self.signer.assert_not_called()
