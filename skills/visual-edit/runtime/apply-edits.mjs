/**
 * Schreibt die im Browser gesammelten Aenderungen in den JSX-Quellcode zurueck.
 *
 * Eingang pro Aenderung:
 *   { src: "src/pages/Index.tsx:42:6", add: [...], remove: [...],
 *     text: "..."|null, ops: ["delete"|"duplicate"] }
 *
 * Die Position stammt aus demselben Parse-Lauf, den das Vite-Plugin auf der
 * unveraenderten Datei macht — Zeile und Spalte treffen deshalb exakt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const PARSER_OPTIONS = {
  sourceType: 'module',
  errorRecovery: true,
  plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
};

/** Sammelt JSX-Elemente samt ihrem Opening-Tag. */
function collectElements(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const c of node) collectElements(c, out);
    return out;
  }
  if (node.type === 'JSXElement' && node.openingElement) {
    out.push({ element: node, opening: node.openingElement });
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const v = node[key];
    if (v && typeof v === 'object') collectElements(v, out);
  }
  return out;
}

/** Alle String-Literale unterhalb eines Knotens (fuer cn(...)-Argumente). */
function collectStrings(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const c of node) collectStrings(c, out);
    return out;
  }
  if (node.type === 'StringLiteral') out.push(node);
  if (node.type === 'TemplateLiteral') out.push(...node.quasis.map((q) => ({ ...q, _quasi: true })));
  for (const key of Object.keys(node)) {
    if (key === 'loc') continue;
    const v = node[key];
    if (v && typeof v === 'object') collectStrings(v, out);
  }
  return out;
}

const splitClasses = (s) => s.split(/\s+/).filter(Boolean);

/**
 * Namen, die in dieser Datei importiert werden.
 *
 * Damit laesst sich `src={heroBild}` (Import eines Assets — ersetzbar) von
 * `href={ziel}` (Prop oder lokale Variable — traegt Laufzeitdaten) trennen.
 */
function importedNames(ast) {
  const names = new Set();
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    for (const spec of node.specifiers) names.add(spec.local.name);
  }
  return names;
}

/** Entfernt Klassen aus einem Text und liefert das Ergebnis. */
function withoutClasses(text, remove) {
  if (!remove.length) return text;
  const kept = splitClasses(text).filter((c) => !remove.includes(c));
  return kept.join(' ');
}

/**
 * Baut die Textersetzungen fuer ein className-Attribut.
 * Liefert ein Array von { start, end, text } oder null, wenn die Form
 * nicht sicher bearbeitbar ist.
 */
function classNameEdits(opening, add, remove, code) {
  const attr = opening.attributes.find(
    (a) => a.type === 'JSXAttribute' && a.name?.name === 'className'
  );

  // Kein className vorhanden: neu anlegen.
  if (!attr) {
    if (!add.length) return [];
    return [{ start: opening.name.end, end: opening.name.end,
      text: ` className="${add.join(' ')}"` }];
  }

  const value = attr.value;

  // className="..."
  if (value?.type === 'StringLiteral') {
    const next = [...splitClasses(withoutClasses(value.value, remove))];
    for (const c of add) if (!next.includes(c)) next.push(c);
    return [{ start: value.start, end: value.end, text: JSON.stringify(next.join(' ')) }];
  }

  if (value?.type !== 'JSXExpressionContainer') return null;
  const expr = value.expression;

  // className={"..."}
  if (expr.type === 'StringLiteral') {
    const next = [...splitClasses(withoutClasses(expr.value, remove))];
    for (const c of add) if (!next.includes(c)) next.push(c);
    return [{ start: expr.start, end: expr.end, text: JSON.stringify(next.join(' ')) }];
  }

  // className={`... ${x} ...`}
  if (expr.type === 'TemplateLiteral') {
    const edits = [];
    for (const q of expr.quasis) {
      const raw = q.value.raw;
      const cleaned = withoutClasses(raw, remove);
      if (cleaned === raw.trim()) continue;
      // Umgebenden Leerraum so lassen, wie er war — sonst wandern
      // Klassen zusammen oder es entstehen doppelte Leerzeichen.
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      edits.push({ start: q.start, end: q.end, text: cleaned ? lead + cleaned + trail : (lead || trail) });
    }
    if (add.length) {
      const last = expr.quasis[expr.quasis.length - 1];
      edits.push({ start: last.end, end: last.end, text: ` ${add.join(' ')}` });
    }
    return edits;
  }

  // className={cn("...", cond && "...")} — der haeufigste Fall in shadcn-Projekten.
  if (expr.type === 'CallExpression') {
    const edits = [];
    for (const lit of collectStrings(expr.arguments)) {
      const raw = lit._quasi ? lit.value.raw : lit.value;
      const cleaned = withoutClasses(raw, remove);
      if (cleaned !== raw) {
        edits.push({ start: lit.start, end: lit.end,
          text: lit._quasi ? cleaned : JSON.stringify(cleaned) });
      }
    }
    if (add.length) {
      // Als letztes Argument anhaengen: cn()/twMerge laesst spaetere Klassen gewinnen.
      const lastArg = expr.arguments[expr.arguments.length - 1];
      const insertAt = lastArg ? lastArg.end : expr.callee.end + 1;
      edits.push({ start: insertAt, end: insertAt,
        text: `${lastArg ? ', ' : ''}${JSON.stringify(add.join(' '))}` });
    }
    return edits;
  }

  // className={styles.foo} o.ae. — hier wird nichts angefasst.
  return null;
}

/**
 * Ersetzt einzelne Textstellen eines Elements.
 *
 * Verankert wird ueber den bisherigen Inhalt, nicht ueber einen Index: im DOM
 * erzeugt auch `{variable}` einen Textknoten, im JSX gibt es dort aber keinen
 * JSXText — eine Zaehlung wuerde auseinanderlaufen.
 */
function textEdits(element, texts, code) {
  const nodes = element.children.filter(
    (c) => c.type === 'JSXText' && c.value.trim() !== ''
  );
  const edits = [];
  const misses = [];

  for (const { find, value } of texts) {
    const hits = nodes.filter((n) => n.value.trim() === find);
    if (hits.length === 0) { misses.push(`Text "${find}" nicht gefunden`); continue; }
    if (hits.length > 1) { misses.push(`Text "${find}" kommt mehrfach vor`); continue; }

    const node = hits[0];
    const raw = code.slice(node.start, node.end);
    const leading = raw.match(/^\s*/)[0];
    const trailing = raw.match(/\s*$/)[0];
    // Zeichen mit JSX-Bedeutung verlangen einen Ausdruck statt rohem Text.
    const body = /[{}<>]/.test(value) ? `{${JSON.stringify(value)}}` : value;
    edits.push({ start: node.start, end: node.end, text: leading + body + trailing });
  }
  return { edits, misses };
}

/**
 * Im DOM heisst es `href`, im Quellcode kann es `to` sein: React Router
 * rendert `<Link to="/preise">` als `<a href="/preise">`. Das Overlay sieht
 * nur das DOM — die Zuordnung passiert deshalb hier.
 */
const ATTR_ALIASES = {
  href: ['to', 'href'],
  src: ['src'],
};

/**
 * Setzt, aendert oder entfernt ein Attribut.
 *
 * Nur sichere Faelle werden angefasst: ein String, ein Bezeichner
 * (typischerweise ein importiertes Asset) oder ein fehlendes Attribut. Ein
 * zusammengesetzter Ausdruck wie `profile.logo_url` traegt Laufzeitdaten und
 * bleibt unberuehrt — ihn zu ersetzen wuerde Funktionalitaet zerstoeren.
 *
 * value === null entfernt das Attribut, value === true schreibt es ohne Wert.
 */
function attrEdit(opening, name, value, imported) {
  const candidates = ATTR_ALIASES[name] || [name];
  let attr = null;
  for (const c of candidates) {
    attr = opening.attributes.find(
      (a) => a.type === 'JSXAttribute' && a.name?.name === c
    );
    if (attr) break;
  }

  // Entfernen — mitsamt dem fuehrenden Leerzeichen.
  if (value === null) {
    if (!attr) return { edits: [] };
    // fuehrendes Leerzeichen mitnehmen
    return { edits: [{ start: attr.start - 1, end: attr.end, text: '' }] };
  }

  const written = value === true ? name : `${name}=${JSON.stringify(String(value))}`;

  if (!attr) {
    // Hinter dem letzten vorhandenen Attribut einfuegen — das haelt den Diff klein.
    const last = opening.attributes[opening.attributes.length - 1];
    const at = last ? last.end : opening.name.end;
    return { edits: [{ start: at, end: at, text: ` ${written}` }] };
  }

  // Bei einem Alias-Treffer den vorhandenen Namen behalten ("to" bleibt "to").
  const keptName = attr.name.name;
  const body = value === true ? keptName : `${keptName}=${JSON.stringify(String(value))}`;

  const v = attr.value;
  if (v === null) {
    // Bisher ohne Wert (z.B. `disabled`).
    return { edits: [{ start: attr.start, end: attr.end, text: body }] };
  }
  if (v.type === 'StringLiteral') {
    return { edits: [{ start: attr.start, end: attr.end, text: body }] };
  }
  if (v.type === 'JSXExpressionContainer') {
    const e = v.expression;
    if (e.type === 'StringLiteral' || e.type === 'BooleanLiteral') {
      return { edits: [{ start: attr.start, end: attr.end, text: body }] };
    }
    // Nur importierte Namen sind ersetzbar (typischerweise ein Asset).
    // Eine Prop oder lokale Variable bleibt unberuehrt.
    if (e.type === 'Identifier' && imported.has(e.name)) {
      return {
        edits: [{ start: attr.start, end: attr.end, text: body }],
        note: `Import "${e.name}" wird hier nicht mehr verwendet — pruefen, ob er noch woanders gebraucht wird`,
      };
    }
  }
  return { edits: null };
}

/** Einrueckung der Zeile, in der ein Element beginnt. */
function indentOf(code, offset) {
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  return code.slice(lineStart, offset).match(/^\s*/)[0];
}

/** Wie viele Sicherungen aufgehoben werden. */
const BACKUPS_BEHALTEN = 20;

/**
 * Legt eine Datei vor dem Ueberschreiben zur Seite.
 *
 * Das Versprechen "jede Aenderung laesst sich zuruecknehmen" darf nicht von
 * git-Kenntnissen abhaengen — viele Nutzer kommen von Website-Baukaesten.
 */
function sichern(abs, rel, root, stempel) {
  const ziel = path.join(root, '.visual-edit', 'backups', stempel, rel);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.copyFileSync(abs, ziel);
}

/** Aeltere Sicherungen entfernen, damit der Ordner nicht endlos waechst. */
function backupsAufraeumen(root) {
  const dir = path.join(root, '.visual-edit', 'backups');
  if (!fs.existsSync(dir)) return;
  const stände = fs.readdirSync(dir).sort();
  for (const alt of stände.slice(0, Math.max(0, stände.length - BACKUPS_BEHALTEN))) {
    fs.rmSync(path.join(dir, alt), { recursive: true, force: true });
  }
}

/**
 * Stellt den Stand vor der letzten Speicherung wieder her.
 * @returns {{files:number, at:string}|null}
 */
export function undoLastSave(root) {
  const dir = path.join(root, '.visual-edit', 'backups');
  if (!fs.existsSync(dir)) return null;
  const stände = fs.readdirSync(dir).sort();
  const letzter = stände[stände.length - 1];
  if (!letzter) return null;

  const basis = path.join(dir, letzter);
  let files = 0;
  const sammeln = (ordner) => {
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) { sammeln(voll); continue; }
      const rel = path.relative(basis, voll);
      fs.copyFileSync(voll, path.join(root, rel));
      files++;
    }
  };
  sammeln(basis);
  fs.rmSync(basis, { recursive: true, force: true });
  return { files, at: letzter };
}

/**
 * Wendet alle Aenderungen an.
 * @returns {{files:number, changes:number, skipped:string[], canUndo:boolean}}
 */
export function applyEdits(edits, root) {
  const byFile = new Map();
  for (const edit of edits) {
    const at = edit.src.lastIndexOf(':');
    const at2 = edit.src.lastIndexOf(':', at - 1);
    const file = edit.src.slice(0, at2);
    const line = Number(edit.src.slice(at2 + 1, at));
    const column = Number(edit.src.slice(at + 1));
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push({ ...edit, line, column });
  }

  const skipped = [];
  let files = 0;
  let changes = 0;
  const stempel = new Date().toISOString().replace(/[:.]/g, '-');

  for (const [rel, fileEdits] of byFile) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { skipped.push(`${rel}: Datei nicht gefunden`); continue; }

    const code = fs.readFileSync(abs, 'utf8');
    let ast;
    try {
      ast = parse(code, PARSER_OPTIONS);
    } catch (err) {
      skipped.push(`${rel}: nicht parsebar (${err.message})`);
      continue;
    }

    const elements = collectElements(ast);
    const imported = importedNames(ast);
    const ranges = [];

    for (const edit of fileEdits) {
      const hit = elements.find(
        (e) => e.opening.loc.start.line === edit.line
            && e.opening.loc.start.column === edit.column
      );
      if (!hit) {
        skipped.push(`${rel}:${edit.line}: Element nicht mehr an dieser Stelle` +
          ' (Datei zwischenzeitlich geaendert?)');
        continue;
      }

      if (edit.ops?.includes('delete')) {
        // Zeilenumbruch und Einrueckung mitnehmen, damit keine Leerzeile bleibt.
        const start = Math.max(0, code.lastIndexOf('\n', hit.element.start - 1));
        ranges.push({ start, end: hit.element.end, text: '', exclusive: true });
        changes++;
        continue;
      }

      if (edit.ops?.includes('duplicate')) {
        const indent = indentOf(code, hit.element.start);
        const source = code.slice(hit.element.start, hit.element.end);
        ranges.push({ start: hit.element.end, end: hit.element.end,
          text: `\n${indent}${source}` });
        changes++;
      }

      if (edit.add?.length || edit.remove?.length) {
        const classEdits = classNameEdits(hit.opening, edit.add || [], edit.remove || [], code);
        if (classEdits === null) {
          skipped.push(`${rel}:${edit.line}: className ist ein Ausdruck — bitte von Hand`);
        } else {
          ranges.push(...classEdits);
          changes += classEdits.length ? 1 : 0;
        }
      }

      if (edit.attrs) {
        for (const [name, value] of Object.entries(edit.attrs)) {
          const { edits: ae, note } = attrEdit(hit.opening, name, value, imported);
          if (!ae) {
            skipped.push(`${rel}:${edit.line}: ${name} ist ein Ausdruck mit Laufzeitdaten — nicht angetastet`);
          } else {
            ranges.push(...ae);
            changes++;
            if (note) skipped.push(`${rel}:${edit.line}: ${note}`);
          }
        }
      }

      if (edit.texts?.length) {
        const { edits: te, misses } = textEdits(hit.element, edit.texts, code);
        for (const m of misses) skipped.push(`${rel}:${edit.line}: ${m} — bitte von Hand`);
        if (te.length) { ranges.push(...te); changes += te.length; }
      }
    }

    if (!ranges.length) continue;

    // Von hinten nach vorne anwenden, damit die Offsets gueltig bleiben.
    ranges.sort((a, b) => b.start - a.start || b.end - a.end);
    let out = code;
    let lastStart = Infinity;
    for (const r of ranges) {
      if (r.end > lastStart) continue; // ueberlappend (z.B. geloeschtes Elternteil)
      out = out.slice(0, r.start) + r.text + out.slice(r.end);
      lastStart = r.start;
    }

    sichern(abs, rel, root, stempel);
    fs.writeFileSync(abs, out);
    files++;
  }

  if (files) backupsAufraeumen(root);
  return { files, changes, skipped, canUndo: files > 0 };
}
