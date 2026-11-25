import io
import unittest
from dataclasses import replace

from PIL import Image
from server.studio_media.promotion import Asset, PromotionError, promote
from server.studio_media.validator import MediaValidationError

ASSET = "99000000-0000-0000-0000-000000000001"
OWNER = "91000000-0000-0000-0000-000000000001"


class Store:
    def __init__(self):
        self.asset = Asset(ASSET, OWNER, "reserved")
        output = io.BytesIO()
        with Image.new("RGB", (64, 32), "steelblue") as image:
            image.save(output, "JPEG")
        self.raw = output.getvalue()
        self.verified = None
        self.denied = self.fail_commit = self.fail_cleanup = False
        self.writes = self.commits = self.deletes = 0

    def authorized_asset(self, asset_id):
        if self.denied or asset_id != self.asset.id:
            raise PromotionError("Denied")
        return self.asset

    def read_quarantine(self, asset):
        return self.raw

    def put_verified_immutable(self, asset, content):
        if self.verified is not None and self.verified != content:
            raise PromotionError("Existing object mismatch")
        if self.verified is None:
            self.writes += 1
            self.verified = content

    def commit_verified(self, asset, image):
        if self.fail_commit or self.denied:
            raise PromotionError("Commit refused")
        self.commits += 1
        self.asset = replace(asset, state="verified", sha256=image.sha256,
                             byte_size=image.byte_size, width=image.width, height=image.height)
        return self.asset

    def read_verified(self, asset):
        return self.verified

    def cleanup_quarantine(self, asset):
        if self.fail_cleanup:
            raise PromotionError("Cleanup interrupted")
        self.deletes += int(self.raw is not None)
        self.raw = None


class PromotionTests(unittest.TestCase):
    def test_real_normalization_and_idempotent_retry(self):
        store = Store()
        result = promote(store, ASSET, 300000)
        self.assertEqual(result.asset.state, "verified")
        self.assertFalse(result.cleanup_pending)
        self.assertEqual(promote(store, ASSET, 300000), result)
        self.assertEqual((store.writes, store.commits, store.deletes), (1, 1, 1))

    def test_invalid_data_never_promoted(self):
        store = Store()
        store.raw = b"<html>invalid JPEG</html>"
        with self.assertRaises(MediaValidationError):
            promote(store, ASSET)
        self.assertEqual((store.writes, store.commits, store.deletes), (0, 0, 0))

    def test_commit_failure_retains_private_object_then_reconciles(self):
        store = Store()
        store.fail_commit = True
        with self.assertRaises(PromotionError):
            promote(store, ASSET)
        self.assertEqual(store.asset.state, "reserved")
        self.assertIsNotNone(store.verified)
        self.assertIsNotNone(store.raw)
        store.fail_commit = False
        self.assertEqual(promote(store, ASSET).asset.state, "verified")
        self.assertEqual(store.writes, 1)

    def test_cleanup_failure_is_reported_and_retryable(self):
        store = Store()
        store.fail_cleanup = True
        self.assertTrue(promote(store, ASSET).cleanup_pending)
        store.fail_cleanup = False
        self.assertFalse(promote(store, ASSET).cleanup_pending)
        self.assertEqual((store.writes, store.commits, store.deletes), (1, 1, 1))

    def test_revoked_access_or_mismatched_verified_bytes_fail_closed(self):
        store = Store()
        promote(store, ASSET)
        store.denied = True
        with self.assertRaises(PromotionError):
            promote(store, ASSET)
        store.denied = False
        store.verified = b"changed"
        with self.assertRaises(PromotionError):
            promote(store, ASSET)

    def test_wrong_asset_identity_or_existing_object_never_overwritten(self):
        store = Store()
        with self.assertRaises(PromotionError):
            promote(store, "not-a-uuid")
        store.verified = b"foreign object"
        with self.assertRaises(PromotionError):
            promote(store, ASSET)
        self.assertEqual(store.verified, b"foreign object")
        self.assertEqual(store.commits, 0)
