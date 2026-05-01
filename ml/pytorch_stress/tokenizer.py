import re


def tokenize(text: str):
    text = re.sub(r"[^\w\s]", " ", str(text).lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text.split()

