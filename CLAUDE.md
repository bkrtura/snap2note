# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**snap2note** is a mobile-first Obsidian plugin ("Obsidian Quick AI Capture") that lets users tap a ribbon icon → trigger the native camera → send the photo to Google Gemini Vision API → insert the recognized/formatted Markdown text at the cursor. The original image is **never saved** (ephemeral/burn-after-reading approach).

## Build Commands

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build (outputs main.js)
npm run build
```

> The build tool is **esbuild** (`esbuild.config.mjs`). Output is a single `main.js` bundled from TypeScript sources in `src/`.

## Development Setup

1. Build the plugin: `npm run build`
2. Copy the plugin folder into your Obsidian vault at `.obsidian/plugins/obsidian-quick-ai-capture/`
3. Required files for Obsidian: `manifest.json`, `main.js`, and optionally `styles.css`
4. Enable the plugin in Obsidian → Settings → Community Plugins

## Source Architecture

```
src/
├── main.ts       # Plugin entry point — lifecycle hooks (onload/onunload), ribbon icon registration, wires modules together
├── capture.ts    # Camera/file input trigger — creates a hidden <input type="file" capture="environment"> element
├── gemini.ts     # Gemini Vision REST API client — builds multipart request with base64 inlineData, returns text
├── settings.ts   # PluginSettingTab UI — API key field, system prompt textarea, image compression toggle
└── utils.ts      # fileToBase64() and optional image compression before API call
```

## Key Technical Constraints

- **No native SDKs**: Use `requestUrl` (Obsidian's fetch wrapper, required on mobile) or native `fetch` — no `@google/generative-ai` SDK to keep bundle size small.
- **Image handling**: Convert file to base64 in `utils.ts`, pass as `inlineData` in the Gemini REST payload, then discard — never write to the vault.
- **Text insertion**: Use `editor.replaceSelection()` or `editor.replaceRange()` — never manipulate the file directly.
- **Mobile support**: `manifest.json` must include `"isDesktopOnly": false`. The `<input capture="environment">` approach is the only stable way to invoke the native camera inside Obsidian's mobile WebView.
- **Target model**: Gemini 2.5 Flash or 1.5 Flash (fast, generous free tier).

## Settings Schema

```typescript
interface SnapToNoteSettings {
  geminiApiKey: string;        // Required — from Google AI Studio
  systemPrompt: string;        // Default: recognize text → Markdown + LaTeX for formulas
  compressImage: boolean;      // Default: true — reduce upload size/time
}
```

## Gemini API Request Shape

POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={API_KEY}`

```json
{
  "contents": [{
    "parts": [
      { "text": "<systemPrompt>" },
      { "inlineData": { "mimeType": "image/jpeg", "data": "<base64>" } }
    ]
  }]
}
```
