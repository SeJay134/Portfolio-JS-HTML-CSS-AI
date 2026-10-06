"""Validate the generated index without starting the embedding model."""

def validate_index():
    try:
        from llm.vector_store import load_index
        load_index()
        return True
    except (OSError, ValueError, KeyError, RuntimeError):
        return False
