# AGENTS.md

Rules for AI coding agents working in this repository. The full shared standard for Lucas' Homey apps lives in `homey-app-standards/template` (AGENTS.md and `docs/coding-standards.md`); this file holds the rules that apply here.

## Code and comments

- **Code documents itself.** Names, types and small, well-named functions say what the code does. Rename or extract before you explain.
- A comment (docblocks included) is allowed only when it adds context that would otherwise be lost: an appliance or firmware quirk, an issue number behind a non-obvious choice, something this code must stay in step with, or a deliberate choice that looks like a mistake.
- Brief and to the point: one line, two at most.
- No comments that restate the code, no docblocks that repeat the function name, no bug history (that goes in the commit), no version numbers that will go stale, no commented-out code.
- When you change code, update or delete the comments next to it. Before you call a change done, read the comments in your own diff against these rules.

```ts
// ❌ restates the code
/** Derive the mode picker from the running program. */
private async syncModeFromProgram(): Promise<void> {

// ✅ context the code can't carry
// Not in CAPABILITY_MAP, so syncCapabilities won't add it to hoods paired earlier.
```
