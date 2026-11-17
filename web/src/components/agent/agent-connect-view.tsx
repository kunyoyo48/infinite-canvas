import { Fragment, useRef, useState } from "react";
import { App, Button, Input, Segmented, Tooltip } from "antd";
import copyToClipboard from "copy-to-clipboard";
import { Activity, Copy, KeyRound, Link2, PlugZap, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { DirectAgentApiError, isDirectAgentBaseUrl, listDirectAgentModels } from "@/services/api/direct-agent";
import type { AgentConnectionMode } from "@/stores/use-agent-store";

const AGENT_PLUGIN_REMOVE_COMMAND = "codex plugin remove infinite-canvas";
const AGENT_MCP_REMOVE_COMMAND = "codex mcp remove infinite-canvas";

export function AgentConnectView({
    theme,
    mode,
    url,
    token,
    directApiKey,
    directBaseUrl,
    directModel,
    enabled,
    connected,
    busy,
    activity,
    connectError,
    onModeChange,
    onUrlChange,
    onTokenChange,
    onDirectApiKeyChange,
    onDirectBaseUrlChange,
    onDirectModelChange,
    onToggleEnabled,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    mode: AgentConnectionMode;
    url: string;
    token: string;
    directApiKey: string;
    directBaseUrl: string;
    directModel: string;
    enabled: boolean;
    connected: boolean;
    busy: boolean;
    activity: string;
    connectError: string;
    onModeChange: (mode: AgentConnectionMode) => void;
    onUrlChange: (value: string) => void;
    onTokenChange: (value: string) => void;
    onDirectApiKeyChange: (value: string) => void;
    onDirectBaseUrlChange: (value: string) => void;
    onDirectModelChange: (value: string) => void;
    onToggleEnabled: () => void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [models, setModels] = useState<string[]>([]);
    const [modelsEmpty, setModelsEmpty] = useState(false);
    const [modelsRequest, setModelsRequest] = useState<"fetch" | "test" | null>(null);
    const [testResult, setTestResult] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
    const modelsRequestIdRef = useRef(0);
    const steps = [{ title: t("agent.connect.pluginTitle"), text: t("agent.connect.pluginText") }, { title: t("agent.connect.directTitle"), text: t("agent.connect.directText"), command: "npx -y @basketikun/canvas-agent@latest" }];
    const statusText = connectError ? t("agent.status.failed") : connected ? activity : enabled ? t("agent.status.connecting") : t("agent.status.disconnected");
    const statusColor = connectError ? "#dc2626" : connected ? "#16a34a" : enabled ? "#d97706" : theme.node.muted;
    const copyCommand = (command: string) => {
        copyToClipboard(command);
        message.success(t("agent.connect.commandCopied"));
    };
    const requestModels = async (kind: "fetch" | "test") => {
        const apiKey = directApiKey.trim();
        if (!apiKey) {
            message.warning(t("agent.direct.keyRequired"));
            return;
        }
        const baseUrl = directBaseUrl.trim();
        if (!isDirectAgentBaseUrl(baseUrl)) {
            message.warning(t("agent.direct.invalidBaseUrl"));
            return;
        }
        const requestId = ++modelsRequestIdRef.current;
        setModelsRequest(kind);
        setTestResult(null);
        try {
            const list = Array.from(new Set(await listDirectAgentModels(apiKey, baseUrl))).sort();
            if (requestId !== modelsRequestIdRef.current) return;
            setModels(list);
            setModelsEmpty(!list.length);
            if (kind === "test") setTestResult(list.length ? { tone: "ok", text: t("agent.connect.apiTestOk", { count: list.length }) } : { tone: "warn", text: t("agent.connect.apiTestEmpty") });
            else if (list.length) message.success(t("agent.connect.apiModelsFetched", { count: list.length }));
        } catch (error) {
            if (requestId !== modelsRequestIdRef.current) return;
            setModelsEmpty(false);
            const text = error instanceof Error ? error.message : t("agent.direct.connectFailed");
            const hint = error instanceof DirectAgentApiError && error.status >= 400 && ![401, 403].includes(error.status) ? ` — ${t("agent.connect.apiModelsHint")}` : "";
            if (kind === "test") setTestResult({ tone: "error", text: `${text}${hint}` });
            else message.error(`${text}${hint}`);
        } finally {
            if (requestId === modelsRequestIdRef.current) setModelsRequest(null);
        }
    };
    const resetModels = () => {
        modelsRequestIdRef.current += 1;
        setModelsRequest(null);
        setModels([]);
        setModelsEmpty(false);
        setTestResult(null);
    };
    const changeApiKey = (value: string) => {
        resetModels();
        onDirectApiKeyChange(value);
    };
    const changeBaseUrl = (value: string) => {
        resetModels();
        onDirectBaseUrlChange(value);
    };
    const codexPluginReminder = (
        <div className="rounded-lg border px-3 py-2.5 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            <div className="font-medium" style={{ color: theme.node.text }}>
                {t("agent.connect.pluginReminder")}
            </div>
            <div className="mt-1">{t("agent.connect.pluginReminderText")}</div>
            <div className="mt-2 grid gap-1.5">
                {[
                    [t("agent.connect.removePlugin"), AGENT_PLUGIN_REMOVE_COMMAND],
                    [t("agent.connect.removeMcp"), AGENT_MCP_REMOVE_COMMAND],
                ].map(([label, command]) => (
                    <div key={command} className="flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                        <span className="shrink-0 text-[11px]" style={{ color: theme.node.muted }}>
                            {label}
                        </span>
                        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">{command}</code>
                        <Tooltip title={t("agent.connect.copyCommand")}>
                            <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(command)} />
                        </Tooltip>
                    </div>
                ))}
            </div>
        </div>
    );
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <div>
                    <div className="text-base font-semibold leading-6">{t("agent.connect.title")}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {t("agent.connect.description")}
                    </div>
                </div>
                <Segmented
                    block
                    value={mode}
                    onChange={(value) => onModeChange(value as AgentConnectionMode)}
                    options={[
                        { label: t("agent.connect.modeLocal"), value: "local" },
                        { label: t("agent.connect.modeDirect"), value: "direct" },
                    ]}
                />
                {mode === "local" ? (
                    <>
                        <div className="space-y-2">
                            {steps.map((step, index) => {
                                const command = "command" in step ? step.command : "";
                                return (
                                    <Fragment key={step.title}>
                                        <div className="rounded-lg px-3 py-2.5">
                                            <div className="text-sm font-medium leading-5">{step.title}</div>
                                            <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                                {step.text}
                                            </div>
                                            {command ? (
                                                <div className="mt-2 flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                                                    <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px] leading-5">{command}</code>
                                                    <Tooltip title={t("agent.connect.copyCommand")}>
                                                        <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Copy className="size-3.5" />} onClick={() => copyCommand(command)} />
                                                    </Tooltip>
                                                </div>
                                            ) : null}
                                        </div>
                                        {index === 0 ? codexPluginReminder : null}
                                    </Fragment>
                                );
                            })}
                        </div>
                        <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 text-sm font-medium leading-5">{t("agent.connect.webConnection")}</span>
                                        <span
                                            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                                            style={{ borderColor: connected || enabled || connectError ? statusColor : theme.node.stroke, color: statusColor }}
                                        >
                                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                                            <span className="truncate">{statusText}</span>
                                        </span>
                                    </div>
                                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {t("agent.connect.autoDiscover")}
                                    </div>
                                </div>
                                <Button className="!h-8 !px-3" type={enabled ? "default" : "primary"} icon={<PlugZap className="size-4" />} onClick={onToggleEnabled}>
                                    {t(enabled ? "agent.connect.disconnect" : "agent.connect.connect")}
                                </Button>
                            </div>
                            <div className="mt-3 grid gap-2.5">
                                <label className="grid gap-1.5">
                                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                        <Link2 className="size-3.5" />
                                        {t("agent.connect.localAddress")}
                                        <span className="font-normal opacity-70">Local URL</span>
                                    </span>
                                    <Input size="large" prefix={<Link2 className="mr-1 size-4" style={{ color: theme.node.faint }} />} value={url} onChange={(event) => onUrlChange(event.target.value)} placeholder={t("agent.connect.urlPlaceholder")} />
                                </label>
                                <label className="grid gap-1.5">
                                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                        <KeyRound className="size-3.5" />
                                        {t("agent.connect.token")}
                                        <span className="font-normal opacity-70">Connect token</span>
                                    </span>
                                    <Input.Password
                                        size="large"
                                        prefix={<KeyRound className="mr-1 size-4" style={{ color: theme.node.faint }} />}
                                        value={token}
                                        onChange={(event) => onTokenChange(event.target.value)}
                                        placeholder={t("agent.connect.tokenPlaceholder")}
                                    />
                                </label>
                                {connectError ? (
                                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                                        {connectError}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="space-y-3">
                        <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 text-sm font-medium leading-5">{t("agent.connect.apiTitle")}</span>
                                        <span
                                            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                                            style={{ borderColor: connected || enabled || connectError ? statusColor : theme.node.stroke, color: statusColor }}
                                        >
                                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                                            <span className="truncate">{statusText}</span>
                                        </span>
                                    </div>
                                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                                        {t("agent.connect.apiText")}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button className="!h-8 !px-3" icon={<Activity className="size-4" />} loading={modelsRequest === "test"} disabled={!directApiKey.trim() || busy || modelsRequest !== null} onClick={() => void requestModels("test")}>
                                        {t(modelsRequest === "test" ? "agent.connect.apiTesting" : "agent.connect.apiTest")}
                                    </Button>
                                    <Button className="!h-8 !px-3" type={enabled ? "default" : "primary"} icon={<PlugZap className="size-4" />} onClick={onToggleEnabled}>
                                        {t(enabled ? "agent.connect.disconnect" : "agent.connect.apiConnect")}
                                    </Button>
                                </div>
                            </div>
                            <div className="mt-3 grid gap-2.5">
                                <label className="grid gap-1.5">
                                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                        <Link2 className="size-3.5" />
                                        {t("agent.connect.provider")}
                                        <span className="font-normal opacity-70">Base URL</span>
                                    </span>
                                    <Input
                                        size="large"
                                        value={directBaseUrl}
                                        onChange={(event) => changeBaseUrl(event.target.value)}
                                        placeholder={t("agent.connect.apiBaseUrlPlaceholder")}
                                        prefix={<Link2 className="mr-1 size-4" style={{ color: theme.node.faint }} />}
                                    />
                                </label>
                                <label className="grid gap-1.5">
                                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>
                                        <KeyRound className="size-3.5" />
                                        API Key
                                    </span>
                                    <Input.Password
                                        size="large"
                                        autoComplete="new-password"
                                        prefix={<KeyRound className="mr-1 size-4" style={{ color: theme.node.faint }} />}
                                        value={directApiKey}
                                        onChange={(event) => changeApiKey(event.target.value)}
                                        placeholder={t("agent.connect.apiKeyPlaceholder")}
                                    />
                                </label>
                                <div className="grid gap-1.5">
                                    <span className="text-xs font-medium" style={{ color: theme.node.muted }}>
                                        {t("agent.connect.apiModel")}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            className="min-w-0 flex-1"
                                            size="large"
                                            aria-label={t("agent.connect.apiModel")}
                                            value={directModel}
                                            onChange={(event) => onDirectModelChange(event.target.value)}
                                            placeholder={t("agent.connect.apiModelPlaceholder")}
                                        />
                                        <Button className="shrink-0" size="large" icon={<RefreshCw className="size-4" />} loading={modelsRequest === "fetch"} disabled={!directApiKey.trim() || modelsRequest !== null} onClick={() => void requestModels("fetch")}>
                                            {t(modelsRequest === "fetch" ? "agent.connect.apiFetchingModels" : "agent.connect.apiFetchModels")}
                                        </Button>
                                    </div>
                                    {models.length ? (
                                        <div className="thin-scrollbar max-h-40 overflow-y-auto rounded-md border" style={{ borderColor: theme.node.stroke }}>
                                            {models.map((model) => (
                                                <button
                                                    key={model}
                                                    type="button"
                                                    className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
                                                    style={{ color: model === directModel ? theme.node.text : theme.node.muted, fontWeight: model === directModel ? 600 : undefined }}
                                                    title={model}
                                                    onClick={() => onDirectModelChange(model)}
                                                >
                                                    {model}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    {modelsEmpty ? (
                                        <div className="text-[11px] leading-4" style={{ color: theme.node.muted }}>
                                            {t("agent.connect.apiModelsEmptyHint")}
                                        </div>
                                    ) : null}
                                </div>
                                {testResult ? (
                                    <div
                                        className="rounded-md border px-2.5 py-2 text-xs leading-5"
                                        style={{
                                            borderColor: testResult.tone === "ok" ? "rgba(22,163,74,.35)" : testResult.tone === "warn" ? "rgba(217,119,6,.35)" : "rgba(220,38,38,.35)",
                                            color: testResult.tone === "ok" ? "#16a34a" : testResult.tone === "warn" ? "#d97706" : "#dc2626",
                                        }}
                                    >
                                        {testResult.text}
                                    </div>
                                ) : null}
                                {connectError ? (
                                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                                        {connectError}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div className="px-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {t("agent.connect.apiSecurity")}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
