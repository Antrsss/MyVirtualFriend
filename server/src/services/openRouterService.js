import OpenAI from "openai";

export class OpenRouterService {
  client = null;

  getClient() {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      const siteUrl = process.env.SITE_URL || "http://localhost";

      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for OpenRouter");
      }

      this.client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        defaultHeaders: {
          "HTTP-Referer": siteUrl,
          "X-Title": "My Virtual Friend",
        },
      });
    }

    return this.client;
  }

  async processPrompt(prompt, model = "openrouter/auto") {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content || "";
  }

  async processChat(messages, model = "openrouter/auto") {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model,
      messages,
    });

    return response.choices[0]?.message?.content || "";
  }

  async *processPromptStream(prompt, model = "openrouter/auto") {
    const client = this.getClient();

    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

export default new OpenRouterService();

