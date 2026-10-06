"""Repository-relative data paths; generated indexes are never public assets."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KB_PATH = ROOT / "content" / "knowledge.json"
INDEX_DIR = Path(os.getenv("INDEX_DIR", str(ROOT / "data" / "embeddings"))).resolve()
