"""Reviewed PUBLIC portfolio catalogue; independent of owner-local knowledge files.

JSON is mirrored from src/data/projects.ts and checked by a frontend unit test.
The source URLs returned to visitors are selected here, never copied verbatim
from data/base/ user documents or arbitrary FAISS metadata.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlsplit

CATALOG_PATH = Path(__file__).resolve().parents[1] / "content" / "public-projects.json"
CATALOG_URL = "https://sergei-luna.vercel.app/#Projects"
ALLOWED_HOSTS = {"github.com", "sergei-luna.vercel.app"}
REQUIRED_IDS = {"chocolate", "gdp", "api", "portfolio"}


def _safe_url(value: str) -> bool:
    if not isinstance(value, str):
        return False
    url = urlsplit(value)
    return (
        url.scheme == "https"
        and url.hostname in ALLOWED_HOSTS
        and not url.username and not url.password
        and not url.port
        and not url.fragment
        and not url.query
        and url.path.startswith("/")
    )


def _public_projects() -> list[dict]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValueError("Invalid public projects catalogue schema.")
    projects = data.get("projects")
    if not isinstance(projects, list) or len(projects) != 4:
        raise ValueError("Unexpected number of public portfolio projects.")
    found = set()
    for item in projects:
        if not isinstance(item, dict) or item.get("id") not in REQUIRED_IDS:
            raise ValueError("Unrecognized public project.")
        if item["id"] in found:
            raise ValueError("Duplicate public project ID.")
        found.add(item["id"])
        if any(not isinstance(item.get(key), str) or not item[key].strip()
               for key in ("title", "summary", "detail", "category")):
            raise ValueError("Missing required public project facts.")
        if not _safe_url(item.get("repository")):
            raise ValueError("Unapproved public project source URL.")
        if not isinstance(item.get("tags"), list) or any(
            not isinstance(tag, str) for tag in item["tags"]
        ):
            raise ValueError("Invalid public project tags.")
    if found != REQUIRED_IDS:
        raise ValueError("Public catalogue is incomplete.")
    return projects


def public_overview() -> str:
    """Stable concise list for every model call, even when FAISS misses the overview."""
    lines = ["Published portfolio projects (verified public catalogue):"]
    for project in _public_projects():
        lines.append(f"- {project['title']}: {project['summary']}")
    return "\n".join(lines)


def load_public_documents() -> list[dict]:
    """Attach only reviewed public title/URL metadata to generated documents."""
    projects = _public_projects()
    documents = [
        {
            "id": "verified-projects-overview",
            "text": public_overview(),
            "source": {"title": "Portfolio projects", "url": CATALOG_URL},
        }
    ]
    for project in projects:
        documents.append({
            "id": f"verified-project-{project['id']}",
            "text": (
                f"Project: {project['title']}. Category: {project['category']}. "
                f"Summary: {project['summary']} Details: {project['detail']} "
                f"Technologies: {', '.join(project['tags'])}. "
                f"Repository: {project['repository']}"
            ),
            "source": {
                "title": project["title"],
                "url": project["repository"],
            },
        })
    return documents


def trusted_source(doc_id: object, source: object) -> dict | None:
    """Only pass provenance matching an exact reviewed ID/title/URL combination.

    Local private documents have no source metadata, and cannot supply their
    own URL even when it looks like a GitHub link.
    """
    if not isinstance(doc_id, str) or not isinstance(source, dict):
        return None
    for document in load_public_documents():
        if doc_id == document["id"] and source == document["source"]:
            return dict(document["source"])
    return None
