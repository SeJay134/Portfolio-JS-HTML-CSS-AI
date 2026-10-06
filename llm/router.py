# llm/router.py

import logging
from llm.dec_logging import logger

class Router:

    def __init__(self, retriever):
        self.keywords = [
            "sergei", "resume", "cv", "portfolio", "experience", "project", "projects", "skills", "education",
            "work history", "code the dream",
        ]
        self.threshold = 1.4 # 0.55
        self.retriever = retriever

    @logger
    def needs_rag(self, message):
        text = message.lower().strip()

        # 1. keys word → RAG
        if any(k in text for k in self.keywords):
            logging.info("Router: keyword match -> RAG")
            return True
        
        # 2. Retriever score → RAG
        chunks = self.retriever.retrieve(message, top_k=1)

        if not chunks:
            return False
        
        score = chunks[0]["score"]

        logging.info(
            "Router score=%s threshold=%s",
            score,
            self.threshold
        )

        x = score < self.threshold

        return x

