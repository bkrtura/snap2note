import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
} from "obsidian";
import { pickImage } from "./capture";
import { recognize } from "./gemini";
import { Snap2NoteSettingTab } from "./settings";
import {
	DEFAULT_SETTINGS,
	GeminiError,
	InsertPosition,
	Snap2NoteSettings,
} from "./types";
import { compressImage, fileToBase64 } from "./utils";

export default class Snap2NotePlugin extends Plugin {
	settings!: Snap2NoteSettings;

	// Track which MarkdownViews already have the header action button.
	private decoratedViews = new WeakSet<MarkdownView>();

	async onload() {
		await this.loadSettings();

		// Ribbon icon — primary entry point on mobile.
		this.addRibbonIcon("camera", "Snap2Note: capture and insert", () => {
			void this.runCapture({ preferCamera: true });
		});

		// Editor header button — shown in the top-right of each note pane.
		this.setupEditorActions();

		this.addCommand({
			id: "capture-and-insert",
			name: "Capture and insert",
			callback: () => {
				void this.runCapture({ preferCamera: true });
			},
		});

		this.addCommand({
			id: "pick-image-and-insert",
			name: "Pick image from file and insert",
			callback: () => {
				void this.runCapture({ preferCamera: false });
			},
		});

		this.addSettingTab(new Snap2NoteSettingTab(this.app, this));
	}

	onunload() {
		// Listener cleanup is handled by registerEvent; WeakSet GCs with the views.
	}

	private setupEditorActions() {
		// Decorate all currently open MarkdownViews.
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				this.addViewAction(leaf.view);
			}
		});

		// Decorate future views as they appear.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.app.workspace.iterateAllLeaves((leaf) => {
					if (leaf.view instanceof MarkdownView) {
						this.addViewAction(leaf.view);
					}
				});
			})
		);
	}

	private addViewAction(view: MarkdownView) {
		if (this.decoratedViews.has(view)) return;
		this.decoratedViews.add(view);
		view.addAction("camera", "Snap2Note: capture and insert", () => {
			void this.runCapture({ preferCamera: true });
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async runCapture(opts: { preferCamera: boolean }) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const editor = view?.editor;
		if (!editor) {
			new Notice("Snap2Note: open a Markdown note first.");
			return;
		}

		if (!this.settings.geminiApiKey) {
			new Notice("Snap2Note: set your Gemini API key in settings.");
			return;
		}

		let file: File | null;
		try {
			file = await pickImage({ preferCamera: opts.preferCamera });
		} catch (e) {
			this.logDebug("pickImage failed", e);
			new Notice("Snap2Note: could not open camera/picker.");
			return;
		}
		if (!file) return;

		const loading = new Notice("Snap2Note: recognizing…", 0);

		let base64 = "";
		try {
			const blob = this.settings.compressImage
				? await compressImage(file)
				: file;
			const encoded = await fileToBase64(blob);
			base64 = encoded.base64;

			const text = await recognize({
				apiKey: this.settings.geminiApiKey,
				model: this.settings.model,
				systemPrompt: this.settings.systemPrompt,
				base64,
				mimeType: encoded.mimeType,
				timeoutMs: this.settings.timeoutSeconds * 1000,
				debug: this.settings.debugLog,
			});

			this.insertText(editor, text);
			loading.hide();
			new Notice("Snap2Note: inserted ✓", 2000);
		} catch (e) {
			loading.hide();
			this.handleError(e);
		} finally {
			base64 = "";
		}
	}

	private insertText(editor: Editor, text: string) {
		const mode: InsertPosition = this.settings.insertPosition;
		if (mode === "end") {
			const last = editor.lastLine();
			const lastCh = editor.getLine(last).length;
			const prefix = lastCh === 0 ? "" : "\n\n";
			editor.replaceRange(prefix + text, { line: last, ch: lastCh });
			return;
		}
		if (mode === "new-line") {
			const cursor = editor.getCursor();
			const atLineStart = cursor.ch === 0;
			editor.replaceRange(atLineStart ? text : "\n" + text, cursor);
			return;
		}

		// cursor: replace selection if present, else insert at cursor
		if (editor.somethingSelected()) {
			editor.replaceSelection(text);
		} else {
			editor.replaceRange(text, editor.getCursor());
		}
	}

	private handleError(err: unknown) {
		if (err instanceof GeminiError) {
			switch (err.kind) {
				case "auth":
					new Notice("Snap2Note: invalid API key. Check settings.", 6000);
					return;
				case "rate-limit":
					new Notice("Snap2Note: rate limit reached. Wait a moment.", 6000);
					return;
				case "timeout":
					new Notice("Snap2Note: request timed out. Check network.", 6000);
					return;
				case "server":
					new Notice("Snap2Note: Gemini server error. Try again.", 6000);
					return;
				case "network":
					new Notice("Snap2Note: network error.", 6000);
					return;
				case "too-large":
					new Notice("Snap2Note: image too large. Enable compression.", 6000);
					return;
				case "empty":
					new Notice("Snap2Note: no text recognized.", 5000);
					return;
				default:
					new Notice(`Snap2Note: ${err.message}`, 6000);
					return;
			}
		}
		this.logDebug("Unexpected error", err);
		new Notice("Snap2Note: unexpected error. Enable debug log for details.");
	}

	private logDebug(label: string, payload?: unknown) {
		if (!this.settings?.debugLog) return;
		if (payload === undefined) {
			console.log(`[snap2note] ${label}`);
		} else {
			console.log(`[snap2note] ${label}`, payload);
		}
	}
}
