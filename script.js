const STORAGE_PREFIX = "cola_switch_key_";

const state = {
  providers: [],
  customColaProviders: [],
  providerId: "",
  variantId: "",
  model: "",
  customColaProvider: "openai",
  customBaseUrl: "",
  status: null,
  pending: false,
};

const elements = {
  statusPanel: document.getElementById("status-panel"),
  providerGrid: document.getElementById("provider-grid"),
  variantBlock: document.getElementById("variant-block"),
  variantSelect: document.getElementById("variant-select"),
  variantHelp: document.getElementById("variant-help"),
  modelInput: document.getElementById("model-input"),
  modelHelp: document.getElementById("model-help"),
  modelSuggestions: document.getElementById("model-suggestions"),
  apiKeyInput: document.getElementById("api-key-input"),
  providerHint: document.getElementById("provider-hint"),
  advancedPanel: document.getElementById("advanced-panel"),
  customFields: document.getElementById("custom-fields"),
  customProviderSelect: document.getElementById("custom-provider-select"),
  customBaseUrlInput: document.getElementById("custom-base-url-input"),
  switchForm: document.getElementById("switch-form"),
  applyButton: document.getElementById("apply-button"),
  applyButtons: Array.from(document.querySelectorAll("[data-apply-button='true']")),
  actionSummary: document.getElementById("action-summary"),
  resultBanner: document.getElementById("result-banner"),
  providerCardTemplate: document.getElementById("provider-card-template"),
};

function postNativeStatus(type, message) {
  try {
    const handler = window.webkit?.messageHandlers?.colaStatus;
    if (handler && typeof handler.postMessage === "function") {
      handler.postMessage({ type, message });
    }
  } catch {}
}

window.addEventListener("error", (event) => {
  postNativeStatus("error", `JS error: ${event.message}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  postNativeStatus("error", `Promise error: ${reason}`);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  const id = target && typeof target.id === "string" ? target.id : "";
  const tag = target && typeof target.tagName === "string" ? target.tagName : "";
  const className = target && typeof target.className === "string" ? target.className : "";
  const text = target && typeof target.textContent === "string" ? target.textContent.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  postNativeStatus("debug", `document-click:${tag}${id ? `#${id}` : ""}${className ? `.${className}` : ""}${text ? `::${text}` : ""}`);
}, true);

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  const id = target && typeof target.id === "string" ? target.id : "";
  const tag = target && typeof target.tagName === "string" ? target.tagName : "";
  const className = target && typeof target.className === "string" ? target.className : "";
  const text = target && typeof target.textContent === "string" ? target.textContent.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  postNativeStatus("debug", `pointerdown:${tag}${id ? `#${id}` : ""}${className ? `.${className}` : ""}${text ? `::${text}` : ""}`);
}, true);

async function request(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || `请求失败：${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function maskKey(value) {
  if (!value) {
    return "未保存";
  }
  if (value.length <= 10) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return `${value.slice(0, 5)}...${value.slice(-4)}`;
}

function getProvider(providerId) {
  return state.providers.find((item) => item.id === providerId);
}

function getVariant(providerId, variantId) {
  return getProvider(providerId)?.variants.find((item) => item.id === variantId);
}

function isCustomMode() {
  return state.providerId === "custom";
}

function getStorageKeyId() {
  if (isCustomMode()) {
    return `custom:${state.customColaProvider}`;
  }
  return state.providerId;
}

function showBanner(message, tone = "success") {
  elements.resultBanner.hidden = false;
  elements.resultBanner.className = `result-banner is-${tone}`;
  elements.resultBanner.textContent = message;
  elements.resultBanner.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearBanner() {
  elements.resultBanner.hidden = true;
  elements.resultBanner.textContent = "";
  elements.resultBanner.className = "result-banner";
}

function saveKey(storageId, value) {
  if (!storageId) {
    return;
  }
  if (!value) {
    localStorage.removeItem(`${STORAGE_PREFIX}${storageId}`);
    return;
  }
  localStorage.setItem(`${STORAGE_PREFIX}${storageId}`, value);
}

function getSavedKey(storageId) {
  return localStorage.getItem(`${STORAGE_PREFIX}${storageId}`) || "";
}

function renderStatus() {
  const status = state.status;
  if (!status) {
    elements.statusPanel.className = "status-panel is-loading";
    elements.statusPanel.textContent = "还没有拿到状态。";
    return;
  }

  const provider = getProvider(status.providerId);
  const title = provider?.name || status.providerLabel || status.providerId;

  elements.statusPanel.className = "status-panel";
  elements.statusPanel.innerHTML = `
    <div class="status-main">
      <div class="status-title">
        <span class="status-provider">${title}</span>
        <span class="status-model">${status.model}</span>
      </div>
      <div class="status-meta">
        入口：${status.variantLabel || "未识别"}<br>
        Cola provider：${status.colaProvider}<br>
        Base URL：${status.baseUrl || "未设置"}<br>
        已保存 Key：${maskKey(status.apiKey)}<br>
        配置文件：${status.settingsFile}
      </div>
    </div>
  `;
}

function renderProviderCards() {
  elements.providerGrid.innerHTML = "";

  state.providers.forEach((provider) => {
    const node = elements.providerCardTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.providerId = provider.id;
    node.querySelector(".provider-name").textContent = provider.shortName;
    node.querySelector(".provider-meta").textContent = provider.tagline;

    if (provider.id === state.providerId) {
      node.classList.add("is-active");
    }

    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.providerId = provider.id;
      state.variantId = provider.defaultVariantId;
      state.model = provider.defaultModel || "";
      if (provider.custom && !state.customColaProvider) {
        state.customColaProvider = state.customColaProviders[0]?.id || "openai";
      }
      if (provider.custom && !state.customBaseUrl) {
        state.customBaseUrl = "";
      }
      loadSavedKey();
      render();
      clearBanner();
      if (elements.advancedPanel) {
        elements.advancedPanel.open = provider.custom;
      }
    });

    elements.providerGrid.appendChild(node);
  });
}

function renderCustomProviderOptions() {
  elements.customProviderSelect.innerHTML = "";
  state.customColaProviders.forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    if (provider.id === state.customColaProvider) {
      option.selected = true;
    }
    elements.customProviderSelect.appendChild(option);
  });
}

function renderVariantOptions() {
  const provider = getProvider(state.providerId);
  if (!provider) {
    return;
  }

  if (provider.custom) {
    elements.variantBlock.classList.add("is-hidden");
    elements.customFields.hidden = false;
    if (elements.advancedPanel) {
      elements.advancedPanel.open = true;
    }
    renderCustomProviderOptions();
    elements.customProviderSelect.value = state.customColaProvider;
    elements.customBaseUrlInput.value = state.customBaseUrl;
    elements.variantHelp.textContent = "";
    return;
  }

  elements.variantBlock.classList.remove("is-hidden");
  elements.customFields.hidden = true;
  elements.variantSelect.innerHTML = "";

  provider.variants.forEach((variant) => {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = variant.name;
    if (variant.id === state.variantId) {
      option.selected = true;
    }
    elements.variantSelect.appendChild(option);
  });

  const currentVariant = getVariant(state.providerId, state.variantId) || provider.variants[0];
  elements.variantHelp.textContent = currentVariant.help;
}

function renderModelField() {
  const provider = getProvider(state.providerId);
  const suggestions = isCustomMode() ? [] : getVariant(state.providerId, state.variantId)?.models || [];
  elements.modelSuggestions.innerHTML = "";

  suggestions.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    elements.modelSuggestions.appendChild(option);
  });

  elements.modelInput.value = state.model || "";
  elements.modelHelp.textContent = provider?.custom
    ? "自定义模式下模型完全手填。"
    : suggestions.length > 0
      ? `可以直接手填，下面这些只是建议值：${suggestions.join(" / ")}`
      : "直接手填模型名。";
}

function loadSavedKey() {
  elements.apiKeyInput.value = getSavedKey(getStorageKeyId());
}

function renderProviderHint() {
  const provider = getProvider(state.providerId);
  if (!provider) {
    return;
  }

  if (provider.custom) {
    elements.providerHint.textContent = `${provider.keyHint} 你可以把列表外的兼容接口接到这里。`;
    return;
  }

  const variant = getVariant(state.providerId, state.variantId);
  elements.providerHint.textContent = `${provider.keyHint} 当前入口会写成 ${variant.baseUrl}`;
}

function renderActionSummary() {
  const provider = getProvider(state.providerId);
  if (!provider) {
    elements.actionSummary.textContent = "目标：未选择";
    return;
  }

  if (provider.custom) {
    const baseUrl = state.customBaseUrl || "未填写 Base URL";
    const model = state.model || "未填写模型";
    const summary = `目标：自定义 / ${state.customColaProvider} / ${model} / ${baseUrl}`;
    elements.actionSummary.textContent = summary;
    return;
  }

  const variant = getVariant(state.providerId, state.variantId);
  const model = state.model || "未填写模型";
  const summary = `目标：${provider.name} / ${variant?.name || "默认"} / ${model}`;
  elements.actionSummary.textContent = summary;
}

function syncCurrentSelectionWithStatus() {
  if (!state.status) {
    return;
  }

  const match = state.providers.find((provider) =>
    !provider.custom && provider.variants.some((variant) => variant.colaProvider === state.status.colaProvider),
  );

  if (!match) {
    state.providerId = "custom";
    state.variantId = "manual";
    state.model = state.status.model || "";
    state.customColaProvider = state.status.colaProvider || "openai";
    state.customBaseUrl = state.status.baseUrl || "";
    return;
  }

  state.providerId = match.id;
  const variant = match.variants.find((item) => item.colaProvider === state.status.colaProvider) || match.variants[0];
  state.variantId = variant.id;
  state.model = state.status.model || match.defaultModel;
}

function render() {
  renderStatus();
  renderProviderCards();
  renderVariantOptions();
  renderModelField();
  renderProviderHint();
  renderActionSummary();
  elements.applyButtons.forEach((button) => {
    button.disabled = state.pending;
    button.textContent = state.pending ? "正在写入 Cola 配置..." : "保存并切换 Cola";
  });
}

async function loadInitialData() {
  const [providersPayload, statusPayload] = await Promise.all([
    request("/api/providers"),
    request("/api/status"),
  ]);

  state.providers = providersPayload.providers;
  state.customColaProviders = providersPayload.customColaProviders || [];
  state.status = statusPayload.status;
  syncCurrentSelectionWithStatus();
  loadSavedKey();
  render();
}

elements.variantSelect.addEventListener("change", () => {
  state.variantId = elements.variantSelect.value;
  const variant = getVariant(state.providerId, state.variantId);
  if (variant && !state.model) {
    state.model = variant.models[0] || "";
  }
  render();
  clearBanner();
});

elements.modelInput.addEventListener("input", () => {
  state.model = elements.modelInput.value.trim();
  clearBanner();
});

elements.customProviderSelect.addEventListener("change", () => {
  state.customColaProvider = elements.customProviderSelect.value;
  loadSavedKey();
  render();
  clearBanner();
});

elements.customBaseUrlInput.addEventListener("input", () => {
  state.customBaseUrl = elements.customBaseUrlInput.value.trim();
  clearBanner();
});

elements.applyButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    postNativeStatus("debug", `apply-button click::保存并切换 Cola::slot-${index}`);
  });

  button.addEventListener("mousedown", () => {
    postNativeStatus("debug", `apply-button mousedown::保存并切换 Cola::slot-${index}`);
  });
});

elements.switchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearBanner();
  state.pending = true;
  render();

  try {
    const apiKey = elements.apiKeyInput.value.trim();
    postNativeStatus("progress", "正在切换 Cola 配置…");
    const payload = {
      providerId: state.providerId,
      variantId: state.variantId,
      model: state.model.trim(),
      apiKey,
      customColaProvider: state.customColaProvider,
      customBaseUrl: state.customBaseUrl.trim(),
    };

    const response = await request("/api/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (apiKey) {
      saveKey(getStorageKeyId(), apiKey);
    }

    state.status = response.status;
    renderStatus();
    const message = response.changed
      ? `已切换到 ${response.status.providerLabel} / ${response.status.model}。下一条新消息通常就会走新配置。`
      : `当前已经是 ${response.status.providerLabel} / ${response.status.model}，我刚刚替你重新保存并验证了一次。`;
    showBanner(message, "success");
    window.alert(message);
    postNativeStatus("success", message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBanner(message, "error");
    window.alert(`切换失败：${message}`);
    postNativeStatus("error", `切换失败：${message}`);
  } finally {
    state.pending = false;
    render();
  }
});

loadInitialData().catch((error) => {
  showBanner(error.message, "error");
  elements.statusPanel.className = "status-panel";
  elements.statusPanel.textContent = "读取 Cola 本地配置失败。";
});

postNativeStatus("bridge-ready", "page-script-loaded");
