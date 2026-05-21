window.DISCERN_KB = {
  version: "2026-05-20",
  source: "Uploaded Discern Developer and Discern Expert references distilled into build guidance.",
  decisionThresholds: {
    strongExistingMatch: 70,
    possibleExistingMatch: 55
  },
  eventGuidance: {
    SIGNORDER: {
      label: "SIGNORDER",
      useWhen: "Use for synchronous order-signing alerts before the order is committed.",
      notes: [
        "Best fit when an incoming order should be evaluated at signing time.",
        "Do not rely on TRIGGER_ORDERID for new signed orders because the new order is not committed yet.",
        "Use incoming-order logic templates for same-transaction checks."
      ]
    },
    SAASSIGNORDER: {
      label: "SAASSIGNORDER",
      useWhen: "Alternate signing event pattern for Orders cloud component workflows.",
      notes: [
        "Use the same incoming-order and existing-order logic pattern after local validation."
      ]
    },
    ORDER_EVENT: {
      label: "ORDER_EVENT",
      useWhen: "Use for background surveillance or post-commit order behavior.",
      notes: [
        "Not preferred for synchronous alerts that must stop or guide signing before commit."
      ]
    },
    CLINICAL_EVENT: {
      label: "CLINICAL_EVENT",
      useWhen: "Use when the triggering condition is documentation, assessment, or clinical event activity.",
      notes: [
        "Confirm the event code, result value, and encounter scope with local build owners."
      ]
    }
  },
  templates: {
    EKS_ORDER_E: "Screen signed orders for target orderables.",
    EKS_ORDER_INCOMING_L: "Detect target orders in the current signing transaction.",
    EKS_ORDERS_FIND_L: "Find existing active orders, usually scoped to the same encounter.",
    EKS_ALERT_FLEX_A: "Display configurable alert text and response actions.",
    EKS_ORDER_ACTION_INC_DETAIL_L: "Use when component-level incoming order detail matching is required."
  },
  buildPrinciples: [
    "Search standard and client-domain rules before proposing a new build.",
    "Prefer same-encounter scope for existing-order checks unless the request explicitly requires person-level history.",
    "Instantiate medication/orderable lists with local order catalog values before testing.",
    "Generate the draft as a build handoff; developer validation is required before production use."
  ]
};
