import hashlib
import io
import subprocess
import unittest
from unittest.mock import patch

from PIL import Image
from server.studio_media.jpeg_worker import inspect_jpeg, InvalidJPEG
from server.studio_media.validator import validate_media, MediaValidationError


def jpeg(size=(96, 64), *, progressive=False, exif=False):
    stream = io.BytesIO()
    with Image.new("RGB", size, (80, 140, 200)) as image:
        metadata = Image.Exif()
        if exif:
            metadata[270] = "private fixture metadata"
        image.save(stream, "JPEG", progressive=progressive, exif=metadata)
    return stream.getvalue()


class MediaValidationTests(unittest.TestCase):
    def test_normalizes_real_baseline_and_progressive(self):
        for progressive in (False, True):
            data = jpeg(progressive=progressive, exif=True)
            result = validate_media(data, 300000)
            self.assertEqual((result.width, result.height), (96, 64))
            self.assertEqual(result.byte_size, len(result.content))
            self.assertLessEqual(result.byte_size, 300000)
            self.assertEqual(result.sha256, hashlib.sha256(result.content).hexdigest())
            self.assertNotIn(b"private fixture metadata", result.content)
            with Image.open(io.BytesIO(result.content), formats=["JPEG"]) as image:
                image.load()
                self.assertEqual(image.size, (96, 64))
                self.assertFalse(image.getexif())
                self.assertNotIn("icc_profile", image.info)

    def test_rejects_fake_trailing_and_truncated_images(self):
        valid = jpeg()
        for data in (b"<svg/>", b"\xff\xd8fake\xff\xd9", valid+b"<html>", valid+valid,
                     valid[:-2], valid[:100]+b"\xff\xd9", b"\xff\xd8"+b"x"*5_000_000):
            with self.subTest(length=len(data)), self.assertRaises(MediaValidationError):
                validate_media(data)

    def test_rejects_oversized_frame_before_decode(self):
        data = jpeg((2201, 1))
        with self.assertRaises(InvalidJPEG):
            inspect_jpeg(data)
        with self.assertRaises(MediaValidationError):
            validate_media(data)

    def test_rejects_non_jpeg_and_cmyk(self):
        for fmt, mode in (("PNG", "RGB"), ("JPEG", "CMYK")):
            output = io.BytesIO()
            with Image.new(mode, (32,32)) as image:
                image.save(output, fmt)
            with self.assertRaises(MediaValidationError):
                validate_media(output.getvalue())

    def test_target_limits_and_no_upscale(self):
        result = validate_media(jpeg((2200, 2200)), 300000)
        self.assertLessEqual(result.byte_size, 300000)
        self.assertEqual((result.width, result.height), (2200, 2200))
        for target in (0, 19999, 5000001, True):
            with self.assertRaises(MediaValidationError):
                validate_media(jpeg(), target)

    def test_timeout_and_process_failure_fail_closed(self):
        for error in (subprocess.TimeoutExpired("worker", 12), subprocess.CalledProcessError(2,"worker"), OSError("private")):
            with patch("server.studio_media.validator.subprocess.run", side_effect=error):
                with self.assertRaisesRegex(MediaValidationError, "validation failed"):
                    validate_media(jpeg())

    def test_worker_receipt_and_environment_are_bounded(self):
        with patch.dict("os.environ", {"SUPABASE_SERVICE_ROLE_KEY":"dummy-secret", "HTTPS_PROXY":"dummy-proxy"}):
            with patch("server.studio_media.validator.subprocess.run") as run:
                run.return_value.stdout = b"invalid"
                with self.assertRaises(MediaValidationError):
                    validate_media(jpeg())
                kwargs = run.call_args.kwargs
                self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", kwargs["env"])
                self.assertNotIn("HTTPS_PROXY", kwargs["env"])
                self.assertEqual(kwargs["timeout"],12)
                self.assertIn("-I",run.call_args.args[0])

    def test_rejects_over_target_worker_output(self):
        with patch("server.studio_media.validator.subprocess.run") as run:
            run.return_value.stdout = b"x"*20001
            with self.assertRaises(MediaValidationError):
                validate_media(jpeg(),20000)


if __name__ == "__main__":
    unittest.main()
