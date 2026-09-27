/**
 * Gemeinsame Tabelle: Editor-Eigenschaft -> Tailwind-Klasse + CSS-Vorschau.
 *
 * Wird von zwei Seiten importiert:
 *   - overlay.js (Browser) fuer die Live-Vorschau
 *   - apply-edits.mjs (Node) fuer das Zurueckschreiben in den Quellcode
 *
 * Deshalb: keine Abhaengigkeiten, reines ESM.
 *
 * Jede Eigenschaft ("Feld") definiert:
 *   css      - CSS-Property fuer die sofortige DOM-Vorschau
 *   prefixes - Tailwind-Klassenpraefixe, die sich gegenseitig ausschliessen.
 *              Beim Setzen werden alle vorhandenen Klassen dieser Gruppe entfernt.
 *   toClass  - baut die Tailwind-Klasse aus dem Editor-Wert
 *   toCss    - baut den CSS-Wert fuer die Vorschau
 */

/** Tailwind-Spacing-Skala: Klassen-Suffix -> rem-Wert. */
export const SPACING = {
  '0': '0px', 'px': '1px', '0.5': '0.125rem', '1': '0.25rem', '1.5': '0.375rem',
  '2': '0.5rem', '2.5': '0.625rem', '3': '0.75rem', '3.5': '0.875rem', '4': '1rem',
  '5': '1.25rem', '6': '1.5rem', '7': '1.75rem', '8': '2rem', '9': '2.25rem',
  '10': '2.5rem', '11': '2.75rem', '12': '3rem', '14': '3.5rem', '16': '4rem',
  '20': '5rem', '24': '6rem', '28': '7rem', '32': '8rem', '36': '9rem',
  '40': '10rem', '48': '12rem', '56': '14rem', '64': '16rem', '72': '18rem', '80': '20rem',
};

/** Tailwind-Schriftgroessen: Klassen-Suffix -> [font-size, line-height]. */
export const FONT_SIZE = {
  'xs': ['0.75rem', '1rem'], 'sm': ['0.875rem', '1.25rem'], 'base': ['1rem', '1.5rem'],
  'lg': ['1.125rem', '1.75rem'], 'xl': ['1.25rem', '1.75rem'], '2xl': ['1.5rem', '2rem'],
  '3xl': ['1.875rem', '2.25rem'], '4xl': ['2.25rem', '2.5rem'], '5xl': ['3rem', '1'],
  '6xl': ['3.75rem', '1'], '7xl': ['4.5rem', '1'], '8xl': ['6rem', '1'], '9xl': ['8rem', '1'],
};

export const FONT_WEIGHT = {
  'thin': 100, 'extralight': 200, 'light': 300, 'normal': 400, 'medium': 500,
  'semibold': 600, 'bold': 700, 'extrabold': 800, 'black': 900,
};

export const RADIUS = {
  'none': '0px', 'sm': '0.125rem', '': '0.25rem', 'md': '0.375rem', 'lg': '0.5rem',
  'xl': '0.75rem', '2xl': '1rem', '3xl': '1.5rem', 'full': '9999px',
};

export const SHADOW = {
  'none': 'none',
  'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  '': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  'md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  'lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  'xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  'inner': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
};

/** Arbitrary-Value-Syntax: Leerzeichen muessen in Tailwind zu "_" werden. */
const arb = (v) => `[${String(v).trim().replace(/\s+/g, '_')}]`;

/** Farbwert -> Klassensuffix. Design-Token ("primary") bleibt, Hex wird arbitrary. */
const colorSuffix = (v) => (v.startsWith('#') || v.startsWith('rgb') ? arb(v) : v);

const spacingField = (cssProps, prefix) => ({
  css: cssProps,
  prefixes: [prefix],
  toClass: (v) => (v === '' ? null : `${prefix}-${v}`),
  toCss: (v) => (v === '' ? '' : SPACING[v] ?? v),
});

export const FIELDS = {
  // --- Typografie -----------------------------------------------------------
  fontSize: {
    css: ['font-size'],
    prefixes: ['text'],
    only: Object.keys(FONT_SIZE),
    toClass: (v) => `text-${v}`,
    toCss: (v) => FONT_SIZE[v]?.[0] ?? v,
  },
  fontWeight: {
    css: ['font-weight'],
    prefixes: ['font'],
    only: Object.keys(FONT_WEIGHT),
    toClass: (v) => `font-${v}`,
    toCss: (v) => String(FONT_WEIGHT[v] ?? v),
  },
  textAlign: {
    css: ['text-align'],
    prefixes: ['text'],
    only: ['left', 'center', 'right', 'justify'],
    toClass: (v) => `text-${v}`,
    toCss: (v) => v,
  },
  lineHeight: {
    css: ['line-height'],
    prefixes: ['leading'],
    toClass: (v) => `leading-${v}`,
    toCss: (v) => ({ none: '1', tight: '1.25', snug: '1.375', normal: '1.5',
      relaxed: '1.625', loose: '2' }[v] ?? v),
  },
  letterSpacing: {
    css: ['letter-spacing'],
    prefixes: ['tracking'],
    toClass: (v) => `tracking-${v}`,
    toCss: (v) => ({ tighter: '-0.05em', tight: '-0.025em', normal: '0em',
      wide: '0.025em', wider: '0.05em', widest: '0.1em' }[v] ?? v),
  },
  textTransform: {
    css: ['text-transform'],
    prefixes: ['uppercase', 'lowercase', 'capitalize', 'normal-case'],
    bare: true,
    toClass: (v) => (v === 'none' ? 'normal-case' : v),
    toCss: (v) => (v === 'normal-case' ? 'none' : v),
  },

  // --- Farben ---------------------------------------------------------------
  color: {
    css: ['color'],
    prefixes: ['text'],
    isColor: true,
    toClass: (v) => `text-${colorSuffix(v)}`,
    toCss: (v) => v,
  },
  backgroundColor: {
    css: ['background-color'],
    prefixes: ['bg'],
    isColor: true,
    toClass: (v) => `bg-${colorSuffix(v)}`,
    toCss: (v) => v,
  },
  borderColor: {
    css: ['border-color'],
    prefixes: ['border'],
    isColor: true,
    toClass: (v) => `border-${colorSuffix(v)}`,
    toCss: (v) => v,
  },
  opacity: {
    css: ['opacity'],
    prefixes: ['opacity'],
    toClass: (v) => `opacity-${v}`,
    toCss: (v) => String(Number(v) / 100),
  },

  // --- Abstaende ------------------------------------------------------------
  padding: spacingField(['padding'], 'p'),
  paddingX: spacingField(['padding-left', 'padding-right'], 'px'),
  paddingY: spacingField(['padding-top', 'padding-bottom'], 'py'),
  paddingTop: spacingField(['padding-top'], 'pt'),
  paddingRight: spacingField(['padding-right'], 'pr'),
  paddingBottom: spacingField(['padding-bottom'], 'pb'),
  paddingLeft: spacingField(['padding-left'], 'pl'),
  margin: spacingField(['margin'], 'm'),
  marginX: spacingField(['margin-left', 'margin-right'], 'mx'),
  marginY: spacingField(['margin-top', 'margin-bottom'], 'my'),
  marginTop: spacingField(['margin-top'], 'mt'),
  marginRight: spacingField(['margin-right'], 'mr'),
  marginBottom: spacingField(['margin-bottom'], 'mb'),
  marginLeft: spacingField(['margin-left'], 'ml'),
  gap: spacingField(['gap'], 'gap'),

  // --- Layout ---------------------------------------------------------------
  display: {
    css: ['display'],
    prefixes: ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid',
      'inline-grid', 'hidden'],
    bare: true,
    toClass: (v) => v,
    toCss: (v) => (v === 'hidden' ? 'none' : v),
  },
  flexDirection: {
    css: ['flex-direction'],
    prefixes: ['flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse'],
    bare: true,
    toClass: (v) => v,
    toCss: (v) => ({ 'flex-row': 'row', 'flex-col': 'column',
      'flex-row-reverse': 'row-reverse', 'flex-col-reverse': 'column-reverse' }[v]),
  },
  justifyContent: {
    css: ['justify-content'],
    prefixes: ['justify'],
    toClass: (v) => `justify-${v}`,
    toCss: (v) => ({ start: 'flex-start', end: 'flex-end', center: 'center',
      between: 'space-between', around: 'space-around', evenly: 'space-evenly' }[v] ?? v),
  },
  alignItems: {
    css: ['align-items'],
    prefixes: ['items'],
    toClass: (v) => `items-${v}`,
    toCss: (v) => ({ start: 'flex-start', end: 'flex-end', center: 'center',
      baseline: 'baseline', stretch: 'stretch' }[v] ?? v),
  },
  flexWrap: {
    css: ['flex-wrap'],
    prefixes: ['flex-wrap', 'flex-nowrap', 'flex-wrap-reverse'],
    bare: true,
    toClass: (v) => v,
    toCss: (v) => ({ 'flex-wrap': 'wrap', 'flex-nowrap': 'nowrap',
      'flex-wrap-reverse': 'wrap-reverse' }[v]),
  },

  // --- Groesse --------------------------------------------------------------
  width: {
    css: ['width'],
    prefixes: ['w'],
    toClass: (v) => `w-${/^[\d.]+(px|rem|%|vw)$/.test(v) ? arb(v) : v}`,
    toCss: (v) => ({ full: '100%', auto: 'auto', screen: '100vw', fit: 'fit-content' }[v]
      ?? SPACING[v] ?? v),
  },
  height: {
    css: ['height'],
    prefixes: ['h'],
    toClass: (v) => `h-${/^[\d.]+(px|rem|%|vh)$/.test(v) ? arb(v) : v}`,
    toCss: (v) => ({ full: '100%', auto: 'auto', screen: '100vh', fit: 'fit-content' }[v]
      ?? SPACING[v] ?? v),
  },
  maxWidth: {
    css: ['max-width'],
    prefixes: ['max-w'],
    toClass: (v) => `max-w-${/^[\d.]+(px|rem|%)$/.test(v) ? arb(v) : v}`,
    toCss: (v) => ({ none: 'none', xs: '20rem', sm: '24rem', md: '28rem', lg: '32rem',
      xl: '36rem', '2xl': '42rem', '3xl': '48rem', '4xl': '56rem', '5xl': '64rem',
      '6xl': '72rem', '7xl': '80rem', full: '100%', prose: '65ch' }[v] ?? v),
  },

  // --- Rahmen & Effekte -----------------------------------------------------
  borderRadius: {
    css: ['border-radius'],
    prefixes: ['rounded'],
    toClass: (v) => (v === '' ? 'rounded' : `rounded-${v}`),
    toCss: (v) => RADIUS[v] ?? v,
  },
  borderWidth: {
    css: ['border-width'],
    prefixes: ['border'],
    only: ['0', '', '2', '4', '8'],
    // "only" verhindert, dass border-t-2 oder border-dashed mit verdraengt wird
    toClass: (v) => (v === '' ? 'border' : `border-${v}`),
    toCss: (v) => (v === '' ? '1px' : `${v}px`),
  },
  boxShadow: {
    css: ['box-shadow'],
    prefixes: ['shadow'],
    toClass: (v) => (v === '' ? 'shadow' : `shadow-${v}`),
    toCss: (v) => SHADOW[v] ?? v,
  },

  // --- Bild -----------------------------------------------------------------
  objectFit: {
    css: ['object-fit'],
    prefixes: ['object'],
    only: ['contain', 'cover', 'fill', 'none', 'scale-down'],
    toClass: (v) => `object-${v}`,
    toCss: (v) => v,
  },
  objectPosition: {
    css: ['object-position'],
    prefixes: ['object'],
    only: ['center', 'top', 'bottom', 'left', 'right', 'left-top', 'right-top'],
    toClass: (v) => `object-${v}`,
    toCss: (v) => v.replace('-', ' '),
  },
  aspectRatio: {
    css: ['aspect-ratio'],
    prefixes: ['aspect'],
    toClass: (v) => `aspect-${v}`,
    toCss: (v) => ({ auto: 'auto', square: '1 / 1', video: '16 / 9' }[v] ?? v),
  },

  // --- Rahmen im Detail -----------------------------------------------------
  borderStyle: {
    css: ['border-style'],
    prefixes: ['border-solid', 'border-dashed', 'border-dotted', 'border-double', 'border-none'],
    bare: true,
    toClass: (v) => v,
    toCss: (v) => v.replace('border-', ''),
  },
  borderTopWidth: {
    css: ['border-top-width'],
    prefixes: ['border-t'],
    toClass: (v) => (v === '' ? 'border-t' : `border-t-${v}`),
    toCss: (v) => (v === '' ? '1px' : `${v}px`),
  },
  borderBottomWidth: {
    css: ['border-bottom-width'],
    prefixes: ['border-b'],
    toClass: (v) => (v === '' ? 'border-b' : `border-b-${v}`),
    toCss: (v) => (v === '' ? '1px' : `${v}px`),
  },
  borderLeftWidth: {
    css: ['border-left-width'],
    prefixes: ['border-l'],
    toClass: (v) => (v === '' ? 'border-l' : `border-l-${v}`),
    toCss: (v) => (v === '' ? '1px' : `${v}px`),
  },
  borderRightWidth: {
    css: ['border-right-width'],
    prefixes: ['border-r'],
    toClass: (v) => (v === '' ? 'border-r' : `border-r-${v}`),
    toCss: (v) => (v === '' ? '1px' : `${v}px`),
  },
  ringWidth: {
    css: ['--tw-ring-offset-shadow'],
    prefixes: ['ring'],
    only: ['0', '1', '2', '4', '8', ''],
    toClass: (v) => (v === '' ? 'ring' : `ring-${v}`),
    toCss: () => '',
  },

  // --- Bewegung -------------------------------------------------------------
  animation: {
    css: ['animation'],
    prefixes: ['animate'],
    toClass: (v) => `animate-${v}`,
    toCss: (v) => ({
      none: 'none',
      spin: 'spin 1s linear infinite',
      ping: 'ping 1s cubic-bezier(0,0,.2,1) infinite',
      pulse: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite',
      bounce: 'bounce 1s infinite',
    }[v] ?? ''),
  },
  transitionProperty: {
    css: ['transition-property'],
    prefixes: ['transition'],
    only: ['all', 'colors', 'opacity', 'shadow', 'transform', 'none', ''],
    toClass: (v) => (v === '' ? 'transition' : `transition-${v}`),
    toCss: (v) => (v === '' ? 'color, background-color, border-color, opacity, box-shadow, transform' : v),
  },
  duration: {
    css: ['transition-duration'],
    prefixes: ['duration'],
    toClass: (v) => `duration-${v}`,
    toCss: (v) => `${v}ms`,
  },
  ease: {
    css: ['transition-timing-function'],
    prefixes: ['ease'],
    only: ['linear', 'in', 'out', 'in-out'],
    toClass: (v) => `ease-${v}`,
    toCss: (v) => ({ linear: 'linear', in: 'cubic-bezier(.4,0,1,1)',
      out: 'cubic-bezier(0,0,.2,1)', 'in-out': 'cubic-bezier(.4,0,.2,1)' }[v]),
  },
  scale: {
    css: ['transform'],
    prefixes: ['scale'],
    toClass: (v) => `scale-${v}`,
    toCss: (v) => `scale(${Number(v) / 100})`,
  },
};


/** Alle Praefixe, die eine Klasse beim Setzen dieses Feldes verdraengen. */
export function conflictingClasses(fieldKey, classes) {
  const field = FIELDS[fieldKey];
  if (!field) return [];
  if (field.bare) return classes.filter((c) => field.prefixes.includes(stripVariants(c).base));

  return classes.filter((c) => {
    const { base } = stripVariants(c);
    return field.prefixes.some((p) => {
      if (!base.startsWith(p + '-')) return false;
      const suffix = base.slice(p.length + 1);
      // "text-" traegt drei Bedeutungen (Groesse, Ausrichtung, Farbe) -
      // nur die passende Gruppe darf verdraengt werden.
      // Ein freier Wert gehoert je nach Inhalt zur Groessen- oder Farbgruppe.
      if (ARBITRARY.test(suffix)) {
        return field.isColor ? arbitraryIsColor(suffix) : !arbitraryIsColor(suffix);
      }
      if (field.only) return field.only.includes(suffix);
      if (field.isColor) return !isSizeOrAlignSuffix(suffix);
      return true;
    }) || (field.prefixes.includes(base) && !field.only);
  });
}

/** Freie Werte in eckigen Klammern, z.B. text-[clamp(2rem,5vw,4rem)]. */
const ARBITRARY = /^\[(.*)\]$/;

/** Unterscheidet text-[#ff0000] (Farbe) von text-[1.5rem] (Groesse). */
function arbitraryIsColor(suffix) {
  const m = ARBITRARY.exec(suffix);
  return m ? /^(#|rgb|hsl|oklch|color-mix|var\(--)/i.test(m[1].trim()) : false;
}

const SIZE_OR_ALIGN = new Set([
  ...Object.keys(FONT_SIZE), 'left', 'center', 'right', 'justify',
  'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip',
]);
const isSizeOrAlignSuffix = (s) => SIZE_OR_ALIGN.has(s);

/** Trennt Varianten ("md:hover:") vom Klassenkern ("px-4"). */
export function stripVariants(cls) {
  const i = cls.lastIndexOf(':');
  return i === -1
    ? { variants: '', base: cls }
    : { variants: cls.slice(0, i + 1), base: cls.slice(i + 1) };
}

/**
 * Wendet eine Feldaenderung auf eine Klassenliste an.
 * variant: optionales Praefix wie "md:" oder "hover:".
 */
export function applyField(classes, fieldKey, value, variant = '') {
  const field = FIELDS[fieldKey];
  if (!field) return classes;

  // Nur Klassen derselben Variantenebene verdraengen.
  const sameLevel = classes.filter((c) => stripVariants(c).variants === variant);
  const doomed = new Set(
    conflictingClasses(fieldKey, sameLevel.map((c) => stripVariants(c).base))
      .map((base) => variant + base)
  );
  const next = classes.filter((c) => !doomed.has(c));

  if (value === null || value === undefined || value === '__unset__') return next;
  const cls = field.toClass(value);
  if (!cls) return next;
  const full = variant + cls;
  return next.includes(full) ? next : [...next, full];
}

/** CSS-Deklarationen fuer die sofortige Vorschau im DOM. */
export function previewStyle(fieldKey, value) {
  const field = FIELDS[fieldKey];
  if (!field) return {};
  const cssValue = field.toCss(value);
  return Object.fromEntries(field.css.map((prop) => [prop, cssValue]));
}
