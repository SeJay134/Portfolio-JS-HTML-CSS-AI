"""Reviewed PUBLIC portfolio catalogue; independent of owner-local knowledge files.

JSON is mirrored from src/data/projects.ts and checked by a frontend unit test.
The source URLs returned to visitors are selected here, never copied verbatim
from data/base/ user documents or arbitrary FAISS metadata.
"""
from __future__ import annotations

import json
import re
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



# Detect only explicit numbered catalogue-project questions (not arbitrary missing facts).
# The checked public catalogue currently contains four entries; this guard does
# not make any claim about projects that might exist outside that catalogue.
# A number before "projects" can be a quantity ("name 5 technologies in
# projects"), not an ordinal. Require an ordinal suffix/word in that position.
# Bare digits are accepted only after singular "project/проект" or an explicit
# project-number marker (# or №).
_OUT_OF_RANGE_ORDINAL = re.compile(
    r"\b(?P<position>\d+(?:-?(?:й|го|ый|м|му|st|nd|rd|th))"
    r"|fifth|sixth|seventh|eighth|ninth|tenth"
    r"|пят(?:ый|ого|ом|ому|ым|ая|ое|ой|ую|ые|ых)"
    r"|шест(?:ой|ого|ом|ому|ым|ая|ое|ую|ые|ых))\b"
    r"(?:\s+[\w-]+){0,3}\s+(?:projects?|проект\w*)\b"
    r"|\b(?:project|проект)\s+(?P<after>\d+)\b"
    r"|\b(?:projects?|проект\w*)\s*[#№]\s*(?P<marked>\d+)\b",
    re.IGNORECASE,
)


def response_language(question: str) -> str:
    """Select answer language from the actual question, not English evidence."""
    return "Russian" if re.search(r"[А-Яа-яЁё]", question) else "English"


def unlisted_project_reply(question: str) -> str | None:
    """Ground numbered-project fallback in catalogue size, without model guesses."""
    match = _OUT_OF_RANGE_ORDINAL.search(question)
    if not match:
        return None
    ordinal = (match.group("position") or match.group("after") or match.group("marked")).casefold()
    numeric = re.match(r"\d+", ordinal)
    position = int(numeric.group()) if numeric else 5
    count = len(_public_projects())
    if position <= count:
        return None
    if response_language(question) == "Russian":
        return (
            f"В проверенном публичном каталоге портфолио указаны только {count} проекта. "
            "Информации о проекте с запрошенным номером и его GitHub-репозитории нет."
        )
    return (
        f"The verified public portfolio catalogue lists only {count} projects. "
        "It has no information about a project at the requested position "
        "or its GitHub repository."
    )


_DISCLOSURE_VERBS = re.compile(
    r"\b(?:reveal|disclose|expose|dump|print|show|share|display|"
    r"покажи|раскрой|выведи|раскрыть|показать)\b", re.IGNORECASE
)
_PRIVATE_TARGETS = re.compile(
    r"(?:internal|hidden|system|developer)\s+(?:prompts?|instructions?|rules?)"
    r"|(?:prompts?|instructions?)\s+(?:of|from)\s+(?:your|the)\s+system"
    r"|(?:private|internal|local)\s+(?:file\s+paths?|documents?|secrets?)"
    r"|(?:api|access)\s+keys?"
    r"|(?:системн|внутренн|скрыт)\w*\s+(?:промпт|инструкц|правил)\w*"
    r"|(?:секретн|приватн)\w*\s+(?:путь|пути|документ|файл)\w*",
    re.IGNORECASE,
)


# Demand a sensitive value immediately after an explicit disclosure verb
# (allowing only harmless qualifiers such as "me the hidden"). Explanatory
# questions like "Show how the portfolio protects API keys" do not match.
_EXPLICIT_PRIVATE_DISCLOSURE = re.compile(
    _DISCLOSURE_VERBS.pattern
    + r"\s+(?:(?:me|us|my|our|your|the|all|actual|raw|hidden|internal|"
      r"secret|private|local|full|complete|entire|original|"
      r"мне|нам|меня|нас|мои|свои|ваши|твои|наши|все|всю|всех|"
      r"полные|полный|скрытые|внутренние|секретные|приватные|"
      r"пожалуйста)\s+){0,8}"
    + r"(?:" + _PRIVATE_TARGETS.pattern + r")",
    re.IGNORECASE,
)


def private_disclosure_reply(question: str) -> str | None:
    """Refuse explicit requests to reveal hidden instructions or private paths.

    This is a narrowly scoped deterministic safety boundary. It does not
    classify ordinary questions ABOUT prompt design, projects, or file formats,
    and does not claim that all injection styles are detectable here.
    """
    if not isinstance(question, str):
        return None
    if not _EXPLICIT_PRIVATE_DISCLOSURE.search(question):
        return None
    if response_language(question) == "Russian":
        return ("Я не могу раскрывать внутренние инструкции, приватные "
                "файлы или секретные настройки.")
    return ("I cannot reveal internal instructions, private files or "
            "secret configuration.")


def public_overview() -> str:
    """Stable list of reviewed facts, independent of the question language."""
    lines = ["Published portfolio projects (verified public catalogue):"]
    for project in _public_projects():
        lines.append(
            f"- {project['title']}: {project['summary']} "
            f"Verified technologies: {', '.join(project['tags'])}."
        )
    return "\n".join(lines)


def focused_public_evidence(question: str) -> str:
    """Include full authoritative facts only for one explicitly named project.

    General overview questions keep a compact four-project context. This
    avoids repeating four long details in every prompt while still supplying
    GDP's World Bank provenance and Streamlit when GDP is the subject.
    """
    if not isinstance(question, str):
        return ""
    matches = [
        project for project in _public_projects()
        if mentions_verified_project(question, project)
    ]
    if len(matches) != 1:
        return ""
    project = matches[0]
    return (
        f"Focused verified project: {project['title']}. "
        f"Details: {project['detail']} "
        f"Technologies: {', '.join(project['tags'])}."
    )


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


_GENERATED_URL = re.compile(r"https?://[^\s<>'\"]+", re.IGNORECASE)


def filter_unapproved_model_urls(reply: str) -> tuple[str, bool]:
    """Keep only exact reviewed public URLs in model text.

    Links returned as structured sources are already independently curated.
    An unexpected generated URL is never trusted, even if hosted on GitHub.
    The boolean is for strict evaluation; dropping the link cannot turn an
    ungrounded LLM output into an unreported PASS.
    """
    if not isinstance(reply, str):
        raise ValueError("Invalid model text")
    allowed = {item["repository"] for item in _public_projects()}
    allowed.add(CATALOG_URL)
    removed = False

    def replace(match: re.Match[str]) -> str:
        nonlocal removed
        whole = match.group(0)
        url = whole.rstrip(".,;:!?)\\]}")  # Preserve trailing punctuation
        trailing = whole[len(url):]
        if url in allowed:
            return whole
        removed = True
        return "[unverified link removed]" + trailing

    return _GENERATED_URL.sub(replace, reply), removed


# Distinctive, reviewed alternative project names; not generic technologies.
_PROJECT_NAME_ALIASES = {
    "portfolio": (
        re.compile(
            r"\bпортфолио\s+сайта\s+и\s+прототип(?:е|а|ом)?\s+(?:AI|ИИ)\b",
            re.IGNORECASE,
        ),
        re.compile(
            r"\bсайт(?:е|а)?[-\s]+портфолио\s+и\s+"
            r"(?:AI|ИИ)[-\s]+прототип(?:е|а|ом)?\b",
            re.IGNORECASE,
        ),
    ),
}


def mentions_verified_project(reply: str, project: dict) -> bool:
    """Require an explicit project name; a technology alone is not provenance."""
    if not isinstance(reply, str) or not isinstance(project, dict):
        return False
    title = project.get("title")
    if not isinstance(title, str) or not title:
        return False
    if title.casefold() in reply.casefold():
        return True
    return any(
        alias.search(reply)
        for alias in _PROJECT_NAME_ALIASES.get(project.get("id"), ())
    )


def sources_for_mentioned_projects(reply: str) -> list[dict]:
    """Return only reviewed title/URL pairs for explicitly named projects.

    The evaluator shares the same recognition predicate. Never attribute a
    repository solely from a technology such as FAISS or from the question.
    """
    if not isinstance(reply, str):
        return []
    return [
        {"title": project["title"], "url": project["repository"]}
        for project in _public_projects()
        if mentions_verified_project(reply, project)
    ]


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
