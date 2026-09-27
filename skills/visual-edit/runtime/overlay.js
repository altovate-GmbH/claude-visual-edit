/**
 * Visual Edit Overlay - direktes Bearbeiten der laufenden Seite.
 *
 * Wird nur im Dev-Server geladen. Jedes JSX-Element traegt durch das
 * Vite-Plugin ein data-ve="datei:zeile:spalte". Darueber findet das
 * Zurueckschreiben spaeter die richtige Stelle im Quellcode.
 *
 * Aenderungen wirken sofort im DOM (Inline-Styles) und werden parallel als
 * Tailwind-Klassen protokolliert. Beim Speichern gehen sie an den Dev-Server,
 * der sie in die Quelldateien schreibt.
 */
import { FIELDS, FONT_SIZE, FONT_WEIGHT, SPACING, applyField, previewStyle } from './tw-map.js';

const UPLOAD_URL = '/__visual-edit/upload';

const SRC_ATTR = 'data-ve';
/** Platzhalterzeile in Auswahlfeldern — nie ein echter Wert. */
const NONE = '__';
const SAVE_URL = '/__visual-edit/save';

/**
 * Auf welche Bildschirmbreiten sich eine Aenderung bezieht.
 * Tailwind arbeitet ab einer Breite aufwaerts — deshalb "ab", nicht "nur".
 */
const VARIANTS = [
  { label: 'Überall', value: '', hint: 'auf jedem Gerät' },
  { label: 'Ab Tablet', value: 'md:', hint: 'ab 768 px Breite' },
  { label: 'Ab Laptop', value: 'lg:', hint: 'ab 1024 px Breite' },
  { label: 'Maus darüber', value: 'hover:', hint: 'nur beim Überfahren' },
];
const VARIANTS_PRO = [
  { label: 'sm', value: 'sm:', hint: 'ab 640 px' },
  { label: 'xl', value: 'xl:', hint: 'ab 1280 px' },
];

/** Technische Tag-Namen in etwas, das man ohne HTML-Kenntnisse versteht. */
const ELEMENT_NAMES = {
  h1: 'Überschrift (groß)', h2: 'Überschrift', h3: 'Zwischenüberschrift',
  h4: 'Zwischenüberschrift', h5: 'Zwischenüberschrift', h6: 'Zwischenüberschrift',
  p: 'Absatz', a: 'Link', img: 'Bild', button: 'Schaltfläche',
  input: 'Eingabefeld', textarea: 'Textfeld', label: 'Feldbeschriftung',
  ul: 'Liste', ol: 'Nummerierte Liste', li: 'Listenpunkt',
  nav: 'Navigation', header: 'Kopfbereich', footer: 'Fußbereich',
  section: 'Abschnitt', article: 'Artikel', aside: 'Randspalte',
  div: 'Bereich', span: 'Textstück', form: 'Formular', svg: 'Symbol',
  table: 'Tabelle', td: 'Tabellenzelle', th: 'Tabellenkopf',
};
const elementName = (tag) => ELEMENT_NAMES[tag] || tag;

/** Tailwind-Kuerzel -> tatsaechliche Pixelgroesse, damit Zahlen etwas sagen. */
const FONT_PX = { xs: '12', sm: '14', base: '16', lg: '18', xl: '20', '2xl': '24',
  '3xl': '30', '4xl': '36', '5xl': '48', '6xl': '60', '7xl': '72', '8xl': '96', '9xl': '128' };

/** Gaengige Abstaende als Pixelwerte statt als Tailwind-Stufen. */
const SPACING_STEPS = [
  ['0', '0'], ['1', '4'], ['2', '8'], ['3', '12'], ['4', '16'], ['6', '24'],
  ['8', '32'], ['10', '40'], ['12', '48'], ['16', '64'], ['20', '80'], ['24', '96'],
];
const spacingOptions = (leer) => [[NONE, leer], ...SPACING_STEPS.map(([v, px]) => [v, `${px}`])];

const state = {
  selected: null,
  variant: '',
  /** Map<src, {add:[], remove:[], texts:[{find,value}], ops:[]}> */
  edits: new Map(),
  history: [],
  picking: true,
  /** Element, das gerade direkt auf der Seite beschrieben wird. */
  editing: null,
  editingSnapshot: null,
  /** Blendet Klassen, Quellpfade und zusaetzliche Breakpoints ein. */
  pro: (() => { try { return localStorage.getItem('visual-edit-pro') === '1'; } catch { return false; } })(),
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const srcOf = (el) => el?.getAttribute?.(SRC_ATTR) || null;

/** Alle DOM-Knoten, die aus derselben JSX-Stelle stammen. */
const twins = (src) => Array.from(document.querySelectorAll(`[${SRC_ATTR}="${CSS.escape(src)}"]`));

const isOverlay = (el) => el?.closest?.('#visual-edit-root') != null;

/** Naechstes Element mit Quellinfo (Text-Wrapper haben oft keine). */
function pickable(el) {
  while (el && el !== document.body) {
    if (srcOf(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function editFor(src) {
  if (!state.edits.has(src)) {
    state.edits.set(src, { src, add: [], remove: [], texts: [], ops: [] });
  }
  return state.edits.get(src);
}

/** Klassenliste eines Elements inklusive der noch nicht gespeicherten Aenderungen. */
function effectiveClasses(el) {
  return (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Aenderungen anwenden
// ---------------------------------------------------------------------------

function setField(fieldKey, value) {
  const el = state.selected;
  if (!el) return;
  const src = srcOf(el);
  const before = effectiveClasses(el);
  const after = applyField(before, fieldKey, value, state.variant);

  state.history.push({ src, classes: before.slice(), text: null });

  const edit = editFor(src);
  edit.remove.push(...before.filter((c) => !after.includes(c)));
  edit.add = edit.add.filter((c) => after.includes(c));
  edit.add.push(...after.filter((c) => !before.includes(c)));

  const styles = state.variant === '' ? previewStyle(fieldKey, value) : {};
  for (const node of twins(src)) {
    node.setAttribute('class', after.join(' '));
    // Live-Vorschau: neue Tailwind-Klassen existieren im kompilierten CSS noch
    // nicht, deshalb zusaetzlich als Inline-Style setzen.
    for (const [prop, val] of Object.entries(styles)) {
      if (val === '' || val == null) node.style.removeProperty(prop);
      else node.style.setProperty(prop, val, 'important');
    }
  }
  render();
}

function addRawClasses(raw) {
  const el = state.selected;
  if (!el) return;
  const src = srcOf(el);
  const before = effectiveClasses(el);
  state.history.push({ src, classes: before.slice(), text: null });

  const incoming = raw.split(/\s+/).filter(Boolean);
  const after = [...before];
  for (const c of incoming) if (!after.includes(c)) after.push(c);

  const edit = editFor(src);
  edit.add.push(...incoming.filter((c) => !before.includes(c)));
  for (const node of twins(src)) node.setAttribute('class', after.join(' '));
  render();
}

function removeClass(cls) {
  const el = state.selected;
  if (!el) return;
  const src = srcOf(el);
  const before = effectiveClasses(el);
  state.history.push({ src, classes: before.slice(), text: null });

  const after = before.filter((c) => c !== cls);
  const edit = editFor(src);
  edit.add = edit.add.filter((c) => c !== cls);
  if (!edit.add.includes(cls)) edit.remove.push(cls);
  for (const node of twins(src)) node.setAttribute('class', after.join(' '));
  render();
}

// --- Text ------------------------------------------------------------------

/**
 * Direkte Kind-Textknoten mit Inhalt. Jeder davon entspricht einem JSXText
 * im Quellcode und ist einzeln patchbar — deshalb bleibt
 * `Ihre Website<br/>endlich sichtbar.` in zwei getrennten Stuecken bearbeitbar.
 */
function textNodes(el) {
  return [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim() !== '');
}

/**
 * Urspruenglicher Inhalt eines Textknotens. Er dient als Anker beim
 * Zurueckschreiben — ueber einen Index waere die Zuordnung unsicher, weil
 * `{variable}` im DOM einen Textknoten erzeugt, im JSX aber keinen JSXText.
 */
const originals = new WeakMap();
function originalOf(node) {
  if (!originals.has(node)) originals.set(node, node.textContent.trim());
  return originals.get(node);
}

/** Traegt die Aenderung eines Textknotens ein und zieht die Zwillinge nach. */
function recordText(el, index, newValue) {
  const src = srcOf(el);
  const nodes = textNodes(el);
  const node = nodes[index];
  if (!node) return;

  const find = originalOf(node);
  if (find === newValue.trim()) return;

  state.history.push({ src, classes: null, texts: nodes.map((n) => n.textContent) });

  const edit = editFor(src);
  const known = edit.texts.find((t) => t.find === find);
  if (known) known.value = newValue;
  else edit.texts.push({ find, value: newValue });

  for (const twin of twins(src)) {
    const tn = textNodes(twin)[index];
    if (tn && tn.textContent !== newValue) tn.textContent = newValue;
  }
}

/** Direktes Schreiben auf der Seite starten (Doppelklick). */
function startTextEdit(el) {
  const nodes = textNodes(el);
  if (!nodes.length) return toast('Dieses Element enthaelt keinen direkten Text.', true);

  state.editing = el;
  state.picking = false;
  state.editingSnapshot = nodes.map((n) => { originalOf(n); return n.textContent; });

  el.setAttribute('contenteditable', 'plaintext-only');
  el.dataset.vePrevOutline = el.style.outline || '';
  el.style.outline = '2px solid #1f6feb';
  el.focus();
  hoverBox.style.display = 'none';
  toast('Direkt tippen — Enter uebernimmt, Esc verwirft.');
}

function endTextEdit(keep) {
  const el = state.editing;
  if (!el) return;
  const nodes = textNodes(el);
  const snapshot = state.editingSnapshot;

  el.removeAttribute('contenteditable');
  el.style.outline = el.dataset.vePrevOutline || '';
  delete el.dataset.vePrevOutline;
  state.editing = null;
  state.picking = true;

  if (!keep) {
    nodes.forEach((n, i) => { if (snapshot[i] != null) n.textContent = snapshot[i]; });
    return render();
  }

  // Wurde beim Tippen die Struktur zerlegt, ist die Zuordnung zum Quellcode
  // nicht mehr sicher — dann lieber gar nichts schreiben.
  if (nodes.length !== snapshot.length) {
    nodes.forEach((n, i) => { if (snapshot[i] != null) n.textContent = snapshot[i]; });
    toast('Struktur veraendert — Text nicht uebernommen.', true);
    return render();
  }

  nodes.forEach((n, i) => {
    if (n.textContent.trim() !== snapshot[i].trim()) recordText(el, i, n.textContent.trim());
  });
  render();
}

/** Setzt ein Attribut am Element — derzeit die Bildquelle. */
function setAttr(name, value) {
  const el = state.selected;
  if (!el) return;
  const src = srcOf(el);
  const edit = editFor(src);
  edit.attrs = { ...(edit.attrs || {}), [name]: value };
  for (const node of twins(src)) {
    if (value === null) node.removeAttribute(name);
    else node.setAttribute(name, value === true ? '' : value);
  }

  // Ein Link in neuem Tab ohne noopener ist ein bekanntes Sicherheitsloch —
  // deshalb wird rel hier automatisch mitgesetzt.
  if (name === 'target' && value === '_blank' && !el.getAttribute('rel')) {
    edit.attrs.rel = 'noopener noreferrer';
    for (const node of twins(src)) node.setAttribute('rel', 'noopener noreferrer');
  }
  render();
}

/** Alle Attribut-Textfelder des Panels uebernehmen. */
function applyAttrFields() {
  const el = state.selected;
  if (!el) return;
  for (const input of ui.querySelectorAll('.ve-attr')) {
    const name = input.dataset.name;
    const value = input.value.trim();
    const current = el.getAttribute(name) ?? '';
    if (value === current) continue;
    setAttr(name, value === '' ? null : value);
  }
}

/** Bild vom Rechner hochladen und als Quelle setzen. */
async function uploadImage(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Das ist kein Bild.', true);
  if (file.size > 8 * 1024 * 1024) return toast('Bild groesser als 8 MB.', true);

  toast(`${file.name} wird hochgeladen …`);
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, dataUrl }),
  }).catch(() => null);

  if (!res || !res.ok) return toast('Upload fehlgeschlagen.', true);
  const { url } = await res.json();
  setAttr('src', url);
  toast(`Bild gesetzt: ${url}`);
}

/** Textfeld im Panel. */
function setText(index, newText) {
  const el = state.selected;
  if (!el) return;
  recordText(el, index, newText);
  render();
}

function structuralOp(kind) {
  const el = state.selected;
  if (!el) return;
  const src = srcOf(el);
  editFor(src).ops.push(kind);

  if (kind === 'delete') {
    for (const node of twins(src)) node.style.display = 'none';
    select(null);
  } else if (kind === 'duplicate') {
    for (const node of twins(src)) {
      const copy = node.cloneNode(true);
      node.after(copy);
    }
  }
  render();
}

function undo() {
  const last = state.history.pop();
  if (!last) return;
  for (const node of twins(last.src)) {
    if (last.classes) node.setAttribute('class', last.classes.join(' '));
    if (last.texts) {
      textNodes(node).forEach((n, i) => { if (last.texts[i] != null) n.textContent = last.texts[i]; });
    }
  }
  // Der Edit-Eintrag wird beim naechsten Setzen ohnehin neu aufgebaut;
  // hier reicht es, ihn zu verwerfen, wenn nichts mehr offen ist.
  state.edits.delete(last.src);
  render();
}

// ---------------------------------------------------------------------------
// Auswahl & Highlight
// ---------------------------------------------------------------------------

const makeBox = () => (typeof document === 'undefined' ? null : document.createElement('div'));
const hoverBox = makeBox();
const selectBox = makeBox();

function styleBox(box, color) {
  if (!box) return;
  Object.assign(box.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '2147483646',
    border: `2px solid ${color}`, borderRadius: '2px', display: 'none',
    transition: 'all .06s ease-out',
  });
}

function placeBox(box, el) {
  if (!box) return;
  if (!el) { box.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  Object.assign(box.style, {
    display: 'block', top: `${r.top}px`, left: `${r.left}px`,
    width: `${r.width}px`, height: `${r.height}px`,
  });
}

function select(el) {
  state.selected = el;
  placeBox(selectBox, el);
  render();
}

// ---------------------------------------------------------------------------
// Speichern
// ---------------------------------------------------------------------------

async function save() {
  const payload = [...state.edits.values()]
    .filter((e) => e.add.length || e.remove.length || e.texts.length || e.ops.length || e.attrs)
    .map((e) => ({
      src: e.src,
      attrs: e.attrs || null,
      add: [...new Set(e.add)],
      remove: [...new Set(e.remove)].filter((c) => !e.add.includes(c)),
      texts: e.texts,
      ops: e.ops,
    }));

  if (!payload.length) return toast('Nichts zu speichern.');

  const res = await fetch(SAVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits: payload }),
  }).catch(() => null);

  if (!res || !res.ok) return toast('Speichern fehlgeschlagen — laeuft der Dev-Server?', true);
  const data = await res.json();
  state.edits.clear();
  state.history.length = 0;
  toast(`${data.files} Datei(en) geschrieben, ${data.changes} Aenderungen.`);
  render();
}

/**
 * Stellt die Dateien so wieder her, wie sie vor der letzten Speicherung waren.
 * Gedacht fuer alle, die kein git benutzen — mit Rueckfrage, damit niemand
 * versehentlich Arbeit verliert.
 */
async function revertLastSave() {
  const ok = window.confirm(
    'Den Stand vor der letzten Speicherung wiederherstellen?\n\n' +
    'Alles, was seitdem gespeichert wurde, geht dabei verloren.'
  );
  if (!ok) return;

  const res = await fetch('/__visual-edit/undo', { method: 'POST' }).catch(() => null);
  if (!res || !res.ok) return toast('Wiederherstellen fehlgeschlagen.', true);

  const daten = await res.json();
  if (!daten.files) return toast('Es gibt keine gespeicherte Fassung zum Zurückgehen.', true);
  toast(`${daten.files} Datei(en) wiederhergestellt.`);
}

function toast(msg, isError = false) {
  const t = ui.querySelector('#toast');
  t.textContent = msg;
  t.style.background = isError ? '#b91c1c' : '#166534';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3200);
}

// ---------------------------------------------------------------------------
// Panel-UI (Shadow DOM, damit Projekt-CSS nicht hineinwirkt)
// ---------------------------------------------------------------------------

const host = typeof document === 'undefined' ? null : document.createElement('div');
if (host) host.id = 'visual-edit-root';
const ui = host ? host.attachShadow({ mode: 'open' }) : null;

const CSS_PANEL = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif; }
#panel {
  position: fixed; top: 12px; right: 12px; bottom: 12px; width: 312px;
  background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 12px;
  display: flex; flex-direction: column; z-index: 2147483647;
  box-shadow: 0 24px 60px rgba(0,0,0,.5); font-size: 12px; overflow: hidden;
}
#panel.collapsed { bottom: auto; }
header { padding: 10px 12px; border-bottom: 1px solid #21262d; display: flex;
  align-items: center; gap: 8px; }
header b { font-size: 12px; font-weight: 600; letter-spacing: .02em; flex: 1; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #f0a818; }
#body { flex: 1; overflow-y: auto; padding: 10px 12px 16px; }
#body::-webkit-scrollbar { width: 8px; }
#body::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
footer { padding: 10px 12px; border-top: 1px solid #21262d; display: flex; gap: 6px;
  align-items: center; }
#revert { font-size: 10px; padding: 5px 7px; white-space: nowrap; }
button {
  background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px;
  padding: 5px 9px; cursor: pointer; font-size: 11px; line-height: 1.4;
}
button:hover { background: #30363d; }
button.on { background: #f0a818; border-color: #f0a818; color: #0d1117; font-weight: 600; }
button.primary { background: #238636; border-color: #2ea043; color: #fff; font-weight: 600;
  flex: 1; padding: 7px; }
button.primary:hover { background: #2ea043; }
button.ghost { background: transparent; }
button.danger:hover { background: #b91c1c; border-color: #b91c1c; }
.sec { margin-top: 14px; }
.head { padding-bottom: 8px; border-bottom: 1px solid #21262d; }
.head b { font-size: 13px; }
.note { color: #d29922; margin-top: 4px; line-height: 1.5; }
.help { color: #7d8590; line-height: 1.5; margin: 4px 0 6px; }
.dim { color: #7d8590; }
.mt { margin-top: 8px !important; }
.grid5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.sec > .lbl, .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  color: #7d8590; margin-bottom: 6px; font-weight: 600; }
.row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
select, input[type=text], textarea {
  background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px;
  padding: 5px 7px; font-size: 11px; width: 100%; font-family: inherit;
}
textarea { resize: vertical; min-height: 48px; line-height: 1.5; }
textarea.ve-txt + textarea.ve-txt { margin-top: 4px; }
input[type=color] { width: 28px; height: 26px; padding: 0; border: 1px solid #30363d;
  border-radius: 6px; background: none; cursor: pointer; }
.chip { background: #1c2128; border: 1px solid #30363d; border-radius: 5px;
  padding: 2px 5px; font-family: ui-monospace, monospace; font-size: 10px;
  cursor: pointer; color: #9198a1; }
.chip:hover { border-color: #b91c1c; color: #f85149; }
.warn { background: #2d1a06; border: 1px solid #7a4a10; border-radius: 7px;
  padding: 7px 9px; margin-top: 10px; color: #f0c98a; line-height: 1.5; }
.warn div + div { margin-top: 4px; }
.chk { display: flex; align-items: center; gap: 6px; margin-top: 7px; cursor: pointer; }
.chk input { accent-color: #f0a818; }
.imgprev { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
  padding: 6px; display: flex; align-items: center; justify-content: center;
  min-height: 74px; }
.imgprev img { max-width: 100%; max-height: 120px; object-fit: contain; display: block; }
.path { font-family: ui-monospace, monospace; font-size: 10px; color: #7d8590;
  word-break: break-all; line-height: 1.5; }
.empty { color: #adbac7; text-align: center; padding: 28px 10px; line-height: 1.8; }
.empty b { color: #e6edf3; font-size: 13px; }
kbd { background: #21262d; border: 1px solid #30363d; border-radius: 4px;
  padding: 1px 5px; font-family: ui-monospace, monospace; font-size: 10px; }
#toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
  background: #166534; color: #fff; padding: 9px 16px; border-radius: 8px;
  font-size: 12px; opacity: 0; transition: opacity .25s; z-index: 2147483647;
  pointer-events: none; }
.count { background: #1f6feb; color: #fff; border-radius: 9px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; }
`;

if (ui) ui.innerHTML = `<style>${CSS_PANEL}</style>
<div id="panel">
  <header>
    <span class="dot"></span><b>Seiten-Editor</b>
    <span class="count" id="cnt" title="offene Änderungen">0</span>
    <button class="ghost" id="pro" title="Technische Details ein-/ausblenden">Profi</button>
    <button class="ghost" id="toggle" title="Ein-/ausklappen">–</button>
  </header>
  <div id="body"></div>
  <footer>
    <button class="ghost" id="undo" title="Letzte Änderung zurücknehmen (Cmd+Z)">↺</button>
    <button class="ghost" id="revert" title="Den Stand vor der letzten Speicherung wiederherstellen">Zurück zum letzten Stand</button>
    <button class="primary" id="save">Änderungen speichern</button>
  </footer>
</div>
<div id="toast"></div>`;

// --- Bausteine --------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function section(label, inner) {
  return `<div class="sec"><div class="lbl">${label}</div>${inner}</div>`;
}

function btnGroup(field, options, current, cls = 'row') {
  return `<div class="${cls}">` + options.map((o) => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    const active = current === value ? ' on' : '';
    return `<button class="ve-set${active}" data-field="${field}" data-value="${esc(value)}">${esc(label)}</button>`;
  }).join('') + '</div>';
}

function selectBox_(field, options, current) {
  return `<select class="ve-set-sel" data-field="${field}">` +
    options.map((o) => {
      const [value, label] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('') + '</select>';
}

/** Liest den aktuell wirksamen Wert aus dem berechneten Stil. */
function computedOf(el, prop) {
  return el ? getComputedStyle(el).getPropertyValue(prop).trim() : '';
}

function rgbToHex(rgb) {
  const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
}

/** Farb-Token aus dem Projekt (shadcn/Tailwind-CSS-Variablen). */
function projectTokens() {
  const names = ['primary', 'secondary', 'accent', 'muted', 'background', 'foreground',
    'destructive', 'border', 'card'];
  const root = getComputedStyle(document.documentElement);
  return names.filter((n) => root.getPropertyValue(`--${n}`).trim() !== '');
}

/**
 * Attribute je Elementtyp. `href` wird beim Zurueckschreiben auf `to`
 * abgebildet, falls der Quellcode React Routers <Link> verwendet.
 */
const ATTR_FIELDS = {
  a: [
    { name: 'href', label: 'Linkziel', ph: '/preise oder https://…' },
    { name: 'target', label: 'Öffnen in', options: [['', 'gleicher Tab'], ['_blank', 'neuem Tab']] },
    { name: 'title', label: 'Tooltip beim Überfahren' },
    { name: 'aria-label', label: 'Vorlesetext', ph: 'nur nötig, wenn kein sichtbarer Text' },
  ],
  img: [
    { name: 'alt', label: 'Alt-Text', ph: 'Was ist zu sehen?' },
    { name: 'title', label: 'Tooltip' },
    { name: 'loading', label: 'Laden', options: [['', 'Standard'], ['lazy', 'verzögert'], ['eager', 'sofort']] },
  ],
  button: [
    { name: 'type', label: 'Typ', options: [['', 'Standard'], ['button', 'button'], ['submit', 'submit'], ['reset', 'reset']] },
    { name: 'aria-label', label: 'Vorlesetext' },
    { name: 'title', label: 'Tooltip' },
    { name: 'disabled', label: 'Deaktiviert', bool: true },
  ],
  input: [
    { name: 'placeholder', label: 'Platzhalter' },
    { name: 'type', label: 'Typ', options: [['text', 'Text'], ['email', 'E-Mail'], ['password', 'Passwort'], ['number', 'Zahl'], ['tel', 'Telefon']] },
    { name: 'name', label: 'Feldname' },
    { name: 'required', label: 'Pflichtfeld', bool: true },
  ],
  textarea: [
    { name: 'placeholder', label: 'Platzhalter' },
    { name: 'rows', label: 'Zeilen' },
  ],
};

/** Attribute, die an jedem Element sinnvoll sind. */
const ATTR_COMMON = [
  { name: 'id', label: 'Anker-ID', ph: 'für Sprungmarken wie #preise' },
];

/**
 * Prueft, was an diesem Element fuer Barrierefreiheit und Sicherheit fehlt.
 * Das sind Pflichten (BFSG, DSGVO-nahe Sorgfalt), die beim visuellen
 * Arbeiten sonst reihenweise untergehen.
 */
function warnings(el, tag) {
  const out = [];
  const attr = (n) => el.getAttribute(n);
  const sichtbarerText = el.textContent.trim().length > 0;

  if (tag === 'img' && !attr('alt')) {
    out.push('Ohne Alt-Text: Screenreader überspringen das Bild.');
  }
  if (tag === 'a') {
    const ziel = attr('href');
    if (!ziel || ziel === '#') out.push('Kein Linkziel gesetzt.');
    if (attr('target') === '_blank' && !(attr('rel') || '').includes('noopener')) {
      out.push('Neuer Tab ohne rel="noopener" — wird beim Setzen ergänzt.');
    }
  }
  if ((tag === 'a' || tag === 'button') && !sichtbarerText
      && !attr('aria-label') && !attr('title')) {
    out.push('Nur Symbol, kein Text: Vorlesetext fehlt.');
  }
  return out;
}

// --- Render -----------------------------------------------------------------

function render() {
  const el = state.selected;
  const body = ui.querySelector('#body');
  // Aenderungen veraendern oft die Elementgroesse — Rahmen nachziehen.
  requestAnimationFrame(() => placeBox(selectBox, state.selected));
  const nEdits = [...state.edits.values()]
    .filter((e) => e.add.length || e.remove.length || e.texts.length || e.ops.length || e.attrs).length;
  ui.querySelector('#cnt').textContent = nEdits;
  ui.querySelector('#pro').classList.toggle('on', state.pro);

  if (!el) {
    body.innerHTML = `<div class="empty">
      <b>Klick auf etwas, das du ändern willst.</b><br><br>
      Doppelklick auf einen Text schreibt ihn direkt um.<br>
      Ein Bild lässt sich per Ziehen austauschen.<br><br>
      <span class="dim">Zum Bedienen der Seite selbst — Links anklicken,
      Menüs öffnen — halte <kbd>Alt</kbd> gedrückt.</span>
    </div>`;
    return;
  }

  const src = srcOf(el);
  const classes = effectiveClasses(el);
  const sameCount = twins(src).length;
  const tokens = projectTokens();
  const tag = el.tagName.toLowerCase();
  const texts = textNodes(el);
  const attrFields = [...(ATTR_FIELDS[tag] || []), ...ATTR_COMMON];
  const warn = warnings(el, tag);
  const variants = state.pro ? [...VARIANTS, ...VARIANTS_PRO] : VARIANTS;

  const colorHex = rgbToHex(computedOf(el, 'color'));
  const bgHex = rgbToHex(computedOf(el, 'background-color'));

  body.innerHTML = `
    <div class="head">
      <b>${esc(elementName(tag))}</b>
      ${sameCount > 1 ? `<div class="note">Kommt ${sameCount}× auf der Seite vor —
        die Änderung gilt für alle.</div>` : ''}
      ${state.pro ? `<div class="path">&lt;${tag}&gt; · ${esc(src)}</div>` : ''}
    </div>

    ${warn.length ? `<div class="warn">${warn.map((w) => `<div>${esc(w)}</div>`).join('')}</div>` : ''}

    ${section('Wo soll die Änderung gelten?', `
      <div class="row">${variants.map((v) =>
        `<button class="ve-variant${state.variant === v.value ? ' on' : ''}"
           data-v="${v.value}" title="${esc(v.hint)}">${esc(v.label)}</button>`).join('')}</div>
      <div class="help">${esc(variants.find((v) => v.value === state.variant)?.hint || '')} —
        alles Weitere unten bezieht sich darauf.</div>`)}

    ${texts.length ? section(`Text${texts.length > 1 ? ` (${texts.length} Stellen)` : ''}`,
      texts.map((n, i) =>
        `<textarea class="ve-txt" data-i="${i}">${esc(n.textContent.trim())}</textarea>`).join('')
      + `<div class="row" style="margin-top:4px">
           <button id="txt-apply">Übernehmen</button>
           <span class="dim">oder auf der Seite doppelklicken</span>
         </div>`) : ''}

    ${tag === 'img' ? section('Bild', `
      <div class="imgprev"><img src="${esc(el.getAttribute('src') || '')}" alt=""></div>
      <div class="row" style="margin-top:6px">
        <button id="pick-img">Bild auswählen …</button>
        <span class="dim">oder hierher ziehen</span>
      </div>
      <input type="file" id="file-img" accept="image/*" style="display:none">
      <div style="height:6px"></div>
      <input type="text" id="img-url" placeholder="oder Bild-Adresse eintragen"
             value="${esc(el.getAttribute('src') || '')}">
      <div class="row" style="margin-top:4px"><button id="img-url-apply">Adresse übernehmen</button></div>
      <div class="lbl mt">Wie soll das Bild den Platz füllen?</div>
      ${btnGroup('objectFit', [['cover','füllt aus'],['contain','ganz sichtbar'],
        ['fill','verzerrt'],['none','Originalgröße']], null, 'grid2')}
      <div class="lbl mt">Seitenverhältnis</div>
      ${btnGroup('aspectRatio', [['auto','automatisch'],['square','quadratisch'],['video','16:9']], null, 'grid3')}`) : ''}

    ${attrFields.length ? section(tag === 'a' ? 'Link' : 'Einstellungen',
      attrFields.map((f) => {
        const cur = el.getAttribute(f.name);
        if (f.bool) {
          return `<label class="chk"><input type="checkbox" class="ve-attr-bool"
            data-name="${f.name}"${cur !== null ? ' checked' : ''}> ${esc(f.label)}</label>`;
        }
        if (f.options) {
          return `<div class="lbl mt">${esc(f.label)}</div>
            <select class="ve-attr-sel" data-name="${f.name}">${f.options.map(([v, l]) =>
              `<option value="${esc(v)}"${(cur || '') === v ? ' selected' : ''}>${esc(l)}</option>`
            ).join('')}</select>`;
        }
        return `<div class="lbl mt">${esc(f.label)}</div>
          <input type="text" class="ve-attr" data-name="${f.name}"
                 placeholder="${esc(f.ph || '')}" value="${esc(cur ?? '')}">`;
      }).join('')
      + `<div class="row" style="margin-top:6px">
           <button id="attr-apply">Übernehmen</button>
           <span class="dim">Feld leeren = Angabe entfernen</span>
         </div>`) : ''}

    ${section('Schrift', `
      <div class="lbl">Größe <span class="dim">in Pixel</span></div>
      ${btnGroup('fontSize', Object.entries(FONT_PX).map(([k, px]) => [k, px]), null, 'grid5')}
      <div class="lbl mt">Stärke</div>
      ${btnGroup('fontWeight', [['light','dünn'],['normal','normal'],['medium','kräftig'],
        ['semibold','halbfett'],['bold','fett'],['extrabold','sehr fett']], null, 'grid3')}
      <div class="lbl mt">Ausrichtung</div>
      ${btnGroup('textAlign', [['left','links'],['center','mittig'],['right','rechts'],
        ['justify','Blocksatz']], null, 'grid4')}
      <div class="lbl mt">Abstände im Text</div>
      <div class="grid2">
        ${selectBox_('lineHeight', [[NONE,'Zeilenabstand'],['tight','eng'],['snug','etwas eng'],
          ['normal','normal'],['relaxed','locker'],['loose','weit']], NONE)}
        ${selectBox_('letterSpacing', [[NONE,'Buchstabenabstand'],['tighter','sehr eng'],['tight','eng'],
          ['normal','normal'],['wide','weit'],['wider','sehr weit']], NONE)}
      </div>`)}

    ${section('Farben', `
      <div class="row">
        <input type="color" class="ve-color" data-field="color" value="${colorHex}">
        <span class="dim">Schrift</span>
        <input type="color" class="ve-color" data-field="backgroundColor" value="${bgHex}">
        <span class="dim">Hintergrund</span>
      </div>
      ${tokens.length ? `
        <div class="lbl mt">Hintergrund aus den Farben dieser Website</div>
        <div class="row">${tokens.map((t) =>
          `<button class="ve-set" data-field="backgroundColor" data-value="${t}">${t}</button>`).join('')}</div>
        <div class="lbl mt">Schrift aus den Farben dieser Website</div>
        <div class="row">${tokens.map((t) =>
          `<button class="ve-set" data-field="color" data-value="${t}">${t}</button>`).join('')}</div>` : ''}`)}

    ${section('Abstand nach innen', `
      <div class="help">Luft zwischen Rand und Inhalt, in Pixel.</div>
      <div class="grid2">
        ${selectBox_('padding', spacingOptions('rundum'), '')}
        ${selectBox_('gap', spacingOptions('zwischen Elementen'), '')}
      </div>
      <div class="lbl mt">Einzelne Seiten</div>
      <div class="grid4">
        ${selectBox_('paddingTop', spacingOptions('oben'), '')}
        ${selectBox_('paddingRight', spacingOptions('rechts'), '')}
        ${selectBox_('paddingBottom', spacingOptions('unten'), '')}
        ${selectBox_('paddingLeft', spacingOptions('links'), '')}
      </div>`)}

    ${section('Abstand nach außen', `
      <div class="help">Luft zu den Nachbarelementen, in Pixel.</div>
      <div class="grid4">
        ${selectBox_('marginTop', spacingOptions('oben'), '')}
        ${selectBox_('marginRight', spacingOptions('rechts'), '')}
        ${selectBox_('marginBottom', spacingOptions('unten'), '')}
        ${selectBox_('marginLeft', spacingOptions('links'), '')}
      </div>`)}

    ${section('Anordnung', `
      <div class="lbl">Wie liegen die Inhalte darin?</div>
      ${btnGroup('display', [['block','untereinander'],['flex','nebeneinander'],
        ['grid','Raster'],['hidden','ausblenden']], null, 'grid2')}
      <div class="lbl mt">Richtung</div>
      ${btnGroup('flexDirection', [['flex-row','waagerecht'],['flex-col','senkrecht']], null, 'grid2')}
      <div class="lbl mt">Ausrichtung</div>
      <div class="grid2">
        ${selectBox_('justifyContent', [[NONE,'in Laufrichtung'],['start','Anfang'],['center','Mitte'],
          ['end','Ende'],['between','verteilt'],['around','gleichmäßig']], NONE)}
        ${selectBox_('alignItems', [[NONE,'quer dazu'],['start','Anfang'],['center','Mitte'],
          ['end','Ende'],['stretch','gedehnt']], NONE)}
      </div>`)}

    ${section('Größe', `
      <div class="grid2">
        ${selectBox_('width', [[NONE,'Breite'],['full','volle Breite'],['auto','automatisch'],
          ['fit','so breit wie Inhalt'],['1/2','die Hälfte'],['1/3','ein Drittel'],
          ['2/3','zwei Drittel'],['1/4','ein Viertel'],['3/4','drei Viertel']], NONE)}
        ${selectBox_('maxWidth', [[NONE,'höchstens …'],['none','unbegrenzt'],['sm','384 px'],
          ['md','448 px'],['lg','512 px'],['xl','576 px'],['2xl','672 px'],['3xl','768 px'],
          ['4xl','896 px'],['5xl','1024 px'],['6xl','1152 px'],['7xl','1280 px'],
          ['prose','Lesebreite'],['full','volle Breite']], NONE)}
      </div>`)}

    ${section('Ecken, Schatten, Rahmen', `
      <div class="lbl">Ecken abrunden</div>
      ${btnGroup('borderRadius', [['none','eckig'],['sm','kaum'],['md','leicht'],['lg','deutlich'],
        ['xl','stark'],['2xl','sehr stark'],['full','rund']], null, 'grid4')}
      <div class="lbl mt">Schatten</div>
      ${btnGroup('boxShadow', [['none','keiner'],['sm','zart'],['md','leicht'],['lg','deutlich'],
        ['xl','stark'],['2xl','sehr stark'],['inner','nach innen']], null, 'grid4')}
      <div class="lbl mt">Rahmen</div>
      <div class="grid2">
        ${selectBox_('borderWidth', [[NONE,'Dicke rundum'],['0','keiner'],['','1 px'],['2','2 px'],
          ['4','4 px'],['8','8 px']], NONE)}
        ${selectBox_('borderStyle', [[NONE,'Linienart'],['border-solid','durchgezogen'],
          ['border-dashed','gestrichelt'],['border-dotted','gepunktet']], NONE)}
      </div>
      <div class="lbl mt">Nur eine Kante</div>
      <div class="grid4">
        ${selectBox_('borderTopWidth', [[NONE,'oben'],['','1'],['2','2'],['4','4'],['8','8']], NONE)}
        ${selectBox_('borderRightWidth', [[NONE,'rechts'],['','1'],['2','2'],['4','4'],['8','8']], NONE)}
        ${selectBox_('borderBottomWidth', [[NONE,'unten'],['','1'],['2','2'],['4','4'],['8','8']], NONE)}
        ${selectBox_('borderLeftWidth', [[NONE,'links'],['','1'],['2','2'],['4','4'],['8','8']], NONE)}
      </div>
      <div class="row mt">
        <input type="color" class="ve-color" data-field="borderColor"
               value="${rgbToHex(computedOf(el, 'border-top-color'))}">
        <span class="dim">Rahmenfarbe</span>
        ${selectBox_('opacity', [[NONE,'Sichtbarkeit'],['25','25 %'],['50','50 %'],['75','75 %'],
          ['90','90 %'],['100','voll']], NONE)}
      </div>`)}

    ${section('Bewegung', `
      <div class="lbl">Dauerhaft in Bewegung</div>
      ${btnGroup('animation', [['none','aus'],['pulse','pulsieren'],['bounce','hüpfen'],
        ['spin','drehen'],['ping','ping']], null, 'grid3')}
      <div class="lbl mt">Beim Erscheinen einblenden</div>
      <div class="grid2">
        <button class="ve-raw" data-raw="animate-in fade-in duration-700">sanft</button>
        <button class="ve-raw" data-raw="animate-in fade-in slide-in-from-bottom-4 duration-700">von unten</button>
        <button class="ve-raw" data-raw="animate-in fade-in slide-in-from-left-4 duration-700">von links</button>
        <button class="ve-raw" data-raw="animate-in zoom-in-95 duration-500">aufziehen</button>
      </div>
      <div class="lbl mt">Wenn die Maus darüber fährt</div>
      <div class="grid2">
        <button class="ve-raw" data-raw="transition-transform duration-300 hover:scale-105">größer werden</button>
        <button class="ve-raw" data-raw="transition-transform duration-300 hover:-translate-y-1">anheben</button>
        <button class="ve-raw" data-raw="transition-shadow duration-300 hover:shadow-xl">Schatten</button>
        <button class="ve-raw" data-raw="transition-opacity duration-300 hover:opacity-80">abblenden</button>
      </div>
      <div class="lbl mt">Tempo der Übergänge</div>
      ${btnGroup('duration', [['150','schnell'],['300','mittel'],['500','ruhig'],
        ['1000','langsam']], null, 'grid4')}`)}

    ${section('Element', `<div class="grid2">
      <button class="ve-op" data-op="duplicate">Kopie anlegen</button>
      <button class="ve-op danger" data-op="delete">Löschen</button>
      <button id="parent">Bereich darum wählen</button>
      <button id="deselect">Auswahl aufheben</button>
    </div>`)}

    ${state.pro ? section(`Technische Klassen (${classes.length})`, `
      <div class="help">Tailwind-Klassen dieses Elements. Klick entfernt eine.</div>
      <div class="row">${classes.map((c) =>
        `<span class="chip ve-rm" data-c="${esc(c)}">${esc(c)}</span>`).join('')
        || '<span class="dim">keine</span>'}</div>
      <div class="lbl mt">Eigene Klassen hinzufügen</div>
      <input type="text" id="raw" placeholder="z. B. backdrop-blur-sm ring-2">
      <div class="row" style="margin-top:4px"><button id="raw-apply">Hinzufügen</button></div>`) : ''}
  `;
}

// --- Ereignisse -------------------------------------------------------------

if (ui) ui.addEventListener('click', (e) => {
  const t = e.target;
  if (t.classList.contains('ve-set')) setField(t.dataset.field, t.dataset.value);
  else if (t.classList.contains('ve-variant')) { state.variant = t.dataset.v; render(); }
  else if (t.classList.contains('ve-rm')) removeClass(t.dataset.c);
  else if (t.classList.contains('ve-op')) structuralOp(t.dataset.op);
  else if (t.classList.contains('ve-raw')) addRawClasses(t.dataset.raw);
  else if (t.id === 'pick-img') ui.querySelector('#file-img').click();
  else if (t.id === 'attr-apply') applyAttrFields();
  else if (t.id === 'img-url-apply') {
    const v = ui.querySelector('#img-url').value.trim();
    if (v) setAttr('src', v);
  }
  else if (t.id === 'raw-apply') {
    const input = ui.querySelector('#raw');
    if (input.value.trim()) { addRawClasses(input.value.trim()); }
  } else if (t.id === 'txt-apply') {
    [...ui.querySelectorAll('.ve-txt')].forEach((ta) => setText(Number(ta.dataset.i), ta.value));
  }
  else if (t.id === 'parent') {
    const p = pickable(state.selected?.parentElement);
    if (p) select(p);
  }
  else if (t.id === 'deselect') select(null);
  else if (t.id === 'pro') {
    state.pro = !state.pro;
    try { localStorage.setItem('visual-edit-pro', state.pro ? '1' : '0'); } catch {}
    // Ein ausgeblendeter Breakpoint darf nicht aktiv bleiben.
    if (!state.pro && ['sm:', 'xl:'].includes(state.variant)) state.variant = '';
    render();
  }
  else if (t.id === 'revert') revertLastSave();
  else if (t.id === 'save') save();
  else if (t.id === 'undo') undo();
  else if (t.id === 'toggle') {
    const panel = ui.querySelector('#panel');
    panel.classList.toggle('collapsed');
    ui.querySelector('#body').style.display =
      panel.classList.contains('collapsed') ? 'none' : '';
    ui.querySelector('footer').style.display =
      panel.classList.contains('collapsed') ? 'none' : '';
    t.textContent = panel.classList.contains('collapsed') ? '+' : '–';
  }
});

if (ui) ui.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'file-img') { if (t.files[0]) uploadImage(t.files[0]); return; }
  if (t.classList.contains('ve-attr-sel')) return setAttr(t.dataset.name, t.value || null);
  if (t.classList.contains('ve-attr-bool')) return setAttr(t.dataset.name, t.checked || null);
  if (t.classList.contains('ve-set-sel')) {
    if (t.value !== NONE) setField(t.dataset.field, t.value);
  } else if (t.classList.contains('ve-color')) {
    setField(t.dataset.field, t.value);
  }
});

// Bild per Drag & Drop direkt auf ein <img> der Seite ziehen.
document.addEventListener('dragover', (e) => {
  const img = e.target?.closest?.('img[' + SRC_ATTR + ']');
  if (!img) return;
  e.preventDefault();
  placeBox(hoverBox, img);
}, true);

document.addEventListener('drop', (e) => {
  const img = e.target?.closest?.('img[' + SRC_ATTR + ']');
  const file = e.dataTransfer?.files?.[0];
  if (!img || !file) return;
  e.preventDefault();
  e.stopPropagation();
  select(img);
  uploadImage(file);
}, true);

// Auswahl auf der Seite
document.addEventListener('mouseover', (e) => {
  if (!state.picking || isOverlay(e.target)) return;
  placeBox(hoverBox, pickable(e.target));
}, true);

if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
  if (isOverlay(e.target)) return;
  if (e.altKey) return; // Alt gedrueckt = Seite normal bedienen

  // Im Schreibmodus: Klick innerhalb setzt nur den Cursor, Klick ausserhalb
  // uebernimmt den Text und waehlt normal weiter.
  if (state.editing) {
    if (state.editing.contains(e.target)) return;
    endTextEdit(true);
  }

  const el = pickable(e.target);
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  select(el);
}, true);

// Doppelklick schreibt direkt auf der Seite.
document.addEventListener('dblclick', (e) => {
  if (isOverlay(e.target) || e.altKey) return;
  const el = pickable(e.target);
  if (!el || state.editing === el) return;
  e.preventDefault();
  e.stopPropagation();
  if (state.editing) endTextEdit(true);
  select(el);
  startTextEdit(el);
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.editing) return endTextEdit(false);
    select(null); hoverBox.style.display = 'none';
  }
  if (e.key === 'Enter' && state.editing && !e.shiftKey) {
    e.preventDefault();
    return endTextEdit(true);
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
});

window.addEventListener('scroll', () => {
  placeBox(selectBox, state.selected);
  hoverBox.style.display = 'none';
}, true);
window.addEventListener('resize', () => placeBox(selectBox, state.selected));

// --- Start ------------------------------------------------------------------

function start() {
  // Bei serverseitigem Rendern gibt es kein DOM — dann passiert hier nichts.
  if (typeof document === 'undefined') return;
  // Mehrfaches Einhaengen verhindern (HTML-Injektion und Entry-Injektion
  // koennen sich je nach Projektform ueberschneiden).
  if (window.__visualEditActive) return;
  window.__visualEditActive = true;

  styleBox(hoverBox, 'rgba(240,168,24,.9)');
  styleBox(selectBox, '#1f6feb');
  selectBox.style.boxShadow = '0 0 0 1px rgba(31,111,235,.35)';
  document.body.append(hoverBox, selectBox, host);
  render();
  console.info('[visual-edit] aktiv — Element anklicken. Alt gedrueckt haelt die Seite bedienbar.');
}

if (typeof document !== 'undefined') {
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}
