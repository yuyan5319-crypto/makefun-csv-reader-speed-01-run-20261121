# Fast broken-CSV reader

A faster drop-in for csv-reader 1.0.0: `solve.js` answers exactly as the
reference does on every input, and `main.ts` is the harness program that
reads every case from `/input/cases.json` and writes the answers to
`/output/answers.json`.

## How it works

The reference reads the text one character at a time and builds every field
up a character at a time. This reader never does that: every field is found
with native `indexOf` scans and taken out with `slice`, and the slow
character-by-character walk only runs on the rare stretches that actually
hold a stray CR, a doubled quote, or a line break inside quotes.

The semantics it reproduces, exactly:

- A U+FEFF at the very start of the text is dropped.
- A record ends at LF or CRLF; a line left with no characters is no record.
- Outside quotes a CR not followed by LF is dropped (`stray_cr`).
- A field that opens with a quote runs to the next quote that is not
  doubled; `""` inside it is one quote, and each CRLF or lone CR inside it
  is read as LF. What follows its closing quote, up to the next comma or
  line break, is appended as it stands (`quote_junk`). A quote that never
  closes is a literal character, and the text after it is read again as
  unquoted (`unterminated_quote`).
- A quote inside an unquoted field is a literal character. Fields stay
  strings, never trimmed or converted.
- `columns` is the first record when `header` is true, else `null`; rows
  are padded with empty strings (`short_row`) or cut (`long_row`) to the
  first record's width.
- Each error is `{code, line, row}`, in the order met, with `line` the
  1-based line its record starts on and `row` its record's index in `rows`
  (`null` for the header).

## Layout

- `solve.js` — the reader: `run(input)` returns `{columns, rows, errors}`.
- `main.ts` — the harness program.
- `package.json` — `{"type": "module"}` so `solve.js` loads as an ES module.

## License

MIT — see `LICENSE`.
