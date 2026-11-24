import { useEffect, useRef, useState } from "react";
import { App, Button, Spin } from "antd";
import { ImagePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";

/**
 * 图片上传框。
 * 图片按项目约定写入浏览器本地（localforage），存的是 storageKey（image:xxx）；
 * 接入对象存储后把 uploadImage 换成预签名直传即可，本组件与调用方都不用改。
 */
export function WorkflowImageField({ value, onChange, required, label, compact, aspect = "square" }: { value: string; onChange: (next: string) => void; required?: boolean; label?: string; compact?: boolean; aspect?: "square" | "wide" }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState("");

    // storageKey 需要异步换成可直接给 <img> 用的地址；外部直接给 URL 时不动。
    useEffect(() => {
        let alive = true;
        if (!value?.startsWith("image:")) {
            setPreview("");
            return;
        }
        void resolveImageUrl(value, "").then((url) => {
            if (alive) setPreview(url);
        });
        return () => {
            alive = false;
        };
    }, [value]);

    const display = value?.startsWith("image:") ? preview : value;

    const pick = async (file?: File) => {
        if (!file) return;
        setUploading(true);
        try {
            const image = await uploadImage(file);
            onChange(image.storageKey || image.url);
        } catch {
            message.error(t("workflow.uploadFailed"));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {label ? (
                <span className="text-xs" style={{ color: theme.node.muted }}>
                    {label}
                    {required ? <span className="ml-1 text-red-500">*</span> : null}
                </span>
            ) : null}
            <div
                className={cn("group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed transition-colors", aspect === "wide" ? "aspect-[16/9]" : "aspect-square", compact ? "w-24" : "w-full")}
                style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? (
                    <Spin size="small" />
                ) : display ? (
                    <>
                        <img src={display} alt="" className="size-full object-cover" />
                        <button
                            type="button"
                            className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(event) => {
                                event.stopPropagation();
                                onChange("");
                            }}
                            aria-label={t("workflow.removeImage")}
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-1 py-4" style={{ color: theme.node.faint }}>
                        <ImagePlus className="size-5" />
                        <span className="text-[11px]">{t("workflow.clickUpload")}</span>
                    </div>
                )}
            </div>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
            {!compact && value ? (
                <Button size="small" type="text" className="self-start px-0" onClick={() => onChange("")}>
                    {t("workflow.removeImage")}
                </Button>
            ) : null}
        </div>
    );
}

/** 只读展示：样图/成品图统一走这里，自动把 storageKey 换成可显示地址 */
export function WorkflowImagePreview({ value, className, alt = "" }: { value: string; className?: string; alt?: string }) {
    const [resolved, setResolved] = useState("");

    useEffect(() => {
        let alive = true;
        if (!value?.startsWith("image:")) {
            setResolved(value || "");
            return;
        }
        void resolveImageUrl(value, "").then((url) => {
            if (alive) setResolved(url);
        });
        return () => {
            alive = false;
        };
    }, [value]);

    if (!resolved) return null;
    return <img src={resolved} alt={alt} className={className} />;
}
