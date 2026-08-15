/**
 * Native paste forwarding. ghostty-web attaches its own paste handler to the
 * hidden terminal textarea (reads `clipboardData`, forwards through its
 * bracketed-paste-aware `paste()`), but the app's toolbar fallback —
 * `navigator.clipboard.readText()` — is blocked by Safari, especially in
 * Add-to-Home-Screen standalone mode. This makes the real native paste event on
 * the focused textarea the primary paste path for keyboard/native paste.
 *
 * The listener runs in the capture phase, which the DOM dispatches on the
 * target *before* ghostty-web's target-phase handler. `stopImmediatePropagation`
 * suppresses that handler so one user paste is forwarded exactly once;
 * `preventDefault` keeps the browser from also mutating the textarea value.
 */

export function attachNativePasteForwarding(
  input: HTMLTextAreaElement,
  paste: (text: string) => void,
): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    event.preventDefault()
    event.stopImmediatePropagation()
    const text = event.clipboardData?.getData("text") ?? ""
    if (text !== "") paste(text)
  }
  input.addEventListener("paste", onPaste, { capture: true })
  return () => input.removeEventListener("paste", onPaste, { capture: true })
}
