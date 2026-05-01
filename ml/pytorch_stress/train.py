import os

import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset

from .config import CHECKPOINT_PATH, MAX_LEN, SEED
from .model import StressModel
from .vocab import encode


class StressDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.tensor(X, dtype=torch.long)
        self.y = torch.tensor(y, dtype=torch.float32)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


def evaluate(model, loader, criterion):
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


def train_or_load(texts, labels, vocab):
    torch.manual_seed(SEED)
    encoded_texts = [encode(t, vocab, MAX_LEN) for t in texts]

    X_temp, X_test, y_temp, y_test = train_test_split(
        encoded_texts, labels, test_size=0.15, random_state=SEED, stratify=labels
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_temp, y_temp, test_size=0.18, random_state=SEED, stratify=y_temp
    )

    train_loader = DataLoader(StressDataset(X_train, y_train), batch_size=16, shuffle=True)
    val_loader = DataLoader(StressDataset(X_val, y_val), batch_size=16)
    test_loader = DataLoader(StressDataset(X_test, y_test), batch_size=16)

    model = StressModel(len(vocab))

    pos_count = sum(y_train)
    neg_count = len(y_train) - pos_count
    pos_weight_value = neg_count / max(1.0, pos_count)
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_weight_value))
    optimizer = optim.AdamW(model.parameters(), lr=0.0015, weight_decay=0.01)

    if os.path.exists(CHECKPOINT_PATH):
        ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu")
        if "model_state" in ckpt:
            model.load_state_dict(ckpt["model_state"])
            return model, vocab, test_loader

    best_val_loss = float("inf")
    patience_left = 6
    best_state = None

    for _epoch in range(35):
        model.train()
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            logits = model(batch_X)
            loss = criterion(logits, batch_y)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        val_loss, _ = evaluate(model, val_loader, criterion)
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = model.state_dict()
            patience_left = 6
        else:
            patience_left -= 1
            if patience_left <= 0:
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    torch.save({"model_state": model.state_dict(), "vocab": vocab}, CHECKPOINT_PATH)
    return model, vocab, test_loader

