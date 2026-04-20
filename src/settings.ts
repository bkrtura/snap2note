import { App, PluginSettingTab, Setting } from "obsidian";
import type Snap2NotePlugin from "./main";
import { DEFAULT_SYSTEM_PROMPT, GeminiModel, InsertPosition } from "./types";

const MODEL_OPTIONS: Record<GeminiModel, string> = {
	"gemini-2.5-flash": "Gemini 2.5 Flash (fast, recommended)",
	"gemini-1.5-flash": "Gemini 1.5 Flash (legacy)",
	"gemini-2.5-pro": "Gemini 2.5 Pro (higher quality, slower)",
};

const POSITION_OPTIONS: Record<InsertPosition, string> = {
	cursor: "At cursor (replace selection if any)",
	"new-line": "At cursor on a new line",
	end: "End of document",
};

export class Snap2NoteSettingTab extends PluginSettingTab {
	plugin: Snap2NotePlugin;

	constructor(app: App, plugin: Snap2NotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Gemini API key")
			.setDesc("Get a free key at aistudio.google.com — stored locally in data.json")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text.inputEl.spellcheck = false;
				text
					.setPlaceholder("Paste key here")
					.setValue(this.plugin.settings.geminiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.geminiApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Model to use for image recognition")
			.addDropdown((dd) => {
				for (const [value, label] of Object.entries(MODEL_OPTIONS)) {
					dd.addOption(value, label);
				}
				dd.setValue(this.plugin.settings.model).onChange(async (value) => {
					this.plugin.settings.model = value as GeminiModel;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc("Instructs the model how to format the output. Change to translate, summarize, etc.")
			.addTextArea((ta) => {
				ta.inputEl.rows = 6;
				ta.inputEl.addClass("snap2note-prompt-textarea");
				ta
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((b) =>
				b
					.setIcon("rotate-ccw")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Compress image")
			.setDesc("Resize longest edge to 1600 px and re-encode as JPEG 0.8 before upload.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.compressImage)
					.onChange(async (value) => {
						this.plugin.settings.compressImage = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Insert position")
			.setDesc("Where to place recognized text in the active note.")
			.addDropdown((dd) => {
				for (const [value, label] of Object.entries(POSITION_OPTIONS)) {
					dd.addOption(value, label);
				}
				dd
					.setValue(this.plugin.settings.insertPosition)
					.onChange(async (value) => {
						this.plugin.settings.insertPosition = value as InsertPosition;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Request timeout (seconds)")
			.setDesc("Cancel the request after this many seconds")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "5";
				t.inputEl.max = "300";
				t
					.setValue(String(this.plugin.settings.timeoutSeconds))
					.onChange(async (value) => {
						const n = Number(value);
						if (Number.isFinite(n) && n >= 5 && n <= 300) {
							this.plugin.settings.timeoutSeconds = Math.round(n);
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Debug log")
			.setDesc("Log timing and errors to the developer console — key and image data are never logged")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.debugLog).onChange(async (value) => {
					this.plugin.settings.debugLog = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
