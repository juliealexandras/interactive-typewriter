# Interactive typewriter

A full-screen storytelling desk modeled on a 1970s Olivetti portable: olive shell, matte black metal, and aged parchment. The paper carriage fills the top of the screen and the keys fill the bottom third. Keys depress, one typebar strikes, and each line scrolls up the sheet. The return lever sends the carriage home, and the margin bell marks the end of the line. The carriage steps, the ribbon fades, and holding a spool rewinds it.

[Live preview: try the typewriter](index.html)

Open `index.html` in a browser. No install and no build step. To serve it locally:

```bash
python3 -m http.server 8765
```

Then visit [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## How to use it

- Click a key, or type on your keyboard. Both paths print the same way.
- Hold Shift, or press Lock, for capitals. Shift on the number row prints `! @ # $ % ^ & * ( )`.
- Space moves the carriage one column. Back removes the previous letter on the current line. Return feeds the paper and sends the carriage home.
- The line stops at 48 characters. A soft tick plays about five columns before that stop.
- Each printed character spends a little ink. After about 50 characters the new type is pale, then blank. The keys and typebar still move.
- Hold either spool for about a second and a half to rewind a fresh ribbon. Letters already on the sheet keep the ink they were struck with.

The first click or key also starts the strike sound.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The page and the machine |
| `styles.css` | Layout and motion |
| `typewriter.js` | Keys, carriage, ink, and ribbon |
| `PROMPT.md` | The spec the page was built from |

## License

[MIT](LICENSE) © 2026 Julie Spigner
