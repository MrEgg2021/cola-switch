"use strict";

const crypto = require("crypto");
const fsp = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");

const HOST = process.env.COLA_SWITCH_HOST || "127.0.0.1";
const PORT = Number(process.env.COLA_SWITCH_PORT || 8765);
const SETTINGS_FILE = process.env.COLA_SETTINGS_FILE || path.join(os.homedir(), ".cola", "settings.json");
const CONFIG_PREFIX = "cola.enc.v1:";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const FILE_MODE = 0o600;
const SERVER_LOG_FILE = "/tmp/cola-switch-server.log";

const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/script.js": "script.js",
};

const CUSTOM_COLA_PROVIDERS = [
  { id: "openai", label: "openai" },
  { id: "anthropic", label: "anthropic" },
  { id: "openrouter", label: "openrouter" },
  { id: "groq", label: "groq" },
  { id: "cerebras", label: "cerebras" },
  { id: "xai", label: "xai" },
  { id: "mistral", label: "mistral" },
  { id: "huggingface", label: "huggingface" },
  { id: "vercel-ai-gateway", label: "vercel-ai-gateway" },
  { id: "zai", label: "zai" },
  { id: "kimi-coding", label: "kimi-coding" },
  { id: "minimax", label: "minimax" },
  { id: "minimax-cn", label: "minimax-cn" },
  { id: "azure-openai-responses", label: "azure-openai-responses" },
  { id: "google-vertex", label: "google-vertex" },
  { id: "amazon-bedrock", label: "amazon-bedrock" },
  { id: "opencode", label: "opencode" },
  { id: "opencode-go", label: "opencode-go" },
  { id: "openai-codex", label: "openai-codex" },
];

const PROVIDERS = [
  {
    id: "openai",
    shortName: "OpenAI",
    name: "ChatGPT / OpenAI",
    tagline: "官方 API，适合直接切到 GPT / Codex。",
    keyHint: "这里填 OpenAI 的 `sk-...` key。",
    defaultVariantId: "standard",
    defaultModel: "gpt-5.4-mini",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "官方默认入口，也可手填其他 OpenAI 线模型。",
        colaProvider: "openai",
        baseUrl: "https://api.openai.com/v1",
        models: ["gpt-5.4-mini", "gpt-5.4", "gpt-5.1-codex-max", "gpt-4.1"],
      },
    ],
  },
  {
    id: "anthropic",
    shortName: "Anthropic",
    name: "Anthropic / Claude",
    tagline: "直接切 Claude 官方 Anthropic 接口。",
    keyHint: "这里填 Anthropic 的 key。",
    defaultVariantId: "standard",
    defaultModel: "claude-sonnet-4-6",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "Cola 内置 `anthropic` provider。",
        colaProvider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
      },
    ],
  },
  {
    id: "openrouter",
    shortName: "OpenRouter",
    name: "OpenRouter",
    tagline: "多厂商统一入口，适合接列表外模型。",
    keyHint: "这里填 OpenRouter 的 key。",
    defaultVariantId: "standard",
    defaultModel: "openai/gpt-5.4-mini",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "模型支持很多，建议直接手填完整模型名。",
        colaProvider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        models: ["openai/gpt-5.4-mini", "anthropic/claude-sonnet-4.5", "moonshotai/kimi-k2.5"],
      },
    ],
  },
  {
    id: "kimi",
    shortName: "Kimi",
    name: "Kimi",
    tagline: "按 Cola 当前内置能力，走 Kimi Coding 入口。",
    keyHint: "这里填 Kimi Coding 的 key。",
    defaultVariantId: "coding",
    defaultModel: "kimi-k2-thinking",
    variants: [
      {
        id: "coding",
        name: "Coding",
        help: "Cola 内置的是 Kimi Coding provider。",
        colaProvider: "kimi-coding",
        baseUrl: "https://api.kimi.com/coding",
        models: ["kimi-k2-thinking", "k2p5", "kimi-k2.5"],
      },
    ],
  },
  {
    id: "zhipu",
    shortName: "智谱",
    name: "智谱 / Zhipu",
    tagline: "走 Cola 内置的 `zai` coding 入口。",
    keyHint: "这里填智谱 coding key。",
    defaultVariantId: "coding",
    defaultModel: "glm-5",
    variants: [
      {
        id: "coding",
        name: "Coding",
        help: "Cola bundle 里对应 `https://api.z.ai/api/coding/paas/v4`。",
        colaProvider: "zai",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        models: ["glm-5", "glm-4.7", "glm-4.6"],
      },
    ],
  },
  {
    id: "grok",
    shortName: "Grok",
    name: "Grok / xAI",
    tagline: "走 Cola 内置的 xAI OpenAI-compatible 入口。",
    keyHint: "这里填 xAI 的 API key。",
    defaultVariantId: "standard",
    defaultModel: "grok-code-fast-1",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "Cola 内置 provider id 是 `xai`，模型可手填。",
        colaProvider: "xai",
        baseUrl: "https://api.x.ai/v1",
        models: ["grok-code-fast-1", "grok-4-1-fast", "grok-4.20-0309-reasoning"],
      },
    ],
  },
  {
    id: "groq",
    shortName: "Groq",
    name: "Groq",
    tagline: "低延迟 OpenAI-compatible 入口。",
    keyHint: "这里填 Groq 的 API key。",
    defaultVariantId: "standard",
    defaultModel: "openai/gpt-oss-120b",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "Cola 内置 provider id 是 `groq`，建议模型直接手填。",
        colaProvider: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b"],
      },
    ],
  },
  {
    id: "cerebras",
    shortName: "Cerebras",
    name: "Cerebras",
    tagline: "高速 OpenAI-compatible 入口。",
    keyHint: "这里填 Cerebras 的 API key。",
    defaultVariantId: "standard",
    defaultModel: "zai-glm-4.7",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "Cola 内置 provider id 是 `cerebras`。",
        colaProvider: "cerebras",
        baseUrl: "https://api.cerebras.ai/v1",
        models: ["zai-glm-4.7", "llama3.1-70b", "qwen-3-32b"],
      },
    ],
  },
  {
    id: "mistral",
    shortName: "Mistral",
    name: "Mistral",
    tagline: "Mistral 官方 API。",
    keyHint: "这里填 Mistral 的 API key。",
    defaultVariantId: "standard",
    defaultModel: "devstral-medium-latest",
    variants: [
      {
        id: "standard",
        name: "Standard API",
        help: "Cola 内置 provider id 是 `mistral`。",
        colaProvider: "mistral",
        baseUrl: "https://api.mistral.ai",
        models: ["devstral-medium-latest", "codestral-latest", "mistral-medium-latest"],
      },
    ],
  },
  {
    id: "huggingface",
    shortName: "HF",
    name: "Hugging Face",
    tagline: "Router 入口，适合转接很多模型。",
    keyHint: "这里填 Hugging Face token。",
    defaultVariantId: "router",
    defaultModel: "moonshotai/Kimi-K2.5",
    variants: [
      {
        id: "router",
        name: "Router",
        help: "Cola 内置 provider id 是 `huggingface`。",
        colaProvider: "huggingface",
        baseUrl: "https://router.huggingface.co/v1",
        models: ["moonshotai/Kimi-K2.5", "openai/gpt-oss-120b", "meta-llama/Llama-3.3-70B-Instruct"],
      },
    ],
  },
  {
    id: "vercel-gateway",
    shortName: "Gateway",
    name: "Vercel AI Gateway",
    tagline: "统一网关，适合把多厂商藏在一个入口后面。",
    keyHint: "这里填 AI Gateway key。",
    defaultVariantId: "gateway",
    defaultModel: "anthropic/claude-opus-4-6",
    variants: [
      {
        id: "gateway",
        name: "Gateway",
        help: "Cola 内置 provider id 是 `vercel-ai-gateway`。",
        colaProvider: "vercel-ai-gateway",
        baseUrl: "https://ai-gateway.vercel.sh",
        models: ["anthropic/claude-opus-4-6", "openai/gpt-5.4-mini", "moonshotai/kimi-k2.5"],
      },
    ],
  },
  {
    id: "minimax",
    shortName: "MiniMax",
    name: "MiniMax",
    tagline: "支持中国区和国际站两个内置入口。",
    keyHint: "这里填 MiniMax 对应入口的 key。",
    defaultVariantId: "cn",
    defaultModel: "MiniMax-M2.7",
    variants: [
      {
        id: "cn",
        name: "中国区",
        help: "写入 Cola 的 `minimax-cn` provider。",
        colaProvider: "minimax-cn",
        baseUrl: "https://api.minimaxi.com/anthropic",
        models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5"],
      },
      {
        id: "global",
        name: "国际站",
        help: "写入 Cola 的 `minimax` provider。",
        colaProvider: "minimax",
        baseUrl: "https://api.minimax.io/anthropic",
        models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5"],
      },
    ],
  },
  {
    id: "custom",
    shortName: "自定义",
    name: "自定义接入",
    tagline: "列表里没有的，就手填 Cola provider、Base URL 和模型。",
    keyHint: "这里填你要接入的服务 key。",
    custom: true,
    defaultVariantId: "manual",
    defaultModel: "",
    variants: [
      {
        id: "manual",
        name: "手动配置",
        help: "适合接入列表外的兼容接口。",
        colaProvider: "",
        baseUrl: "",
        models: [],
      },
    ],
    supportedColaProviders: CUSTOM_COLA_PROVIDERS,
  },
];

function getEncryptionKey() {
  const parts = [
    "Y29sYS1jb25maWc=",
    "cHJvdGVjdGlvbi12MQ==",
    "bG9jYWwtb25seQ==",
    "b2JmdXNjYXRpb24=",
  ];
  const material = parts.map((value) => Buffer.from(value, "base64").toString("utf8")).join(":");
  return crypto.createHash("sha256").update(material).digest();
}

async function appendServerLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fsp.appendFile(SERVER_LOG_FILE, line, "utf8").catch(() => {});
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(CONFIG_PREFIX);
}

function decryptSettings(value) {
  if (!isEncrypted(value)) {
    return value;
  }

  const raw = Buffer.from(value.slice(CONFIG_PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encryptSettings(value) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ciphertext]).toString("base64");
  return `${CONFIG_PREFIX}${payload}`;
}

async function readSettings() {
  const raw = await fsp.readFile(SETTINGS_FILE, "utf8");
  return JSON.parse(decryptSettings(raw));
}

async function writeSettings(settings) {
  await fsp.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  const payload = encryptSettings(JSON.stringify(settings, null, 2));
  const tempFile = path.join(
    path.dirname(SETTINGS_FILE),
    `.${path.basename(SETTINGS_FILE)}.${process.pid}.${Date.now()}.tmp`,
  );

  await fsp.writeFile(tempFile, payload, { encoding: "utf8", mode: FILE_MODE });
  await fsp.chmod(tempFile, FILE_MODE);
  await fsp.rename(tempFile, SETTINGS_FILE);
  await fsp.chmod(SETTINGS_FILE, FILE_MODE);
}

function findProvider(providerId) {
  return PROVIDERS.find((item) => item.id === providerId);
}

function findVariant(providerId, variantId) {
  return findProvider(providerId)?.variants.find((item) => item.id === variantId);
}

function buildCustomStatus(settings, activeProvider, activeKey) {
  return {
    providerId: "custom",
    providerLabel: `自定义 / ${activeProvider}`,
    variantId: "manual",
    variantLabel: "手动配置",
    colaProvider: activeProvider,
    model: settings.model || "",
    apiKey: activeKey?.apiKey || "",
    baseUrl: activeKey?.baseUrl || "",
    settingsFile: SETTINGS_FILE,
  };
}

function resolveUiStatus(settings) {
  const activeProvider = settings.provider;
  const matchedProvider = PROVIDERS.find((provider) =>
    provider.id !== "custom" && provider.variants.some((variant) => variant.colaProvider === activeProvider),
  );
  const matchedVariant = matchedProvider?.variants.find((variant) => variant.colaProvider === activeProvider);
  const activeKey = settings.providerKeys?.[activeProvider];

  if (!matchedProvider) {
    return buildCustomStatus(settings, activeProvider, activeKey);
  }

  return {
    providerId: matchedProvider.id,
    providerLabel: matchedProvider.name,
    variantId: matchedVariant?.id || "",
    variantLabel: matchedVariant?.name || "自定义",
    colaProvider: activeProvider,
    model: settings.model || "",
    apiKey: activeKey?.apiKey || "",
    baseUrl: activeKey?.baseUrl || "",
    settingsFile: SETTINGS_FILE,
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function isCustomProviderSupported(colaProvider) {
  return CUSTOM_COLA_PROVIDERS.some((item) => item.id === colaProvider);
}

async function handleApply(request, response) {
  const body = await readJsonBody(request);
  await appendServerLog(`POST /api/apply providerId=${body.providerId || ""} variantId=${body.variantId || ""} model=${body.model || ""}`);
  const provider = findProvider(body.providerId);
  if (!provider) {
    sendJson(response, 400, { error: "服务商不存在。" });
    return;
  }

  const settings = await readSettings();
  const previousProvider = settings.provider || "";
  const previousModel = settings.model || "";
  let colaProvider = "";
  let baseUrl = "";

  if (provider.custom) {
    colaProvider = typeof body.customColaProvider === "string" ? body.customColaProvider.trim() : "";
    baseUrl = typeof body.customBaseUrl === "string" ? body.customBaseUrl.trim() : "";

    if (!colaProvider || !isCustomProviderSupported(colaProvider)) {
      sendJson(response, 400, { error: "请先选择一个 Cola provider。" });
      return;
    }

    if (!baseUrl) {
      sendJson(response, 400, { error: "自定义模式下 Base URL 不能为空。" });
      return;
    }
  } else {
    const variant = findVariant(body.providerId, body.variantId || provider.defaultVariantId);
    if (!variant) {
      sendJson(response, 400, { error: "入口配置不存在。" });
      return;
    }

    colaProvider = variant.colaProvider;
    baseUrl = variant.baseUrl;
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) {
    sendJson(response, 400, { error: "模型不能为空。" });
    return;
  }

  const nextKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const existingKey = settings.providerKeys?.[colaProvider]?.apiKey || "";
  const previousBaseUrl = settings.providerKeys?.[previousProvider]?.baseUrl || "";
  const previousApiKey = settings.providerKeys?.[previousProvider]?.apiKey || "";
  const apiKey = nextKey || existingKey;

  if (!apiKey) {
    sendJson(response, 400, { error: "这个服务商还没有保存过 key，请先填入 API Key。" });
    return;
  }

  settings.provider = colaProvider;
  settings.model = model;
  settings.modelConfig = {
    sota: model,
    default: model,
    fast: model,
  };
  settings.thinkingLevel = settings.thinkingLevel || "off";
  settings.providerKeys = settings.providerKeys || {};
  settings.providerKeys[colaProvider] = {
    apiKey,
    baseUrl,
  };

  const changed = !(
    previousProvider === colaProvider &&
    previousModel === model &&
    previousBaseUrl === baseUrl &&
    previousApiKey === apiKey
  );

  await writeSettings(settings);
  await appendServerLog(`apply done colaProvider=${colaProvider} model=${model} changed=${changed}`);
  sendJson(response, 200, {
    ok: true,
    changed,
    status: resolveUiStatus(settings),
  });
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    await appendServerLog(`${request.method} ${url.pathname}`);

    if (request.method === "GET" && url.pathname === "/api/providers") {
      sendJson(response, 200, {
        providers: PROVIDERS,
        customColaProviders: CUSTOM_COLA_PROVIDERS,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      const settings = await readSettings();
      sendJson(response, 200, { status: resolveUiStatus(settings) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/apply") {
      await handleApply(request, response);
      return;
    }

    const staticFile = STATIC_FILES[url.pathname];
    if (request.method === "GET" && staticFile) {
      const filePath = path.join(__dirname, staticFile);
      const content = await fsp.readFile(filePath);
      const contentType = staticFile.endsWith(".css")
        ? "text/css; charset=utf-8"
        : staticFile.endsWith(".js")
          ? "application/javascript; charset=utf-8"
          : "text/html; charset=utf-8";
      response.writeHead(200, { "Content-Type": contentType });
      response.end(content);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

const server = http.createServer((request, response) => {
  handleRequest(request, response);
});

server.listen(PORT, HOST, () => {
  fsp.writeFile(SERVER_LOG_FILE, "", "utf8").catch(() => {});
  process.stdout.write(`Cola switch running at http://${HOST}:${PORT}\n`);
});
