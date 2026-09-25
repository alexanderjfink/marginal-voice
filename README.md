# Marginal Voice

A Zotero plugin that transcribes audio recordings and turns spoken quotes into PDF highlight annotations.

## What it does

Marginal Voice listens to audio attachments in your Zotero library, transcribes them locally with OpenAI Whisper (via `faster-whisper`), and looks for spoken quotes triggered by a keyword. When it finds text in the attached PDF that matches what you said, it creates a yellow highlight annotation on the exact sentence and attaches your remaining spoken commentary as an annotation note.

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
   - Transcribe the audio locally.
   - Detect each time you say the trigger word (default: `quote`).
   - Try to match the next 4-6 words against the PDF text, with tolerance for hyphenation differences.
   - Expand the match to the full sentence in the PDF.
   - Create a highlight annotation on that sentence.
   - Attach everything you said after the matched words as a note on the annotation.

### Example

If you say:

> "Quote the EU has adopted a comprehensive regulatory framework and I'm thinking about how this will affect member states."

And the PDF contains the sentence:

> "The EU has adopted a comprehensive regulatory framework."

Marginal Voice will:
- Highlight that full sentence in the PDF.
- Attach a note reading: "and I'm thinking about how this will affect member states."

### Trigger word behavior

The trigger word is only treated as a keyword when the words immediately after it match text in the PDF. If you say the trigger word in passing and the following words don't match anything, it is ignored. This lets you talk naturally about quotes without every casual use of the word creating an annotation.

## Configuration

Open **Zotero Preferences → Marginal Voice** to change:

- **Trigger Word**: the spoken keyword that starts a quote (default: `quote`).
- **Whisper Model**: transcription model size (`tiny`, `base`, `small`, `medium`, `large`); larger is more accurate but slower.
- **Highlight Color**: hex color for created annotations (default: `#ffd400`, Zotero yellow).
- **Python Path**: path to the Python interpreter if Zotero doesn't use the right one.
- **Log Level**: how much detail to write to the Zotero debug log.

## Building from source

```bash
cd marginal-voice
./build.sh
```

The output is `marginal-voice-1.0.0.xpi` in the project root.

## Roadmap

### Custom labels and colors

Currently every annotation uses a single trigger word and a single highlight color. The next step is to support **multiple labeled triggers**, each with its own color. For example:

- Saying `"claim ..."` creates a green highlight.
- Saying `"evidence ..."` creates a blue highlight.
- Saying `"question ..."` creates a red highlight.

This will let you categorize annotations by voice while you read, rather than manually changing colors afterward.

### Live annotation

Eventually Marginal Voice will support **live annotation** while reading a PDF in Zotero. You will be able to start dictation, speak quotes and commentary, and see highlights appear in the PDF reader in real time without pre-recording an audio file.

## License

MIT
