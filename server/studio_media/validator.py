"""Server-side adapter for the bounded local worker; no hosted operations."""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

MAX_BYTES = 5_000_000
MIN_TARGET = 20_000
WORKER = Path(__file__).with_name("jpeg_worker.py").resolve()


class MediaValidationError(ValueError):
    pass


@dataclass(frozen=True)
class VerifiedJPEG:
    content: bytes
    byte_size: int
    sha256: str
    width: int
    height: int


def _normalized_dimensions(data: bytes) -> tuple[int, int]:
    # Inspect the trusted worker's baseline output without importing Pillow
    # into the calling process. Reject malformed/truncated worker receipts.
    if not 4 <= len(data) <= MAX_BYTES or not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        raise MediaValidationError("Invalid normalization result")
    pos = 2
    while pos + 4 <= len(data):
        if data[pos] != 255:
            break
        marker = data[pos + 1]
        length = int.from_bytes(data[pos + 2:pos + 4], "big")
        end = pos + 2 + length
        if length < 2 or end > len(data):
            break
        if marker == 0xC0 and length >= 8 and data[pos + 4] == 8:
            height = int.from_bytes(data[pos + 5:pos + 7], "big")
            width = int.from_bytes(data[pos + 7:pos + 9], "big")
            if 1 <= width <= 2200 and 1 <= height <= 2200:
                return width, height
            break
        if marker in (0xDA, 0xD9):
            break
        pos = end
    raise MediaValidationError("Invalid normalization result")


def validate_media(data: bytes, target: int = MAX_BYTES) -> VerifiedJPEG:
    if not isinstance(data, bytes) or not 4 <= len(data) <= MAX_BYTES:
        raise MediaValidationError("Media size is outside allowed limits")
    if type(target) is not int or not MIN_TARGET <= target <= MAX_BYTES:
        raise MediaValidationError("Invalid output limit")
    # Inherit only OS essentials, not auth, service keys, proxy settings or
    # project environment. No shell, no caller-controlled paths or arguments.
    env = {k: v for k, v in os.environ.items() if k.upper() in
           {"SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"}}
    try:
        result = subprocess.run([sys.executable, "-I", str(WORKER), str(target)],
                                input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=12, check=True, env=env, cwd=WORKER.parent)
    except (OSError, subprocess.SubprocessError) as exc:
        raise MediaValidationError("Media validation failed or timed out") from exc
    output = result.stdout
    if len(output) > target:
        raise MediaValidationError("Invalid normalization result")
    width, height = _normalized_dimensions(output)
    return VerifiedJPEG(output, len(output), hashlib.sha256(output).hexdigest(), width, height)
