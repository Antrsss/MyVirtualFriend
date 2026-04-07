import json
import sys
import traceback

from neural_network import model, vocab, encode
import torch


def predict_proba(text: str) -> float:
    model.eval()
    with torch.no_grad():
        encoded = encode(text, vocab)
        input_tensor = torch.tensor([encoded], dtype=torch.long)
        output = model(input_tensor).item()
        return float(output)


def stress_level(score: float) -> str:
    if score < 0.35:
        return "low"
    if score < 0.65:
        return "medium"
    return "high"


print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        payload = json.loads(line)
        req_id = payload.get("id")
        text = str(payload.get("text", ""))
        score = predict_proba(text)
        result = {
            "id": req_id,
            "ok": True,
            "score": score,
            "level": stress_level(score),
        }
    except Exception as e:
        result = {
            "id": payload.get("id") if "payload" in locals() else None,
            "ok": False,
            "error": str(e),
            "trace": traceback.format_exc(limit=1),
        }
    print(json.dumps(result, ensure_ascii=False), flush=True)

