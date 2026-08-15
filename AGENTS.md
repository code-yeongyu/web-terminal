# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Terminal input architecture (paste, IME)

- Native keyboard/system paste on the hidden Ghostty textarea is the app's primary paste path
  (`src/client/paste-input.ts`): a capture-phase `paste` listener reads `clipboardData.getData("text")`
  and forwards exactly once via `terminal.paste(text)` (bracketed-paste aware), using
  `stopImmediatePropagation` to suppress ghostty-web's own target-phase textarea handler so one user
  paste never double-sends. Touch `paste-input.ts` if paste semantics change.
- `navigator.clipboard.readText()` is blocked by Safari, especially in Add-to-Home-Screen standalone
  mode (`src/client/ui/toolbar.ts` falls back to focusing the terminal and telling the user to use the
  keyboard Paste key). Do not rely on programmatic clipboard reads as the primary path.
- IME forwarding (`src/client/ime-input.ts`) only handles `insertText`, `deleteContentBackward`, and
  `insertLineBreak` beforeinput; `insertFromPaste` and composition paths are deliberately left alone to
  avoid double-sending.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
