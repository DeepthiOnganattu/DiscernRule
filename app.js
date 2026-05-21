(function () {
  const STANDARD_RULES = Array.isArray(window.STANDARD_DISCERN_RULES)
    ? window.STANDARD_DISCERN_RULES
    : [];
  const RAW_SHARED_CLIENT_RULES = Array.isArray(window.CLIENT_DOMAIN_RULES)
    ? window.CLIENT_DOMAIN_RULES
    : [];
  const DISCERN_KB = window.DISCERN_KB || {};

  const STORAGE_KEY = "discern-rule-search.clientRules.v1";
  const MAX_RESULTS = 40;
  const STRONG_MATCH_SCORE = Number(DISCERN_KB.decisionThresholds?.strongExistingMatch || 70);
  const POSSIBLE_MATCH_SCORE = Number(DISCERN_KB.decisionThresholds?.possibleExistingMatch || 55);
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from",
    "has", "have", "if", "in", "into", "is", "it", "may", "not", "of", "on",
    "or", "our", "rule", "rules", "should", "that", "the", "their", "then",
    "this", "to", "was", "when", "where", "with", "within", "without", "will",
    "patient", "patients", "provider", "clinician", "alert", "alerts", "order",
    "orders", "document", "documentation"
  ]);
  const KNOWN_MEDICATIONS = [
    "daptomycin", "linezolid", "vancomycin", "cefepime", "ceftriaxone", "piperacillin",
    "tazobactam", "meropenem", "metronidazole", "levofloxacin", "ciprofloxacin",
    "azithromycin", "warfarin", "heparin", "enoxaparin", "insulin", "methotrexate",
    "gentamicin", "tobramycin", "amiodarone", "digoxin", "morphine", "hydromorphone"
  ];

  const els = {
    standardCount: document.getElementById("standardCount"),
    clientCount: document.getElementById("clientCount"),
    totalResults: document.getElementById("totalResults"),
    strongResults: document.getElementById("strongResults"),
    summaryLine: document.getElementById("summaryLine"),
    requestDetails: document.getElementById("requestDetails"),
    keywordInput: document.getElementById("keywordInput"),
    draftDomain: document.getElementById("draftDomain"),
    scopeSelect: document.getElementById("scopeSelect"),
    domainSelect: document.getElementById("domainSelect"),
    evokeSelect: document.getElementById("evokeSelect"),
    triggerContext: document.getElementById("triggerContext"),
    actionType: document.getElementById("actionType"),
    includeExpired: document.getElementById("includeExpired"),
    results: document.getElementById("results"),
    draftPanel: document.getElementById("draftPanel"),
    verdict: document.getElementById("verdict"),
    exportButton: document.getElementById("exportButton"),
    searchButton: document.getElementById("searchButton"),
    resetButton: document.getElementById("resetButton"),
    clientDomain: document.getElementById("clientDomain"),
    clientFile: document.getElementById("clientFile"),
    clientPaste: document.getElementById("clientPaste"),
    addClientButton: document.getElementById("addClientButton"),
    clearClientButton: document.getElementById("clearClientButton"),
    clientStatus: document.getElementById("clientStatus")
  };

  let clientRules = loadClientRules();
  let lastResults = [];
  let lastDraft = null;

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_/\\-]+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(value) {
    return normalize(value)
      .split(" ")
      .filter(Boolean)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function isExpired(rule) {
    return String(rule.status || "").toLowerCase() === "expired";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlight(value, queryTokens) {
    let html = escapeHtml(value || "");
    const activeTokens = unique(queryTokens)
      .filter((token) => token.length > 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);

    activeTokens.forEach((token) => {
      const re = new RegExp(`(${escapeRegExp(token)})`, "ig");
      html = html.replace(re, "<mark>$1</mark>");
    });
    return html;
  }

  function combinedText(rule) {
    return [
      rule.ruleName,
      rule.solutionArea,
      rule.contentGuide,
      rule.status,
      rule.evoke,
      rule.purpose,
      rule.alertText,
      rule.supplementalFiles,
      rule.otherNotes,
      rule.domain,
      rule.source
    ].join(" ");
  }

  function loadClientRules() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveClientRules() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clientRules));
  }

  function currentStandardRules() {
    return STANDARD_RULES.filter((rule) => !isExpired(rule));
  }

  function sharedClientRules() {
    return RAW_SHARED_CLIENT_RULES
      .map((rule) => buildClientRule({
        ruleName: rule.ruleName || rule.rule || rule.name || rule.rule_name,
        domain: rule.domain || rule.solutionArea || "Shared client domain",
        status: rule.status || "Client",
        evoke: rule.evoke || "",
        purpose: rule.purpose || rule.description || rule.details || "",
        alertText: rule.alertText || rule.alert || "",
        source: rule.source || "client-domain-rules.js"
      }))
      .filter(Boolean);
  }

  function allClientRules() {
    return [
      ...sharedClientRules().map((rule) => ({ ...rule, clientScope: "shared" })),
      ...clientRules.map((rule) => ({ ...rule, clientScope: "browser" }))
    ];
  }

  function allRules() {
    return [
      ...STANDARD_RULES.map((rule) => ({ ...rule, sourceType: "standard" })),
      ...allClientRules().map((rule) => ({ ...rule, sourceType: "client" }))
    ];
  }

  function updateCounts() {
    const sharedCount = sharedClientRules().length;
    const localCount = clientRules.length;
    const totalClient = sharedCount + localCount;
    els.standardCount.textContent = currentStandardRules().length.toLocaleString();
    els.clientCount.textContent = totalClient.toLocaleString();
    els.clientStatus.textContent = totalClient
      ? `${totalClient.toLocaleString()} client rules loaded across ${clientDomainCount()} domain(s). ${sharedCount.toLocaleString()} shared, ${localCount.toLocaleString()} browser import(s).`
      : "No client rules loaded.";
  }

  function clientDomainCount() {
    return unique(allClientRules().map((rule) => rule.domain || "Client domain")).length;
  }

  function populateFilters() {
    const searchableRules = allRules().filter((rule) => !isExpired(rule) || els.includeExpired.checked);
    const domains = unique(searchableRules.map((rule) => rule.solutionArea || rule.domain)).sort();
    const evokes = unique(searchableRules.map((rule) => rule.evoke)).sort();

    const selectedDomain = els.domainSelect.value;
    const selectedEvoke = els.evokeSelect.value;

    els.domainSelect.innerHTML = `<option value="all">All</option>${domains
      .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
      .join("")}`;
    els.evokeSelect.innerHTML = `<option value="all">All</option>${evokes
      .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
      .join("")}`;

    if (domains.includes(selectedDomain)) els.domainSelect.value = selectedDomain;
    if (evokes.includes(selectedEvoke)) els.evokeSelect.value = selectedEvoke;
  }

  function getCandidateRules() {
    const scope = els.scopeSelect.value;
    const domain = els.domainSelect.value;
    const evoke = els.evokeSelect.value;
    const includeExpired = els.includeExpired.checked;

    return allRules().filter((rule) => {
      if (!includeExpired && isExpired(rule)) return false;
      if (scope === "standard" && rule.sourceType !== "standard") return false;
      if (scope === "client" && rule.sourceType !== "client") return false;
      if (domain !== "all" && (rule.solutionArea || rule.domain) !== domain) return false;
      if (evoke !== "all" && rule.evoke !== evoke) return false;
      return true;
    });
  }

  function scoreRule(rule, queryText, queryTokens) {
    const normalizedQuery = normalize(queryText);
    const normalizedName = normalize(rule.ruleName);
    const nameTokens = tokens(rule.ruleName);
    const bodyTokens = tokens(combinedText(rule));
    const bodySet = new Set(bodyTokens);
    const nameSet = new Set(nameTokens);
    const reasons = [];
    let score = 0;

    if (!normalizedQuery && !queryTokens.length) return { score: 0, reasons };

    if (normalizedQuery && normalizedName === normalizedQuery) {
      score += 100;
      reasons.push("exact rule name");
    } else if (normalizedQuery.length >= 3 && normalizedName.includes(normalizedQuery)) {
      score += 88;
      reasons.push("rule name contains query");
    } else if (normalizedQuery.length >= 3 && normalizedQuery.includes(normalizedName)) {
      score += 76;
      reasons.push("query contains rule name");
    }

    const matchedNameTokens = queryTokens.filter((token) => nameSet.has(token));
    const matchedBodyTokens = queryTokens.filter((token) => bodySet.has(token));
    const tokenBase = Math.max(1, Math.min(queryTokens.length, 8));

    if (matchedNameTokens.length) {
      score += Math.min(64, (matchedNameTokens.length / tokenBase) * 64);
      reasons.push(`name tokens: ${unique(matchedNameTokens).slice(0, 5).join(", ")}`);
    }

    const bodyOnly = matchedBodyTokens.filter((token) => !matchedNameTokens.includes(token));
    if (bodyOnly.length) {
      score += Math.min(28, (unique(bodyOnly).length / tokenBase) * 28);
      reasons.push(`detail tokens: ${unique(bodyOnly).slice(0, 5).join(", ")}`);
    }

    const phraseHits = buildPhrases(queryTokens)
      .filter((phrase) => normalize(combinedText(rule)).includes(phrase))
      .slice(0, 3);
    if (phraseHits.length) {
      score += phraseHits.length * 8;
      reasons.push(`phrases: ${phraseHits.join(", ")}`);
    }

    if (rule.sourceType === "client") score += 3;
    if (isExpired(rule)) score -= 14;

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons: unique(reasons)
    };
  }

  function buildPhrases(queryTokens) {
    const phrases = [];
    for (let i = 0; i < queryTokens.length - 1; i += 1) {
      phrases.push(`${queryTokens[i]} ${queryTokens[i + 1]}`);
    }
    return unique(phrases);
  }

  function runSearch() {
    populateFilters();
    const requestText = els.requestDetails.value.trim();
    const keywordText = els.keywordInput.value.trim();
    const domainText = els.draftDomain.value.trim();
    const queryText = `${keywordText} ${requestText} ${domainText}`.trim();
    const queryTokens = unique(tokens(queryText));

    if (!queryText) {
      lastResults = [];
      renderEmpty("Enter a rule request or keyword to search.", "neutral");
      return;
    }

    const scored = getCandidateRules()
      .map((rule) => ({ ...rule, ...scoreRule(rule, queryText, queryTokens) }))
      .filter((rule) => rule.score > 0)
      .sort((a, b) => b.score - a.score || a.ruleName.localeCompare(b.ruleName))
      .slice(0, MAX_RESULTS);

    lastResults = scored;
    renderResults(scored, queryTokens, queryText);
  }

  function renderEmpty(message, kind) {
    els.results.innerHTML = "";
    hideDraft();
    els.totalResults.textContent = "0";
    els.strongResults.textContent = "0";
    els.summaryLine.textContent = "Ready";
    els.exportButton.disabled = true;
    setVerdict(message, kind);
  }

  function setVerdict(message, kind) {
    els.verdict.className = `verdict ${kind}`;
    els.verdict.textContent = message;
  }

  function hideDraft() {
    lastDraft = null;
    els.draftPanel.hidden = true;
    els.draftPanel.innerHTML = "";
  }

  function renderResults(results, queryTokens, queryText) {
    const strong = results.filter((rule) => rule.score >= STRONG_MATCH_SCORE).length;
    els.totalResults.textContent = results.length.toLocaleString();
    els.strongResults.textContent = strong.toLocaleString();
    els.exportButton.disabled = !results.length;
    els.summaryLine.textContent = results.length
      ? `${results.length} match(es) shown from ${getCandidateRules().length.toLocaleString()} searchable rule(s)`
      : "No matches";

    if (!results.length) {
      setVerdict("No existing rule match found in the selected scope. A new-rule draft is ready for review.", "bad");
      els.results.innerHTML = "";
      renderDraft(queryText, queryTokens, results);
      return;
    }

    const top = results[0];
    if (top.score >= STRONG_MATCH_SCORE) {
      setVerdict(`Strong existing-rule match: ${top.ruleName}`, "good");
      hideDraft();
    } else if (top.score >= POSSIBLE_MATCH_SCORE) {
      setVerdict(`Possible existing-rule match: ${top.ruleName}`, "warn");
      renderDraft(queryText, queryTokens, results);
    } else {
      setVerdict("Low-confidence matches found. Review them, or use the KB-backed new-rule draft below.", "warn");
      renderDraft(queryText, queryTokens, results);
    }

    els.results.innerHTML = results.map((rule) => resultHtml(rule, queryTokens)).join("");
  }

  function resultHtml(rule, queryTokens) {
    const classes = ["result"];
    if (rule.sourceType === "client") classes.push("client");
    if (isExpired(rule)) classes.push("expired");

    const description = rule.purpose || rule.alertText || rule.otherNotes || "No purpose text available.";
    const meta = [
      rule.sourceType === "client" ? `${rule.clientScope === "shared" ? "Shared client" : "Client"}` : "Standard",
      rule.solutionArea || rule.domain,
      rule.status,
      rule.evoke
    ].filter(Boolean);
    const detailRows = [
      ["Rule name", rule.ruleName],
      ["Source", rule.sourceType === "client" ? (rule.source || "Client domain") : "Standard Discern workbook"],
      ["Solution/domain", rule.solutionArea || rule.domain],
      ["Content guide", rule.contentGuide],
      ["Status", rule.status],
      ["EVOKE", rule.evoke],
      ["Purpose", rule.purpose],
      ["Alert text", rule.alertText],
      ["Supplemental files", rule.supplementalFiles],
      ["Other notes", rule.otherNotes]
    ].filter((row) => row[1]);

    return `
      <article class="${classes.join(" ")}">
        <div class="result-head">
          <div>
            <h3>${highlight(rule.ruleName, queryTokens)}</h3>
            <div class="meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
          </div>
          <div class="score">${rule.score}%</div>
        </div>
        <p class="description">${highlight(description, queryTokens)}</p>
        ${rule.alertText && rule.alertText !== description ? `<p class="description">${highlight(rule.alertText, queryTokens)}</p>` : ""}
        <div class="match-reasons">${escapeHtml(rule.reasons.join(" | ") || "matched search text")}</div>
        <details class="rule-detail">
          <summary>View rule details</summary>
          <dl class="detail-grid">
            ${detailRows.map(([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${highlight(value, queryTokens)}</dd>
              </div>
            `).join("")}
          </dl>
        </details>
      </article>
    `;
  }

  function renderDraft(queryText, queryTokens, results) {
    const draft = createRuleDraft(queryText, queryTokens, results);
    lastDraft = draft;
    els.draftPanel.hidden = false;
    els.draftPanel.innerHTML = `
      <article class="draft-card">
        <div class="draft-head">
          <div>
            <p class="draft-kicker">KB-backed draft</p>
            <h3>${escapeHtml(draft.ruleName)}</h3>
            <p>${escapeHtml(draft.purpose)}</p>
          </div>
          <span class="draft-badge">New rule</span>
        </div>
        <div class="draft-summary">
          <div>
            <span>Event</span>
            <strong>${escapeHtml(draft.event)}</strong>
          </div>
          <div>
            <span>Solution/domain</span>
            <strong>${escapeHtml(draft.solutionArea)}</strong>
          </div>
          <div>
            <span>Action</span>
            <strong>${escapeHtml(draft.actionLabel)}</strong>
          </div>
        </div>
        <div class="draft-note">
          ${escapeHtml(draft.reason)}
        </div>
        <div class="actions draft-actions">
          <button class="primary" type="button" data-copy-draft>Copy draft</button>
          <button class="secondary" type="button" data-download-draft>Download draft</button>
        </div>
        <pre class="draft-code">${escapeHtml(draft.markdown)}</pre>
      </article>
    `;
    els.draftPanel.querySelector("[data-copy-draft]").addEventListener("click", copyDraft);
    els.draftPanel.querySelector("[data-download-draft]").addEventListener("click", downloadDraft);
  }

  function createRuleDraft(queryText, queryTokens, results) {
    const request = els.requestDetails.value.trim() || els.keywordInput.value.trim() || queryText;
    const medications = extractMedicationTerms(queryText);
    const duplicateTherapy = isDuplicateTherapyRequest(queryText, medications);
    const solutionArea = inferSolutionArea(queryText, medications);
    const event = inferEvent(queryText, medications);
    const actionLabel = inferActionLabel(queryText, duplicateTherapy);
    const ruleName = buildDraftRuleName(solutionArea, queryTokens, medications, duplicateTherapy);
    const closest = results.slice(0, 3).map((rule) => `${rule.ruleName} (${rule.score}%)`);

    const purpose = duplicateTherapy && medications.length >= 2
      ? `Alert when ${titleCase(medications[0])} and ${titleCase(medications[1])} duplicate therapy is detected.`
      : `Evaluate the request and create a Discern rule when no reusable standard or client-domain rule is confirmed.`;

    const draft = duplicateTherapy && medications.length >= 2
      ? duplicateTherapyDraft({ ruleName, request, medications, solutionArea, event, actionLabel, closest })
      : generalRuleDraft({ ruleName, request, queryTokens, solutionArea, event, actionLabel, closest });

    return {
      ruleName,
      purpose,
      solutionArea,
      event,
      actionLabel,
      reason: closest.length
        ? `No strong existing-rule match was found. Closest candidates: ${closest.join(" | ")}. Validate locally before build.`
        : "No existing-rule match was found in the selected scope. Validate the generated draft locally before build.",
      markdown: draft
    };
  }

  function extractMedicationTerms(value) {
    const normalized = normalize(value);
    const hits = KNOWN_MEDICATIONS.filter((med) => normalized.includes(med));
    return unique(hits);
  }

  function isDuplicateTherapyRequest(value, medications) {
    const normalized = normalize(value);
    return medications.length >= 2 && (
      normalized.includes("duplicate") ||
      normalized.includes("duplication") ||
      normalized.includes("same time") ||
      normalized.includes("together") ||
      normalized.includes("both") ||
      normalized.includes("therapy")
    );
  }

  function inferSolutionArea(value, medications) {
    const explicit = els.draftDomain.value.trim();
    if (explicit) return explicit;
    const normalized = normalize(value);
    if (medications.length || /antimicrobial|antibiotic|pharmacy|medication|therapy/.test(normalized)) {
      return "Pharmacy / Antimicrobial Stewardship";
    }
    if (/vte|venous|thrombo|platelet|anticoag/.test(normalized)) return "VTE / Quality";
    if (/document|assessment|form|note|nursing/.test(normalized)) return "Clinical Documentation";
    return "Client domain - confirm";
  }

  function inferEvent(value, medications) {
    const selected = els.triggerContext.value;
    if (selected === "signorder") return "SIGNORDER";
    if (selected === "order_event") return "ORDER_EVENT";
    if (selected === "clinical_event") return "CLINICAL_EVENT";

    const normalized = normalize(value);
    if (/background|surveillance|post commit|after order/.test(normalized)) return "ORDER_EVENT";
    if (/document|assessment|clinical event|result|chart/.test(normalized) && !medications.length) return "CLINICAL_EVENT";
    if (/order|ordered|sign|incoming|medication|therapy/.test(normalized) || medications.length) return "SIGNORDER";
    return "SIGNORDER";
  }

  function inferActionLabel(value, duplicateTherapy) {
    const selected = els.actionType.value;
    if (selected === "soft_stop" || duplicateTherapy) return "EKS_ALERT_FLEX_A soft-stop alert";
    if (selected === "worklist") return "Worklist / follow-up action";
    if (selected === "log_only") return "Log-only or audit action";
    return "EKS_ALERT_FLEX_A provider alert";
  }

  function buildDraftRuleName(solutionArea, queryTokens, medications, duplicateTherapy) {
    const prefix = rulePrefix(solutionArea);
    if (duplicateTherapy && medications.length >= 2) {
      return `${prefix}_${ruleToken(medications[0])}_${ruleToken(medications[1])}_DUP_1`;
    }
    const tokensForName = unique(queryTokens)
      .filter((token) => token.length > 2)
      .filter((token) => !["request", "details", "domain", "solution"].includes(token))
      .slice(0, 3);
    const stem = tokensForName.length ? tokensForName.map(ruleToken).join("_") : "NEW_RULE";
    return `${prefix}_${stem}_1`;
  }

  function rulePrefix(solutionArea) {
    const normalized = normalize(solutionArea);
    if (/antimicrobial|stewardship/.test(normalized)) return "ASP";
    if (/pharmacy|medication/.test(normalized)) return "PHARM";
    if (/vte|quality/.test(normalized)) return "VTE";
    if (/documentation|nursing/.test(normalized)) return "DOC";
    return "DISCERN";
  }

  function ruleToken(value) {
    return String(value || "RULE")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 18) || "RULE";
  }

  function titleCase(value) {
    return String(value || "")
      .split(/\s+/)
      .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : "")
      .join(" ");
  }

  function duplicateTherapyDraft({ ruleName, request, medications, solutionArea, event, actionLabel, closest }) {
    const first = titleCase(medications[0]);
    const second = titleCase(medications[1]);
    const firstList = `${ruleToken(medications[0])}_ORDERABLES`;
    const secondList = `${ruleToken(medications[1])}_ORDERABLES`;
    const kbEvent = DISCERN_KB.eventGuidance?.[event]?.useWhen || "Validate the selected EVOKE/event with the client build team.";
    return [
      `# ${ruleName}`,
      "",
      "## Search decision",
      closest.length
        ? `No strong existing-rule match was found. Closest candidates: ${closest.join(" | ")}.`
        : "No existing-rule match was found in the selected scope.",
      "",
      "## Purpose",
      `Alert the ordering clinician when ${first} and ${second} duplicate therapy is detected.`,
      "",
      "## Request captured",
      request,
      "",
      "## Recommended module",
      `- Solution area: ${solutionArea}`,
      `- EVOKE/Event: ${event}`,
      `- Event guidance: ${kbEvent}`,
      `- Action: ${actionLabel}`,
      "",
      "## Catalog prerequisites",
      `- ${firstList}: include all active ${first} orderable mnemonics and synonyms from the local order catalog.`,
      `- ${secondList}: include all active ${second} orderable mnemonics and synonyms from the local order catalog.`,
      "- Confirm active medication statuses such as Ordered and InProcess before production validation.",
      "",
      "## Evoke section",
      "- E1 - EKS_ORDER_E: screen the triggering signed orders for either medication.",
      `  - ORD_METHOD: whose primary mnemonic is`,
      `  - OPT_ORDERS: ${firstList}, ${secondList}`,
      "",
      "## Logic section",
      `- L1 - EKS_ORDER_INCOMING_L: incoming ${first} in the signing transaction.`,
      `- L2 - EKS_ORDER_INCOMING_L: incoming ${second} in the signing transaction.`,
      `- L3 - EKS_ORDERS_FIND_L: active ${second} on the same encounter, linked to L1.`,
      `- L4 - EKS_ORDERS_FIND_L: active ${first} on the same encounter, linked to L2.`,
      "",
      "## Logic expression",
      "Action group 1:",
      "L1 AND (L2 OR L3)",
      "",
      "Action group 2:",
      "L2 AND NOT L1 AND L4",
      "",
      "## Action section",
      "- Template: EKS_ALERT_FLEX_A",
      `- Title: Duplicate therapy: ${first} and ${second}`,
      `- Alert text: ${first} and ${second} are considered duplicate therapy. Review the medication profile and cancel one therapy unless concurrent therapy is clinically intended.`,
      "- Response: Cancel order or continue with documented override, per local policy.",
      "",
      "## KB build notes",
      "- Use SIGNORDER for synchronous pre-commit order alerts when possible.",
      "- Do not rely on TRIGGER_ORDERID for new sign orders.",
      "- Keep existing-order checks scoped to the same encounter unless local policy requires broader scope.",
      "- Developer validation is required before TESTING or PRODUCTION migration."
    ].join("\n");
  }

  function generalRuleDraft({ ruleName, request, queryTokens, solutionArea, event, actionLabel, closest }) {
    const kbEvent = DISCERN_KB.eventGuidance?.[event]?.useWhen || "Validate the selected EVOKE/event with the client build team.";
    const concept = unique(queryTokens).slice(0, 6).join(", ") || "request criteria";
    return [
      `# ${ruleName}`,
      "",
      "## Search decision",
      closest.length
        ? `No strong existing-rule match was found. Closest candidates: ${closest.join(" | ")}.`
        : "No existing-rule match was found in the selected scope.",
      "",
      "## Purpose",
      "Create a new Discern rule candidate for the captured request after developer review.",
      "",
      "## Request captured",
      request,
      "",
      "## Recommended module",
      `- Solution area: ${solutionArea}`,
      `- EVOKE/Event: ${event}`,
      `- Event guidance: ${kbEvent}`,
      `- Action: ${actionLabel}`,
      "",
      "## Suggested build structure",
      "- E1: Select the EVOKE/event that best represents when the rule should evaluate.",
      `- L1: Evaluate request criteria for ${concept}.`,
      "- L2: Add encounter/person/order scope checks required by local policy.",
      "- A1: Configure alert, worklist, or audit action based on expected action.",
      "",
      "## Logic expression",
      "L1 AND L2",
      "",
      "## Draft alert/action text",
      "Review the request criteria and take the locally approved action. Replace this text with final clinical wording during validation.",
      "",
      "## KB build notes",
      "- Search standard and client-domain rules before creating a new rule.",
      "- Use SIGNORDER for pre-commit order alerts, ORDER_EVENT for post-commit surveillance, and CLINICAL_EVENT for documentation/event triggers.",
      "- Instantiate local code sets, orderables, result values, and statuses before TESTING.",
      "- Developer validation is required before TESTING or PRODUCTION migration."
    ].join("\n");
  }

  async function copyDraft(event) {
    if (!lastDraft) return;
    const button = event.currentTarget;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(lastDraft.markdown);
      } else {
        fallbackCopy(lastDraft.markdown);
      }
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy draft"; }, 1400);
    } catch {
      button.textContent = "Copy failed";
      setTimeout(() => { button.textContent = "Copy draft"; }, 1400);
    }
  }

  function fallbackCopy(textValue) {
    const field = document.createElement("textarea");
    field.value = textValue;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }

  function downloadDraft() {
    if (!lastDraft) return;
    const blob = new Blob([lastDraft.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${lastDraft.ruleName}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function parseDelimited(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === "," || char === "\t") && !inQuotes) {
        row.push(cell.trim());
        cell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function parseClientText(text, defaultDomain) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      return parseClientJson(trimmed, defaultDomain);
    }

    const rows = parseDelimited(trimmed);
    if (!rows.length) return [];

    const firstRow = rows[0].map((cell) => normalize(cell));
    const hasHeader = firstRow.some((cell) =>
      ["rule name", "rule", "rule id", "name", "domain", "solution area", "status", "purpose"].includes(cell)
    );

    if (!hasHeader) {
      return rows
        .map((row) => buildClientRule({ ruleName: row[0], domain: row[1] || defaultDomain, purpose: row.slice(2).join(" ") }))
        .filter(Boolean);
    }

    const bodyRows = rows.slice(1);
    const indexFor = (names) => firstRow.findIndex((cell) => names.includes(cell));
    const index = {
      ruleName: indexFor(["rule name", "rule", "rule id", "name", "rule_name"]),
      domain: indexFor(["domain", "client domain", "solution area", "solution", "client"]),
      status: indexFor(["status"]),
      evoke: indexFor(["evoke"]),
      purpose: indexFor(["purpose", "description", "details", "request"]),
      alertText: indexFor(["alert text", "alert"]),
      source: indexFor(["source"])
    };

    return bodyRows
      .map((row) => buildClientRule({
        ruleName: row[index.ruleName],
        domain: index.domain >= 0 ? row[index.domain] : defaultDomain,
        status: index.status >= 0 ? row[index.status] : "Client",
        evoke: index.evoke >= 0 ? row[index.evoke] : "",
        purpose: index.purpose >= 0 ? row[index.purpose] : row.filter(Boolean).slice(1).join(" "),
        alertText: index.alertText >= 0 ? row[index.alertText] : "",
        source: index.source >= 0 ? row[index.source] : "Client domain"
      }))
      .filter(Boolean);
  }

  function parseClientJson(text, defaultDomain) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((item) => buildClientRule({
        ruleName: item.ruleName || item.rule || item.name || item.rule_name,
        domain: item.domain || item.solutionArea || defaultDomain,
        status: item.status || "Client",
        evoke: item.evoke || "",
        purpose: item.purpose || item.description || item.details || "",
        alertText: item.alertText || item.alert || "",
        source: item.source || "Client domain"
      }))
      .filter(Boolean);
  }

  function buildClientRule(input) {
    const ruleName = String(input.ruleName || "").trim();
    if (!ruleName) return null;
    return {
      ruleName,
      solutionArea: "",
      contentGuide: "",
      status: String(input.status || "Client").trim(),
      evoke: String(input.evoke || "").trim(),
      purpose: String(input.purpose || "").trim(),
      alertText: String(input.alertText || "").trim(),
      supplementalFiles: "",
      otherNotes: "",
      source: String(input.source || "Client domain").trim(),
      domain: String(input.domain || "Client domain").trim()
    };
  }

  async function addClientRules() {
    const defaultDomain = els.clientDomain.value.trim() || "Client domain";
    const pasted = els.clientPaste.value.trim();
    const file = els.clientFile.files[0];
    let imported = [];

    try {
      if (file) {
        if (/\.xlsx$/i.test(file.name)) {
          throw new Error("XLSX files are not parsed in this local page. Save the client domain list as CSV or paste rule names.");
        }
        const text = await file.text();
        imported = imported.concat(parseClientText(text, defaultDomain));
      }

      if (pasted) {
        imported = imported.concat(parseClientText(pasted, defaultDomain));
      }
    } catch (error) {
      els.clientStatus.textContent = error.message;
      return;
    }

    if (!imported.length) {
      els.clientStatus.textContent = "No client rules were found in the input.";
      return;
    }

    const existingKeys = new Set(allClientRules().map(clientKey));
    const newRules = imported.filter((rule) => {
      const key = clientKey(rule);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });

    clientRules = clientRules.concat(newRules);
    saveClientRules();
    els.clientPaste.value = "";
    els.clientFile.value = "";
    updateCounts();
    populateFilters();
    els.clientStatus.textContent = `${newRules.length.toLocaleString()} new client rule(s) added.`;
    runSearch();
  }

  function clientKey(rule) {
    return `${normalize(rule.domain)}::${normalize(rule.ruleName)}`;
  }

  function clearClientRules() {
    if (!clientRules.length) {
      els.clientStatus.textContent = sharedClientRules().length
        ? "No browser-imported client rules loaded. Shared client rules are still available."
        : "No client rules loaded.";
      return;
    }
    clientRules = [];
    saveClientRules();
    updateCounts();
    populateFilters();
    runSearch();
    els.clientStatus.textContent = sharedClientRules().length
      ? "Browser-imported client rules cleared. Shared client rules are still available."
      : "Client rules cleared.";
  }

  function exportResults() {
    if (!lastResults.length) return;
    const header = ["Score", "Rule Name", "Source", "Domain/Solution", "Status", "EVOKE", "Purpose"];
    const rows = lastResults.map((rule) => [
      rule.score,
      rule.ruleName,
      rule.sourceType === "client" ? "Client" : "Standard",
      rule.solutionArea || rule.domain,
      rule.status,
      rule.evoke,
      rule.purpose || rule.alertText || rule.otherNotes
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "discern-rule-search-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    return `"${String(value || "").replace(/"/g, '""')}"`;
  }

  function resetSearch() {
    els.requestDetails.value = "";
    els.keywordInput.value = "";
    els.draftDomain.value = "";
    els.scopeSelect.value = "all";
    els.domainSelect.value = "all";
    els.evokeSelect.value = "all";
    els.triggerContext.value = "auto";
    els.actionType.value = "provider_alert";
    els.includeExpired.checked = false;
    populateFilters();
    renderEmpty("Enter a rule request or keyword to search.", "neutral");
  }

  function bindEvents() {
    els.searchButton.addEventListener("click", runSearch);
    els.resetButton.addEventListener("click", resetSearch);
    els.exportButton.addEventListener("click", exportResults);
    els.addClientButton.addEventListener("click", addClientRules);
    els.clearClientButton.addEventListener("click", clearClientRules);
    [els.scopeSelect, els.domainSelect, els.evokeSelect, els.includeExpired, els.triggerContext, els.actionType].forEach((el) => {
      el.addEventListener("change", runSearch);
    });
    [els.requestDetails, els.keywordInput, els.draftDomain].forEach((el) => {
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) runSearch();
      });
    });
  }

  bindEvents();
  updateCounts();
  populateFilters();
  resetSearch();
})();
