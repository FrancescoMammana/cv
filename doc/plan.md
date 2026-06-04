# Piano di Sviluppo: Fix PDF — Esperienze tagliate a metà

## Problema

Il bottone "PDF" nella pagina principale usa **html2pdf.js** per generare un PDF.
html2pdf.js rende tutto il contenuto HTML in canvas tramite html2canvas e poi lo
suddivide in pagine A4 con jsPDF. Di default **non sa quali elementi vanno preservati
intatti**, quindi taglia a metà gli `.item` delle esperienze (e potenzialmente altre
sezioni) quando cadono a cavallo tra due pagine.

## Causa

In `/home/ubuntu/projects/cv/assets/js/pdf-generator.js` manca l'opzione `pagebreak`
di html2pdf.js, che permette di specificare:
- quali elementi **non** devono essere spezzati (`avoid`)
- quali modalità di page-break usare tra CSS, avoid-all, legacy

In `/home/ubuntu/projects/cv/_sass/_print.scss` manca `break-inside: avoid` sugli
elementi `.item`, che aiuterebbe sia la modalità CSS di html2pdf sia la stampa nativa.

## Soluzione

### Step 1 — Modificare `assets/js/pdf-generator.js` ✅

Aggiungere il blocco `pagebreak` nell'oggetto `opt` passato a html2pdf:

```javascript
pagebreak: {
  mode: ["avoid-all", "css", "legacy"],
  avoid: [".item"],
},
```

- **`mode: ['avoid-all', 'css', 'legacy']`**: dice a html2pdf di rispettare le regole
  CSS `break-inside` (`css`), di evitare rotture ovunque possibile (`avoid-all`),
  e di usare l'algoritmo legacy come fallback (`legacy`).
- **`avoid: ['.item']`**: impedisce esplicitamente di spezzare gli elementi con
  classe `.item` (usata da experiences, projects, certifications, ecc.).

### Step 2 — Modificare `_sass/_print.scss` ✅

Aggiungere, all'interno del blocco `@media print`:

```scss
.experiences-section .item,
.projects-section .item,
.certifications-section .item {
  break-inside: avoid;
}
```

Questo garantisce che il `mode: 'css'` di html2pdf abbia regole da rispettare,
e migliora anche la stampa nativa dal browser.

### Step 3 — Verifica ✅

(L'ambiente non ha Ruby/Jekyll per buildare, ma JS e SCSS sono stati validati a vista:

- JS: l'oggetto `pagebreak` segue la stessa sintassi degli altri campi in `opt`.
- SCSS: `break-inside: avoid` segue lo stesso pattern già presente nel file.
- `git diff` conferma modifiche pulite e circoscritte.)

## Come testare

```bash
bundle exec jekyll serve
```

Poi cliccare il bottone "PDF" e controllare che le esperienze non siano più tagliate.

1. Aprire la pagina principale in locale (o su GitHub Pages dopo il deploy).
2. Cliccare il bottone "PDF".
3. Controllare che le esperienze non siano più tagliate a metà tra una pagina e l'altra.
4. Verificare che il resto del layout (sidebar, skills, ecc.) sia ancora corretto.

### File coinvolti

| File | Modifica |
|------|----------|
| `assets/js/pdf-generator.js` | Aggiunto `pagebreak` alle opzioni html2pdf |
| `_sass/_print.scss` | Aggiunto `break-inside: avoid` sugli `.item` |
| `doc/plan.md` | Documento di pianificazione e report modifiche |
