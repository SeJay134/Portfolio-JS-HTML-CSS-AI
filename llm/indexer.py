"""Build the retrieval index from the versioned public knowledge source."""
import json
from llm.paths import KB_PATH
from llm.embedder import embed_chunks
from llm.vector_store import save_index


def rebuild_index():
    chunks = json.loads(KB_PATH.read_text(encoding="utf-8"))
    if not chunks or any(not c.get("text") for c in chunks):
        raise ValueError("Knowledge source must contain nonempty evidence")
    save_index(chunks, embed_chunks(chunks))
    print(f"Indexed {len(chunks)} evidence records.")


if __name__ == "__main__":
    rebuild_index()
