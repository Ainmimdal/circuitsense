# Elera AI Agent

Elera AI is a provider-neutral tool-calling agent over the semantic physical circuit store. The language model decides which Elera tool to request; Elera validates the JSON arguments and executes the operation through the existing deterministic placement, Auto Wire, Auto Layout, routing, history, and validation layers.

The model never edits DOM nodes or project JSON directly.

## Supported providers

Tools are defined once in the OpenAI function-tool JSON schema. OpenAI uses the Responses API, Gemini uses the Interactions API, and every other provider uses Chat Completions:

| Provider | Runtime transport | Conversation state | Cache optimization |
| --- | --- | --- | --- |
| DeepSeek | Chat Completions | Bounded Elera transcript | Automatic matching-prefix cache |
| Google Gemini | Interactions API | `previous_interaction_id` | Native state plus implicit caching |
| OpenAI | Responses API | `previous_response_id` | Stable `prompt_cache_key` and implicit caching |
| OpenRouter | Chat Completions | Bounded Elera transcript | Stable `session_id` for sticky cache routing |
| Custom | User-supplied OpenAI-compatible endpoint | Bounded Elera transcript | Provider-dependent |

A provider key is valid only for its own endpoint. A custom provider must implement Chat Completions messages, function tools, assistant `tool_calls`, and tool-result messages. HTTPS is required except for localhost development endpoints.

## Runtime flow

1. `ai-assistant` loads provider configuration and the tab-scoped key.
2. `EleraAiAgent` supplies stable system instructions and JSON-schema tool definitions first. The changing project snapshot and latest user message are appended later so matching-prefix caches remain useful.
3. The provider returns an assistant message or one or more function calls.
4. The agent validates each tool name and argument object.
5. Read-only tools run immediately. Mutations follow the configured action mode.
6. Elera sends structured tool results back to the provider.
7. The loop stops at a final assistant response, cancellation, a repeated-call guard, or the user-configured tool-round limit. When the limit is reached, Elera makes one final request with tools disabled so the user receives a progress summary.

Provider-specific raw output steps are preserved in the active transport state's recovery buffer. The canonical transcript remains provider-neutral, while an expired native continuation can still be replayed with required reasoning or thought-signature items.

## Current-chat memory and token cost

Elera keeps one canonical in-memory transcript independently of the selected provider. The transcript remembers the current chat across turns and is the fallback source when the user changes provider or a provider-side continuation expires. Starting a new conversation clears this local transcript and all continuation IDs.

OpenAI and Gemini normally receive only incremental messages after their first request. Elera retains the raw provider output steps locally only as a recovery path for an expired continuation; it does not resend them during a healthy stateful session. DeepSeek, OpenRouter and custom endpoints receive Elera's bounded transcript because their configured transports are stateless.

Completed tool-call traces are removed from the fallback transcript after their final response because the next project snapshot is authoritative. Elera keeps at most eight recent user turns. Older user/assistant text is converted into a deterministic compact summary capped at 6,000 characters; this does not make another model request and therefore adds no summarization charge.

Provider usage objects are normalized into input, cached input, cache-write, output, reasoning and total tokens. The AI panel shows cumulative input, cached-input and output tokens for the current conversation. These counters are provider-reported; unavailable fields remain zero.

## Elera tools

- `list_available_components`: resolves up to 24 component searches in one batched call and exposes exact IDs and pins. The full catalog is deliberately omitted from the system prompt to avoid resending it on every provider request.
- `inspect_circuit`: returns current semantic instances, surfaces, wires, and validation.
- `place_components`: atomically creates valid physical component instances and attempts legal breadboard mounting.
- `delete_components`: removes named instances and attached wires atomically.
- `find_compatible_pins`: batches named capability requirements and returns authoritative candidates without allocating them.
- `inspect_pin_usage`: returns a compact controller pin budget with capabilities, current connections, and constraints.
- `connect_pins`: validates exact instance/pin references against endpoint intent and controller capabilities, rejecting the whole mutation on incompatibility.
- `auto_wire`: invokes the metadata-driven transactional Auto Wire engine.
- `arrange_components`: changes component and board positions only; it never invokes Auto Wire or changes semantic endpoints.
- `route_wires`: resets and routes existing connections without changing topology or placement.
- `validate_circuit`: invokes deterministic physical validation.
- `undo_last_change`: uses editor history.
- `clear_circuit`: retains surfaces and always requires confirmation.

Controller pin capabilities are derived from the same `autoWirePins` inventory used by the component library, Auto Wire, generated physical footprints, and connection validation. Direction and UART capabilities extend the existing `DIGITAL`, `ANALOG`, `PWM`, `I2C_*`, `VCC`, and `GND` vocabulary. Board-specific concerns such as input-only, boot-strap, and reserved serial pins are annotations on that inventory, not an AI-only pin database.

For normal AI construction, the model is instructed to:

1. Inspect the circuit and catalog as needed.
2. Place all required components.
3. Identify the circuit's complete signal requirements.
4. Batch those requirements through `find_compatible_pins`.
5. Choose exact controller pins itself and commit them with `connect_pins`.
6. Validate the semantic result.
7. Run `arrange_components`, then `route_wires`.
8. Validate the final physical result and report success only with zero errors; warnings remain reportable but non-blocking.

The governing rule is: **determine circuit topology first; optimize physical presentation afterward.** `auto_wire` remains available when the user explicitly asks for automatic wiring or the model intentionally chooses the deterministic helper.

These AI-facing stages are intentionally separate from the normal editor's user-facing **Auto Layout** button. That convenience command continues to compose Auto Wire, arrangement, and routing in one transaction.

## Action modes

- **Explain before acting** and **Ask before modifying circuit** show Apply/Reject controls for every mutation.
- **Suggest only** reports proposed mutations to the model without executing them.
- **Auto-apply safe fixes** executes ordinary mutations immediately. `clear_circuit` still requires confirmation.

## Key handling and deployment

Non-secret preferences are stored in `localStorage`. The API key is stored in `sessionStorage`, so it is removed when the browser tab session ends. The key is sent directly from the browser to the selected provider and is never included in model messages or tool results.

The BYOK tool-round budget is configurable from 5 to 50 and defaults to 20. Repeated identical catalog queries receive a compact cached response, while the hard ceiling still protects the browser from an unbounded agent loop.

This direct-browser BYOK design is suitable for a local FYP prototype. A production deployment should replace it with a server-side relay, authentication, rate limits, encrypted secret storage, provider allow-lists, audit logging, and per-user quotas.

## Extension points

- Add provider metadata in `src/ai/config.js` when the provider is OpenAI-compatible.
- Add a transport adapter in `src/ai/providers.js` for a provider with a different protocol.
- Register additional circuit capabilities in `src/ai/tools.js`; keep decisions in pure engine services and mutations transactional.
- Keep UI event rendering and approvals in `src/components/ai-assistant.js`.

Regression coverage is in `test/ai-agent.test.js`.
