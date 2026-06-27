// Content script for the ISC2 (Salesforce Lightning) CPE portal, tuned for the
// podcast workflow: Category = "Education" → sub-type "Online webinars, podcasts
// and other online materials". The wizard spans separate pages, so this acts on
// whichever step is currently rendered:
//   Step 1 /s/cpeportaldatespage     → start-date / end-date
//   Step 2 /s/cpeportalcategorydetailpage → the 5 detail fields below
//   Step 3 /s/cpeportaldomainpage     → CISSP domain CARDS (not a <select>)
//
// Lightning controls live inside nested Shadow DOM, so the matcher recurses
// through shadowRoots. Each input carries a stable Salesforce API `name`
// (e.g. Label__c) plus a visible <label> (prefixed "*" when required) — match on
// `name` first, then fall back to label/placeholder keywords. Some ShadowRoot
// methods throw under LockerService, so DOM lookups are wrapped in try/catch.

(function () {
  // Step 2 detail fields, keyed by their stable Salesforce API name.
  const NAME_MAP = {
    title: "Label__c",
    provider: "Presenter__c",
    year: "Yearpublished__c",
    credits: "Credits__c",
    description: "ReviewText__c",
  };

  // Keyword fallback (label/placeholder/name/id text) when the API name isn't found.
  const FIELD_KEYWORDS = {
    title: ["title", "activity title", "activity name", "course name"],
    provider: ["presenter", "provider", "vendor", "organization", "sponsor", "host"],
    year: ["year published", "year"],
    credits: ["credits", "cpe credit", "credit", "hours", "quantity"],
    description: ["summary", "description", "review text", "what you learned", "notes"],
    url: ["url", "link", "evidence", "supporting", "reference"],
  };

  // Mirrors CISSP_DOMAINS in lib/domains.js (content scripts can't import modules).
  const DOMAIN_NAMES = [
    "Security and Risk Management",
    "Asset Security",
    "Security Architecture and Engineering",
    "Communication and Network Security",
    "Identity and Access Management (IAM)",
    "Security Assessment and Testing",
    "Security Operations",
    "Software Development Security",
  ];
  const CERT_NAME = "Certified Information Systems Security Professional";

  // ---- Shadow-DOM-aware traversal -----------------------------------------

  function safeQueryAll(root, selector) {
    try {
      return [...root.querySelectorAll(selector)];
    } catch (_) {
      return [];
    }
  }

  // Collect matching controls across the document and every nested shadow root.
  function collectControls(root, out) {
    for (const el of safeQueryAll(root, "input, textarea, select")) out.push(el);
    for (const el of safeQueryAll(root, "*")) {
      if (el.shadowRoot) collectControls(el.shadowRoot, out);
    }
    return out;
  }

  // Collect every element across the document and nested shadow roots.
  function collectElements(root, out) {
    for (const el of safeQueryAll(root, "*")) {
      out.push(el);
      if (el.shadowRoot) collectElements(el.shadowRoot, out);
    }
    return out;
  }

  function isFillableControl(el) {
    const tag = el.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") return false; // domains are cards, not selects
    if (el.disabled || el.readOnly) return false;
    const type = (el.getAttribute("type") || "").toLowerCase();
    return !["hidden", "submit", "button", "checkbox", "radio", "file", "image"].includes(type);
  }

  function labelText(el) {
    try {
      const root = el.getRootNode();
      if (el.id && root && root.querySelector) {
        const lbl = root.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return lbl.textContent || "";
      }
    } catch (_) {
      // LockerService can throw on some ShadowRoot methods — fall through.
    }
    try {
      const wrap = el.closest("label");
      if (wrap) return wrap.textContent || "";
    } catch (_) {
      /* ignore */
    }
    return "";
  }

  function describe(el) {
    const bits = [labelText(el)];
    for (const attr of ["aria-label", "placeholder", "name"]) {
      const v = el.getAttribute(attr);
      if (v) bits.push(v);
    }
    if (el.id) bits.push(el.id);
    return bits.join(" ").toLowerCase();
  }

  // ---- Value setting -------------------------------------------------------

  // Native value setter + input/change so Lightning's reactive bindings register.
  function setInputValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Exactly one click — firing both el.click() and a synthetic MouseEvent would
  // toggle a card on then off.
  function clickEl(el) {
    try {
      if (typeof el.click === "function") {
        el.click();
      } else {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
    } catch (_) {
      /* ignore */
    }
  }

  // ---- Per-field value normalization --------------------------------------

  // Credits must be a 0.25 multiple; the field rejects other increments.
  function normalizeCredits(value) {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return String(value);
    const quarter = Math.round(n * 4) / 4;
    return Number.isInteger(quarter) ? String(quarter) : String(quarter);
  }

  // ReviewText__c is a single-line input; the form asks for no bullet points.
  function stripBullets(value) {
    return String(value)
      .replace(/[•▪◦‣·]/g, " ")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeValue(field, value) {
    if (value === undefined || value === null) return "";
    if (field === "credits") return normalizeCredits(value);
    if (field === "description") return stripBullets(value);
    if (field === "year") {
      const m = String(value).match(/\d{4}/);
      return m ? m[0] : String(value);
    }
    return String(value);
  }

  // ---- Domain cards (Step 3) ----------------------------------------------

  function elementsWithText(predicate) {
    return collectElements(document, []).filter((el) => {
      let text;
      try {
        text = (el.textContent || "").trim();
      } catch (_) {
        return false;
      }
      return predicate(el, text);
    });
  }

  // The most specific element whose own text equals/contains the target.
  function bestTextMatch(matches) {
    if (matches.length === 0) return null;
    return matches.reduce((best, el) =>
      (safeQueryAll(el, "*").length < safeQueryAll(best, "*").length ? el : best)
    );
  }

  function clickableCard(el) {
    let node = el;
    for (let i = 0; i < 6 && node; i++) {
      const cls = (node.getAttribute && node.getAttribute("class")) || "";
      const role = (node.getAttribute && node.getAttribute("role")) || "";
      if (/card/i.test(cls) || role === "button" || node.tagName === "BUTTON" || node.tagName === "A") {
        return node;
      }
      node = node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
    }
    return el;
  }

  function selectDomainCard(name) {
    const exact = bestTextMatch(elementsWithText((_, t) => t === name));
    const target = exact || bestTextMatch(elementsWithText((_, t) => t.includes(name)));
    if (!target) return false;
    clickEl(clickableCard(target));
    return true;
  }

  function fillDomains(domainNames) {
    if (!domainNames || domainNames.length === 0) return "skipped";
    // Select the CISSP certification card first, if present on this page.
    const cert = bestTextMatch(elementsWithText((_, t) => t.includes(CERT_NAME)));
    if (cert) clickEl(clickableCard(cert));

    const wanted = domainNames.filter((d) => DOMAIN_NAMES.includes(d));
    if (wanted.length === 0) return "not found";
    let selected = 0;
    for (const name of wanted) if (selectDomainCard(name)) selected++;
    if (selected === 0) return "not found";
    return selected === wanted.length ? "filled" : `partial (${selected}/${wanted.length})`;
  }

  // ---- Dates (Step 1) ------------------------------------------------------

  function findControl(controls, used, apiName, keywords) {
    let el = controls.find((c) => !used.has(c) && c.getAttribute("name") === apiName);
    if (!el && keywords) {
      el = controls.find((c) => !used.has(c) && keywords.some((k) => describe(c).includes(k)));
    }
    return el || null;
  }

  function fillDates(controls, used, dateValue) {
    if (!dateValue) return "skipped";
    const start = findControl(controls, used, "start-date", ["start date"]);
    const end = findControl(controls, used, "end-date", ["end date"]);
    let filled = 0;
    if (start) {
      used.add(start);
      setInputValue(start, String(dateValue));
      filled++;
    }
    if (end) {
      used.add(end);
      setInputValue(end, String(dateValue));
      filled++;
    }
    if (filled === 0) return "not found";
    return filled === 2 ? "filled" : "partial (one of start/end)";
  }

  // ---- Orchestration -------------------------------------------------------

  function domainList(fields) {
    if (Array.isArray(fields.domains) && fields.domains.length) return fields.domains;
    return String(fields.domain || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function fillForm(fields) {
    const controls = collectControls(document, []).filter(isFillableControl);
    const used = new Set();
    const report = {};

    // Step 2 detail fields, by Salesforce API name (keyword fallback).
    for (const [field, apiName] of Object.entries(NAME_MAP)) {
      const value = normalizeValue(field, fields[field]);
      if (value === "") {
        report[field] = "skipped";
        continue;
      }
      const el = findControl(controls, used, apiName, FIELD_KEYWORDS[field]);
      if (!el) {
        report[field] = "not found";
        continue;
      }
      used.add(el);
      setInputValue(el, value);
      report[field] = "filled";
    }

    // Step 1 dates.
    report.date = fillDates(controls, used, fields.date);

    // Step 3 domain cards.
    report.domain = fillDomains(domainList(fields));

    // Fields with no control on this sub-type (e.g. the evidence URL) — keyword
    // fallback so other categories still get a partial fill; otherwise reported
    // as not found so the popup's copy buttons cover it.
    if (fields.url) {
      const el = findControl(controls, used, "__none__", FIELD_KEYWORDS.url);
      if (el) {
        used.add(el);
        setInputValue(el, String(fields.url));
        report.url = "filled";
      } else {
        report.url = "not found";
      }
    } else {
      report.url = "skipped";
    }

    return report;
  }

  // Chrome can't return a promise from an onMessage listener — respond
  // synchronously via sendResponse (fillForm is synchronous).
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "cpe-ping") {
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === "cpe-autofill") {
      sendResponse(fillForm(msg.fields || {}));
      return;
    }
  });
})();
