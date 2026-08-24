import { ConfigYaml } from "@continuedev/config-yaml";

export const defaultContextProvidersVsCode: NonNullable<
  ConfigYaml["context"]
>[number][] = [
  { provider: "code" },
  { provider: "docs" },
  { provider: "diff" },
  { provider: "terminal" },
  { provider: "problems" },
  { provider: "folder" },
  { provider: "codebase" },
];

export const defaultContextProvidersJetBrains: NonNullable<
  ConfigYaml["context"]
>[number][] = [
  { provider: "diff" },
  { provider: "folder" },
  { provider: "codebase" },
];

export const defaultModels: NonNullable<ConfigYaml["models"]> = [
  {
    name: "Qwen2.5 Coder 7B (local)",
    provider: "ollama",
    model: "qwen2.5-coder:7b-instruct-q4_K_M",
    defaultCompletionOptions: {
      temperature: 0.2,
    },
    roles: ["chat", "edit", "apply"],
  },
  {
    name: "Qwen2.5 Coder 1.5B Base (local)",
    provider: "ollama",
    model: "qwen2.5-coder:1.5b-base-q8_0",
    roles: ["autocomplete"],
  },
  {
    name: "Nomic Embed (local)",
    provider: "ollama",
    model: "nomic-embed-text",
    roles: ["embed"],
  },
];

export const defaultConfig: ConfigYaml = {
  name: "Local Assistant",
  version: "1.0.0",
  schema: "v1",
  models: defaultModels,
  context: defaultContextProvidersVsCode,
};

export const defaultConfigJetBrains: ConfigYaml = {
  name: "Local Assistant",
  version: "1.0.0",
  schema: "v1",
  models: [],
  context: defaultContextProvidersJetBrains,
};
