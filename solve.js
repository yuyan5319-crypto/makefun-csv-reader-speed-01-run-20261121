// Fast broken-CSV reader: a faster drop-in for csv-reader 1.0.0.
//
// run(input) returns, for one case's input {text, header}, exactly the answer
// csv-reader 1.0.0 returns: {columns, rows, errors}. The reading rules, as
// specified for this competition:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote and each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after it
//     is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with empty strings (short_row, with fields: its field count) or cut
//     (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; a record's
//     short_row or long_row is recorded when it ends, with line the 1-based
//     line its record starts on (counting every LF, CRLF and lone CR inside
//     quotes) and row its record's index in rows (null for the header).
//
// Speed comes from never reading the text one character at a time: every
// field is found with native indexOf scans and taken out with slice, and the
// slow character-by-character walk only runs on the rare stretches that
// actually hold a stray CR, a doubled quote or a line break inside quotes.
// Nothing is kept from one call to the next.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of a record carries these two.
  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // One stretch of a quoted field's content, [a, b): every CRLF and lone CR
  // in it becomes one LF, and every line break it holds is counted. A CRLF
  // never straddles a doubled quote, so it never straddles the ends of a
  // stretch cut at one either; the common stretch holds no line break at
  // all and is returned as a plain slice.
  function quotedStretch(a, b) {
    const seg = text.slice(a, b);
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return seg;
    let out = '';
    let start = 0;
    for (let k = 0; k < seg.length; k++) {
      const ch = seg.charCodeAt(k);
      if (ch === 13) {
        out += seg.slice(start, k);
        out += '\n';
        line += 1;
        if (seg.charCodeAt(k + 1) === 10) k += 1;
        start = k + 1;
      } else if (ch === 10) {
        out += seg.slice(start, k);
        out += '\n';
        line += 1;
        start = k + 1;
      }
    }
    return out + seg.slice(start);
  }

  // Unquoted characters onto `value`, up to the next comma or line break: a
  // CR not followed by LF is dropped (stray_cr). Returns the field, how it
  // ended, and how many characters were kept (added). The field's stretch is
  // found with two native scans and taken out with one slice; only a
  // stretch that actually holds a CR is walked character by character.
  function readUnquoted(value) {
    let added = 0;
    const cur = pos;
    const ci = text.indexOf(',', cur);
    const ni = text.indexOf('\n', cur);
    let m;
    let isComma;
    if (ci === -1) {
      m = ni;
      isComma = false;
    } else if (ni === -1) {
      m = ci;
      isComma = true;
    } else if (ci < ni) {
      m = ci;
      isComma = true;
    } else {
      m = ni;
      isComma = false;
    }
    if (m === -1) {
      // No comma or line break is left: the field runs to the end of the
      // text. (No line break is left either, so a CR here is always lone.)
      const seg = text.slice(cur);
      if (seg.indexOf('\r') === -1) {
        pos = len;
        return { value: value + seg, ended: END, added: seg.length };
      }
      let start = 0;
      for (let k = 0; k < seg.length; k++) {
        if (seg.charCodeAt(k) === 13) {
          pushError('stray_cr');
          value += seg.slice(start, k);
          added += k - start;
          start = k + 1;
        }
      }
      value += seg.slice(start);
      added += seg.length - start;
      pos = len;
      return { value, ended: END, added };
    }
    const seg = text.slice(cur, m);
    if (seg.indexOf('\r') === -1) {
      pos = m + 1;
      if (isComma) return { value: value + seg, ended: COMMA, added: seg.length };
      line += 1;
      return { value: value + seg, ended: LINE_BREAK, added: seg.length };
    }
    // The stretch holds a CR. The stretch holds no line feed (m is the
    // nearest comma or line feed), so a CR with more of the stretch after it
    // is lone, and a CR at the stretch's end is lone when a comma follows it
    // and a CRLF when a line feed follows it.
    let start = 0;
    for (let k = 0; k < seg.length; k++) {
      if (seg.charCodeAt(k) !== 13) continue;
      if (k + 1 < seg.length || isComma) {
        pushError('stray_cr');
        value += seg.slice(start, k);
        added += k - start;
        start = k + 1;
        continue;
      }
      value += seg.slice(start, k);
      added += k - start;
      pos = m + 1;
      line += 1;
      return { value, ended: LINE_BREAK, added };
    }
    value += seg.slice(start);
    added += seg.length - start;
    pos = m + 1;
    if (isComma) return { value, ended: COMMA, added };
    line += 1;
    return { value, ended: LINE_BREAK, added };
  }

  // A quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let cur = pos + 1;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted. Line breaks the failed scan
        // counted are un-counted, so the re-read counts them again.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        value += quotedStretch(cur, q);
        value += '"';
        cur = q + 2;
        continue;
      }
      value += quotedStretch(cur, q);
      pos = q + 1;
      break;
    }
    if (pos >= len) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) pushError('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
