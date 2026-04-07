import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]).optional(),
  sender: z.enum(["user", "ai"]).optional(),
  content: z.string().optional(),
  text: z.string().optional(),
});

export const chatRequestSchema = z.object({
  role: z.string().min(1).default("friend"),
  topic: z.string().optional().default(""),
  messages: z.array(chatMessageSchema).min(1),
  model: z.string().optional(),
});

export function normalizeMessages(messages) {
  return messages
    .map((m) => {
      // поддержим разные форматы: {sender,text} (наш фронт) и {role,content} (OpenAI)
      if (m.role && m.content) {
        return { role: m.role, content: String(m.content) };
      }
      if (m.sender && m.text) {
        return {
          role: m.sender === "user" ? "user" : "assistant",
          content: String(m.text),
        };
      }
      if (m.role && m.text) {
        return { role: m.role, content: String(m.text) };
      }
      if (m.sender && m.content) {
        return {
          role: m.sender === "user" ? "user" : "assistant",
          content: String(m.content),
        };
      }
      return null;
    })
    .filter(Boolean);
}

