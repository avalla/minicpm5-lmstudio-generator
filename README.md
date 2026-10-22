# MiniCPM5 Tool Calling Generator for LM Studio

**Experimental prototype, not production ready.** Implements the Generator-plugin approach to interpreting MiniCPM5's in-band `<function>/<param>` tool output. Adapted from the design of `avalla/pi`, branch `feat/minicpm5-inband-tools`; this is a reduced independent reimplementation, **not a verbatim extraction**.

## Important limitations

- LM Studio plugins are beta / may require private beta access.
- This Generator appears as an **additional model** in the LM Studio model picker. Keep the underlying **native MLX MiniCPM5 model loaded** and the local REST server running.
- The full LM Studio GUI and SDK integration has **not been verified** end-to-end yet.
- The plugin currently supports model text output containing valid `<function name="..."><param name="...">...</param></function>` calls, not native streamed OpenAI tool_calls.
- Unknown tools or malformed XML fail closed.
- No secrets should be placed in repository files. Configure MCP separately in LM Studio.
- The streaming parser here is a prototype: not a general-purpose XML parser; no max generation length, concurrency hardening or complex nested XML validation.

## Installation / smoke test on your Mac

1. In LM Studio load native `MiniCPM5-2B-MLX` and start Local Server (`http://127.0.0.1:1234`).
2. In Terminal: `curl -s http://127.0.0.1:1234/v1/models | jq -r '.data[].id'`.
3. Install dependencies inside this directory: `bun install`.
4. Test parser: `bun test`, then `bun run typecheck`.
5. Start plugin: `lms dev` (requires plugin-capable LM Studio build; may be private beta).
6. Select the `minicpm5-tool-calling` **Generator** from LM Studio's model menu and set its model ID to the exact native MiniCPM5 model from step 2. Do **not** point it at itself.
7. Connect your MCP server to LM Studio separately, preferably via OAuth.
8. Ask a prompt that requires one of its tools, e.g. `Chi è l'utente autenticato? Usa auth_whoami e restituisci il risultato MCP.`
9. Verify the LM Studio UI shows a real tool call and its result, not `<function name="auth_whoami"></function>`.

## Troubleshooting

- LM Studio currently bundles development plugins as CommonJS. Do **not** add `"type": "module"` to `package.json`; Bun can still execute the tests and scripts.
- The history serializer uses `ChatMessage.getToolCallRequests()`, not `getToolCalls()`.
- If `lms dev` isn't available, check whether LM Studio Plugin SDK beta is enabled for your account/build.
- If the tool call remains XML, inspect whether LM Studio is using the plugin Generator model rather than the native model.
- If the connection loops or fails, ensure the Generator's `model` field is the **native model ID** returned by `/v1/models`, not the name of the plugin.
- If no MCP tools show up, fix your LM Studio MCP connection first. The plugin does not contain an MCP client.
- Do not copy raw OAuth access tokens from the browser for use in production.

## Source references

- https://github.com/avalla/pi/tree/feat/minicpm5-inband-tools
- https://lmstudio.ai/docs/typescript/plugins/generator
- https://lmstudio.ai/docs/typescript/plugins/generator/tool-calling-generators

### Known implementation details

The history serializer replays prior tool calls as MiniCPM5 `<function>` blocks and tool results as `<tool_response>` user messages. This needs to be checked against the selected MLX chat template. The parser was independently reimplemented for the plugin based on the design found in Pi, because this prototype is intentionally standalone. Its tests passing does **not** prove that LM Studio's extension API accepts every callback as written; validate with the installed SDK.

## License

MIT — see [LICENSE](LICENSE).
