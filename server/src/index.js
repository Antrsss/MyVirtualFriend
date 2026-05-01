import "dotenv/config";
import express from "express";
import cors from "cors";
import openRouterService from "./services/openRouterService.js";
import stressModelClient from "./services/stressModelClient.js";
import { buildSystemPrompt } from "./prompts/roles.js";
import { chatRequestSchema, normalizeMessages } from "./validation/chatRequest.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

function isMostlyRussian(text) {
  const s = String(text || "");
  const letters = s.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if (!letters.length) return true;
  const ru = s.match(/[А-Яа-яЁё]/g) || [];
  return ru.length / letters.length >= 0.6;
}

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.issues,
      });
    }

    const { role, topic, model } = parsed.data;
    const systemPrompt = buildSystemPrompt({ role, topic });

    const normalized = normalizeMessages(parsed.data.messages);
    if (!normalized.length) {
      return res.status(400).json({ error: "No valid messages" });
    }

    const messages = [{ role: "system", content: systemPrompt }, ...normalized];

    let text = await openRouterService.processChat(
      messages,
      model || DEFAULT_MODEL
    );

    if (!isMostlyRussian(text)) {
      const retryMessages = [
        ...messages,
        {
          role: "system",
          content:
            "Предыдущий ответ был не на русском. Переформулируй тот же ответ ТОЛЬКО на русском языке, естественно и без потери смысла.",
        },
      ];
      text = await openRouterService.processChat(
        retryMessages,
        model || DEFAULT_MODEL
      );
    }

    return res.json({ text });
  } catch (e) {
    const status = e?.status || e?.response?.status || 500;
    const details =
      e?.error?.message ||
      e?.response?.data?.error?.message ||
      e?.message ||
      "Unknown server error";
    console.error("OpenRouter error:", details, e);
    return res.status(status).json({
      error: "Server error",
      details,
    });
  }
});

app.post("/api/stress/predict", async (req, res) => {
  try {
    const text = String(req.body?.text || "");
    const result = await stressModelClient.predict(text);
    return res.json(result);
  } catch (e) {
    return res.status(500).json({ error: "Stress prediction failed", details: e?.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

