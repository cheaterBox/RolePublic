export type AiProvider =
  | "ollama"
  | "deepseek"
  | "openrouter"
  | "openai"
  | "gemini"
  | "anthropic"
  | "groq"
  | "bedrock";

export const AI_PROVIDERS: {
  id: AiProvider;
  label: string;
  needsKey: boolean;
}[] = [
  { id: "deepseek", label: "DeepSeek", needsKey: true },
  { id: "openrouter", label: "OpenRouter", needsKey: true },
  { id: "openai", label: "OpenAI", needsKey: true },
  { id: "gemini", label: "Gemini", needsKey: true },
  { id: "anthropic", label: "Anthropic", needsKey: true },
  { id: "groq", label: "Groq", needsKey: true },
  { id: "bedrock", label: "Bedrock (AWS)", needsKey: true },
  { id: "ollama", label: "Ollama (Local)", needsKey: false },
];

export function isBedrockEnvAuth(apiKey: string): boolean {
  return apiKey.trim() === "bedrock_env_auth";
}

export function parseBedrockKey(
  apiKey: string,
): { accessKey: string; secretKey: string; region?: string } | null {
  const parts = apiKey.split(":").map((p) => p.trim());
  if (parts.length < 2) return null;
  return { accessKey: parts[0], secretKey: parts[1], region: parts[2] };
}
