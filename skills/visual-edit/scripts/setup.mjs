#!/usr/bin/env node
/**
 * Richtet Visual Edit in einem Vite-Projekt ein.
 *
 *   node ~/.claude/skills/visual-edit/scripts/setup.mjs [projektpfad]
 *
 * Schritte:
 *   1. Runtime nach <projekt>/.visual-edit/ kopieren (selbstenthaltend,
 *      kein Verweis auf Pfade ausserhalb des Projekts)
 *   2. @babel/parser als devDependency sicherstellen
 *   3. Plugin in die Vite-Config eintragen
 *   4. .gitignore ergaenzen
 *
 * Mehrfaches Ausfuehren ist unschaedlich.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.join(HERE, '..', 'runtime');
const project = path.resolve(process.argv[2] || process.cwd());

const log = (msg) => console.log(`  ${msg}`);
const fail = (msg) => { console.error(`\n  Abbruch: ${msg}\n`); process.exit(1); };

// --- 0. Projekt pruefen -----------------------------------------------------
const pkgPath = path.join(project, 'package.json');
if (!fs.existsSync(pkgPath)) fail(`keine package.json in ${project}`);

const configFile = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']
  .map((f) => path.join(project, f))
  .find((f) => fs.existsSync(f));
if (!configFile) fail('keine vite.config gefunden — Visual Edit braucht Vite.');

console.log(`\n  Visual Edit einrichten in ${path.basename(project)}\n`);

// --- 1. Runtime kopieren ----------------------------------------------------
const target = path.join(project, '.visual-edit');
fs.mkdirSync(target, { recursive: true });
for (const file of ['overlay.js', 'tw-map.js', 'vite-plugin.mjs', 'apply-edits.mjs']) {
  fs.copyFileSync(path.join(RUNTIME, file), path.join(target, file));
}
log('Runtime nach .visual-edit/ kopiert');

// --- 2. Abhaengigkeit -------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const hasParser = fs.existsSync(path.join(project, 'node_modules', '@babel', 'parser'))
  || pkg.devDependencies?.['@babel/parser'] || pkg.dependencies?.['@babel/parser'];

if (!hasParser) {
  const manager = fs.existsSync(path.join(project, 'pnpm-lock.yaml')) ? 'pnpm'
    : fs.existsSync(path.join(project, 'bun.lockb')) ? 'bun'
    : fs.existsSync(path.join(project, 'yarn.lock')) ? 'yarn' : 'npm';
  const cmd = manager === 'npm' ? 'npm install -D @babel/parser'
    : manager === 'yarn' ? 'yarn add -D @babel/parser'
    : `${manager} add -D @babel/parser`;
  log(`@babel/parser fehlt — installiere via ${manager} …`);
  execSync(cmd, { cwd: project, stdio: 'inherit' });
}
log('@babel/parser vorhanden');

// Aus dem Projekt laden — dort wurde er eben installiert.
const projectRequire = createRequire(path.join(project, 'package.json'));
const { parse } = projectRequire('@babel/parser');

// --- 3. Vite-Config patchen -------------------------------------------------
//
// Hier wird ueber den Syntaxbaum gearbeitet, nicht per Textsuche: Vite-Configs
// enthalten Kommentare, die Beispielcode zeigen ("… defineConfig({ vite: { … } })").
// Eine Textsuche schreibt in genau solche Kommentare hinein.

/** Findet das Konfigurationsobjekt hinter `export default defineConfig(...)`. */
function findConfigObject(ast) {
  const exp = ast.program.body.find((n) => n.type === 'ExportDefaultDeclaration');
  if (!exp) return null;

  let node = exp.declaration;
  // defineConfig(...) auspacken
  if (node.type === 'CallExpression') node = node.arguments[0];
  if (!node) return null;
  // defineConfig(({ mode }) => ({ ... })) auspacken
  if (node.type === 'ArrowFunctionExpression') {
    node = node.body;
    if (node.type === 'BlockStatement') {
      const ret = node.body.find((n) => n.type === 'ReturnStatement');
      node = ret?.argument;
    }
  }
  return node?.type === 'ObjectExpression' ? node : null;
}

/**
 * Holt das zugrundeliegende Array — auch wenn noch etwas drangehaengt ist,
 * wie im haeufigen `plugins: [react(), ...].filter(Boolean)`.
 */
function arrayOf(node) {
  if (!node) return null;
  if (node.type === 'ArrayExpression') return node;
  if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
    return arrayOf(node.callee.object);
  }
  return null;
}

const prop = (obj, name) => obj.properties.find(
  (p) => (p.type === 'ObjectProperty' || p.type === 'Property')
    && (p.key?.name === name || p.key?.value === name)
);

let config = fs.readFileSync(configFile, 'utf8');

if (config.includes('.visual-edit/vite-plugin')) {
  log('Vite-Config enthaelt das Plugin bereits');
} else {
  let ast;
  try {
    ast = parse(config, { sourceType: 'module', plugins: ['typescript'], errorRecovery: true });
  } catch (err) {
    fail(`${path.basename(configFile)} ist nicht lesbar: ${err.message}`);
  }

  const root_ = findConfigObject(ast);
  if (!root_) {
    fail(
      `In ${path.basename(configFile)} wurde kein "export default defineConfig({ … })" gefunden.\n` +
      '  Bitte von Hand eintragen — oben:\n' +
      "    import visualEdit from './.visual-edit/vite-plugin.mjs';\n" +
      '  und visualEdit() in das plugins-Array aufnehmen.'
    );
  }

  const eintrag = '\n    // nur im Dev-Server aktiv, im Build automatisch inaktiv\n    visualEdit(),\n    ';
  let einfuegen; // { pos, text }
  let form;

  const pluginsArray = arrayOf(prop(root_, 'plugins')?.value);
  const viteProp = prop(root_, 'vite');

  if (pluginsArray) {
    // Form A: klassisches Vite-Projekt.
    einfuegen = { pos: pluginsArray.start + 1, text: eintrag };
    form = 'plugins-Array';
  } else if (viteProp?.value?.type === 'ObjectExpression') {
    const inner = arrayOf(prop(viteProp.value, 'plugins')?.value);
    if (inner) {
      einfuegen = { pos: inner.start + 1, text: eintrag };
      form = 'vite.plugins';
    } else {
      einfuegen = { pos: viteProp.value.start + 1, text: `\n    plugins: [${eintrag}\n    ],` };
      form = 'vite-Block ergaenzt';
    }
  } else {
    // Form B: gekapselte Config (z.B. TanStack Start) ohne eigenen vite-Block.
    einfuegen = { pos: root_.start + 1, text: `\n  vite: {\n    plugins: [${eintrag}\n    ],\n  },` };
    form = 'vite-Block angelegt';
  }

  // Import hinter dem letzten echten Import einsetzen (AST, nicht Text).
  const importe = ast.program.body.filter((n) => n.type === 'ImportDeclaration');
  const importLine = "\nimport visualEdit from './.visual-edit/vite-plugin.mjs';";
  const importPos = importe.length ? importe[importe.length - 1].end : 0;

  // Von hinten nach vorne einsetzen, damit die Positionen gueltig bleiben.
  const stellen = [einfuegen, { pos: importPos, text: importLine }]
    .sort((a, b) => b.pos - a.pos);
  for (const st of stellen) config = config.slice(0, st.pos) + st.text + config.slice(st.pos);

  fs.writeFileSync(configFile, config);
  log(`${path.basename(configFile)} ergaenzt (${form})`);
}

// --- 4. .gitignore ----------------------------------------------------------
const giPath = path.join(project, '.gitignore');
const gi = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
if (!gi.includes('.visual-edit')) {
  fs.writeFileSync(giPath, gi.replace(/\s*$/, '') + '\n\n# Visual Edit (nur lokal)\n.visual-edit/\n');
  log('.gitignore ergaenzt');
}

const hatIndexHtml = fs.existsSync(path.join(project, 'index.html'));
if (!hatIndexHtml) {
  log('Kein index.html — das Overlay wird ueber den Client-Einstieg geladen');
}

console.log(`
  Fertig. Dev-Server starten, Seite oeffnen — das Panel erscheint rechts.

    Klick        Element auswaehlen
    Alt + Klick  Seite normal bedienen (Links, Buttons)
    Esc          abwaehlen
    Cmd+Z        zurueck
    Cmd+S        in den Code schreiben
`);
