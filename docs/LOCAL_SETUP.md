# Fully local setup

This guide covers running OGContinue entirely against local models via [Ollama](https://ollama.com), no API keys or cloud calls required.

## Recommended models by GPU VRAM

| VRAM   | Chat / Edit / Agent model             | Embeddings (RAG)     |
| ------ | ------------------------------------- | -------------------- |
| 6 GB   | `qwen2.5-coder:7b-instruct-q4_K_M`    | `nomic-embed-text`   |
| 8-12 GB| `qwen2.5-coder:14b-instruct-q4_K_M`   | `nomic-embed-text`   |
| 16+ GB | `qwen2.5-coder:32b-instruct-q4_K_M`   | `nomic-embed-text`   |

Qwen2.5-Coder was chosen over general-purpose models because it has strong function-calling support, which Agent mode depends on.

## Example `config.yaml`

Agent mode isn't a separate role — it's enabled automatically once a model with tool-calling support is assigned the `chat` role. Embeddings for RAG/codebase search are just another model entry with the `embed` role, not a separate top-level key.

4 local models config:
```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Qwen2.5 Coder 7B (local)
    provider: ollama
    model: qwen2.5-coder:7b-instruct-q4_K_M
    roles:
      - chat
      - edit
      - apply

  - name: Nomic Embed (local)
    provider: ollama
    model: nomic-embed-text
    roles:
      - embed
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

4 paid models config:
```yaml
name: Local Assistant
version: 1.0.0
schema: v1
models:
  - name: Claude Sonnet (Anthropic)
    provider: anthropic
    model: claude-sonnet-4-5
    apiKey: sk-ant-...
    roles:
      - chat
      - edit
      - apply

  - name: GPT-5 (OpenAI)
    provider: openai
    model: gpt-5
    apiKey: sk-...
    roles:
      - chat

  - name: Gemini (Google)
    provider: gemini
    model: gemini-2.5-pro
    apiKey: AIza...
    roles:
      - chat
context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: problems
  - provider: folder
  - provider: codebase
```

## Notes for 6 GB cards (e.g. RTX 3060 Mobile)

- Keep context window at 8k-16k; larger contexts spill into system RAM and slow generation significantly.
- Close other GPU-heavy applications before starting a long Agent session.
- Q4_K_M quantization is the right balance of quality/speed at this VRAM tier — avoid Q8 or fp16 variants of the 7B model here.
