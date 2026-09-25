// Bootstrap entry point for Marginal Voice plugin

var chromeHandle = null;

async function startup({ id, version, resourceURI, rootURI }) {
  await Zotero.initializationPromise;

  // Register chrome:// URLs for bundled resources
  try {
    const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
      .getService(Components.interfaces.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "marginalvoice", "chrome/content/"]
    ]);
  } catch (e) {
    Zotero.debug("[MarginalVoice] Chrome registration failed: " + e.message);
  }

  // Load main module into a scope with required globals
  const scriptURI = rootURI + "modules/marginal-voice.js";
  Services.scriptloader.loadSubScript(scriptURI, {
    Zotero,
    Components,
    Services,
    window: undefined
  });

  // Initialize plugin
  if (typeof Zotero.MarginalVoice !== "undefined") {
    await Zotero.MarginalVoice.init({ id, version, rootURI });
  }

  // Register window hooks for existing windows
  Zotero.getMainWindows().forEach((win) => {
    if (typeof Zotero.MarginalVoice !== "undefined") {
      Zotero.MarginalVoice.onMainWindowLoad({ window: win });
    }
  });
}

function shutdown({ id, version, resourceURI, rootURI }) {
  if (typeof Zotero.MarginalVoice !== "undefined") {
    Zotero.MarginalVoice.shutdown();
  }
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function install() {}
function uninstall() {}
