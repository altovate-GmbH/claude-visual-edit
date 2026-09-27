# Visual Edit

**Die Seite anklicken statt sie zu beschreiben.**

Ein Plugin für [Claude Code](https://claude.com/claude-code), das den laufenden
Dev-Server zum visuellen Editor macht. Element anklicken, im Panel ändern,
speichern — was herauskommt, ist echter Tailwind-Code im Projekt. Kein Export,
kein Zwischenformat, keine Sperre.

> Screenshot: `docs/panel.png` *(noch einzufügen)*

## Für wen das gedacht ist

Für Agenturen, die bisher mit Website-Baukästen arbeiten und an KI-Werkzeuge
herankommen wollen, ohne alles auf einmal umzustellen.

Der Einstieg in KI-gestützte Entwicklung scheitert selten an der Technik. Er
scheitert daran, dass man für jede Kleinigkeit einen Satz formulieren muss:
„mach die Überschrift etwas größer, aber nur auf dem Desktop". Im Baukasten
wären das zwei Klicks gewesen.

Visual Edit gibt diese zwei Klicks zurück — im Code-Projekt, ohne dessen
Vorteile aufzugeben.

## Installation

```
/plugin marketplace add altovate-GmbH/claude-visual-edit
```

Danach im Projekt:

```
/visual-edit
```

Claude richtet alles ein: prüft die Projektform, ergänzt die Vite-Konfiguration,
startet den Dev-Server. Beim ersten Mal dauert das etwa eine Minute.

## Bedienung

| Aktion | Wirkung |
|---|---|
| Klick auf ein Element | auswählen |
| Doppelklick auf Text | direkt auf der Seite schreiben |
| Bild auf ein Bild ziehen | austauschen |
| **Alt + Klick** | Seite normal bedienen (Links, Menüs) |
| `Esc` | Auswahl aufheben |
| `⌘Z` | letzte Änderung zurück |
| `⌘S` | speichern |

Oben im Panel steht, **wo** die Änderung gelten soll: überall, ab Tablet, ab
Laptop, oder nur wenn die Maus darüber fährt. „Ab Tablet" heißt ab dieser
Bildschirmbreite aufwärts — so lassen sich Handy und Desktop getrennt
gestalten.

## Was sich ändern lässt

- **Text** — direkt auf der Seite oder über die Felder im Panel
- **Schrift** — Größe in Pixel, Stärke, Ausrichtung, Zeilen- und Buchstabenabstand
- **Farben** — Farbwähler für Schrift und Hintergrund, dazu die Farben, die das
  Projekt selbst definiert
- **Abstände** — innen und außen, rundum oder je Seite, in Pixel
- **Anordnung** — untereinander, nebeneinander, Raster; Ausrichtung, Breite
- **Bilder** — austauschen per Dateiwahl, Ziehen oder Adresse; Ausschnitt und
  Seitenverhältnis
- **Ecken, Schatten, Rahmen** — Radius, acht Schattenstufen, Rahmen rundum oder
  je Kante, Linienart, Farbe
- **Bewegung** — Animationen, Eintritts- und Hover-Effekte als fertige Vorlagen
- **Einstellungen** — Linkziel, Alt-Text, Tooltip, Vorlesetext, Platzhalter,
  Pflichtfeld, Anker-ID

Dazu Hinweise, wenn etwas fehlt, das rechtlich oder für Screenreader zählt:
Bild ohne Alt-Text, Link ohne Ziel, Symbol-Schaltfläche ohne Vorlesetext. Wer
„in neuem Tab öffnen" setzt, bekommt `rel="noopener noreferrer"` automatisch
dazu.

Der Knopf **Profi** blendet die Tailwind-Klassen und den Quellpfad ein. Ohne
ihn kommt die Oberfläche ohne Fachbegriffe aus.

## Jede Speicherung ist zurücknehmbar

Vor jedem Schreiben legt Visual Edit eine Sicherung der betroffenen Dateien an.
Der Knopf **Zurück zum letzten Stand** stellt sie wieder her — ohne `git`, ohne
Kommandozeile. Die letzten 20 Stände bleiben erhalten.

## Voraussetzungen

Ein Vite-Projekt mit React und Tailwind. Beide gängigen Formen laufen:

| Projektform | Merkmal |
|---|---|
| klassisches Vite-SPA | `index.html` im Wurzelverzeichnis |
| TanStack Start (SSR) | kein `index.html`, gekapselte Konfiguration |

Node 18 oder neuer. Die einzige zusätzliche Abhängigkeit im Projekt ist
`@babel/parser`.

## Wie es funktioniert

Ein Vite-Plugin hängt im Dev-Server an jedes JSX-Element eine unsichtbare
Markierung mit Datei, Zeile und Spalte. Das Panel im Browser liest sie aus,
zeigt passende Einstellungen und schickt die Änderungen zurück. Dort werden sie
über den Syntaxbaum in die Quelldatei geschrieben — als Tailwind-Klasse, an
genau der Stelle, aus der das Element stammt.

Im Produktions-Build ist das Plugin inaktiv (`apply: 'serve'`). Weder
Markierungen noch Panel landen in der ausgelieferten Seite.

## Was es nicht kann

Ehrlichkeit vorweg, damit niemand an der falschen Stelle sucht:

- **Kein Verschieben per Drag.** Umsortieren bleibt eine Code-Änderung.
- **Werte aus Variablen bleiben unberührt.** Bei `src={profile.logo}` oder
  `<Link to={ziel}>` wird nichts überschrieben — das sind Laufzeitdaten. Das
  Protokoll sagt, was übersprungen wurde.
- **Generische Komponenten führen in die Irre.** Klickst du ein Nav-Element an,
  das aus einer wiederverwendeten Komponente kommt, sitzt der Inhalt dort, wo
  die Komponente aufgerufen wird. Das Panel ändert dann alles Feste und meldet
  den Rest.
- **Ein Element aus einer Schleife steht im Code nur einmal.** Eine Änderung
  trifft alle Durchläufe — das Panel sagt, wie viele.
- **Nur Vite.** Next.js, Astro und Nuxt fehlen bisher.

## Mitwirken

Fehlerberichte und Pull Requests sind willkommen — besonders zu weiteren
Projektformen. Bei einem Fehlerbericht hilft: Projektform, Vite-Version, und
was in der Konsole des Dev-Servers steht.

## Lizenz

MIT — siehe [LICENSE](LICENSE).

Gebaut von [Altovate GmbH](https://altovate.de).
