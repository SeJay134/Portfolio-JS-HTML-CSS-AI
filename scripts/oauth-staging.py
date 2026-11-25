"""Launch a disposable local-only stack. No hosted CLI operations or credentials."""
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import sys
import warnings
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import build_opener, ProxyHandler, HTTPRedirectHandler, Request

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "sergei-portfolio-oauth-staging"
API = "http://127.0.0.1:54321"
VERSIONS = (
    "20261122002514_google_profiles.sql",
    "20261125120000_blog_foundation.sql",
    "20261125130000_blog_admin_authorization.sql",
)


def clean_env():
    # In particular, do not inherit VITE_*, SUPABASE_*, database URLs, cloud
    # tokens, remote Docker overrides, proxy settings or OAuth secrets.
    allowed = ("PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP",
               "SYSTEMROOT", "WINDIR", "APPDATA", "LOCALAPPDATA", "USERPROFILE",
               "LANG", "LC_ALL", "TERM", "SHELL")
    return {k: os.environ[k] for k in allowed if k in os.environ}


def run(args, env, cwd, **kwargs):
    return subprocess.run(args, env=env, cwd=cwd, check=True, **kwargs)


def preflight(env, work, smoke):
    for name in (("docker", "supabase") if smoke else ("docker", "supabase", "node", "npm")):
        if not shutil.which(name, path=env.get("PATH")):
            raise RuntimeError("Install Docker, Supabase CLI 3.4.0 and Node.js first.")
    if not smoke and not (ROOT / "node_modules" / "vite" / "bin" / "vite.js").is_file():
        raise RuntimeError("Run npm ci in the reviewed repository first.")
    endpoint = run(["docker", "context", "inspect", "--format",
                    "{{.Endpoints.docker.Host}}"], env, work, capture_output=True,
                   text=True).stdout.strip()
    if not (endpoint.startswith("unix:///") or endpoint.startswith("npipe:////./pipe/")):
        raise RuntimeError("Docker must use a local socket, not a remote daemon.")
    existing = run(["docker", "ps", "-a", "--format", "{{.Names}}"],
                   env, work, capture_output=True, text=True).stdout.splitlines()
    if any(name.endswith("_" + PROJECT) for name in existing):
        raise RuntimeError("A staging container already exists; inspect it before restarting.")
    volumes = run(["docker", "volume", "ls", "--format", "{{.Name}}"], env, work,
                  capture_output=True, text=True).stdout.splitlines()
    if any(name.endswith("_" + PROJECT) for name in volumes):
        raise RuntimeError("Stale staging volume exists; inspect it before restarting.")
    version = run(["supabase", "--version"], env, work, capture_output=True,
                  text=True).stdout.strip()
    if version != "3.4.0":
        raise RuntimeError("Use the same Supabase CLI version 3.4.0 as CI.")
    for port in (54320, 54321, 54322, 54323, 54324, 5511):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError as exc:
                raise RuntimeError("A required local port is already in use.") from exc


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def smoke_check(key):
    # Real local auth gateway. Never follow the Google redirect or send a
    # request to a real provider; use a deliberately fake client/secret.
    opener = build_opener(ProxyHandler({}), NoRedirect())
    headers = {"apikey": key, "Accept": "application/json"}
    with opener.open(Request(API + "/auth/v1/settings", headers=headers), timeout=10) as response:
        settings = json.load(response)
    providers = settings.get("external", {})
    if providers.get("google") is not True or any(
        enabled is True for name, enabled in providers.items() if name != "google"
    ):
        raise RuntimeError("Unexpected local Auth provider settings.")
    if settings.get("disable_signup") is True:
        raise RuntimeError("Local OAuth signups are disabled.")
    print("PASS: Google is the sole enabled provider")
    params = urlencode({"provider": "google",
                        "redirect_to": "http://127.0.0.1:5511/auth/callback/",
                        "code_challenge": "A" * 43,
                        "code_challenge_method": "s256"})
    try:
        with opener.open(Request(API + "/auth/v1/authorize?" + params, headers=headers), timeout=10):
            raise RuntimeError("Expected OAuth redirect.")
    except HTTPError as error:
        if error.code not in (302, 303, 307):
            raise RuntimeError("Local OAuth authorization did not redirect.") from None
        location = urlparse(error.headers.get("Location", ""))
        values = parse_qs(location.query)
        if (location.scheme != "https" or location.hostname != "accounts.google.com"
                or values.get("redirect_uri") != [API + "/auth/v1/callback"]
                or values.get("client_id") != ["fixture.apps.googleusercontent.com"]
                or not values.get("state")):
            raise RuntimeError("Unexpected OAuth redirect configuration.")
    print("PASS: local Google authorization builds the expected callback redirect (not followed)")


def main():
    if sys.argv[1:] not in ([], ["--smoke"]):
        raise RuntimeError("Usage: python3 scripts/oauth-staging.py [--smoke]")
    smoke = sys.argv[1:] == ["--smoke"]
    if not smoke and not sys.stdin.isatty():
        raise RuntimeError("Run interactive staging in a local terminal.")
    warnings.filterwarnings("error", category=getpass.GetPassWarning)
    env = clean_env()
    with tempfile.TemporaryDirectory(prefix="portfolio-oauth-staging-") as tmp:
        work = Path(tmp)
        preflight(env, work, smoke)
        if smoke:
            client, secret, email = "fixture.apps.googleusercontent.com", "fixture-not-a-secret", None
        else:
            print("Use only a dedicated test Google OAuth client and test account.")
            print("Supabase Docker ports may bind to all interfaces. Use a trusted local")
            print("machine with a firewall blocking inbound ports; never tunnel this stack.")
            if input("Confirm local firewall and separate test client (LOCAL ONLY): ") != "LOCAL ONLY":
                return
            client = input("Test Google Client ID: ").strip()
            if not re.fullmatch(r"[A-Za-z0-9_-]+\.apps\.googleusercontent\.com", client):
                raise RuntimeError("Expected one Google web client ID.")
            secret = getpass.getpass("Test Google Client Secret (not echoed): ").strip()
            if not secret or "\n" in secret or "\r" in secret:
                raise RuntimeError("Missing or invalid test secret.")
            email = getpass.getpass("Dedicated test Google email (not your real admin email): ").strip().lower()
            if not re.fullmatch(r"[a-z0-9._+%\-]+@[a-z0-9.\-]+\.[a-z]{2,}", email) or len(email) > 254:
                raise RuntimeError("Expected a dedicated test email.")
            if input("Confirm this is a separate test identity (TEST ACCOUNT): ") != "TEST ACCOUNT":
                return
        config = work / "supabase"
        (config / "migrations").mkdir(parents=True)
        shutil.copyfile(ROOT / "supabase/staging/config.toml.example", config / "config.toml")
        for name in VERSIONS:
            shutil.copyfile(ROOT / "supabase/migrations" / name, config / "migrations" / name)
        cli_env = {**env, "STAGING_GOOGLE_CLIENT_ID": client,
                   "STAGING_GOOGLE_CLIENT_SECRET": secret}
        # Never send Google credentials to Vite. Do not print CLI status output.
        attempted = False
        try:
            attempted = True
            run(["supabase", "start"], cli_env, work, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL)
            status = json.loads(run(["supabase", "status", "-o", "json"], cli_env, work,
                                    capture_output=True, text=True).stdout)
            key = status.get("PUBLISHABLE_KEY", "")
            if status.get("API_URL", "").rstrip("/") not in (API, "http://localhost:54321"):
                raise RuntimeError("Unexpected API origin; refusing to start frontend.")
            if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", key):
                raise RuntimeError("Modern local publishable key required.")
            if smoke:
                smoke_check(key)
                return
            # Exact staging container, freshly created by this invocation. Input
            # is strict ASCII and contains no quotes; never touch a hosted DB.
            sql = "insert into private.admin_allowlist(email) values ('" + email + "');"
            run(["docker", "exec", "-i", "supabase_db_" + PROJECT, "psql", "-U", "postgres",
                 "-d", "postgres", "-v", "ON_ERROR_STOP=1"], env, work,
                input=sql, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            app_env = {**env, "VITE_SUPABASE_URL": API, "VITE_SUPABASE_PUBLISHABLE_KEY": key,
                       "VITE_ENABLE_GOOGLE_AUTH": "true", "VITE_ENABLE_BLOG_ADMIN": "true",
                       "VITE_ENABLE_LIVE_BLOG": "true", "VITE_ENABLE_PUBLIC_CHAT_UI": "false"}
            print("Open http://127.0.0.1:5511/admin/blog/ in a fresh private browser window.")
            print("The allowlist is local only. No administrator is assigned until test sign-in.")
            print("Ctrl+C stops Vite and removes the disposable Supabase stack.")
            run(["node", str(ROOT / "node_modules/vite/bin/vite.js"), "--mode", "oauth-staging",
                 "--host", "127.0.0.1", "--port", "5511", "--strictPort"], app_env, ROOT)
        except KeyboardInterrupt:
            pass
        except (subprocess.CalledProcessError, ValueError):
            raise RuntimeError("Local staging command failed. No hosted fallback.") from None
        finally:
            if attempted:
                stopped = subprocess.run(["supabase", "stop", "--no-backup"], env=cli_env,
                                         cwd=work, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if stopped.returncode:
                    print("Cleanup failed. Inspect ONLY containers ending in _" + PROJECT)
                else:
                    print("Disposable staging stack stopped; close the private browser window.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, getpass.GetPassWarning) as error:
        print(str(error))
        raise SystemExit(1) from None
