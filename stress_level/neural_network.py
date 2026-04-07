import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split
from collections import Counter
import re
from dataset import texts, labels
import matplotlib.pyplot as plt
from sklearn.metrics import roc_curve, auc


# Токенизация по пробелам
def tokenize(text):
    text = re.sub(r'[^\w\s]', '', text.lower()) # Удаление всех знаков препинания
    return text.split()

tokenized_texts = [tokenize(t) for t in texts]

# Считаем, сколько раз каждое слово встречается во всех текстах
vocab = Counter(token for text in tokenized_texts for token in text)
# Преобразуем Counter в словарь: каждому слову даём уникальный ID
vocab = {word: i+1 for i, (word, _) in enumerate(vocab.most_common())}
vocab['<PAD>'] = 0

# Преобразование текста в индексы
def encode(text, vocab, max_len=10):
    tokens = tokenize(text)
    ids = [vocab.get(token, 0) for token in tokens]
    if len(ids) < max_len:
        ids += [0] * (max_len - len(ids))
    return ids[:max_len]

encoded_texts = [encode(t, vocab) for t in texts]

# Делим данные: 70% обучение, 30% тест
X_train, X_test, y_train, y_test = train_test_split(encoded_texts, labels, test_size=0.3, random_state=42)

# === Dataset и DataLoader ===
class StressDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.tensor(X, dtype=torch.long)
        self.y = torch.tensor(y, dtype=torch.float32)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

train_dataset = StressDataset(X_train, y_train)
test_dataset = StressDataset(X_test, y_test)

train_loader = DataLoader(train_dataset, batch_size=2, shuffle=True)
test_loader = DataLoader(test_dataset, batch_size=2)

# === Нейросеть ===
class StressModel(nn.Module):
    def __init__(self, vocab_size, embedding_dim=16, hidden_dim=16):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
        self.fc1 = nn.Linear(embedding_dim * 10, hidden_dim)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.3)  # 💥 Добавлено сюда
        self.fc2 = nn.Linear(hidden_dim, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        embedded = self.embedding(x)                 # [B, T, E]
        flat = embedded.view(x.size(0), -1)          # [B, T*E]
        out = self.fc1(flat)
        out = self.relu(out)
        out = self.dropout(out)                      
        out = self.fc2(out)
        return self.sigmoid(out).squeeze(1)

model = StressModel(len(vocab), embedding_dim=16)

# === Обучение ===
criterion = nn.BCELoss()
optimizer = optim.Adam(model.parameters(), lr=0.01, weight_decay=1e-5)

# Для графиков
train_losses = []
train_accuracies = []
test_accuracies = []

for epoch in range(10):
    model.train()
    correct_train = 0
    total_train = 0
    running_loss = 0
    for batch_X, batch_y in train_loader:
        optimizer.zero_grad()
        output = model(batch_X)
        loss = criterion(output, batch_y)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item()
        
        # Точность на обучении
        pred = (output > 0.5).float()
        correct_train += (pred == batch_y).sum().item()
        total_train += batch_y.size(0)
    
    avg_train_loss = running_loss / len(train_loader)
    train_losses.append(avg_train_loss)
    train_accuracy = correct_train / total_train
    train_accuracies.append(train_accuracy)
    
    # Тестирование
    model.eval()
    correct_test = 0
    total_test = 0
    with torch.no_grad():
        for batch_X, batch_y in test_loader:
            output = model(batch_X)
            pred = (output > 0.5).float()
            correct_test += (pred == batch_y).sum().item()
            total_test += batch_y.size(0)
    
    test_accuracy = correct_test / total_test
    test_accuracies.append(test_accuracy)
    
    print(f"Epoch {epoch+1}, Loss: {avg_train_loss:.4f}, Train Accuracy: {train_accuracy:.4f}, Test Accuracy: {test_accuracy:.4f}")

# Функция для построения графиков
def plot_metrics():
    # График потерь
    plt.figure(figsize=(10, 5))
    plt.plot(range(1, 11), train_losses, label='Потери')
    plt.xlabel('Эпоха')
    plt.ylabel('Потери')
    plt.title('График потерь на обучении')
    plt.legend()
    plt.show()

    # График точности
    plt.figure(figsize=(10, 5))
    plt.plot(range(1, 11), train_accuracies, label='Обучение')
    plt.plot(range(1, 11), test_accuracies, label='Тестирование')
    plt.xlabel('Эпоха')
    plt.ylabel('Точность')
    plt.title('График тончости на обучении и тестировании')
    plt.legend()
    plt.show()

# === Тестирование ===
model.eval()
with torch.no_grad():
    correct = 0
    total = 0
    for batch_X, batch_y in test_loader:
        output = model(batch_X)
        pred = (output > 0.5).float()
        correct += (pred == batch_y).sum().item()
        total += batch_y.size(0)

    print(f"Final Test Accuracy: {correct/total:.2f}")

# Функция предсказания
def predict(text):
    model.eval()
    with torch.no_grad():
        encoded = encode(text, vocab)  # Преобразуем текст в индексы
        input_tensor = torch.tensor([encoded], dtype=torch.long)  # Добавим батч-дим
        output = model(input_tensor)
        prediction = (output > 0.5).float().item()
        print(f"Текст: \"{text}\"")
        print(f"Стресс: {'ДА' if prediction == 1.0 else 'НЕТ'} (вероятность: {output.item():.2f})")

# Функция: гистограмма распределения предсказанных вероятностей
def plot_prediction_distribution(model, test_loader):
    predictions = []

    model.eval()
    with torch.no_grad():
        for batch_X, _ in test_loader:
            output = model(batch_X)
            predictions.extend(output.cpu().numpy())

    plt.figure(figsize=(8, 5))
    plt.hist(predictions, bins=20, edgecolor='black')
    plt.xlabel('Предсказанная вероятность')
    plt.ylabel('Частота')
    plt.title('Распределение предсказанных вероятностей')
    plt.show()

# Функция: ROC-кривая
def plot_roc_curve(model, test_loader):
    true_labels = []
    pred_scores = []

    model.eval()
    with torch.no_grad():
        for batch_X, batch_y in test_loader:
            output = model(batch_X)
            true_labels.extend(batch_y.cpu().numpy())
            pred_scores.extend(output.cpu().numpy())

    fpr, tpr, _ = roc_curve(true_labels, pred_scores)
    roc_auc = auc(fpr, tpr)

    plt.figure(figsize=(8, 5))
    plt.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC-кривая (площадь = {roc_auc:.2f})')
    plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
    plt.xlabel('Доля ложных срабатываний (FPR)')
    plt.ylabel('Доля истинных срабатываний (TPR)')
    plt.title('ROC-кривая (Receiver Operating Characteristic)')
    plt.legend(loc='lower right')
    plt.show()
