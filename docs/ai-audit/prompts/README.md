# Prompt Logs

Evidence for Section 3 of the AI Audit Report (Specification Engineering & Prompt Logs).
Three AI tools were used in sequence; each produced input for the next.

| Stage | Tool | What it produced | Log |
| --- | --- | --- | --- |
| 1. Planning | ChatGPT | Project plan: naming, auction flow, contract/function outline, security checklist, test plan | [`chatgpt-plan.txt`](chatgpt-plan.txt) (output). Conversation export: **TODO - add the ChatGPT share link or export** |
| 2. First implementation | Codex desktop agent | `FairLaunch` contracts, tests, React app, docs (commit `0a75a78`) | Prompt summary and decisions in [`../development-log.md`](../development-log.md). Full session export: **TODO - add the Codex session export** |
| 3. Cross-model review and remediation | Claude Code (Claude Opus 5.5, VS Code extension) | Review of stages 1-2, regression tests, contract fixes, fuzz/invariant tests, Slither, frontend rebuild, this documentation (commits `35253ce`..) | [`claude-code-session.md`](claude-code-session.md) |

Raw session transcripts for Claude Code are stored locally by the tool under
`~/.claude/projects/`; the prompts below are copied from that session verbatim.
