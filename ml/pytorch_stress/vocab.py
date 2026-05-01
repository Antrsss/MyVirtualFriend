from collections import Counter

from .config import MIN_FREQ
from .tokenizer import tokenize


def build_vocab(source_texts):
    tokenized = [tokenize(t) for t in source_texts]
    counter = Counter(tok for row in tokenized for tok in row)
    vocab = {"<PAD>": 0, "<UNK>": 1}
    for word, freq in counter.most_common():
        if freq >= MIN_FREQ and word not in vocab:
            vocab[word] = len(vocab)
    return vocab


def encode(text, vocab_map, max_len: int):
    tokens = tokenize(text)
    ids = [vocab_map.get(token, vocab_map["<UNK>"]) for token in tokens]
    if len(ids) < max_len:
        ids += [vocab_map["<PAD>"]] * (max_len - len(ids))
    return ids[:max_len]

