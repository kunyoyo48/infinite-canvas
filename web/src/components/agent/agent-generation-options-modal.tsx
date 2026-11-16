import { useMemo, useState, type ReactNode } from "react";
import { InputNumber, Modal, Segmented, Select, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { imageAspectOptions, imageQualityOptions, imageScaleOptions } from "@/components/image-settings-panel";
import { videoResolutionOptions, videoSecondsRange, videoSizeOptions } from "@/components/video-settings-panel";
import { useAgentGenerationStore, type AgentGenerationOptions, type AgentGenerationRequest } from "@/stores/use-agent-generation-store";
import { modelOptionLabel, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";

/**
 * Confirmation dialog for Agent-triggered generations. The Agent only asks for a generation;
 * the user picks the channel/model, ratio, and other options here before anything is submitted.
 */
export function AgentGenerationOptionsModal() {
    const request = useAgentGenerationStore((state) => state.requests[0]);
    return request ? <AgentGenerationOptionsDialog key={request.id} request={request} /> : null;
}

function AgentGenerationOptionsDialog({ request }: { request: AgentGenerationRequest }) {
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const confirm = useAgentGenerationStore((state) => state.confirm);
    const cancel = useAgentGenerationStore((state) => state.cancel);
    const [options, setOptions] = useState(request.options);
    const image = request.kind === "image";
    const setOption = <K extends keyof AgentGenerationOptions>(key: K, value: AgentGenerationOptions[K]) => setOptions((previous) => ({ ...previous, [key]: value }));
    const models = useMemo(() => {
        const values = selectableModelsByCapability(config, request.kind);
        const all = options.model && !values.includes(options.model) ? [options.model, ...values] : values;
        return all.map((value) => ({ value, label: modelOptionLabel(config, value) }));
    }, [config, options.model, request.kind]);

    return (
        <Modal
            open
            centered
            width={460}
            title={t(image ? "agent.generation.imageTitle" : "agent.generation.videoTitle")}
            okText={t("agent.generation.confirm")}
            cancelText={t("common.cancel")}
            onOk={() => confirm(request.id, options)}
            onCancel={() => cancel(request.id)}
        >
            <div className="space-y-3 pt-1">
                <Typography.Text type="secondary" className="block text-xs">
                    {t(image ? "agent.generation.imageDescription" : "agent.generation.videoDescription")}
                </Typography.Text>
                {request.prompt ? (
                    <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} className="!mb-0 text-xs">
                        {request.prompt}
                    </Typography.Paragraph>
                ) : null}
                <OptionRow label={t("agent.generation.model")}>
                    <Select className="w-full" value={options.model} options={models} onChange={(value) => setOption("model", value)} />
                </OptionRow>
                <OptionRow label={t("agent.generation.ratio")}>
                    <Select className="w-full" value={options.ratio} options={image ? imageAspectOptions : videoSizeOptions} onChange={(value) => setOption("ratio", value)} />
                </OptionRow>
                <OptionRow label={t("agent.generation.resolution")}>
                    <Segmented block value={options.resolution} options={image ? imageScaleOptions : videoResolutionOptions} onChange={(value) => setOption("resolution", String(value))} />
                </OptionRow>
                {image ? (
                    <>
                        <OptionRow label={t("agent.generation.quality")}>
                            <Select className="w-full" value={options.quality} options={imageQualityOptions} onChange={(value) => setOption("quality", value)} />
                        </OptionRow>
                        <OptionRow label={t("agent.generation.count")}>
                            <InputNumber min={1} max={5000} precision={0} value={Number(options.count) || 1} onChange={(value) => setOption("count", String(value || 1))} />
                        </OptionRow>
                    </>
                ) : (
                    <>
                        <OptionRow label={t("agent.generation.seconds")}>
                            <InputNumber
                                min={videoSecondsRange.min}
                                max={videoSecondsRange.max}
                                precision={0}
                                addonAfter="s"
                                value={Number(options.seconds) || 6}
                                onChange={(value) => setOption("seconds", String(value || 6))}
                            />
                        </OptionRow>
                        <OptionRow label={t("agent.generation.mode")}>
                            <Segmented
                                block
                                value={options.mode}
                                options={[
                                    { value: "frames", label: t("settingsPanels.video.modes.frames") },
                                    { value: "reference", label: t("settingsPanels.video.modes.reference") },
                                ]}
                                onChange={(value) => setOption("mode", value === "reference" ? "reference" : "frames")}
                            />
                        </OptionRow>
                    </>
                )}
            </div>
        </Modal>
    );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3">
            <Typography.Text type="secondary" className="text-xs">
                {label}
            </Typography.Text>
            {children}
        </div>
    );
}
