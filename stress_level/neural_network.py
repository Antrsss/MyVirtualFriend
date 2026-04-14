import os
import re
from collections import Counter

import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import auc, roc_curve
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset

from dataset import labels, texts

SEED = 42
torch.manual_seed(SEED)

MAX_LEN = 24
MIN_FREQ = 1
CHECKPOINT_PATH = os.path.join(os.path.dirname(__file__), "stress_model.pt")


def tokenize(text):
    text = re.sub(r"[^\w\s]", " ", str(text).lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text.split()


def build_vocab(source_texts):
    tokenized = [tokenize(t) for t in source_texts]
    counter = Counter(tok for row in tokenized for tok in row)
    vocab = {"<PAD>": 0, "<UNK>": 1}
    for word, freq in counter.most_common():
        if freq >= MIN_FREQ and word not in vocab:
            vocab[word] = len(vocab)
    return vocab


vocab = build_vocab(texts)


def encode(text, vocab_map, max_len=MAX_LEN):
    tokens = tokenize(text)
    ids = [vocab_map.get(token, vocab_map["<UNK>"]) for token in tokens]
    if len(ids) < max_len:
        ids += [vocab_map["<PAD>"]] * (max_len - len(ids))
    return ids[:max_len]


encoded_texts = [encode(t, vocab) for t in texts]

X_temp, X_test, y_temp, y_test = train_test_split(
    encoded_texts, labels, test_size=0.15, random_state=SEED, stratify=labels
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.18, random_state=SEED, stratify=y_temp
)


class StressDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.tensor(X, dtype=torch.long)
        self.y = torch.tensor(y, dtype=torch.float32)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


train_dataset = StressDataset(X_train, y_train)
val_dataset = StressDataset(X_val, y_val)
test_dataset = StressDataset(X_test, y_test)

train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=16)
test_loader = DataLoader(test_dataset, batch_size=16)


class StressModel(nn.Module):
    def __init__(self, vocab_size, embedding_dim=64, hidden_dim=64):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
        self.lstm = nn.LSTM(
            input_size=embedding_dim,
            hidden_size=hidden_dim,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.norm = nn.LayerNorm(hidden_dim * 2)
        self.dropout = nn.Dropout(0.35)
        self.fc = nn.Linear(hidden_dim * 2, 1)

    def forward(self, x):
        emb = self.embedding(x)
        out, _ = self.lstm(emb)
        pooled = out.mean(dim=1)
        pooled = self.norm(pooled)
        pooled = self.dropout(pooled)
        logits = self.fc(pooled).squeeze(1)
        return logits


model = StressModel(len(vocab))

train_losses = []
val_losses = []
train_accuracies = []
val_accuracies = []
test_accuracies = []


def evaluate(loader):
    model.eval()
    total_loss = 0.0
    total = 0
    correct = 0
    with torch.no_grad():
        for batch_X, batch_y in loader:
            logits = model(batch_X)
            loss = criterion(logits, batch_y)
            probs = torch.sigmoid(logits)
            pred = (probs > 0.5).float()
            total_loss += loss.item() * batch_y.size(0)
            correct += (pred == batch_y).sum().item()
            total += batch_y.size(0)
    return total_loss / max(1, total), correct / max(1, total)


def train_model(num_epochs=35, patience=6):
    best_val_loss = float("inf")
    patience_left = patience
    best_state = None

    for epoch in range(num_epochs):
        model.train()
        running_loss = 0.0
        total = 0
        correct = 0

        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            logits = model(batch_X)
            loss = criterion(logits, batch_y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            probs = torch.sigmoid(logits)
            pred = (probs > 0.5).float()

            running_loss += loss.item() * batch_y.size(0)
            correct += (pred == batch_y).sum().item()
            total += batch_y.size(0)

        avg_train_loss = running_loss / max(1, total)
        train_acc = correct / max(1, total)
        val_loss, val_acc = evaluate(val_loader)

        train_losses.append(avg_train_loss)
        val_losses.append(val_loss)
        train_accuracies.append(train_acc)
        val_accuracies.append(val_acc)

        print(
            f"Epoch {epoch + 1:02d} | train_loss={avg_train_loss:.4f} "
            f"train_acc={train_acc:.4f} val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
        )

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = model.state_dict()
            patience_left = patience
        else:
            patience_left -= 1
            if patience_left <= 0:
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    torch.save({"model_state": model.state_dict(), "vocab": vocab}, CHECKPOINT_PATH)


def load_or_train():
    if os.path.exists(CHECKPOINT_PATH):
        ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu")
        if "model_state" in ckpt:
            model.load_state_dict(ckpt["model_state"])
            return
    train_model()


pos_count = sum(y_train)
neg_count = len(y_train) - pos_count
pos_weight_value = neg_count / max(1.0, pos_count)
criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_weight_value))
optimizer = optim.AdamW(model.parameters(), lr=0.0015, weight_decay=0.01)

load_or_train()
test_loss, test_acc = evaluate(test_loader)
test_accuracies.append(test_acc)
print(f"Final Test Accuracy: {test_acc:.2f}")


def predict(text):
    model.eval()
    with torch.no_grad():
        encoded = encode(text, vocab)
        input_tensor = torch.tensor([encoded], dtype=torch.long)
        logits = model(input_tensor)
        prob = torch.sigmoid(logits).item()
        prediction = 1.0 if prob > 0.5 else 0.0
        print(f'Текст: "{text}"')
        print(f"Стресс: {'ДА' if prediction == 1.0 else 'НЕТ'} (вероятность: {prob:.2f})")
        return {"stress": bool(prediction), "probability": prob}


def plot_metrics():
    if not train_losses:
        print("Нет истории обучения (модель загружена из checkpoint).")
        return

    epochs = range(1, len(train_losses) + 1)
    plt.figure(figsize=(10, 4))
    plt.plot(epochs, train_losses, label="Train Loss")
    plt.plot(epochs, val_losses, label="Val Loss")
    plt.xlabel("Эпоха")
    plt.ylabel("Потери")
    plt.title("Потери обучения")
    plt.legend()
    plt.show()

    plt.figure(figsize=(10, 4))
    plt.plot(epochs, train_accuracies, label="Train Acc")
    plt.plot(epochs, val_accuracies, label="Val Acc")
    plt.xlabel("Эпоха")
    plt.ylabel("Точность")
    plt.title("Точность обучения")
    plt.legend()
    plt.show()


def plot_prediction_distribution(model, test_loader):
    predictions = []
    model.eval()
    with torch.no_grad():
        for batch_X, _ in test_loader:
            logits = model(batch_X)
            probs = torch.sigmoid(logits)
            predictions.extend(probs.cpu().numpy())

    plt.figure(figsize=(8, 5))
    plt.hist(predictions, bins=20, edgecolor="black")
    plt.xlabel("Предсказанная вероятность")
    plt.ylabel("Частота")
    plt.title("Распределение предсказанных вероятностей")
    plt.show()


def plot_roc_curve(model, test_loader):
    true_labels = []
    pred_scores = []
    model.eval()
    with torch.no_grad():
        for batch_X, batch_y in test_loader:
            logits = model(batch_X)
            probs = torch.sigmoid(logits)
            true_labels.extend(batch_y.cpu().numpy())
            pred_scores.extend(probs.cpu().numpy())

    fpr, tpr, _ = roc_curve(true_labels, pred_scores)
    roc_auc = auc(fpr, tpr)

    plt.figure(figsize=(8, 5))
    plt.plot(fpr, tpr, color="darkorange", lw=2, label=f"ROC-кривая (AUC = {roc_auc:.2f})")
    plt.plot([0, 1], [0, 1], color="navy", lw=2, linestyle="--")
    plt.xlabel("Доля ложных срабатываний (FPR)")
    plt.ylabel("Доля истинных срабатываний (TPR)")
    plt.title("ROC-кривая")
    plt.legend(loc="lower right")
    plt.show()
