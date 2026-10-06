# llm/rag_pipeline.py

from llm.formatter import build_context
import ollama
import logging
logger = logging.getLogger(__name__)

MODEL_NAME = "qwen2.5:7b"

def run_rag(query: str, retriever) -> str:
    logging.info('rag_pipeline run_rug was invoked')
    # 1. Retrieve relevant chunks
    chunks = retriever.retrieve(query, top_k=3)



    # 3. If no context found → fallback
    if not chunks:
        return "Not found in base"
    
    # 2. Build context
    context = build_context(chunks)
    # logging.info(f"RAG context:\n{context}")

    # 4. Build RAG system prompt
    system = (
        "You are a helpful assistant.\n"
        "Answer only using the provided context.\n"
        "If the context partially answers the question, provide the partial answer.\n"
        "Only reply 'Not found in base' if the context contains no relevant information."
    )

    # 5. Final prompt
    prompt = f"{system}\n\n---\n\n{context}\n\nQuestion: {query}"

    # 6. Send to model directly (NO Flask call!)
    response = ollama.chat(
        model=MODEL_NAME,
        messages=[{"role": "user", "content": prompt}]
    )

    return response["message"]["content"]
