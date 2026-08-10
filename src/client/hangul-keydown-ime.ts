import type { Terminal } from "ghostty-web"

// iPhone Edge (EdgiOS 151) delivers Korean as one keydown per jamo — key="ㅎ", keyCode 0,
// no composition events, no beforeinput. ghostty encodes those keydowns as plain input, so
// the PTY receives bare jamo and nothing ever composes. This module intercepts raw
// compatibility-jamo keydowns before ghostty's container listener, runs a standard 2-beolsik
// automaton, and replays the result as synthetic composition events — the same stream a
// desktop IME produces — so ghostty's compositionend sender and the preedit overlay handle
// the rest unchanged. Desktop IMEs never emit bare jamo keydowns with isComposing=false,
// so the interception is self-gating.

const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
const JUNGSEONG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
const JONGSEONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"]

const VOWEL_JOIN: Readonly<Record<string, string>> = {
  ㅗㅏ: "ㅘ",
  ㅗㅐ: "ㅙ",
  ㅗㅣ: "ㅚ",
  ㅜㅓ: "ㅝ",
  ㅜㅔ: "ㅞ",
  ㅜㅣ: "ㅟ",
  ㅡㅣ: "ㅢ",
}
const VOWEL_SPLIT: Readonly<Record<string, readonly [string, string]>> = {
  ㅘ: ["ㅗ", "ㅏ"],
  ㅙ: ["ㅗ", "ㅐ"],
  ㅚ: ["ㅗ", "ㅣ"],
  ㅝ: ["ㅜ", "ㅓ"],
  ㅞ: ["ㅜ", "ㅔ"],
  ㅟ: ["ㅜ", "ㅣ"],
  ㅢ: ["ㅡ", "ㅣ"],
}
const FINAL_JOIN: Readonly<Record<string, string>> = {
  ㄱㅅ: "ㄳ",
  ㄴㅈ: "ㄵ",
  ㄴㅎ: "ㄶ",
  ㄹㄱ: "ㄺ",
  ㄹㅁ: "ㄻ",
  ㄹㅂ: "ㄼ",
  ㄹㅅ: "ㄽ",
  ㄹㅌ: "ㄾ",
  ㄹㅍ: "ㄿ",
  ㄹㅎ: "ㅀ",
  ㅂㅅ: "ㅄ",
}
const FINAL_SPLIT: Readonly<Record<string, readonly [string, string]>> = {
  ㄳ: ["ㄱ", "ㅅ"],
  ㄵ: ["ㄴ", "ㅈ"],
  ㄶ: ["ㄴ", "ㅎ"],
  ㄺ: ["ㄹ", "ㄱ"],
  ㄻ: ["ㄹ", "ㅁ"],
  ㄼ: ["ㄹ", "ㅂ"],
  ㄽ: ["ㄹ", "ㅅ"],
  ㄾ: ["ㄹ", "ㅌ"],
  ㄿ: ["ㄹ", "ㅍ"],
  ㅀ: ["ㄹ", "ㅎ"],
  ㅄ: ["ㅂ", "ㅅ"],
}

type HangulState = { cho?: string; jung?: string; jong?: string }

const isConsonant = (ch: string): boolean => CHOSEONG.includes(ch)
const isVowel = (ch: string): boolean => ch.length === 1 && JUNGSEONG.includes(ch)
const isJamo = (ch: string): boolean =>
  ch.length === 1 && ch >= "\u3131" && ch <= "\u3163" && (isConsonant(ch) || isVowel(ch))

function composeSyllable(cho: string, jung: string, jong: string): string {
  return String.fromCodePoint(
    0xac00 + (CHOSEONG.indexOf(cho) * 21 + JUNGSEONG.indexOf(jung)) * 28 + JONGSEONG.indexOf(jong),
  )
}

function stateText(state: HangulState): string {
  if (state.cho !== undefined && state.jung !== undefined) {
    return composeSyllable(state.cho, state.jung, state.jong ?? "")
  }
  return state.cho ?? state.jung ?? ""
}

function feed(state: HangulState, ch: string): { next: HangulState; committed: string } {
  if (isConsonant(ch)) {
    if (state.cho === undefined && state.jung === undefined)
      return { next: { cho: ch }, committed: "" }
    if (state.jung === undefined) return { next: { cho: ch }, committed: stateText(state) }
    if (state.cho === undefined) return { next: { cho: ch }, committed: stateText(state) }
    if (state.jong === undefined) {
      if (JONGSEONG.includes(ch)) return { next: { ...state, jong: ch }, committed: "" }
      return { next: { cho: ch }, committed: stateText(state) }
    }
    const joined = FINAL_JOIN[state.jong + ch]
    if (joined !== undefined) return { next: { ...state, jong: joined }, committed: "" }
    return { next: { cho: ch }, committed: stateText(state) }
  }
  // vowel
  if (state.cho === undefined && state.jung === undefined)
    return { next: { jung: ch }, committed: "" }
  if (state.jung === undefined) return { next: { ...state, jung: ch }, committed: "" }
  if (state.jong === undefined) {
    const joined = VOWEL_JOIN[state.jung + ch]
    if (joined !== undefined) return { next: { ...state, jung: joined }, committed: "" }
    return { next: { jung: ch }, committed: stateText(state) }
  }
  // Final consonant migrates to the next syllable when a vowel follows (도깨비불).
  const split = FINAL_SPLIT[state.jong]
  if (split !== undefined) {
    const cho = state.cho
    const jung = state.jung
    if (cho !== undefined && jung !== undefined) {
      return { next: { cho: split[1], jung: ch }, committed: composeSyllable(cho, jung, split[0]) }
    }
  }
  const cho = state.cho
  const jung = state.jung
  if (cho !== undefined && jung !== undefined && state.jong !== undefined) {
    return { next: { cho: state.jong, jung: ch }, committed: composeSyllable(cho, jung, "") }
  }
  return { next: { jung: ch }, committed: stateText(state) }
}

function backspace(state: HangulState): HangulState {
  if (state.jong !== undefined) {
    const split = FINAL_SPLIT[state.jong]
    if (split !== undefined) return { ...state, jong: split[0] }
    const kept: HangulState = {}
    if (state.cho !== undefined) kept.cho = state.cho
    if (state.jung !== undefined) kept.jung = state.jung
    return kept
  }
  if (state.jung !== undefined) {
    const split = VOWEL_SPLIT[state.jung]
    if (split !== undefined) return { ...state, jung: split[0] }
    return state.cho === undefined ? {} : { cho: state.cho }
  }
  return {}
}

export function attachHangulKeydownIme(container: HTMLElement, terminal: Terminal): () => void {
  let state: HangulState = {}
  let sessionOpen = false

  const fire = (type: string, data: string): void => {
    const target = terminal.textarea ?? container
    target.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }))
  }
  const commit = (text: string): void => {
    if (!sessionOpen) fire("compositionstart", "")
    fire("compositionend", text)
    sessionOpen = false
  }
  const sync = (): void => {
    const text = stateText(state)
    if (text === "") {
      if (sessionOpen) commit("")
      return
    }
    if (!sessionOpen) {
      sessionOpen = true
      fire("compositionstart", "")
    }
    fire("compositionupdate", text)
  }
  const flush = (): void => {
    const text = stateText(state)
    state = {}
    if (sessionOpen || text !== "") commit(text)
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      if (sessionOpen) flush()
      return
    }
    if (isJamo(event.key)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const result = feed(state, event.key)
      state = result.next
      if (result.committed !== "") commit(result.committed)
      sync()
      return
    }
    if (sessionOpen && event.key === "Backspace") {
      event.preventDefault()
      event.stopImmediatePropagation()
      state = backspace(state)
      sync()
      return
    }
    if (sessionOpen) flush()
  }
  const onFocusOut = (): void => {
    if (sessionOpen) flush()
  }

  container.addEventListener("keydown", onKeydown, { capture: true })
  container.addEventListener("focusout", onFocusOut)
  return () => {
    container.removeEventListener("keydown", onKeydown, { capture: true })
    container.removeEventListener("focusout", onFocusOut)
  }
}
