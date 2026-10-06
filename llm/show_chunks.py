# llm/show_chunks.py

from llm.vector_store import load_index

def main():
    index, chunks = load_index()

    print(f"Total vectors in FAISS: {index.ntotal}")
    print(f"Embedding dimension: {index.d}")
    print(f"Total chunks in meta: {len(chunks)}")

    for i, chunk in enumerate(chunks):
        print(f"\n=== CHUNK {i+1} / {len(chunks)} ===")
        print("ID:", chunk.get("id"))
        print("DOC_ID:", chunk.get("doc_id"))
        print("TEXT:")
        print(chunk.get("text"))

if __name__ == "__main__":
    main()


# python -m llm.show_chunks