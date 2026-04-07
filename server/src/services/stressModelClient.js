import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const scriptPath = path.join(repoRoot, "stress_level", "serve_model.py");
const pythonExec = process.env.PYTHON_EXECUTABLE || "python";

class StressModelClient {
  constructor() {
    this.proc = null;
    this.buffer = "";
    this.pending = new Map();
    this.reqId = 1;
    this.ready = false;
    this.start();
  }

  start() {
    this.proc = spawn(pythonExec, [scriptPath], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk) => this.handleStdout(chunk.toString()));
    this.proc.stderr.on("data", (chunk) => {
      console.warn("[stress-model stderr]", chunk.toString());
    });
    this.proc.on("exit", () => {
      this.ready = false;
    });
  }

  handleStdout(text) {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.ready) {
          this.ready = true;
          continue;
        }
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          if (msg.ok) pending.resolve(msg);
          else pending.reject(new Error(msg.error || "stress model error"));
        }
      } catch (_e) {
        // ignore non-json lines from model training logs
      }
    }
  }

  async predict(text) {
    if (!text || !String(text).trim()) {
      return { score: 0.0, level: "low", source: "empty" };
    }
    if (!this.proc || !this.ready) {
      return this.fallback(text, "fallback_not_ready");
    }
    const id = this.reqId++;
    const payload = JSON.stringify({ id, text: String(text) }) + "\n";
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("stress model timeout"));
      }, 6000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      this.proc.stdin.write(payload);
    }).catch(() => null);

    if (!result) {
      return this.fallback(text, "fallback_timeout");
    }
    return {
      score: Number(result.score || 0),
      level: String(result.level || "low"),
      source: "python_nn",
    };
  }

  fallback(text, source) {
    const t = String(text).toLowerCase();
    const highWords = ["паника", "трев", "невыносим", "срыв", "устал", "давит", "страшно"];
    const mediumWords = ["груст", "тяжело", "одиноч", "нерв", "пустот", "пережив"];
    let score = 0.2;
    if (mediumWords.some((w) => t.includes(w))) score = 0.55;
    if (highWords.some((w) => t.includes(w))) score = 0.82;
    return {
      score,
      level: score >= 0.65 ? "high" : score >= 0.35 ? "medium" : "low",
      source,
    };
  }
}

const stressModelClient = new StressModelClient();
export default stressModelClient;

