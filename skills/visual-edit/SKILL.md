---
name: visual-edit
description: Website-Entwuerfe direkt auf der laufenden Seite visuell bearbeiten statt per Prompt — Element anklicken, Text, Farben, Abstaende, Typografie und Layout im Panel aendern, Ergebnis wird als Tailwind-Klassen in den JSX-Quellcode zurueckgeschrieben. Use when Alex an einem Website-Entwurf, einer Landingpage oder einem UI herumschrauben will ohne Aenderungen zu beschreiben; bei "visuell bearbeiten", "live auf der Seite aendern", "direkt anklicken", "ohne prompten designen", "Live-Editor", "visual edit", "WYSIWYG", "Abstaende anpassen", "Farbe von dem Button aendern"; oder wenn eine Feedback-Runde am Design viele kleine Korrekturen bringt, die als Prompt-Pingpong zu langsam waeren.
---

# Visual Edit — Live-Bearbeitung im Browser

Macht aus dem laufenden Dev-Server einen visuellen Editor: Element anklicken,
im Panel aendern, speichern — die Aenderung landet als Tailwind-Klasse im JSX.

Gedacht für die letzten 20 % eines Entwurfs, in denen Prompt-Pingpong teurer ist
als zwei Klicks: Abstände, Schriftgrößen, Farben, Ausrichtung, Textkorrekturen.

## Voraussetzungen

Vite-Projekt mit React und Tailwind. Beide gängigen Lovable-Formen laufen:

| Projektform | Erkennungsmerkmal | Wie das Overlay hineinkommt |
|---|---|---|
| klassisches Vite-SPA | `index.html` im Wurzelverzeichnis, eigenes `plugins`-Array | über die HTML-Seite |
| TanStack Start (SSR) | kein `index.html`, Config über `@lovable.dev/vite-tanstack-config` | über den Client-Einstieg (`src/router.tsx`) |

Das Setup erkennt das selbst. Bei Next.js oder anderen Bundlern nicht
einsetzen, sondern darauf hinweisen.

## Ablauf

### 1. Einrichten

```bash
SETUP=$(find "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude}" "$HOME/.claude/skills" "$HOME/.claude/plugins" -name setup.mjs -path '*visual-edit*' 2>/dev/null | head -1); node "$SETUP" .
```

Der Suchbefehl findet das Script, egal ob der Skill als Plugin installiert ist
oder von Hand nach `~/.claude/skills/` kopiert wurde. Liefert er nichts, ist
der Skill nicht richtig installiert — dann der Person sagen, sie soll
`/plugin marketplace add altovate-GmbH/claude-visual-edit` ausführen.

Das Script kopiert die Runtime nach `<projekt>/.visual-edit/`, installiert
`@babel/parser`, trägt das Plugin in die Vite-Config ein und ergänzt die
`.gitignore`. Mehrfach ausführbar — bereits Eingerichtetes bleibt unberührt.

### 2. Dev-Server starten und Seite öffnen

`preview_start` mit dem Dev-Server-Eintrag aus `.claude/launch.json`, sonst
`npm run dev` und die URL im Browser-Pane öffnen. Das Panel erscheint rechts.

Danach Alex übergeben — mit diesen Bedienhinweisen:

| Aktion | Wirkung |
|---|---|
| Klick auf ein Element | auswählen |
| **Doppelklick** | Text direkt auf der Seite schreiben (`Enter` übernimmt, `Esc` verwirft) |
| **Bild auf ein `<img>` ziehen** | Bild austauschen |
| **Alt + Klick** | Seite normal bedienen (Links, Buttons, Menüs) |
| `Esc` | abwählen |
| `⌘Z` | letzte Änderung zurück |
| `⌘S` / Button | alles in den Code schreiben |

**Oben im Panel steht, wo die Änderung gelten soll.** Das ist die einzige
Stelle, die Erklärung braucht — sag sie dem Nutzer aktiv:

| Auswahl | Bedeutung |
|---|---|
| Überall | auf jedem Gerät (Standard) |
| Ab Tablet | erst ab 768 px Bildschirmbreite, darunter bleibt alles wie es ist |
| Ab Laptop | erst ab 1024 px |
| Maus darüber | nur während der Zeiger auf dem Element steht |

„Ab Tablet" heißt **ab dieser Breite aufwärts**, nicht „nur auf Tablets". So
lassen sich Handy und Desktop unterschiedlich gestalten: erst „Überall" die
Handy-Variante setzen, dann „Ab Laptop" die große.

Der Knopf **Profi** oben rechts blendet Tailwind-Klassen, den Quellpfad und
weitere Breakpoints ein. Für Nutzer ohne Entwicklerhintergrund ausgeschaltet
lassen — die Einstellung merkt sich der Browser.

### 3. Änderungen prüfen

Nach dem Speichern liegt das Protokoll in `<projekt>/.visual-edit/last-session.json`
und die Konsole des Dev-Servers zeigt eine Zeile pro Durchgang. Dann:

1. `git diff` lesen — was ist tatsächlich im Code gelandet.
2. `skipped` im Protokoll prüfen. Übersprungen wird, was nicht sicher
   automatisch geht: `className={styles.x}`, Texte mit Ausdrücken
   (`{title}`), Dateien, die zwischenzeitlich von Hand geändert wurden.
   Diese Stellen **von Hand nachziehen** und Alex sagen, welche das waren.
3. Klassen aufräumen, wo der Editor Redundanz hinterlassen hat
   (z. B. `p-4 pt-8` → entweder beides bewusst oder zusammenfassen).

### 4. Abschließen

Wenn Alex fertig ist: Dev-Server stoppen. `.visual-edit/` darf liegen bleiben,
es ist gitignored und im Produktions-Build inaktiv (`apply: 'serve'`).

Soll es ganz weg: Ordner löschen, Import und `visualEdit(),` aus der Vite-Config
entfernen, `@babel/parser` deinstallieren.

## Sprache im Panel

Die Oberfläche kommt ohne Fachbegriffe aus: Elemente heißen „Überschrift",
„Absatz", „Schaltfläche" statt `h1`, `p`, `button`. Schriftgrößen und Abstände
stehen in Pixeln statt als `text-2xl` oder `p-4`. Anordnung heißt
„untereinander / nebeneinander / Raster". Tailwind-Klassen tauchen nur im
Profi-Modus auf.

Wenn ein Nutzer trotzdem nach einem Begriff fragt, übersetze ihn — und schreib
das Panel notfalls um, statt den Begriff zu erklären.

## Was der Editor kann

- **Text** — per Doppelklick direkt auf der Seite, oder über die Felder im
  Panel. Elemente mit mehreren Textstellen (`Zeile eins<br/>Zeile zwei`, oder
  Text rund um `{variable}`) werden stellenweise bearbeitet, die Variable
  bleibt unberührt
- **Typografie** — Größe, Gewicht, Ausrichtung, Zeilenhöhe, Laufweite
- **Farben** — Colorpicker für Text und Fläche, plus die Design-Tokens des
  Projekts (`primary`, `accent`, … aus den CSS-Variablen)
- **Abstände** — Padding und Margin pro Seite, Gap
- **Layout** — display, flex-Richtung, justify, align
- **Größe** — Breite, max-width
- **Bilder** — austauschen per Dateiwahl, Drag & Drop aufs Bild oder URL.
  Hochgeladene Dateien landen in `public/visual-edit/`. Dazu Ausschnitt
  (`object-fit`), Position und Seitenverhältnis
- **Rahmen** — Breite rundum oder je Kante, Stil (durchgezogen/gestrichelt/
  gepunktet), Farbe, Ring
- **Ecken & Schatten** — Radius, acht Schattenstufen inklusive `inner`, Deckkraft
- **Bewegung** — Dauer-Animationen (pulsieren, hüpfen, drehen, ping),
  Eintritts-Effekte (einblenden, von unten, von links, aufziehen) und
  Hover-Effekte (größer, anheben, Schatten, abblenden) als fertige Presets,
  plus Feinjustierung von Übergang, Dauer und Kurve
- **Attribute** je nach Element: Linkziel, Öffnen in neuem Tab, Tooltip,
  Vorlesetext (`aria-label`), Anker-ID · bei Bildern Alt-Text und Ladeverhalten ·
  bei Buttons Typ und „deaktiviert" · bei Feldern Platzhalter, Typ, Pflichtfeld.
  Leeres Feld entfernt das Attribut
- **Hinweise zur Barrierefreiheit** direkt am Element: Bild ohne Alt-Text,
  Link ohne Ziel, Symbol-Link ohne Vorlesetext. Beim Setzen von „neuer Tab"
  wird `rel="noopener noreferrer"` automatisch ergänzt
- **Rohe Tailwind-Klassen** für alles Übrige
- **Struktur** — Element duplizieren oder löschen

## Grenzen — Alex vorab sagen

- **Live-Vorschau vs. Code.** Neue Tailwind-Klassen existieren im kompilierten
  CSS noch nicht, deshalb zeigt das Overlay sie als Inline-Style. Nach dem
  Speichern rebuildet Vite und die echte Klasse greift. Kleiner Sprung im
  Rendering ist dabei normal, kein Fehler.
- **Gleiche Quelle, mehrere Elemente.** Ein Element aus `.map()` steht im Code
  nur einmal. Eine Änderung trifft alle Instanzen — das Panel zeigt an, wie
  viele. Für eine einzelne Karte muss der Code aufgeteilt werden.
- **`cn()`-Klassen** werden als zusätzliches Argument angehängt. Mit
  `tailwind-merge` (shadcn-Standard) gewinnt das Spätere — korrekt. Ohne
  `tailwind-merge` können konkurrierende Klassen nebeneinander stehen.
- **Kein Verschieben per Drag.** Umsortieren bleibt eine Code-Änderung.
- **Werte aus Variablen bleiben unberührt.** Bei `src={profile.logo_url}` oder
  `<Link to={href}>` wird nichts geschrieben — das sind Laufzeitdaten, und ein
  fester Wert würde die Komponente kaputtmachen. Nur importierte Namen
  (`src={heroBild}`) werden ersetzt, mit Vermerk im Protokoll.
- **Generische Komponenten führen in die Irre.** Klickst du ein Nav-Item an,
  das aus `<Link to={href}>` kommt, sitzt das eigentliche Ziel dort, wo die
  Komponente *aufgerufen* wird — nicht dort, wo du geklickt hast. Das Panel
  ändert dann alles, was fest steht (Aussehen, `target`), und meldet das Ziel
  als übersprungen. Für solche Fälle bleibt es eine Code-Änderung.
- **`<Link to>` wird erkannt.** Im DOM heißt es `href`, im Code `to` — der
  Patcher bildet das ab und behält den Namen aus dem Quellcode bei.
- **Eintritts-Effekte brauchen `tailwindcss-animate`** (in shadcn-Projekten
  Standard). Fehlt das Paket, bleiben die Presets wirkungslos.
- **Textstellen werden über ihren Inhalt zugeordnet,** nicht über eine
  Position. Steht derselbe Text zweimal im selben Element, wird er
  übersprungen statt geraten. Wird beim Schreiben die Struktur zerlegt
  (z. B. ein `<br>` gelöscht), verwirft das Overlay die Änderung und sagt es.

## Nach einem Bild-Austausch

Hochgeladene Bilder liegen in `public/visual-edit/` und sind **nicht**
gitignored — sie gehören zum Ergebnis. Beim Aufräumen prüfen: verwaiste
Imports (stehen im Protokoll) und Dateien in `public/visual-edit/`, auf die
nichts mehr zeigt.

## Warum das Plugin vorne stehen muss

Framework-Plugins wie TanStack Router bauen JSX-Dateien um, bevor sie
ausgeliefert werden — Routen werden aufgeteilt, Zeilen verschieben sich. Würden
die Markierungen danach gesetzt, zeigten sie auf falsche Stellen im Quellcode
und Änderungen landeten an der falschen Zeile.

Deshalb rückt sich das Plugin beim Start selbst vor die Framework-Plugins. Es
annotiert den unveränderten Dateiinhalt; die Markierungen wandern durch alle
weiteren Umbauten unverändert mit. Klappt das Umsortieren nicht, sagt die
Konsole das — dann vor dem Speichern den Diff prüfen.

## Fehlersuche

| Symptom | Ursache |
|---|---|
| Panel fehlt | Plugin nicht in der Config, oder es ist kein `serve`-Lauf |
| Klick wählt nichts aus | Element ohne `data-ve` — kommt aus `dangerouslySetInnerHTML` oder einer Lib |
| „Element nicht mehr an dieser Stelle" | Datei wurde parallel editiert; Seite neu laden und erneut ändern |
| Speichern schlägt fehl | Dev-Server neu gestartet, ohne die Seite neu zu laden |
| Panel fehlt bei TanStack Start | kein Client-Einstieg gefunden — die Konsole nennt die gesuchten Pfade |
| Änderung ohne sichtbare Wirkung | vorhandene Klasse derselben Gruppe blockiert; im Profi-Modus nachsehen |
