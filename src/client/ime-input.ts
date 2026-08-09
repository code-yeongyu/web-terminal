/**
 * IME input forwarding. ghostty-web prevents `beforeinput` on the terminal
 * container to stop browser text editing, but never forwards plain
 * `insertText` insertions to the PTY — so keyboards that insert text without a
 * composition session (iOS third-party keyboards, inline suggestions) silently
 * lose input. This forwards those insertions, while staying out of the way of
 * the composition path, which ghostty's compositionend already delivers.
 */

const COMPOSITION_DEDUP_MS = 100

export function attachImeInputForwarding(
  container: HTMLElement,
  sendInput: (data: string) => void,
): () => void {
  let composing = false
  let lastComposition: Readonly<{ data: string; endedAt: number }> | undefined

  const onCompositionStart = (): void => {
    composing = true
    lastComposition = undefined
  }
  const onCompositionEnd = (event: CompositionEvent): void => {
    composing = false
    lastComposition = event.data === "" ? undefined : { data: event.data, endedAt: Date.now() }
  }
  const onBeforeInput = (event: InputEvent): void => {
    if (composing) return
    // iOS Korean (and held backspace) arrives as beforeinput deletes with no
    // keydown: each jamo update is deleteContentBackward + reinsert. Swallowing
    // the delete leaves every intermediate jamo on screen.
    if (event.inputType === "deleteContentBackward") {
      lastComposition = undefined
      sendInput("\u007f")
      return
    }
    if (event.inputType === "insertLineBreak") {
      lastComposition = undefined
      sendInput("\r")
      return
    }
    if (event.inputType !== "insertText" || event.data === null || event.data === "") return
    const duplicate =
      lastComposition !== undefined &&
      event.data === lastComposition.data &&
      Date.now() - lastComposition.endedAt < COMPOSITION_DEDUP_MS
    lastComposition = undefined
    if (duplicate) return
    sendInput(event.data)
  }

  container.addEventListener("compositionstart", onCompositionStart, { capture: true })
  container.addEventListener("compositionend", onCompositionEnd, { capture: true })
  container.addEventListener("beforeinput", onBeforeInput, { capture: true })
  return () => {
    container.removeEventListener("compositionstart", onCompositionStart, { capture: true })
    container.removeEventListener("compositionend", onCompositionEnd, { capture: true })
    container.removeEventListener("beforeinput", onBeforeInput, { capture: true })
  }
}
