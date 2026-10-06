# llm/loader.py

import os
from pathlib import Path

def load_documents(path):
    docs = []
    for root, _, files in os.walk(path):
        for f in files:
            if f.endswith((".txt", ".md")):
                full_path = Path(root) / f
                with open(full_path, "r", encoding="utf-8") as file:
                    docs.append({
                        "id": f,                     # name
                        "text": file.read(),         # content
                        "path": str(full_path),      # path
                    })
    return docs
