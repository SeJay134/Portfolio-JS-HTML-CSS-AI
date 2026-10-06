# llm/formatter.py

def build_context(chunks):
    ctx = ""
    for c in chunks:
        ctx += (
            f"\n\n---\n"
            f"📄 Document: {c['doc_id']}\n"
            f"🔹 Chunk: {c['id']}\n\n"
            f"{c['text']}\n"
        )
    return ctx.strip()
