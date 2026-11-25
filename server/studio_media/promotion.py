"""Promotion orchestration, with an explicitly trusted, server-only storage adapter.

No network endpoint, token parsing, secrets, database or cloud configuration here.
The adapter MUST authorize each operation and atomically check authorization
again when committing metadata. Never use an adapter controlled by a client.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re
from typing import Protocol

from .validator import MAX_BYTES, MIN_TARGET, VerifiedJPEG, validate_media

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")


class PromotionError(RuntimeError):
    pass


@dataclass(frozen=True)
class Asset:
    id: str
    owner_id: str
    state: str
    sha256: str | None = None
    byte_size: int | None = None
    width: int | None = None
    height: int | None = None

    @property
    def key(self) -> str:
        if not UUID.fullmatch(self.id) or not UUID.fullmatch(self.owner_id):
            raise PromotionError("Invalid asset identity")
        return f"{self.owner_id}/{self.id}.jpg"


class TrustedStore(Protocol):
    def authorized_asset(self, asset_id: str) -> Asset:
        """Verify current caller/session, ownership, reservation lifetime or verified state."""
    def read_quarantine(self, asset: Asset) -> bytes:
        """Read bounded bytes from exactly this private key."""
    def put_verified_immutable(self, asset: Asset, content: bytes) -> None:
        """No overwrite. On retry, existing bytes MUST be identical or fail."""
    def read_verified(self, asset: Asset) -> bytes:
        """Read exact private object, with a bounded response."""
    def commit_verified(self, asset: Asset, image: VerifiedJPEG) -> Asset:
        """Atomic current-auth + owner + reserved state CAS; exact idempotent receipt."""
    def cleanup_quarantine(self, asset: Asset) -> None:
        """Delete only the quarantine key of an authorized, committed verified asset.
        Missing object is success. Never delete verified bytes.
        """


@dataclass(frozen=True)
class PromotionResult:
    asset: Asset
    cleanup_pending: bool


def check_asset(asset: Asset, asset_id: str) -> None:
    if asset.id != asset_id or asset.state not in ("reserved", "verified"):
        raise PromotionError("Media unavailable")
    _ = asset.key
    if asset.state == "verified":
        if (not isinstance(asset.sha256, str) or not DIGEST.fullmatch(asset.sha256)
                or type(asset.byte_size) is not int or not 1 <= asset.byte_size <= MAX_BYTES
                or type(asset.width) is not int or not 1 <= asset.width <= 2200
                or type(asset.height) is not int or not 1 <= asset.height <= 2200):
            raise PromotionError("Invalid verified metadata")


def promote(store: TrustedStore, asset_id: str, target: int = MAX_BYTES) -> PromotionResult:
    if not isinstance(asset_id, str) or not UUID.fullmatch(asset_id):
        raise PromotionError("Invalid asset identity")
    if type(target) is not int or not MIN_TARGET <= target <= MAX_BYTES:
        raise PromotionError("Invalid output limit")
    asset = store.authorized_asset(asset_id)
    check_asset(asset, asset_id)
    if asset.state == "reserved":
        raw = store.read_quarantine(asset)
        image = validate_media(raw, target)
        current = store.authorized_asset(asset_id)
        if current != asset:
            raise PromotionError("Reservation changed; retry")
        store.put_verified_immutable(asset, image.content)
        # An interrupted write or auth revocation can leave a PRIVATE orphan.
        # Do not remove it automatically: a concurrent retry may have committed.
        committed = store.commit_verified(asset, image)
        check_asset(committed, asset_id)
        if (committed.owner_id != asset.owner_id or committed.state != "verified"
                or (committed.sha256, committed.byte_size, committed.width, committed.height)
                != (image.sha256, image.byte_size, image.width, image.height)):
            raise PromotionError("Invalid promotion receipt")
        asset = committed
    current = store.authorized_asset(asset_id)
    if current != asset:
        raise PromotionError("Verified media changed")
    verified = store.read_verified(asset)
    if (not isinstance(verified, bytes) or len(verified) != asset.byte_size
            or len(verified) > target or hashlib.sha256(verified).hexdigest() != asset.sha256):
        raise PromotionError("Verified object mismatch")
    # Cleanup failure is recoverable; committed metadata and verified bytes remain.
    try:
        store.cleanup_quarantine(asset)
    except PromotionError:
        return PromotionResult(asset, True)
    return PromotionResult(asset, False)
