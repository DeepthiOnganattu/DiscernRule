# Discern Rules Assistant

This is a static, shareable UI for searching standard and client-domain Discern rules and drafting a new rule when no strong match exists.

## What it does

- Takes a rule request in natural language.
- Searches standard rules from `Discern_Rules_Reference_Build.xlsx`.
- Searches shared client-domain rules from `client-domain-rules.js`.
- Allows browser-level client imports from CSV, JSON, or pasted text.
- Shows full rule details for matching rules.
- Generates a KB-backed new-rule draft when no strong existing match is found.

## Shareable hosting

No local server is required. Upload the full `discern-rule-search` folder to any static web host such as an internal IIS folder, SharePoint static file location, Azure Static Web Apps, GitHub Pages, Netlify, or Vercel.

The hosted entry point is:

```text
index.html
```

Required files to publish together:

```text
index.html
styles.css
app.js
discern-rules-data.js
discern-kb.js
client-domain-rules.js
```

To preload client-domain rules for every user, populate `client-domain-rules.js` with rows like:

```js
window.CLIENT_DOMAIN_RULES = [
  {
    ruleName: "CLIENT_ASP_DUP_THERAPY",
    domain: "Client A - Pharmacy",
    status: "PRODUCTION",
    evoke: "SIGNORDER",
    purpose: "Checks duplicate antimicrobial therapy.",
    alertText: "Review duplicate therapy before signing."
  }
];
```

Browser-imported client rules are stored in that user's browser local storage only.
