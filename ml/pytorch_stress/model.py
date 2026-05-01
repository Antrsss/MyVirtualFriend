import torch.nn as nn


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

