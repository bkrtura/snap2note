export type GeminiModel =
	| "gemini-2.5-flash"
	| "gemini-1.5-flash"
	| "gemini-2.5-pro";

export type InsertPosition = "cursor" | "end" | "new-line";

export interface Snap2NoteSettings {
	geminiApiKey: string;
	model: GeminiModel;
	systemPrompt: string;
	compressImage: boolean;
	insertPosition: InsertPosition;
	timeoutSeconds: number;
	debugLog: boolean;
}

export const DEFAULT_SYSTEM_PROMPT =
	"You are a document recognition expert. Extract all text from the image and format it as Markdown. " +
	"Use LaTeX ($...$ for inline, $$...$$ for block) for mathematical formulas. " +
	"Preserve lists, tables, and headings. Output only the recognized content with no commentary.";

export const DEFAULT_SETTINGS: Snap2NoteSettings = {
	geminiApiKey: "",
	model: "gemini-2.5-flash",
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	compressImage: true,
	insertPosition: "cursor",
	timeoutSeconds: 60,
	debugLog: false,
};

export type GeminiErrorKind =
	| "auth"
	| "rate-limit"
	| "timeout"
	| "server"
	| "network"
	| "empty"
	| "too-large"
	| "unknown";

export class GeminiError extends Error {
	kind: GeminiErrorKind;
	status?: number;
	retryable: boolean;

	constructor(kind: GeminiErrorKind, message: string, status?: number) {
		super(message);
		this.name = "GeminiError";
		this.kind = kind;
		this.status = status;
		this.retryable =
			kind === "timeout" ||
			kind === "server" ||
			kind === "network" ||
			kind === "rate-limit";
	}
}
