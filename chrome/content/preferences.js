"use strict";

const AA_PREFIX = "extensions.marginalvoice.";

function _aaGet(key, fallback) {
  try {
    const p = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);
    const full = AA_PREFIX + key;
    const t = p.getPrefType(full);
    if (t === 0) return fallback;
    if (t === 128) return p.getBoolPref(full);
    if (t === 64) return p.getIntPref(full);
    return p.getStringPref(full);
  } catch (_) {
    return fallback;
  }
}

function _aaSet(key, value) {
  try {
    const p = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefBranch);
    const full = AA_PREFIX + key;
    if (typeof value === "boolean") p.setBoolPref(full, value);
    else if (typeof value === "number") p.setIntPref(full, value);
    else p.setStringPref(full, String(value));
  } catch (e) {
    dump("[MarginalVoicePrefs] set failed: " + e + "\n");
  }
}

function aaLog(msg) {
  dump("[MarginalVoicePrefs] " + msg + "\n");
  try {
    if (typeof Zotero !== "undefined" && Zotero.debug) {
      Zotero.debug("[MarginalVoicePrefs] " + msg);
    }
  } catch (_) {}
}

function loadPrefs() {
  aaLog("loadPrefs called");
  try {
    document.getElementById("marginalvoice-transcriptionMode").value = _aaGet("transcriptionMode", "python");
    document.getElementById("marginalvoice-pythonPath").value = _aaGet("pythonPath", "");
    document.getElementById("marginalvoice-helperScriptPath").value = _aaGet("helperScriptPath", "");
    document.getElementById("marginalvoice-customCommandPath").value = _aaGet("customCommandPath", "");
    document.getElementById("marginalvoice-customCommandArgs").value = _aaGet("customCommandArgs", "");
    document.getElementById("marginalvoice-whisperModel").value = _aaGet("whisperModel", "base");
    document.getElementById("marginalvoice-triggerWord").value = _aaGet("triggerWord", "quote");
    document.getElementById("marginalvoice-fuzzyThreshold").value = _aaGet("fuzzyThreshold", "0.6");
    document.getElementById("marginalvoice-annotationColor").value = _aaGet("annotationColor", "#ffd400");
    document.getElementById("marginalvoice-skipDuplicates").checked = _aaGet("skipDuplicates", true);
    document.getElementById("marginalvoice-logLevel").value = _aaGet("logLevel", "info");
    aaLog("loadPrefs done");
  } catch (e) {
    aaLog("loadPrefs error: " + e);
  }
}

function savePrefs() {
  aaLog("savePrefs called");
  try {
    _aaSet("transcriptionMode", document.getElementById("marginalvoice-transcriptionMode").value);
    _aaSet("pythonPath", document.getElementById("marginalvoice-pythonPath").value);
    _aaSet("helperScriptPath", document.getElementById("marginalvoice-helperScriptPath").value);
    _aaSet("customCommandPath", document.getElementById("marginalvoice-customCommandPath").value);
    _aaSet("customCommandArgs", document.getElementById("marginalvoice-customCommandArgs").value);
    _aaSet("whisperModel", document.getElementById("marginalvoice-whisperModel").value);
    _aaSet("triggerWord", document.getElementById("marginalvoice-triggerWord").value);
    _aaSet("fuzzyThreshold", document.getElementById("marginalvoice-fuzzyThreshold").value);
    _aaSet("annotationColor", document.getElementById("marginalvoice-annotationColor").value);
    _aaSet("skipDuplicates", document.getElementById("marginalvoice-skipDuplicates").checked);
    _aaSet("logLevel", document.getElementById("marginalvoice-logLevel").value);
    aaLog("savePrefs done");
  } catch (e) {
    aaLog("savePrefs error: " + e);
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  loadPrefs();
} else {
  window.addEventListener("load", loadPrefs);
}
aaLog("preferences.js loaded, readyState=" + document.readyState);
