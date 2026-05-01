import torch

from dataset import labels, texts
from ml.pytorch_stress.config import MAX_LEN
from ml.pytorch_stress.train import train_or_load
from ml.pytorch_stress.vocab import build_vocab, encode

vocab = build_vocab(texts)
model, vocab, test_loader = train_or_load(texts, labels, vocab)


def predict(text):
    model.eval()
    with torch.no_grad():
        encoded = encode(text, vocab, MAX_LEN)
        input_tensor = torch.tensor([encoded], dtype=torch.long)
        logits = model(input_tensor)
        prob = torch.sigmoid(logits).item()
        prediction = 1.0 if prob > 0.5 else 0.0
        print(f'Текст: "{text}"')
        print(f"Стресс: {'ДА' if prediction == 1.0 else 'НЕТ'} (вероятность: {prob:.2f})")
        return {"stress": bool(prediction), "probability": prob}
