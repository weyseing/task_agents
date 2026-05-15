// Mock in-memory filesystem for the Lumen Files page.
// Replaced by real API calls when the backend lands (see progress/20260516…).

export const INITIAL_FS = {
  id: "root",
  name: "WFH Group",
  kind: "folder",
  children: [
    {
      id: "d-proj",
      name: "Q2 Planning",
      kind: "folder",
      children: [
        {
          id: "f-roadmap",
          name: "Roadmap.md",
          kind: "file",
          type: "md",
          content: `# Q2 Roadmap

_Owner: Priya · Last edited May 12_

## Themes
- **Task agents v2** — multi-step planning, tool retries, audit log
- **Compliance** — SOC 2 Type II renewal, SSO hardening
- **Internal adoption** — onboard Finance + People ops

## Milestones
1. **May 20** — Roadmap sign-off
2. **Jun 03** — Agent v2 alpha (internal)
3. **Jun 24** — SOC 2 evidence freeze
4. **Jul 08** — Finance pilot kickoff

## Risks
- Vendor review for the new model gateway is slipping
- People ops has limited bandwidth in late June

> Discuss in Friday review. See \`Budget.xlsx\` for headcount.
`,
        },
        {
          id: "f-budget",
          name: "Budget.xlsx",
          kind: "file",
          type: "xlsx",
          content: {
            columns: ["Team", "Headcount", "Q2 Spend", "Q3 Forecast", "Variance"],
            rows: [
              ["Platform", "8", "$642,000", "$710,000", "+10.6%"],
              ["Agents", "11", "$884,500", "$905,000", "+2.3%"],
              ["Security", "4", "$318,000", "$320,000", "+0.6%"],
              ["Design", "3", "$226,500", "$240,000", "+6.0%"],
              ["People Ops", "2", "$148,000", "$152,000", "+2.7%"],
              ["Total", "28", "$2,219,000", "$2,327,000", "+4.9%"],
            ],
          },
        },
        {
          id: "f-allhands",
          name: "All-Hands.pptx",
          kind: "file",
          type: "pptx",
          content: {
            slides: [
              { title: "Q2 All-Hands", bullets: ["Wednesday · 10:00 PT", "Lumen v4.2.1 · Internal"] },
              { title: "Where we are", bullets: ["Task agents in 4 teams", "92% weekly active among pilots", "NPS 41 (up from 22)"] },
              { title: "What ships next", bullets: ["Agent planner v2", "SOC 2 Type II", "Finance pilot"] },
              { title: "Risks", bullets: ["Model gateway timeline", "People ops bandwidth"] },
              { title: "Thanks", bullets: ["Questions in #lumen-allhands"] },
            ],
          },
        },
      ],
    },
    {
      id: "d-policy",
      name: "Policies",
      kind: "folder",
      children: [
        {
          id: "f-aup",
          name: "Acceptable Use.docx",
          kind: "file",
          type: "docx",
          content: {
            blocks: [
              { type: "h1", text: "Acceptable Use Policy" },
              { type: "p", text: "This policy governs use of Lumen, the WFH Group task-agent platform. All personnel with Lumen accounts must comply." },
              { type: "h2", text: "1 · Authorized use" },
              { type: "p", text: "Lumen is provided for internal work product only. Personal use, including for non-WFH side projects, is not permitted." },
              { type: "h2", text: "2 · Data handling" },
              { type: "li", text: "Do not paste customer PII into chat prompts." },
              { type: "li", text: "Confidential financial data must remain in workspaces tagged Restricted." },
              { type: "li", text: "Vendor evaluations may not use customer-identifying records." },
              { type: "h2", text: "3 · Session activity" },
              { type: "p", text: "All sessions are logged for security review. Logs are retained for 13 months and may be reviewed by Security on request." },
            ],
          },
        },
        {
          id: "f-soc2",
          name: "SOC 2 Evidence.pdf",
          kind: "file",
          type: "pdf",
          content: {
            pages: [
              {
                title: "SOC 2 Type II · Evidence package",
                body: [
                  "WFH Group · Lumen platform",
                  "Audit window: Jan 01 2026 – Dec 31 2026",
                  "Prepared by: Security team",
                  "Last updated: May 12 2026",
                ],
              },
              {
                title: "Section 3 · Access controls",
                body: [
                  "SSO is enforced for all Lumen accounts via Google Workspace.",
                  "MFA is required at the IdP level; Lumen does not maintain local passwords.",
                  "Privileged roles (admin, auditor) require quarterly access review.",
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "d-data",
      name: "Data",
      kind: "folder",
      children: [
        {
          id: "f-pilots",
          name: "pilot-usage.csv",
          kind: "file",
          type: "csv",
          content: {
            columns: ["week", "team", "wau", "sessions", "agent_runs"],
            rows: [
              ["2026-W14", "Platform", "7", "241", "1,084"],
              ["2026-W14", "Agents", "10", "398", "2,210"],
              ["2026-W15", "Platform", "8", "268", "1,205"],
              ["2026-W15", "Agents", "11", "421", "2,498"],
              ["2026-W16", "Platform", "8", "274", "1,310"],
              ["2026-W16", "Agents", "11", "455", "2,702"],
              ["2026-W17", "Platform", "8", "281", "1,344"],
              ["2026-W17", "Agents", "11", "468", "2,810"],
            ],
          },
        },
        {
          id: "f-config",
          name: "agent-config.json",
          kind: "file",
          type: "json",
          content: `{
  "version": "4.2.1",
  "defaults": {
    "model": "claude-haiku-4-5",
    "max_steps": 12,
    "tools": ["files", "search", "calendar"]
  },
  "limits": {
    "tokens_per_run": 80000,
    "runs_per_user_per_day": 200
  },
  "audit": {
    "retain_days": 395,
    "redact_pii": true
  }
}
`,
        },
      ],
    },
    {
      id: "f-readme",
      name: "README.md",
      kind: "file",
      type: "md",
      content: `# Lumen Files

Welcome. This is the WFH Group internal workspace.

**Tips**
- Click any file in the sidebar to open it.
- Use the tabs above the editor to switch between open files.
- Edits save to your local session — nothing is uploaded yet.

The agent panel on the right is where Lumen will help you edit files once we wire it up.
`,
    },
    {
      id: "f-cover",
      name: "cover.png",
      kind: "file",
      type: "png",
      content: { w: 1600, h: 900, label: "Lumen · cover", palette: ["#0F172A", "#F1F4F9"] },
    },
    {
      id: "f-notes",
      name: "scratch.txt",
      kind: "file",
      type: "txt",
      content: `scratch pad
-----------
- ping eng about gateway slip
- finance pilot — who's the exec sponsor?
- order coffee for thursday review
`,
    },
  ],
};

export function fsClone(node) {
  return JSON.parse(JSON.stringify(node));
}

export function fsFind(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const c of node.children) {
      const r = fsFind(c, id);
      if (r) return r;
    }
  }
  return null;
}

export function fsFindParent(node, id, parent = null) {
  if (node.id === id) return parent;
  if (node.children) {
    for (const c of node.children) {
      const r = fsFindParent(c, id, node);
      if (r) return r;
    }
  }
  return null;
}

export function fsDelete(root, id) {
  const next = fsClone(root);
  const parent = fsFindParent(next, id);
  if (parent && parent.children) {
    parent.children = parent.children.filter((c) => c.id !== id);
  }
  return next;
}

export function fsUpdate(root, id, content) {
  const next = fsClone(root);
  const node = fsFind(next, id);
  if (node) node.content = content;
  return next;
}
