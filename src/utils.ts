export const MAX_BASE64_BYTES = 15 * 1024 * 1024;

export async function fileToBase64(
	blob: Blob
): Promise<{ base64: string; mimeType: string }> {
	const mimeType = blob.type || "image/jpeg";
	const buf = await blob.arrayBuffer();
	const bytes = new Uint8Array(buf);

	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, Array.from(chunk));
	}
	const base64 = btoa(binary);
	return { base64, mimeType };
}

export async function compressImage(
	file: File,
	maxEdge = 1600,
	quality = 0.8
): Promise<Blob> {
	const bitmap = await loadBitmap(file);

	const { width, height } = fitIntoBox(bitmap.width, bitmap.height, maxEdge);
	if (width === bitmap.width && height === bitmap.height && isJpeg(file)) {
		bitmap.close?.();
		return file;
	}

	const blob = await drawToBlob(bitmap, width, height, quality);
	bitmap.close?.();
	return blob;
}

function isJpeg(file: File): boolean {
	return /jpe?g/i.test(file.type);
}

function fitIntoBox(
	w: number,
	h: number,
	maxEdge: number
): { width: number; height: number } {
	const longest = Math.max(w, h);
	if (longest <= maxEdge) return { width: w, height: h };
	const scale = maxEdge / longest;
	return {
		width: Math.round(w * scale),
		height: Math.round(h * scale),
	};
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
	if (typeof createImageBitmap === "function") {
		try {
			return await createImageBitmap(file);
		} catch {
			// fall through to HTMLImageElement path
		}
	}
	return await loadViaImageElement(file);
}

function loadViaImageElement(file: File): Promise<ImageBitmap> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = async () => {
			try {
				const bmp = await createImageBitmap(img);
				URL.revokeObjectURL(url);
				resolve(bmp);
			} catch (e) {
				URL.revokeObjectURL(url);
				reject(e instanceof Error ? e : new Error(String(e)));
			}
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Failed to load image"));
		};
		img.src = url;
	});
}

async function drawToBlob(
	bitmap: ImageBitmap,
	width: number,
	height: number,
	quality: number
): Promise<Blob> {
	if (typeof OffscreenCanvas !== "undefined") {
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
		ctx.drawImage(bitmap, 0, 0, width, height);
		return await canvas.convertToBlob({ type: "image/jpeg", quality });
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2d context unavailable");
	ctx.drawImage(bitmap, 0, 0, width, height);
	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
			"image/jpeg",
			quality
		);
	});
}

export function approxBase64Bytes(base64: string): number {
	const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
	return Math.floor((base64.length * 3) / 4) - pad;
}

export function redact(value: string, keep = 4): string {
	if (!value) return "";
	if (value.length <= keep) return "*".repeat(value.length);
	return value.slice(0, keep) + "*".repeat(Math.min(8, value.length - keep));
}
