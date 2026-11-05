// Serialises data for a prompt's tagged data blocks (<session_data>,
// <user_text>, ...). JSON.stringify leaves < and > alone, so a user-typed
// "</user_text>" would close the block early and the rest would read as prompt
// text. Escaping them as \u003c / \u003e keeps the JSON identical in meaning
// (the model reads them as the same characters) while making a tag impossible.
export function promptJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
}
