// Install the browser DOM globals that extension/lib/feeds.js relies on
// (DOMParser, NodeFilter — plus document.createTreeWalker), backed by linkedom
// so the DOM-parsing code paths can run under `node --test`. Call installDom()
// before exercising parseGrcEpisodes / stripHtml.
import { parseHTML, DOMParser as XmlDOMParser } from "linkedom";

export function installDom() {
  class DOMParser {
    parseFromString(str, type) {
      if (type === "text/html") {
        // linkedom's text/html fragment handling is flaky for bare text, so
        // wrap in a full document — this matches real browser DOMParser
        // semantics, where document.body is always present.
        return parseHTML(`<!DOCTYPE html><html><body>${str}</body></html>`).document;
      }
      return new XmlDOMParser().parseFromString(str, type);
    }
  }
  globalThis.DOMParser = DOMParser;
  globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
}
