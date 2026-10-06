import sys
from types import SimpleNamespace
from llm.service import PortfolioService


def test_each_generation_has_only_current_question_and_shared_policy(monkeypatch):
    calls = []
    class Client:
        def __init__(self, **kwargs):
            pass
        def chat(self, **kwargs):
            calls.append(kwargs)
            return {"message": {"content": "Grounded answer"}}
    monkeypatch.setitem(sys.modules, 'ollama', SimpleNamespace(Client=Client))
    service = PortfolioService({'MODEL_NAME': 'test', 'OLLAMA_HOST': 'http://localhost:11434', 'MODEL_TIMEOUT': 1})
    service.retriever = SimpleNamespace(retrieve=lambda *args, **kwargs: [{'text': 'Sergei builds software.', 'title': 'Portfolio', 'url': 'https://sergei-luna.vercel.app/#Projects'}])
    service.answer('A-private-marker')
    answer = service.answer('B-question')
    assert len(calls[1]['messages']) == 2
    assert calls[1]['messages'][0]['role'] == 'system'
    assert 'A-private-marker' not in str(calls[1])
    assert answer['sources'][0]['title'] == 'Portfolio'
