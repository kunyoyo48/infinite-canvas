import { afterAll, afterEach, expect, test } from "bun:test";

// i18n reads browser storage during module initialization.
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});

const { listDirectAgentModels, runDirectAgentTurn } = await import("../src/services/api/direct-agent");

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});
afterAll(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
});

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

test("runs a canvas tool and returns the final assistant answer", async () => {
    let request = 0;
    globalThis.fetch = (async () => {
        request += 1;
        if (request === 1) {
            return jsonResponse({
                choices: [
                    {
                        message: {
                            content: "",
                            tool_calls: [
                                {
                                    id: "call-1",
                                    type: "function",
                                    function: {
                                        name: "canvas_apply_ops",
                                        arguments: JSON.stringify({ ops: [{ type: "add_node", id: "text-1", nodeType: "text", title: "Hello", position: { x: 0, y: 0 } }] }),
                                    },
                                },
                            ],
                        },
                    },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 5 },
            });
        }
        return jsonResponse({ choices: [{ message: { content: "已创建文本节点" } }], usage: { prompt_tokens: 20, completion_tokens: 7 } });
    }) as typeof fetch;
    const executed: Array<{ name: string; input: Record<string, unknown> }> = [];
    const result = await runDirectAgentTurn({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
        model: "gpt-5.5",
        history: [{ role: "user", content: "创建一个文本节点" }],
        snapshot: null,
        signal: new AbortController().signal,
        executeTool: async (call, input) => {
            executed.push({ name: call.name, input });
            return { ok: true };
        },
    });

    expect(executed).toEqual([
        { name: "canvas_apply_ops", input: { ops: [{ type: "add_node", id: "text-1", nodeType: "text", title: "Hello", position: { x: 0, y: 0 } }] } },
    ]);
    expect(result.content).toBe("已创建文本节点");
    expect(result.usage).toEqual({ input: 30, output: 12 });
    expect(result.history.find((message) => message.role === "tool")).toMatchObject({ role: "tool", tool_call_id: "call-1" });
});

test("maps 401 from the models endpoint to an authentication error", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "Invalid token" } }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch;

    await expect(listDirectAgentModels("sk-test", "https://api.example.com/v1")).rejects.toThrow("鉴权失败");
});

test("returns an empty list when the provider exposes no models", async () => {
    globalThis.fetch = (async () => jsonResponse({ success: true, data: [], object: "list" })) as typeof fetch;

    await expect(listDirectAgentModels("sk-test", "https://api.example.com/v1")).resolves.toEqual([]);
});

test("surfaces the provider message when a 200 response reports a failure", async () => {
    globalThis.fetch = (async () => jsonResponse({ success: false, message: "get user group failed" })) as typeof fetch;

    await expect(listDirectAgentModels("sk-test", "https://api.example.com/v1")).rejects.toThrow("get user group failed");
});

test("uses the configured base URL for model and chat requests", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return urls.length === 1 ? jsonResponse({ data: [{ id: "claude-sonnet-4-5" }] }) : jsonResponse({ choices: [{ message: { content: "ok" } }] });
    }) as typeof fetch;

    await expect(listDirectAgentModels("sk-test", "https://api.example.com")).resolves.toEqual(["claude-sonnet-4-5"]);
    await runDirectAgentTurn({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1beta/openai",
        model: "claude-sonnet-4-5",
        history: [{ role: "user", content: "你好" }],
        snapshot: null,
        signal: new AbortController().signal,
        executeTool: async () => ({ ok: true }),
    });
    expect(urls).toEqual(["https://api.example.com/v1/models", "https://api.example.com/v1beta/openai/chat/completions"]);
});

test("stops after the tool round limit", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
        requests += 1;
        return jsonResponse({ choices: [{ message: { content: "", tool_calls: [{ id: `call-${requests}`, type: "function", function: { name: "canvas_get_state", arguments: "{}" } }] } }] });
    }) as typeof fetch;

    await expect(
        runDirectAgentTurn({
            apiKey: "sk-test",
            baseUrl: "https://api.example.com/v1",
            model: "gpt-5.5",
            history: [{ role: "user", content: "读画布" }],
            snapshot: null,
            signal: new AbortController().signal,
            executeTool: async () => ({ ok: true }),
        }),
    ).rejects.toThrow("工具调用次数过多");
    expect(requests).toBe(8);
});

test("does not call the API after the signal is aborted", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
        requests += 1;
        return jsonResponse({ choices: [{ message: { content: "done" } }] });
    }) as typeof fetch;
    const controller = new AbortController();
    controller.abort();

    await expect(
        runDirectAgentTurn({
            apiKey: "sk-test",
            baseUrl: "https://api.example.com/v1",
            model: "gpt-5.5",
            history: [{ role: "user", content: "读画布" }],
            snapshot: null,
            signal: controller.signal,
            executeTool: async () => ({ ok: true }),
        }),
    ).rejects.toThrow();
    expect(requests).toBe(0);
});
