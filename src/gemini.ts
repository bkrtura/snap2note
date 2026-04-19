import { requestUrl, RequestUrlParam } from "obsidian";
import { GeminiError, GeminiModel } from "./types";
import { approxBase64Bytes, MAX_BASE64_BYTES, redact } from "./utils";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface RecognizeOptions {
	apiKey: string;
	model: GeminiModel;
	systemPrompt: string;
	base64: string;
	mimeType: string;
	timeoutMs: number;
	debug?: boolean;
}

interface GeminiPart {
	text?: string;
}

interface GeminiCandidate {
	content?: { parts?: GeminiPart[] };
	finishReason?: string;
}

interface GeminiResponse {
	candidates?: GeminiCandidate[];
	promptFeedback?: { blockReason?: string };
	error?: { code?: number; message?: string; status?: string };
}

export async function recognize(opts: RecognizeOptions): Promise<string> {
	if (!opts.apiKey) {
		throw new GeminiError("auth", "Missing API key");
	}
	if (approxBase64Bytes(opts.base64) > MAX_BASE64_BYTES) {
		throw new GeminiError(
			"too-large",
			"Image exceeds 15 MB. Enable compression or use a smaller image."
		);
	}

	const url = `${API_BASE}/${opts.model}:generateContent?key=${encodeURIComponent(
		opts.apiKey
	)}`;

	const body = JSON.stringify({
		contents: [
			{
				parts: [
					{ text: opts.systemPrompt },
					{
						inlineData: {
							mimeType: opts.mimeType,
							data: opts.base64,
						},
					},
				],
			},
		],
	});

	const started = Date.now();
	if (opts.debug) {
		console.log(
			`[snap2note] POST ${opts.model} key=${redact(opts.apiKey)} bytes~${approxBase64Bytes(opts.base64)}`
		);
	}

	let response: { status: number; text: string };
	try {
		response = await withTimeout(
			sendRequest(url, body),
			opts.timeoutMs,
			() => new GeminiError("timeout", "Gemini request timed out")
		);
	} catch (e) {
		if (e instanceof GeminiError) throw e;
		throw new GeminiError(
			"network",
			e instanceof Error ? e.message : "Network error"
		);
	}

	if (opts.debug) {
		console.log(
			`[snap2note] response ${response.status} in ${Date.now() - started}ms`
		);
	}

	return parseResponse(response.status, response.text);
}

async function sendRequest(
	url: string,
	body: string
): Promise<{ status: number; text: string }> {
	const params: RequestUrlParam = {
		url,
		method: "POST",
		contentType: "application/json",
		body,
		throw: false,
	};
	const res = await requestUrl(params);
	return { status: res.status, text: res.text };
}

function withTimeout<T>(
	p: Promise<T>,
	ms: number,
	onTimeout: () => Error
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(onTimeout()), ms);
		p.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			}
		);
	});
}

function parseResponse(status: number, text: string): string {
	if (status === 401 || status === 403) {
		throw new GeminiError("auth", extractErrorMessage(text) ?? "Invalid API key", status);
	}
	if (status === 429) {
		throw new GeminiError(
			"rate-limit",
			extractErrorMessage(text) ?? "Rate limit reached",
			status
		);
	}
	if (status >= 500) {
		throw new GeminiError(
			"server",
			extractErrorMessage(text) ?? `Gemini server error (${status})`,
			status
		);
	}
	if (status < 200 || status >= 300) {
		throw new GeminiError(
			"unknown",
			extractErrorMessage(text) ?? `Unexpected HTTP ${status}`,
			status
		);
	}

	let parsed: GeminiResponse;
	try {
		parsed = JSON.parse(text) as GeminiResponse;
	} catch {
		throw new GeminiError("unknown", "Failed to parse Gemini response");
	}

	if (parsed.error) {
		const msg = parsed.error.message ?? "Gemini returned an error";
		const kind = parsed.error.code === 401 || parsed.error.code === 403 ? "auth" : "unknown";
		throw new GeminiError(kind, msg, parsed.error.code);
	}

	if (parsed.promptFeedback?.blockReason) {
		throw new GeminiError(
			"empty",
			`Blocked: ${parsed.promptFeedback.blockReason}`
		);
	}

	const recognized = parsed.candidates
		?.flatMap((c) => c.content?.parts ?? [])
		.map((p) => p.text ?? "")
		.join("")
		.trim();

	if (!recognized) {
		throw new GeminiError("empty", "No text recognized in the image");
	}

	return recognized;
}

function extractErrorMessage(text: string): string | null {
	if (!text) return null;
	try {
		const json = JSON.parse(text);
		return json?.error?.message ?? null;
	} catch {
		return null;
	}
}
