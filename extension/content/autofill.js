// Content script injected on ISC2 pages. It receives the computed CPE field
// values from the popup and fills the visible form using a heuristic matcher
// (label text / name / id / placeholder / aria-label, plus <select> option text
// for the domain). Because the real ISC2 CPE form is behind a login and its
// exact markup can change, this matches by meaning rather than hardcoded
// selectors, and reports per-field success back to the popup as a fallback.

(function () {
  // Keyword groups per logical field. Order matters: more specific first.
  const FIELD_KEYWORDS = {
    title: ["activity title", "activity name", "course name", "title", "name of", "activity"],
    provider: ["provider", "vendor", "organization", "sponsor", "host", "source"],
    description: ["description", "summary", "what you learned", "learning", "details", "notes"],
    date: ["completion date", "date completed", "completion", "date attended", "date"],
    credits: ["number of credits", "cpe credit", "credit", "hours", "quantity"],
    domain: ["domain"],
    url: ["url", "link", "evidence", "supporting", "reference"],
  };

  function describe(el) {
    const bits = [];
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) bits.push(lbl.textContent);
    }
    const wrapLabel = el.closest("label");
    if (wrapLabel) bits.push(wrapLabel.textContent);
    if (el.getAttribute("aria-label")) bits.push(el.getAttribute("aria-label"));
    if (el.getAttribute("placeholder")) bits.push(el.getAttribute("placeholder"));
    if (el.getAttribute("name")) bits.push(el.getAttribute("name"));
    if (el.id) bits.push(el.id);
    return bits.join(" ").toLowerCase();
  }

  function candidateControls() {
    return [...document.querySelectorAll("input, textarea, select")].filter((el) => {
      if (el.disabled || el.readOnly) return false;
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "checkbox", "radio", "file", "image"].includes(type)) {
        return false;
      }
      return el.offsetParent !== null || el.tagName === "SELECT";
    });
  }

  function setInputValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelectValue(el, value) {
    const wanted = String(value).toLowerCase();
    const option = [...el.options].find((o) => {
      const t = o.textContent.toLowerCase();
      return t.includes(wanted) || wanted.includes(t.trim());
    });
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function fillForm(fields) {
    const controls = candidateControls().map((el) => ({ el, text: describe(el) }));
    const used = new Set();
    const report = {};

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      const value = fields[field];
      if (value === undefined || value === null || value === "") {
        report[field] = "skipped";
        continue;
      }
      const isDomain = field === "domain";
      const match = controls.find((c) => {
        if (used.has(c.el)) return false;
        if (isDomain && c.el.tagName !== "SELECT") return false;
        return keywords.some((k) => c.text.includes(k));
      });
      if (!match) {
        report[field] = "not found";
        continue;
      }
      used.add(match.el);
      if (match.el.tagName === "SELECT") {
        report[field] = setSelectValue(match.el, value) ? "filled" : "option not found";
      } else {
        setInputValue(match.el, String(value));
        report[field] = "filled";
      }
    }
    return report;
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "cpe-ping") {
      return Promise.resolve({ ok: true });
    }
    if (msg && msg.type === "cpe-autofill") {
      return Promise.resolve(fillForm(msg.fields || {}));
    }
    return undefined;
  });
})();
