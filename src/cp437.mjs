// Minimal CP437 → Unicode transcoder for `screen.art` in the dev harness, so
// block-art `.ans` files render in a local UTF-8 terminal. (In production the
// PHP host transcodes through its own App\Bbs\Art pipeline.) Bytes 0x00–0x7F
// pass through unchanged so ESC/SGR survive; 0x80–0xFF map to their glyphs.

// prettier-ignore
const HIGH = [
  'Ç','ü','é','â','ä','à','å','ç','ê','ë','è','ï','î','ì','Ä','Å',
  'É','æ','Æ','ô','ö','ò','û','ù','ÿ','Ö','Ü','¢','£','¥','₧','ƒ',
  'á','í','ó','ú','ñ','Ñ','ª','º','¿','⌐','¬','½','¼','¡','«','»',
  '░','▒','▓','│','┤','╡','╢','╖','╕','╣','║','╗','╝','╜','╛','┐',
  '└','┴','┬','├','─','┼','╞','╟','╚','╔','╩','╦','╠','═','╬','╧',
  '╨','╤','╥','╙','╘','╒','╓','╫','╪','┘','┌','█','▄','▌','▐','▀',
  'α','ß','Γ','π','Σ','σ','µ','τ','Φ','Θ','Ω','δ','∞','φ','ε','∩',
  '≡','±','≥','≤','⌠','⌡','÷','≈','°','∙','·','√','ⁿ','²','■',' ',
];

/** Transcode a CP437 byte buffer to a UTF-8 string, stripping the EOF marker. */
export function cp437ToUtf8(buffer) {
  let out = '';
  for (const byte of buffer) {
    if (byte === 0x1a) break; // DOS EOF: end of art
    out += byte < 0x80 ? String.fromCharCode(byte) : HIGH[byte - 0x80];
  }
  return out;
}
