from llm.retriever import Retriever

class Encoder:
    def encode(self, *args, **kwargs):
        return [[0.1]]

class Index:
    ntotal = 3
    def search(self, vectors, count):
        return [[0.1, 0.2, 99]], [[-1, 0, 1]]


def test_sentinel_and_irrelevant_results_are_discarded():
    retriever = Retriever(Index(), [{'text': 'relevant'}, {'text': 'irrelevant'}], Encoder())
    assert retriever.retrieve('question') == [{'text': 'relevant', 'score': 0.2}]


def test_empty_index_does_not_search():
    index = Index()
    index.ntotal = 0
    assert Retriever(index, [], Encoder()).retrieve('question') == []
