# Build a mechanical typewriter page

[Live preview: try the typewriter](index.html)

Build a single-page typewriter that a web visitor can operate. Keys depress, one typebar strikes a fixed point, letters appear on the paper at the moment of the hit, the carriage steps, ink fades, and holding a spool rewinds a fresh ribbon.

This is a drawn machine in HTML, CSS, and SVG. It is not a text box styled to look like a typewriter.

## Stack and files

Create only these files:

- `index.html` — page structure and the SVG scene
- `styles.css` — layout and motion
- `typewriter.js` — state, input, and rendering

No framework, no bundler, no package install, no API keys, no external images, fonts, or audio files. The page must run by opening `index.html` in a browser. Use the system monospace stack: `"Courier New", Courier, monospace`.

Design an original machine. Do not copy a brand name, logo, or model name onto the body.

## Scene

Draw the machine as layers, centered on a warm plaster desk (`#cfc6b8`). The form is a 1970s Olivetti portable: a low olive shell around a matte black keyboard deck. Do not print a brand name or logo on the body. Scale the whole machine with `transform: scale()` on a narrow viewport so the key layout never reflows.

Parts, from back to front:

- **Body.** Olive green molded shell (`#55633f`), about 920px wide, with a short matte highlight and softly squared corners.
- **Paper mask.** A window above the platen showing about 8 lines, set in a matte black throat with a thin paper scale along the top. Older lines scroll up and out of the mask. The sheet is aged parchment (`#e3d0a8`) with a soft shadow.
- **Platen.** A black horizontal cylinder behind the strike point.
- **Ribbon and spools.** Two spools, left and right. A dark ribbon runs between them across the strike point. Ribbon color tracks ink: full ink is `#1a1a1a`, empty ink matches the parchment.
- **Type basket.** A fan of static bars for the silhouette, plus one striking bar that swings to the center strike point. Do not build a separate moving bar per key.
- **Keyboard.** Low square matte black keycaps (`#161616`), about 36px, with 6px gaps, small corner radii, and parchment legends (`#e7dcc4`). Rows, top to bottom:
  1. `1 2 3 4 5 6 7 8 9 0`
  2. `Q W E R T Y U I O P`
  3. `A S D F G H J K L`
  4. `Z X C V B N M`
  5. Shift, Shift Lock, Space (wide), Backspace, Return
- **Hint.** One line of copy on the body, hidden until ink is under 0.25: "Hold a spool to rewind the ribbon." No modal and no tutorial that covers the machine.

The strike point stays visually fixed at the center of the platen. The paper carriage translates horizontally. Glyphs are individual characters on the sheet, not a form field.

## State

Own this object in `typewriter.js`. Do not store the page text in the DOM and read it back.

```js
{
  lines: [""],       // string per paper line
  col: 0,            // column of the next glyph
  row: 0,            // index into lines
  shift: false,      // true while either Shift key is held
  shiftLock: false,  // toggled by the Shift Lock key
  ink: 1,            // 0 empty, 1 full
  ribbonPhase: 0,    // spool rotation, in turns
  ribbonDirection: 1,// 1 or -1; flips at each end of travel
  carriageX: 0,      // px; 0 is the right-hand home position
  busy: false,       // true during a strike
  queue: []          // pending press codes, max length 3
}
```

Constants:

- `COLUMNS = 48`
- `COLUMN_WIDTH = 14` pixels
- `LINE_HEIGHT = 28` pixels
- `VISIBLE_LINES = 8`
- `INK_PER_STRIKE = 0.02`
- `MARGIN_BELL_AT = 43` (five columns before the stop)
- `WIND_MS = 1500` (hold time that restores ink to 1)

## Input

Pointer clicks on keycaps and physical keyboard events both call one function, `pressKey(code)`.

- Printable keys: the legend character, or its shifted symbol for the number row (`! @ # $ % ^ & * ( )`).
- Letters use uppercase when `shift` or `shiftLock` is on. Shift does not also toggle shift lock.
- Shift Lock stays down until pressed again.
- Space prints a space and advances the carriage.
- Backspace erases the previous glyph and steps the carriage back one column. This is a visitor shortcut: do not refuse to erase because a historical typewriter had no erase key. At column 0, backspace does nothing (do not climb to the previous line).
- Return feeds the paper one line and animates the carriage home.
- Ignore repeats from the OS while a key is held, except Shift, which tracks keyup and keydown.

While `busy` is true, push new presses onto `queue` and drop any press past length 3. When the current action finishes, play the next queued press. Do not run two strikes at once.

## Strike

For a printable key inside the margin, with ink above 0:

1. Depress that keycap for 50ms.
2. Swing the striking bar to the platen in 90ms.
3. At the end of the 90ms, append the glyph to the current line, then spend ink.
4. Return the bar in 70ms and step the carriage left by `COLUMN_WIDTH` in 40ms.
5. Advance `ribbonPhase` by a small step. Rotate both spools to match. When the phase reaches either end of its travel, flip `ribbonDirection`.

If ink is 0, run the same motion and leave the paper unchanged.

If `col` is already `COLUMNS`, ignore printable keys until Return. When a printable key moves `col` to `MARGIN_BELL_AT`, play one soft tick.

Print only at the hit. Never show the glyph at keydown.

## Ink and ribbon

`ink` starts at 1. Each printed character subtracts `INK_PER_STRIKE` and clamps at 0. About 50 strikes take the ribbon from full to empty.

Glyph color is a mix from `#1a1a1a` at ink 1 toward `#e3d0a8` at ink 0, using the ink value from the moment that glyph was printed. Store that value with the glyph (for example, parallel arrays or objects `{ ch, ink }`). Do not recolor old glyphs when the ribbon is refilled.

The ribbon segment across the platen uses the current `ink` color.

## Refill

Pointer-down on either spool starts winding. While the pointer stays down, spin the spools faster and raise `ink` toward 1. A hold of `WIND_MS` (about 1.5 seconds) restores `ink` to 1. Pointer-up stops the wind early and keeps whatever ink was restored. Refill does not rewrite glyphs already on the sheet. The next strikes use the new ink.

There is no refill control outside the machine.

## Sound and motion

On the first pointer or key gesture, resume a Web Audio context and play a short synthesized click at each strike (a noise burst or oscillator under 40ms). Play a quieter tick for the margin bell. If audio cannot start, the machine still prints.

If `prefers-reduced-motion: reduce` matches, skip carriage, typebar, and spool travel animations. Still depress keys briefly, still print at the logical hit, and still update ink.

## Build order

Keep the page usable after each step. Do not skip ahead to polish.

1. Static scene: body, paper mask, platen, spools, ribbon, basket, keys.
2. Strike and print: `pressKey`, key depress, typebar, glyph, carriage step, input queue.
3. Shift, shift lock, backspace, return, column stop, and margin tick.
4. Ink spend, per-glyph ink color, spool rotation, direction flip.
5. Hold-to-wind refill and the low-ink hint.
6. Strike click, wired to the first user gesture.

## Do not

- Do not use a `textarea`, `input`, or `contenteditable` element for the paper.
- Do not move a caret while the carriage stays still. The carriage moves; the strike point stays fixed.
- Do not reveal a glyph before the typebar finishes its upward swing.
- Do not add a refill button, menu, or control outside the spools.
- Do not load remote assets, fonts, or audio files.
- Do not add accounts, saving, sharing, or a blocking tutorial.
- Do not animate one unique typebar per key.

## Done when

Verify in a browser before stopping. Exercise the machine; do not stop at a screenshot.

- Clicking the M key and pressing M on the keyboard both depress that key, swing the bar, and show M at the strike point after the bar arrives.
- Holding Shift, or turning Shift Lock on, prints capitals. Return feeds one line and sends the carriage home. Backspace removes the last glyph and steps the carriage back.
- A printable key at column 48 does not add a character. Around column 43, one tick plays.
- After about 50 printed characters, new glyphs are visibly lighter, then absent, while keys and the bar still move.
- Holding a spool for about 1.5 seconds restores dark type on the following strikes. Glyphs already printed stay at the ink level they were struck with.
- Typing quickly queues up to 3 presses, plays them in order, and does not overlap two strikes.
- The low-ink sentence appears only under ink 0.25, and it does not cover the keys.
