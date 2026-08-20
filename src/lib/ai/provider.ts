/**
 * Warstwa dostawcy modelu AI.
 *
 * Cała reszta aplikacji rozmawia wyłącznie z interfejsem `AIProvider`.
 * Zmiana dostawcy = zmiana jednej zmiennej w .env.local, zero zmian w kodzie.
 * To celowe: uzależnienie produktu od jednego dostawcy AI jest ryzykiem
 * biznesowym (ceny, limity, dostępność, rezydencja danych w UE).
 */

export type JsonSchema = Record<string, unknown>;

export interface GenerateOptions {
  system?: string;
  /** Wymuszenie odpowiedzi w formacie JSON zgodnym ze schematem. */
  schema?: JsonSchema;
  temperature?: number;
  /** Pliki wejściowe (np. CV jako PDF) — model widzi układ strony, nie tylko tekst. */
  files?: { mimeType: string; data: Buffer }[];
}

export interface AIProvider {
  name: string;
  generate(prompt: string, opts?: GenerateOptions): Promise<string>;
  /** Ile realnie kosztowało dotychczasowe użycie — do pokazania w UI. */
  usage(): { calls: number; inputTokens: number; outputTokens: number };
}

class GeminiProvider implements AIProvider {
  name = "gemini";
  private stats = { calls: 0, inputTokens: 0, outputTokens: 0 };
  private model: string;

  constructor(private apiKey: string, model?: string) {
    // Flash jest w darmowym tierze i obsługuje wejście PDF/obraz — dokładnie to,
    // czego potrzebujemy, żeby model WIDZIAŁ układ CV, a nie tylko wyciągnięty tekst.
    this.model = model || process.env.GEMINI_MODEL || "gemini-3.6-flash";
  }

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(this.apiKey);

    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: opts.system,
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        ...(opts.schema
          ? { responseMimeType: "application/json", responseSchema: opts.schema as never }
          : {}),
      },
    });

    const parts: unknown[] = [{ text: prompt }];
    for (const f of opts.files ?? []) {
      parts.push({ inlineData: { mimeType: f.mimeType, data: f.data.toString("base64") } });
    }

    let res;
    try {
      res = await model.generateContent(parts as never);
    } catch (e) {
      // SAMONAPRAWA PRZY WYCOFANIU MODELU.
      //
      // Google wycofuje starsze modele i zwraca wtedy 404 z podpowiedzią,
      // czego użyć zamiast. Bez tego aplikacja przestaje działać z dnia na dzień,
      // a użytkownik widzi surowy błąd API i nie wie, co zrobić.
      //
      // Wyłuskujemy nazwę następcy z komunikatu i ponawiamy raz.
      const msg = (e as Error).message ?? "";
      const suggested = msg.match(/use\s+models\/([a-z0-9.\-]+)/i)?.[1];

      if (suggested && suggested !== this.model) {
        console.warn(`[gemini] model ${this.model} został wycofany — przełączam na ${suggested}`);
        this.model = suggested;
        const retryModel = genAI.getGenerativeModel({
          model: this.model,
          systemInstruction: opts.system,
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            ...(opts.schema
              ? { responseMimeType: "application/json", responseSchema: opts.schema as never }
              : {}),
          },
        });
        res = await retryModel.generateContent(parts as never);
      } else {
        throw new Error(friendlyGeminiError(msg, this.model));
      }
    }

    this.stats.calls++;
    const um = res.response.usageMetadata;
    if (um) {
      this.stats.inputTokens += um.promptTokenCount ?? 0;
      this.stats.outputTokens += um.candidatesTokenCount ?? 0;
    }
    return res.response.text();
  }

  usage() { return { ...this.stats }; }
}

class OpenAIProvider implements AIProvider {
  name = "openai";
  private stats = { calls: 0, inputTokens: 0, outputTokens: 0 };
  constructor(private apiKey: string, private model = process.env.OPENAI_MODEL || "gpt-4o-mini") {}

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    const content: unknown[] = [{ type: "text", text: prompt }];
    for (const f of opts.files ?? []) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${f.mimeType};base64,${f.data.toString("base64")}` },
      });
    }
    const body = {
      model: this.model,
      temperature: opts.temperature ?? 0.2,
      ...(opts.schema ? { response_format: { type: "json_object" } } : {}),
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content },
      ],
    };
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
    const j = await r.json();
    this.stats.calls++;
    this.stats.inputTokens += j.usage?.prompt_tokens ?? 0;
    this.stats.outputTokens += j.usage?.completion_tokens ?? 0;
    return j.choices[0].message.content ?? "";
  }
  usage() { return { ...this.stats }; }
}

class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private stats = { calls: 0, inputTokens: 0, outputTokens: 0 };
  constructor(private apiKey: string, private model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5") {}

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    const content: unknown[] = [];
    for (const f of opts.files ?? []) {
      content.push({
        type: f.mimeType === "application/pdf" ? "document" : "image",
        source: { type: "base64", media_type: f.mimeType, data: f.data.toString("base64") },
      });
    }
    content.push({ type: "text", text: prompt });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 8192,
        temperature: opts.temperature ?? 0.2,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
    const j = await r.json();
    this.stats.calls++;
    this.stats.inputTokens += j.usage?.input_tokens ?? 0;
    this.stats.outputTokens += j.usage?.output_tokens ?? 0;
    return j.content.map((c: { text?: string }) => c.text ?? "").join("");
  }
  usage() { return { ...this.stats }; }
}

class OllamaProvider implements AIProvider {
  name = "ollama";
  private stats = { calls: 0, inputTokens: 0, outputTokens: 0 };
  constructor(private url = process.env.OLLAMA_URL || "http://localhost:11434",
              private model = process.env.OLLAMA_MODEL || "llama3.1") {}

  async generate(prompt: string, opts: GenerateOptions = {}): Promise<string> {
    const r = await fetch(`${this.url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: (opts.system ? opts.system + "\n\n" : "") + prompt,
        format: opts.schema ? "json" : undefined,
        stream: false,
        options: { temperature: opts.temperature ?? 0.2 },
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}: ${await r.text()}`);
    const j = await r.json();
    this.stats.calls++;
    return j.response ?? "";
  }
  usage() { return { ...this.stats }; }
}

let cached: AIProvider | null = null;

export function getAI(): AIProvider {
  if (cached) return cached;
  const p = (process.env.AI_PROVIDER || "gemini").toLowerCase();

  const need = (v: string | undefined, name: string) => {
    if (!v) throw new Error(
      `Brak klucza ${name} w pliku .env.local. ` +
      `Dla Gemini darmowy klucz dostaniesz na https://aistudio.google.com/apikey`
    );
    return v;
  };

  switch (p) {
    case "openai":    cached = new OpenAIProvider(need(process.env.OPENAI_API_KEY, "OPENAI_API_KEY")); break;
    case "anthropic": cached = new AnthropicProvider(need(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY")); break;
    case "ollama":    cached = new OllamaProvider(); break;
    default:          cached = new GeminiProvider(need(process.env.GEMINI_API_KEY, "GEMINI_API_KEY"));
  }
  return cached;
}

/** Zamiana surowych błędów API na komunikaty, z którymi da się coś zrobić. */
function friendlyGeminiError(msg: string, model: string): string {
  if (/API key not valid|API_KEY_INVALID/i.test(msg))
    return "Klucz GEMINI_API_KEY jest nieprawidłowy. Wygeneruj nowy na https://aistudio.google.com/apikey i wklej do .env.local";
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg))
    return "Wyczerpał się darmowy limit zapytań do Gemini. Odczekaj kilka minut albo ustaw inny model w GEMINI_MODEL.";
  if (/404|not found|no longer available/i.test(msg))
    return `Model "${model}" jest niedostępny. Wpisz aktualną nazwę do GEMINI_MODEL w .env.local — listę znajdziesz na https://ai.google.dev/gemini-api/docs/models`;
  if (/SAFETY|blocked/i.test(msg))
    return "Model odmówił odpowiedzi ze względów bezpieczeństwa. Spróbuj z innym dokumentem.";
  return msg;
}

/** Bezpieczne parsowanie JSON od modelu — modele lubią owijać odpowiedź w ```json. */
export function parseJson<T>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
  return JSON.parse(s) as T;
}
