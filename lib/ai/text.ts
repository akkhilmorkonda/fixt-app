// Text helpers for AI output: keep it the right length and plain. Pure, so tests cover them.

/** Collapses whitespace and strips markdown the UI would show literally. */
export function plain(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cuts text to at most `max` characters at a sentence or word boundary. The
 * prompts ask for the right length; this only guards the database and the UI
 * against a model that ignores them.
 */
export function clip(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return `${(word > max * 0.6 ? cut.slice(0, word) : cut).replace(/[,;:\s]+$/, "")}…`;
}

/** Keeps the newest part of a long field, marking what was dropped. */
export function tail(text: string | null | undefined, max: number) {
  if (!text) return "";
  return text.length <= max ? text : `[earlier text omitted]\n…${text.slice(text.length - max)}`;
}

/**
 * Swaps typographic characters for plain ones in a text message. One curly
 * quote or dash switches the whole message to UCS-2, which fits 70 characters
 * per segment instead of 160, so a two-line text bills as three.
 */
export function smsSafe(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00A0\u2009\u202F]/g, " ");
}

/** SMS segments a text uses (GSM-7 when possible, else UCS-2). */
export function smsSegments(text: string) {
  const gsm = /^[\n\r -_a-z{|}~¡£¤¥§¿ÄÅÆÇÉÑÖØÜßàäåæèéìñòöøùüΓΔΘΛΞΠΣΦΨΩ€]*$/.test(text);
  const per = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return text.length <= per ? 1 : Math.ceil(text.length / multi);
}
