# llm/splitter.py

def split_text(docs, chunk_size=100, overlap=40):
    chunks = []

    for doc in docs:
        doc_id = doc["id"]
        text = doc["text"]

        words = text.split()

        start = 0
        chunk_id = 0

        while start < len(words):
            end = start + chunk_size

            chunk_words = words[start:end]
            chunk_text = " ".join(chunk_words)

            chunks.append({
                "id": f"{doc_id}_chunk_{chunk_id}",
                "doc_id": doc_id,
                "text": chunk_text,
            })

            chunk_id += 1
            start = end - overlap

    return chunks