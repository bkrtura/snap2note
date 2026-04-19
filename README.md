# Snap2Note

> One tap → capture → AI recognizes → Markdown inserted. Image never saved.

A mobile-first Obsidian plugin powered by **Google Gemini Vision**. Tap the camera icon, snap a photo of any handwritten note, whiteboard, book page, or formula — and the recognized, formatted Markdown lands directly at your cursor. The original image is discarded immediately after recognition.

---

## Features

- **One-tap capture** from the ribbon or the editor header button (top-right of each note)
- **Native camera** on iOS and Android; file picker fallback on desktop
- **Gemini Vision AI** — fast, accurate, multilingual, generous free tier
- **Markdown output** — preserves headings, lists, tables; formulas in LaTeX
- **Ephemeral images** — photo is never written to your vault
- **Customizable prompt** — switch between OCR / translation / summarization
- **Model choice** — Gemini 2.5 Flash (default), 1.5 Flash, 2.5 Pro
- **Client-side compression** — resize to 1600 px before upload to save bandwidth
- **Configurable insert position** — at cursor, new line, or end of document
- **Timeout control** — abort slow requests on mobile networks
- **Debug log** — timing info, never logs API key or image data

---

## Installation

### Manual (all platforms)

1. Download the [latest release](../../releases/latest): `main.js`, `manifest.json`, `styles.css`
2. Create the folder `<your-vault>/.obsidian/plugins/snap2note/`
3. Copy the three files into that folder
4. Open Obsidian → **Settings → Community plugins → reload** → enable **Snap2Note**

### Build from source

```bash
git clone https://github.com/sasyouhei/snap2note.git
cd snap2note
npm install
npm run build   # outputs main.js
```

---

## Setup

1. Get a free API key at **[Google AI Studio](https://aistudio.google.com/apikey)**
2. Obsidian → **Settings → Snap2Note** → paste the key
3. Optionally adjust model, prompt, or compression

---

## Usage

| Method | Action |
|---|---|
| **Camera icon (ribbon)** | Tap in the left sidebar — best for mobile |
| **Camera icon (editor header)** | Tap in the top-right of any open note |
| **Command palette** | `Snap2Note: Capture and insert` |
| **Command palette** | `Snap2Note: Pick image from file and insert` |

**Flow**: open a note → position your cursor → tap the icon → take photo → text is inserted automatically.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Gemini API Key | — | Required. From Google AI Studio. |
| Model | `gemini-2.5-flash` | Also: `gemini-1.5-flash`, `gemini-2.5-pro` |
| System Prompt | OCR → Markdown | Fully customizable |
| Compress image | On | Max edge 1600 px, JPEG 0.8 |
| Insert position | Cursor | Cursor / new line / end of doc |
| Request timeout | 60 s | Abort after N seconds |
| Debug log | Off | Console output (never logs key or image) |

**Default system prompt:**
> You are a document recognition expert. Extract all text from the image and format it as Markdown. Use LaTeX for formulas. Output only the recognized content.

---

## Privacy

- Your image is sent **only** to Google's Gemini API (`generativelanguage.googleapis.com`) over HTTPS.
- The image is held in memory as base64, sent, then the reference is immediately released. It is **never written** to your Obsidian vault.
- Your API key is stored in the plugin's `data.json` (standard Obsidian local storage, not synced to Obsidian's servers).
- No analytics, no telemetry, no third-party services beyond Gemini.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Plugin not in list after install | Reload plugins (Settings → Community plugins → ⟳) or restart Obsidian |
| Camera icon missing on iPhone | Swipe from left edge, or tap `···` in the editor header |
| "Invalid API key" | Re-paste the key from Google AI Studio (starts with `AIza`) |
| "Request timed out" | Increase timeout in settings or check network |
| "Rate limit reached" | Free tier — wait ~1 min and retry |
| "Image too large" | Enable compression; or shoot at lower resolution |
| "No text recognized" | Check lighting/focus; adjust system prompt |
| Camera won't open on mobile | Check Obsidian has camera permission in iOS/Android system settings |

---

## Development

```bash
npm run dev    # watch mode — auto-rebuilds on save
npm run build  # production build → main.js
```

Stack: **TypeScript** + **esbuild** + **Obsidian API** + **Gemini REST API**

```
src/
├── main.ts       Plugin entry — ribbon, commands, editor header action, main flow
├── capture.ts    Hidden <input> to trigger native camera / file picker
├── gemini.ts     Gemini Vision REST client with timeout and error mapping
├── settings.ts   Settings tab UI (7 settings)
├── types.ts      Shared types and GeminiError class
└── utils.ts      Image compression, base64 encoding, debug helpers
```

---

## License

MIT — free to use, modify, and distribute.
