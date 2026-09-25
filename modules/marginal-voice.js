/**
 * Marginal Voice for Zotero
 * Transcribes audio files and creates PDF highlight annotations from spoken quotes.
 */

const MarginalVoice = {
  id: "marginal-voice@alexanderjfink.github.io",
  rootURI: null,
  menuItems: [],

  formatLogArg(a) {
    if (a && (a.message || a.stack)) {
      const parts = [];
      if (a.message) parts.push(a.message);
      if (a.stack) parts.push(a.stack);
      return parts.length > 0 ? parts.join("\n") : String(a);
    }
    if (typeof a === "string") return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  },

  log(level, ...args) {
    const logLevel = Zotero.Prefs.get("extensions.marginalvoice.logLevel") || "info";
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] >= levels[logLevel]) {
      Zotero.debug(`[MarginalVoice] ${level.toUpperCase()}: ${args.map(a => this.formatLogArg(a)).join(" ")}`);
    }
  },

  async init({ id, version, rootURI }) {
    this.rootURI = rootURI;
    this.log("info", "Initializing Marginal Voice plugin");

    // Extract bundled helper script to a temp file so Python can execute it
    await this.extractHelperScript();

    // Register preference pane
    if (Zotero.PreferencePanes) {
      try {
        Zotero.PreferencePanes.register({
          pluginID: this.id,
          label: "Marginal Voice",
          src: this.rootURI + "chrome/content/preferences.xhtml",
          scripts: [this.rootURI + "chrome/content/preferences.js"],
          image: this.rootURI + "skin/icon-48.png"
        });
        this.log("info", "Preference pane registered");
      } catch (e) {
        this.log("error", "Failed to register preference pane:", e);
      }
    } else {
      this.log("warn", "Zotero.PreferencePanes not available");
    }
  },

  async extractHelperScript() {
    try {
      const helperURI = this.rootURI + "scripts/zaa-helper.py";
      this.log("debug", "Extracting helper script from", helperURI);
      const content = await this.readURI(helperURI);

      const tmpDir = Zotero.getTempDirectory();
      const tmpFile = tmpDir.clone();
      tmpFile.append("zaa-helper.py");
      if (tmpFile.exists()) {
        tmpFile.remove(false);
      }
      await Zotero.File.putContentsAsync(tmpFile, content);
      this.helperScriptTempPath = tmpFile.path;
      this.log("info", "Helper script extracted to", this.helperScriptTempPath);
    } catch (e) {
      this.log("error", "Failed to extract helper script:", e);
      throw e;
    }
  },

  async readURI(uri) {
    // Try modern Fetch API first
    if (typeof fetch !== "undefined") {
      try {
        const response = await fetch(uri);
        if (response.ok) return await response.text();
      } catch (e) {
        this.log("debug", "fetch failed, falling back to NetUtil:", e.message);
      }
    }

    // Fallback to NetUtil for resource:// / jar:// URIs
    const { NetUtil } = ChromeUtils.import("resource://gre/modules/NetUtil.jsm");
    return new Promise((resolve, reject) => {
      NetUtil.asyncFetch(
        {
          uri: Services.io.newURI(uri),
          loadUsingSystemPrincipal: true
        },
        (inputStream, status) => {
          if (Components.isSuccessCode(status)) {
            const data = NetUtil.readInputStreamToString(inputStream, inputStream.available());
            resolve(data);
          } else {
            reject(new Error(`Failed to read URI ${uri}: ${status}`));
          }
        }
      );
    });
  },

  shutdown() {
    this.log("info", "Shutting down Marginal Voice plugin");
    this.unregisterMenus();
  },

  onMainWindowLoad({ window }) {
    this.registerMenus(window);
  },

  onMainWindowUnload({ window }) {
    // Cleanup handled by Zotero.MenuManager or manual removal
  },

  registerMenus(window) {
    const doc = window.document;
    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (!itemMenu) return;

    // Separator
    const sep = doc.createXULElement("menuseparator");
    sep.id = "marginalvoice-separator";
    itemMenu.appendChild(sep);
    this.menuItems.push(sep);

    // Submenu
    const menu = doc.createXULElement("menu");
    menu.id = "marginalvoice-menu";
    menu.setAttribute("label", "Marginal Voice");
    this.menuItems.push(menu);

    const popup = doc.createXULElement("menupopup");
    popup.id = "marginalvoice-popup";
    menu.appendChild(popup);

    // Transcribe and Annotate
    const item1 = doc.createXULElement("menuitem");
    item1.id = "marginalvoice-transcribe-one";
    item1.setAttribute("label", "Transcribe and Annotate");
    item1.addEventListener("command", () => this.handleTranscribeCommand(window, false));
    popup.appendChild(item1);

    // Transcribe and Annotate All Audio
    const item2 = doc.createXULElement("menuitem");
    item2.id = "marginalvoice-transcribe-all";
    item2.setAttribute("label", "Transcribe and Annotate All Audio");
    item2.addEventListener("command", () => this.handleTranscribeCommand(window, true));
    popup.appendChild(item2);

    itemMenu.appendChild(menu);

    // Show/hide menu based on selection
    itemMenu.addEventListener("popupshowing", () => {
      const items = window.ZoteroPane.getSelectedItems();
      const hasAudio = items.some(item => this.isAudioAttachment(item));
      menu.hidden = !hasAudio;
      sep.hidden = !hasAudio;
    });
  },

  unregisterMenus() {
    // Remove menu elements from all windows by ID
    const ids = ["marginalvoice-separator", "marginalvoice-menu"];
    for (const win of Zotero.getMainWindows()) {
      const doc = win.document;
      for (const id of ids) {
        const elem = doc.getElementById(id);
        if (elem && elem.parentNode) {
          elem.parentNode.removeChild(elem);
        }
      }
    }
    this.menuItems = [];
  },

  isAudioAttachment(item) {
    if (!item || !item.isAttachment()) return false;
    const contentType = item.attachmentContentType || "";
    const filename = item.attachmentFilename || "";
    const audioTypes = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac"];
    const audioExts = [".mp3", ".m4a", ".wav", ".ogg", ".flac"];
    return audioTypes.includes(contentType) || audioExts.some(ext => filename.toLowerCase().endsWith(ext));
  },

  getParentPDFAttachments(audioItem) {
    const parentID = audioItem.parentID;
    if (!parentID) return [];
    const parent = Zotero.Items.get(parentID);
    if (!parent) return [];
    const attachments = parent.getAttachments();
    return Zotero.Items.get(attachments).filter(att => att.isPDFAttachment());
  },

  async handleTranscribeCommand(window, processAll) {
    const items = window.ZoteroPane.getSelectedItems();
    const audioItems = items.filter(item => this.isAudioAttachment(item));
    if (audioItems.length === 0) {
      window.alert("No audio file selected.");
      return;
    }

    const toProcess = processAll ? audioItems : [audioItems[0]];
    const progress = new Zotero.ProgressWindow({ window });
    progress.changeHeadline("Marginal Voice");
    progress.show();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const audioItem of toProcess) {
      processed++;
      const itemProgress = new progress.ItemProgress("audio", `Processing ${audioItem.getField("title") || "audio file"}...`);
      try {
        await this.transcribeAndAnnotate(audioItem);
        itemProgress.setProgress(100);
        itemProgress.setText("Done");
        succeeded++;
      } catch (err) {
        this.log("error", "Failed to process audio:", err);
        itemProgress.setError();
        const msg = err && (err.message || err.stack || String(err)) || "Unknown error";
        itemProgress.setText(`Error: ${msg}`);
        failed++;
      }
    }

    progress.startCloseTimer(5000);
  },

  async transcribeAndAnnotate(audioItem) {
    // Get audio file path
    const audioPath = await audioItem.getFilePathAsync();
    if (!audioPath) throw new Error("Cannot access audio file path.");

    // Get parent PDF attachments
    const pdfAttachments = this.getParentPDFAttachments(audioItem);
    if (pdfAttachments.length === 0) {
      throw new Error("No PDF attachment found on parent item.");
    }
    const pdfItem = pdfAttachments[0];
    const pdfPath = await pdfItem.getFilePathAsync();

    // Transcribe audio
    this.log("info", "Transcribing:", audioPath);
    const transcript = await this.transcribeAudio(audioPath);
    this.log("info", "Transcript:", transcript);

    // Find quote segments, only treating "quote" as a keyword when the
    // words immediately following it actually match text in the PDF.
    const triggerWord = (Zotero.Prefs.get("extensions.marginalvoice.triggerWord") || "quote").toLowerCase().trim();
    const segments = await this.findQuoteSegments(transcript, triggerWord, pdfPath);
    this.log("info", `Found ${segments.length} valid quote segments`);

    // Process each segment
    const skipDuplicates = Zotero.Prefs.get("extensions.marginalvoice.skipDuplicates") !== false;
    const color = Zotero.Prefs.get("extensions.marginalvoice.annotationColor") || "#ffd400";

    let createdCount = 0;
    let skippedCount = 0;
    const warnings = [];

    for (const segment of segments) {
      try {
        // Match quote in PDF and get exact position
        const match = await this.matchQuoteInPDF(pdfPath, segment.quoteCandidate);
        if (!match) {
          warnings.push(`Could not match quote: "${segment.quoteCandidate.substring(0, 50)}..."`);
          this.log("warn", "No match for quote:", segment.quoteCandidate);
          continue;
        }

        const commentary = match.commentary || segment.commentary || "";

        // Check for duplicates
        if (skipDuplicates && await this.isDuplicate(pdfItem, match.sentence, match)) {
          skippedCount++;
          this.log("info", "Skipping duplicate annotation:", match.sentence);
          continue;
        }

        // Create annotation
        await this.createHighlightAnnotation(pdfItem, match.sentence, commentary, match, color);
        createdCount++;
      } catch (err) {
        this.log("error", "Error processing segment:", err);
        warnings.push(`Error: ${err.message}`);
      }
    }

    this.log("info", `Created ${createdCount} annotations, skipped ${skippedCount} duplicates`);
    if (warnings.length > 0) {
      this.log("warn", "Warnings:", warnings);
    }

    return { created: createdCount, skipped: skippedCount, warnings };
  },

  async transcribeAudio(audioPath) {
    const mode = Zotero.Prefs.get("extensions.marginalvoice.transcriptionMode") || "python";

    if (mode === "custom") {
      return this.transcribeWithCustomCommand(audioPath);
    }
    return this.transcribeWithPython(audioPath);
  },

  async transcribeWithPython(audioPath) {
    const pythonPath = this.getPythonPath();
    const helperPath = this.getHelperScriptPath();
    const model = Zotero.Prefs.get("extensions.marginalvoice.whisperModel") || "base";

    const tmpFile = Zotero.getTempDirectory();
    tmpFile.append("marginalvoice_transcript.json");
    tmpFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o666);

    const args = [helperPath, "transcribe", "--audio", audioPath, "--model", model, "--output", tmpFile.path];
    this.log("debug", "Running:", pythonPath, args.join(" "));

    await this.runCommand(pythonPath, args);

    const output = await Zotero.File.getContentsAsync(tmpFile);
    tmpFile.remove(false);

    this.log("debug", "Helper output:", output);
    const json = JSON.parse(output);
    if (json.error) {
      this.log("error", "Transcription helper reported error:", json.error);
      throw new Error(json.error);
    }
    return json.text || "";
  },

  async transcribeWithCustomCommand(audioPath) {
    const cmdPath = Zotero.Prefs.get("extensions.marginalvoice.customCommandPath");
    if (!cmdPath) throw new Error("Custom command path not configured.");

    const tmpFile = Zotero.getTempDirectory();
    tmpFile.append("marginalvoice_transcript.json");
    tmpFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o666);

    const argsStr = Zotero.Prefs.get("extensions.marginalvoice.customCommandArgs") || "";
    const args = argsStr.split(/\s+/).filter(Boolean).map(arg => arg.replace(/\{audio\}/g, audioPath));
    // If custom command doesn't support --output, we wrap it
    // For now, assume custom commands write to stdout and we capture via temp file
    await this.runCommandWithShellRedirect(cmdPath, args, tmpFile.path);

    const output = await Zotero.File.getContentsAsync(tmpFile);
    tmpFile.remove(false);

    try {
      const json = JSON.parse(output);
      if (json.text !== undefined) return json.text;
      if (json.transcript !== undefined) return json.transcript;
      return output.trim();
    } catch {
      return output.trim();
    }
  },

  async runCommand(cmdPath, args) {
    const cmdFile = Components.classes["@mozilla.org/file/local;1"]
      .createInstance(Components.interfaces.nsIFile);
    cmdFile.initWithPath(cmdPath);

    if (!cmdFile.exists()) {
      throw new Error(`Command not found: ${cmdPath}`);
    }

    const process = Components.classes["@mozilla.org/process/util;1"]
      .createInstance(Components.interfaces.nsIProcess);
    process.init(cmdFile);
    process.startHidden = true;

    // Use runw for unicode support on Windows, run otherwise
    const useUnicode = Zotero.isWin;
    const exitCode = await new Promise((resolve, reject) => {
      const observer = {
        observe(subject, topic) {
          if (topic === "process-finished") {
            resolve(subject.exitValue);
          } else if (topic === "process-failed") {
            reject(new Error("Process failed to start"));
          }
        }
      };
      try {
        if (useUnicode && process.runwAsync) {
          process.runwAsync(args, args.length, observer);
        } else {
          process.runAsync(args, args.length, observer);
        }
      } catch (e) {
        reject(e);
      }
    });

    if (exitCode !== 0) {
      throw new Error(`Command failed with exit code ${exitCode}: ${cmdPath} ${args.join(" ")}`);
    }
  },

  async runCommandWithShellRedirect(cmdPath, args, outputPath) {
    // Cross-platform shell redirect
    const isWin = Zotero.isWin;
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellFile = Components.classes["@mozilla.org/file/local;1"]
      .createInstance(Components.interfaces.nsIFile);
    shellFile.initWithPath(shell);

    const process = Components.classes["@mozilla.org/process/util;1"]
      .createInstance(Components.interfaces.nsIProcess);
    process.init(shellFile);
    process.startHidden = true;

    const quotedCmd = this.escapeShellArg(cmdPath);
    const quotedArgs = args.map(a => this.escapeShellArg(a)).join(" ");
    const redirectCmd = isWin
      ? `${quotedCmd} ${quotedArgs} > "${outputPath}" 2>&1`
      : `${quotedCmd} ${quotedArgs} > ${this.escapeShellArg(outputPath)} 2>&1`;

    const shellArgs = isWin ? ["/c", redirectCmd] : ["-c", redirectCmd];

    const exitCode = await new Promise((resolve, reject) => {
      const observer = {
        observe(subject, topic) {
          if (topic === "process-finished") {
            resolve(subject.exitValue);
          } else if (topic === "process-failed") {
            reject(new Error("Shell process failed to start"));
          }
        }
      };
      try {
        if (Zotero.isWin && process.runwAsync) {
          process.runwAsync(shellArgs, shellArgs.length, observer);
        } else {
          process.runAsync(shellArgs, shellArgs.length, observer);
        }
      } catch (e) {
        reject(e);
      }
    });

    if (exitCode !== 0) {
      throw new Error(`Shell command failed with exit code ${exitCode}`);
    }
  },

  escapeShellArg(arg) {
    if (Zotero.isWin) {
      // Simple Windows quoting
      if (!/\s/.test(arg)) return arg;
      return `"${arg.replace(/"/g, "\"\"")}"`;
    }
    return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
  },

  getPythonPath() {
    const configured = Zotero.Prefs.get("extensions.marginalvoice.pythonPath");
    if (configured) return configured;
    // Try common paths
    const candidates = ["/usr/bin/python3", "/usr/local/bin/python3", "python3", "python"];
    return candidates[0];
  },

  getHelperScriptPath() {
    const configured = Zotero.Prefs.get("extensions.marginalvoice.helperScriptPath");
    if (configured) return configured;
    if (!this.helperScriptTempPath) {
      throw new Error("Helper script has not been extracted. Please restart Zotero.");
    }
    return this.helperScriptTempPath;
  },

  async findQuoteSegments(transcript, triggerWord, pdfPath) {
    const lowerTranscript = transcript.toLowerCase();
    const lowerTrigger = triggerWord.toLowerCase();

    // First pass: find all trigger positions and test whether each one matches.
    const triggers = [];
    let searchIndex = 0;
    while (true) {
      const triggerIndex = lowerTranscript.indexOf(lowerTrigger, searchIndex);
      if (triggerIndex === -1) break;

      const afterTrigger = triggerIndex + lowerTrigger.length;
      let contentStart = afterTrigger;
      while (contentStart < transcript.length && /[\s,;:]/.test(transcript[contentStart])) {
        contentStart++;
      }

      // Find the end of this segment (next trigger or end of transcript)
      const nextTrigger = lowerTranscript.indexOf(lowerTrigger, contentStart);
      const contentEnd = nextTrigger === -1 ? transcript.length : nextTrigger;
      const rawContent = transcript.substring(contentStart, contentEnd).trim();

      if (!rawContent) {
        searchIndex = afterTrigger + 1;
        continue;
      }

      const words = rawContent.split(/\s+/).filter(w => w.length > 0);
      const maxWords = Math.min(6, words.length);
      const minWords = Math.min(4, words.length);

      this.log("info", `Trigger at ${triggerIndex}: raw='${rawContent.substring(0, 60)}...', trying ${minWords}-${maxWords} words`);

      let matchedCount = 0;
      for (let count = maxWords; count >= minWords; count--) {
        const probe = words.slice(0, count).join(" ");
        const match = await this.matchQuoteInPDF(pdfPath, probe);
        if (match) {
          matchedCount = count;
          this.log("info", `Matched ${count} words: '${probe}'`);
          break;
        }
      }

      triggers.push({
        triggerIndex,
        contentStart,
        contentEnd,
        rawContent,
        matchedCount,
        valid: matchedCount > 0
      });

      searchIndex = contentEnd;
    }

    // Second pass: build segments only from valid triggers.
    // Commentary extends to the next valid trigger, not just the next trigger word.
    const validTriggers = triggers.filter(t => t.valid);
    const segments = [];

    for (let i = 0; i < validTriggers.length; i++) {
      const t = validTriggers[i];
      const segmentEnd = (i + 1 < validTriggers.length) ? validTriggers[i + 1].triggerIndex : transcript.length;
      const fullContent = transcript.substring(t.contentStart, segmentEnd).trim();
      const words = fullContent.split(/\s+/).filter(w => w.length > 0);
      const quoteCandidate = words.slice(0, t.matchedCount).join(" ");
      const commentary = words.slice(t.matchedCount).join(" ");

      segments.push({
        raw: t.rawContent,
        quoteCandidate: quoteCandidate,
        commentary: commentary
      });
    }

    // Log skipped triggers
    for (const t of triggers) {
      if (!t.valid) {
        this.log("info", `Trigger at ${t.triggerIndex} did not match; skipping`);
      }
    }

    return segments;
  },

  findQuoteInPDF(fullText, quoteCandidate, threshold) {
    // Normalize whitespace and lowercase
    const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const nCandidate = normalize(quoteCandidate);
    const candidateWords = nCandidate.split(/\s+/).filter(w => w.length > 0);

    if (candidateWords.length === 0) return null;

    // Try to match first 4-6 words progressively
    const maxWords = Math.min(6, candidateWords.length);
    const minWords = Math.min(4, candidateWords.length);

    for (let wordCount = maxWords; wordCount >= minWords; wordCount--) {
      const probeWords = candidateWords.slice(0, wordCount);
      const match = this.findRegexMatchInText(fullText, probeWords);
      if (match) {
        const commentaryWords = candidateWords.slice(wordCount);
        return {
          sentence: match.sentence,
          pageIndex: match.pageIndex,
          matchedWords: wordCount,
          commentary: commentaryWords.join(" ").trim()
        };
      }
    }

    // Fallback: fuzzy sentence-level matching
    if (candidateWords.length >= 3) {
      const sentences = this.extractSentences(fullText);
      let bestMatch = null;
      let bestScore = 0;

      for (const sentence of sentences) {
        const score = this.similarity(nCandidate, normalize(sentence.text));
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = sentence;
        }
      }

      if (bestMatch) {
        return {
          sentence: bestMatch.text,
          pageIndex: bestMatch.pageIndex,
          matchedWords: 0,
          commentary: ""
        };
      }
    }

    return null;
  },

  // Build a regex that allows optional hyphens within words, then search original text
  findRegexMatchInText(fullText, words) {
    // Replace page separators with spaces for regex search, but keep original for position mapping
    const searchText = fullText.replace(/\f/g, " ");
    const patterns = words.map(w => w.replace(/-/g, "[-]?"));
    const regex = new RegExp(patterns.map(p => `(?:${p})`).join("\\s+"), "i");
    const match = searchText.match(regex);
    if (!match) return null;

    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const expanded = this.expandToSentence(fullText, matchStart, matchEnd - matchStart);
    return expanded;
  },

  extractSentences(text) {
    const sentences = [];
    const sentenceEnders = /[.!?]/;
    let current = "";
    let pageIndex = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\f") {
        pageIndex++;
        continue;
      }
      current += text[i];
      if (sentenceEnders.test(text[i])) {
        const trimmed = current.trim();
        if (trimmed.length > 10) {
          sentences.push({ text: trimmed, pageIndex });
        }
        current = "";
      }
    }

    if (current.trim().length > 10) {
      sentences.push({ text: current.trim(), pageIndex });
    }

    return sentences;
  },

  expandToSentence(text, start, length) {
    const sentenceEnders = /[.!?]/;
    let sentenceStart = start;
    while (sentenceStart > 0 && !sentenceEnders.test(text[sentenceStart - 1])) {
      sentenceStart--;
    }
    while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
      sentenceStart++;
    }

    let sentenceEnd = start + length;
    while (sentenceEnd < text.length && !sentenceEnders.test(text[sentenceEnd])) {
      sentenceEnd++;
    }
    sentenceEnd++;

    const sentence = text.substring(sentenceStart, sentenceEnd).trim();
    const textBefore = text.substring(0, start);
    const pageIndex = (textBefore.match(/\f/g) || []).length;

    return { sentence, pageIndex };
  },

  similarity(s1, s2) {
    // Character-level similarity using longest common substring ratio
    const lcs = this.longestCommonSubstring(s1, s2);
    return (2 * lcs.length) / (s1.length + s2.length);
  },

  longestCommonSubstring(s1, s2) {
    if (!s1 || !s2) return "";
    let maxLen = 0;
    let endIndex = 0;
    const matrix = Array(s1.length + 1).fill(null).map(() => Array(s2.length + 1).fill(0));

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
          if (matrix[i][j] > maxLen) {
            maxLen = matrix[i][j];
            endIndex = i;
          }
        }
      }
    }

    return s1.substring(endIndex - maxLen, endIndex);
  },

  async matchQuoteInPDF(pdfPath, quoteCandidate, pageHint) {
    const pythonPath = this.getPythonPath();
    const helperPath = this.getHelperScriptPath();

    const tmpFile = Zotero.getTempDirectory();
    tmpFile.append("marginalvoice_match.json");
    tmpFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o666);

    const args = [helperPath, "match", "--pdf", pdfPath, "--quote", quoteCandidate, "--output", tmpFile.path];
    if (pageHint !== undefined && pageHint !== null) {
      args.push("--page-hint", String(pageHint));
    }

    this.log("debug", "Matching quote:", quoteCandidate);
    await this.runCommand(pythonPath, args);

    const output = await Zotero.File.getContentsAsync(tmpFile);
    tmpFile.remove(false);

    try {
      const json = JSON.parse(output);
      this.log("debug", "Match result:", json);
      if (json.found) {
        return {
          sentence: json.sentence,
          pageIndex: json.pageIndex,
          pageLabel: json.pageLabel || String(json.pageIndex + 1),
          rects: json.rects,
          commentary: json.commentary || ""
        };
      }
      return null;
    } catch (e) {
      this.log("error", "Failed to parse match result:", e);
      return null;
    }
  },

  async locateTextInPDF(pdfPath, text, pageHint) {
    const pythonPath = this.getPythonPath();
    const helperPath = this.getHelperScriptPath();

    const tmpFile = Zotero.getTempDirectory();
    tmpFile.append("marginalvoice_locate.json");
    tmpFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o666);

    const args = [helperPath, "locate", "--pdf", pdfPath, "--text", text, "--output", tmpFile.path];
    if (pageHint !== undefined && pageHint !== null) {
      args.push("--page-hint", String(pageHint));
    }

    await this.runCommand(pythonPath, args);

    const output = await Zotero.File.getContentsAsync(tmpFile);
    tmpFile.remove(false);

    try {
      const json = JSON.parse(output);
      if (json.found) {
        return {
          pageIndex: json.pageIndex,
          rects: json.rects,
          pageLabel: json.pageLabel || String(json.pageIndex + 1)
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  async isDuplicate(pdfItem, text, position) {
    const annotations = pdfItem.getAnnotations();
    for (const ann of annotations) {
      if (ann.annotationType !== "highlight") continue;
      const annText = ann.annotationText || "";
      // Normalize for comparison
      if (this.normalizeText(annText) === this.normalizeText(text)) {
        // Also check position similarity
        try {
          const annPos = JSON.parse(ann.annotationPosition || "{}");
          if (annPos.pageIndex === position.pageIndex) {
            // Consider it a duplicate if same text and same page
            return true;
          }
        } catch {
          // If position parsing fails, fall back to text-only
          return true;
        }
      }
    }
    return false;
  },

  normalizeText(text) {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  },

  async createHighlightAnnotation(pdfItem, text, comment, position, color) {
    // Build sortIndex: pageIndex | textOffset | yFromTop
    const pageIndex = position.pageIndex;
    const yFromTop = Math.max(0, Math.floor(position.rects[0][3] || 0));
    const sortIndex = `${String(pageIndex).padStart(5, "0")}|${String(0).padStart(6, "0")}|${String(yFromTop).padStart(5, "0")}`;

    let key;
    try {
      key = Zotero.DataObjectUtilities.generateKey();
    } catch (e) {
      this.log("error", "Failed to generate annotation key:", e);
      throw new Error("Could not generate annotation key: " + e.message);
    }

    const json = {
      type: "highlight",
      key: key,
      text: text,
      comment: comment || "",
      color: color,
      pageLabel: position.pageLabel || String(pageIndex + 1),
      sortIndex: sortIndex,
      position: {
        pageIndex: pageIndex,
        rects: position.rects
      }
    };

    this.log("debug", "Creating annotation:", JSON.stringify(json));

    try {
      let annotation;
      if (Zotero.Notifier && Zotero.Notifier.Queue) {
        const queue = new Zotero.Notifier.Queue();
        annotation = await Zotero.Annotations.saveFromJSON(pdfItem, json, { notifierQueue: queue });
        await Zotero.Notifier.commit(queue);
      } else {
        annotation = await Zotero.Annotations.saveFromJSON(pdfItem, json);
      }
      this.log("info", "Created annotation:", annotation?.key || annotation?.id || "unknown");
      return annotation;
    } catch (err) {
      this.log("error", "Failed to create annotation:", err);
      throw err;
    }
  }
};

Zotero.MarginalVoice = MarginalVoice;
