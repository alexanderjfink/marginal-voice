# Marginal Voice

A Zotero plugin that transcribes audio recordings and turns spoken quotes into PDF highlight annotations.

## What it does

Marginal Voice listens to audio attachments in your Zotero library, transcribes them locally with OpenAI Whisper (via `faster-whisper`), and looks for spoken quotes triggered by a keyword or phrase. When it finds text in the attached PDF that matches what you said, it creates a colored highlight annotation on the exact sentence and attaches your remaining spoken commentary as an annotation note.

You can define multiple trigger phrases, each with its own highlight color. For example:

- `quote` → yellow
- `Main Theory` → blue
- `Key Point` → red
- `Definition` → green

## Installation

1. Install the Python dependencies:
   ```bash
   pip install faster-whisper pymupdf
   ```

2. Download the latest `marginal-voice.xpi` from the [releases page](https://github.com/alexanderjfink/marginal-voice/releases).

3. In Zotero, go to **Tools → Plugins**.

4. Click the gear icon and choose **Install Plugin From File...**.

5. Select `marginal-voice.xpi`.

6. Restart Zotero when prompted.

## Usage

1. Attach an audio file (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`) to a Zotero item that also has a PDF attachment.

2. In the Zotero items pane, right-click the audio attachment.

3. Choose **Marginal Voice → Transcribe and Annotate** to process the selected audio, or **Transcribe and Annotate All Audio** to process every audio attachment on the parent item.

4. The plugin will:
   - Transcribe the audio locally, capturing word-level timestamps.
   - Detect each time you say a configured trigger phrase.
   - Try to match the next 4-6 words against the PDF text, with tolerance for hyphenation differences.
   - Expand the match to the full sentence in the PDF.
   - Create a highlight annotation on that sentence using the trigger's color.
   - Attach everything you said after the matched words as a note on the annotation.
   - End the current annotation if a long silence (longer than the configured timeout) is detected.

### Example

If you say:

> "Main Theory the EU has adopted a comprehensive regulatory framework and I'm thinking about how this will affect member states."

And the PDF contains the sentence:

> "The EU has adopted a comprehensive regulatory framework."

Marginal Voice will:
- Highlight that full sentence in **blue**.
- Attach a note reading: "and I'm thinking about how this will affect member states."

### Trigger phrase behavior

A trigger phrase is only treated as a keyword when the words immediately after it match text in the PDF. If you say a trigger phrase in passing and the following words don't match anything, it is ignored. This lets you talk naturally without every casual use of the word creating an annotation.

Multi-word triggers such as "Main Theory" or "Key Point" are supported.

## Configuration

Open **Zotero Preferences → Marginal Voice** to change:

- **Trigger Words &amp; Colors**: add, remove, or edit trigger phrases and assign each a highlight color. Defaults are `quote` (yellow), `Main Theory` (blue), `Key Point` (red), and `Definition` (green).
- **Silence Timeout**: maximum silence gap (in seconds) before a spoken annotation commentary is cut off. Requires Python transcription mode with word timestamps.
- **Whisper Model**: transcription model size (`tiny`, `base`, `small`, `medium`, `large`); larger is more accurate but slower.
- **Python Path**: path to the Python interpreter if Zotero doesn't use the right one.
- **Log Level**: how much detail to write to the Zotero debug log.

## Building from source

```bash
cd marginal-voice
./build.sh
```

The output is `marginal-voice-1.0.0.xpi` in the project root.

## Roadmap

### Live annotation

Eventually Marginal Voice will support **live annotation** while reading a PDF in Zotero. You will be able to start dictation, speak quotes and commentary, and see highlights appear in the PDF reader in real time without pre-recording an audio file.

## License

MIT
