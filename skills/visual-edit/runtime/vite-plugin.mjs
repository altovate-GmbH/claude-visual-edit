/**
 * Vite-Plugin fuer Visual Edit. Laeuft ausschliesslich im Dev-Server.
 *
 * Drei Aufgaben:
 *   1. Jedes JSX-Element bekommt data-ve="datei:zeile:spalte" — die Bruecke
 *      zwischen DOM-Knoten und Quellcode-Stelle.
 *   2. Das Overlay wird in die Seite injiziert.
 *   3. POST /__visual-edit/save schreibt die Aenderungen in die Quelldateien.
 *
 * Im Build (`vite build`) ist das Plugin komplett inaktiv — weder Attribute
 * noch Overlay landen in der Produktion.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { applyEdits, undoLastSave } from './apply-edits.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JSX_FILE = /\.[jt]sx$/;
const SKIP_DIRS = /node_modules|\.visual-edit/;

/**
 * Projekte ohne index.html (TanStack Start, andere SSR-Setups) bekommen das
 * Overlay ueber eine dieser Dateien — sie werden beim Start des Clients
 * genau einmal geladen. Reihenfolge = Vorrang.
 */
const CLIENT_ENTRIES = [
  'src/router.tsx', 'src/client.tsx', 'src/entry-client.tsx',
  'src/main.tsx', 'src/main.jsx', 'src/index.tsx',
];

/**
 * Laedt das Overlay nur im Browser — beim SSR-Durchlauf passiert nichts.
 *
 * Bewusst ueber ein script-Element statt ueber import(): die Datei wird erst
 * zur Laufzeit von der Middleware ausgeliefert. Vites Import-Analyse wuerde
 * sie beim Auflösen vermissen und den Build abbrechen — auch mit @vite-ignore.
 */
const INJECTION = `
if (typeof document !== 'undefined' && !document.getElementById('visual-edit-loader')) {
  const s = document.createElement('script');
  s.id = 'visual-edit-loader';
  s.type = 'module';
  s.src = '/__visual-edit/overlay.js';
  document.head.appendChild(s);
}
`;

const PARSER_OPTIONS = {
  sourceType: 'module',
  errorRecovery: true,
  plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
};

/** Laeuft rekursiv durch den AST und sammelt alle JSX-Opening-Elemente. */
function collectJsxOpenings(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectJsxOpenings(child, out);
    return out;
  }
  if (node.type === 'JSXOpeningElement') out.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const value = node[key];
    if (value && typeof value === 'object') collectJsxOpenings(value, out);
  }
  return out;
}

export default function visualEdit(options = {}) {
  const attr = options.attribute || 'data-ve';
  let root = process.cwd();
  let enabled = false;
  /** true, sobald klar ist, dass das Overlay ueber den Entry kommen muss. */
  let viaEntry = false;
  let entryFile = null;
  /** Dateien, zu denen bereits eine Warnung ausgegeben wurde. */
  const warned = new Set();

  return {
    name: 'visual-edit',
    apply: 'serve', // niemals im Produktions-Build
    // Muss vor plugin-react laufen, sonst stimmen Zeile/Spalte nicht mehr
    // mit der Datei auf der Platte ueberein.
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
      enabled = config.command === 'serve';
      if (!enabled) return;

      // Framework-Plugins (etwa TanStack Router) bauen JSX-Dateien um, bevor
      // sie ausgeliefert werden — Routen werden aufgeteilt, Zeilen verschieben
      // sich. Wuerden die Markierungen danach gesetzt, zeigten sie auf falsche
      // Stellen im Quellcode. Deshalb rueckt dieses Plugin vor sie: es
      // annotiert den unveraenderten Dateiinhalt, und die Markierungen wandern
      // durch alle weiteren Umbauten unveraendert mit.
      try {
        const liste = config.plugins;
        const eigen = liste.findIndex((pl) => pl.name === 'visual-edit');
        const erstesFramework = liste.findIndex(
          (pl) => /tanstack|react|solid|svelte|vue|remix|router/i.test(pl.name || '')
        );
        if (eigen > -1 && erstesFramework > -1 && eigen > erstesFramework) {
          const [selbst] = liste.splice(eigen, 1);
          liste.splice(erstesFramework, 0, selbst);
        }
      } catch {
        console.warn(
          '[visual-edit] Reihenfolge der Plugins liess sich nicht anpassen.\n' +
          '[visual-edit] Markierungen koennten auf falsche Stellen zeigen — ' +
          'vor dem Speichern den Diff pruefen.'
        );
      }

      // Ohne index.html greift transformIndexHtml nicht — dann wird das
      // Overlay stattdessen in den Client-Einstieg importiert.
      viaEntry = !fs.existsSync(path.join(root, 'index.html'));
      if (!viaEntry) return;

      entryFile = CLIENT_ENTRIES
        .map((rel) => path.join(root, rel))
        .find((abs) => fs.existsSync(abs)) || null;

      if (!entryFile) {
        console.warn(
          '[visual-edit] Kein Einstiegspunkt gefunden (weder index.html noch ' +
          CLIENT_ENTRIES.join(', ') + ').\n' +
          '[visual-edit] Das Panel erscheint deshalb nicht. Bitte melden, in ' +
          'welchem Projekt das auftritt.'
        );
      }
    },

    transform(code, id) {
      if (!enabled) return null;
      const file = id.split('?')[0];

      // Overlay in den Client-Einstieg haengen (Projekte ohne index.html).
      if (viaEntry && entryFile && path.resolve(file) === path.resolve(entryFile)) {
        const withOverlay = code + INJECTION;
        // Die Datei kann zugleich JSX enthalten — dann unten weiterverarbeiten.
        if (!JSX_FILE.test(file) || !code.includes('<')) {
          return { code: withOverlay, map: null };
        }
        code = withOverlay;
      }

      if (!JSX_FILE.test(file) || SKIP_DIRS.test(file)) return null;
      if (!code.includes('<')) return null;

      let ast;
      try {
        ast = parse(code, PARSER_OPTIONS);
      } catch (err) {
        // Je Datei nur einmal melden — sonst flutet es die Konsole bei jedem
        // Speichern. Stillschweigend zu scheitern waere schlimmer: dann fehlen
        // die Markierungen und niemand weiss, warum nichts anklickbar ist.
        if (!warned.has(file)) {
          warned.add(file);
          console.warn(`[visual-edit] ${path.relative(root, file)} nicht lesbar: ${err.message}`);
          console.warn('[visual-edit] Elemente dieser Datei sind nicht anklickbar.');
        }
        return null;
      }

      const rel = path.relative(root, file).split(path.sep).join('/');
      const inserts = [];

      for (const open of collectJsxOpenings(ast)) {
        if (open.name?.type === 'JSXMemberExpression' && !open.name.object) continue;
        const already = open.attributes.some(
          (a) => a.type === 'JSXAttribute' && a.name?.name === attr
        );
        if (already) continue;
        const { line, column } = open.loc.start;
        // Direkt hinter den Tag-Namen einsetzen: <div| ...>
        inserts.push({ pos: open.name.end, text: ` ${attr}="${rel}:${line}:${column}"` });
      }

      if (!inserts.length) return null;
      inserts.sort((a, b) => b.pos - a.pos); // von hinten, damit Offsets gueltig bleiben
      let out = code;
      for (const ins of inserts) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
      return { code: out, map: null };
    },

    transformIndexHtml(html) {
      if (!enabled || viaEntry) return html;
      return {
        html,
        tags: [{
          tag: 'script',
          attrs: { type: 'module', src: '/__visual-edit/overlay.js' },
          injectTo: 'body',
        }],
      };
    },

    configureServer(server) {
      // Runtime-Dateien direkt ausliefern — unabhaengig davon, wie Vite
      // statische Ordner behandelt.
      server.middlewares.use('/__visual-edit/overlay.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.end(fs.readFileSync(path.join(HERE, 'overlay.js'), 'utf8'));
      });
      server.middlewares.use('/__visual-edit/tw-map.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.end(fs.readFileSync(path.join(HERE, 'tw-map.js'), 'utf8'));
      });

      // Bild-Upload: landet in public/visual-edit/ und ist damit unter
      // /visual-edit/<datei> erreichbar.
      server.middlewares.use('/__visual-edit/upload', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body);
            const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || '');
            if (!match) throw new Error('kein Bild');

            // Dateinamen entschaerfen: keine Pfadanteile, keine Sonderzeichen.
            const ext = { 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[match[1]]
              || match[1].split('/')[1];
            const base = path.basename(name || 'bild', path.extname(name || ''))
              .replace(/[^a-z0-9_-]+/gi, '-').toLowerCase().slice(0, 60) || 'bild';
            const file = `${base}-${Date.now().toString(36)}.${ext}`;

            const dir = path.join(root, 'public', 'visual-edit');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, file), Buffer.from(match[2], 'base64'));

            const url = `/visual-edit/${file}`;
            console.log(`[visual-edit] Bild gespeichert: public${url}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ url }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      // Letzte Speicherung zuruecknehmen — ohne git-Kenntnisse.
      server.middlewares.use('/__visual-edit/undo', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        try {
          const ergebnis = undoLastSave(root);
          if (ergebnis) {
            console.log(`[visual-edit] Stand von ${ergebnis.at} wiederhergestellt ` +
              `(${ergebnis.files} Datei(en))`);
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(ergebnis || { files: 0 }));
        } catch (err) {
          console.error('[visual-edit] Zuruecknehmen fehlgeschlagen:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      server.middlewares.use('/__visual-edit/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const { edits } = JSON.parse(body);
            const result = applyEdits(edits, root);
            // Protokoll fuer Claude: was wurde wo geaendert.
            const logDir = path.join(root, '.visual-edit');
            fs.mkdirSync(logDir, { recursive: true });
            fs.writeFileSync(
              path.join(logDir, 'last-session.json'),
              JSON.stringify({ at: new Date().toISOString(), edits, result }, null, 2)
            );
            console.log(
              `[visual-edit] ${result.changes} Aenderung(en) in ${result.files} Datei(en)` +
              (result.skipped.length ? ` · ${result.skipped.length} uebersprungen` : '')
            );
            for (const s of result.skipped) console.warn(`[visual-edit]   ! ${s}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err) {
            console.error('[visual-edit] Fehler beim Schreiben:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}
