import i18n from "@/i18n";
import type { ReferenceImage } from "@/types/image";

export const IMAGE_UPLOAD_MAX_EDGE = 1024;
export const IMAGE_UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;
const IMAGE_UPLOAD_MIN_EDGE = 640;
const IMAGE_UPLOAD_REUSABLE_TYPES = /^image\/(png|jpe?g|webp)$/i;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(i18n.t("common.imageEncodeFailed")))), type, quality));
}

export async function compressImageBlob(source: Blob, maxBytes = IMAGE_UPLOAD_MAX_BYTES): Promise<Blob> {
    const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" }).catch(() => {
        throw new Error(i18n.t("common.imageFormatUnsupported", { type: source.type || "-" }));
    });
    try {
        if (IMAGE_UPLOAD_REUSABLE_TYPES.test(source.type) && source.size <= maxBytes && Math.max(bitmap.width, bitmap.height) <= IMAGE_UPLOAD_MAX_EDGE) return source;
        let edge = IMAGE_UPLOAD_MAX_EDGE;
        let preferPng = !/^image\/jpe?g$/i.test(source.type);
        for (;;) {
            const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
            const width = Math.max(1, Math.round(bitmap.width * scale));
            const height = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error(i18n.t("common.imageEncodeFailed"));
            context.imageSmoothingQuality = "high";
            context.drawImage(bitmap, 0, 0, width, height);

            let blob = preferPng ? await canvasToBlob(canvas, "image/png") : undefined;
            if (!blob || blob.size > maxBytes) {
                context.globalCompositeOperation = "destination-over";
                context.fillStyle = "#fff";
                context.fillRect(0, 0, width, height);
                preferPng = false;
                blob = await canvasToBlob(canvas, "image/jpeg", 0.8);
            }
            if (blob.size <= maxBytes || edge <= IMAGE_UPLOAD_MIN_EDGE) return blob;
            edge = Math.max(IMAGE_UPLOAD_MIN_EDGE, Math.round(edge / 2));
        }
    } finally {
        bitmap.close();
    }
}

export function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number) {
    const value = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes ? i18n.t("common.durationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") }) : i18n.t("common.durationSeconds", { seconds });
}

export function getDataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        return 0;
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(file);
    });
}

export function readImageMeta(dataUrl: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve) => {
        const image = new Image();
        const done = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024, mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" });
        image.onload = done;
        image.onerror = done;
        setTimeout(done, 3000);
        image.src = dataUrl;
    });
}

export function dataUrlToFile(image: ReferenceImage) {
    const [header, content] = image.dataUrl.split(",", 2);
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || image.type || "image/png";
    const binary = atob(content || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], image.name || "reference.png", { type: mimeType });
}
