<div align="center">
  <img src="https://img.shields.io/badge/Jekyll-CC0000?logo=jekyll&logoColor=white" alt="Jekyll"/>
  <img src="https://img.shields.io/badge/GitHub%20Pages-222222?logo=githubpages&logoColor=white" alt="GitHub Pages"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/C%23-239120?logo=csharp&logoColor=white" alt="C#"/>
  <img src="https://img.shields.io/badge/.NET-512BD4?logo=dotnet&logoColor=white" alt=".NET"/>
  <img src="https://img.shields.io/badge/SQL%20Server-CC2927?logo=microsoftsqlserver&logoColor=white" alt="SQL Server"/>
  <br/>
  <a href="https://francescomammana.github.io/cv/">🌐 Visita il sito live</a>
</div>

# Francesco Mammana — CV Online

Benvenuto nel repository del mio **curriculum vitae online**, un sito statico realizzato con [Jekyll](https://jekyllrb.com/) e ospitato su [GitHub Pages](https://pages.github.com/).

## Chi sono

Sono **Francesco Mammana**, un Senior .NET Developer con oltre vent'anni di esperienza nella progettazione di sistemi gestionali ed ERP per la gestione di grandi volumi di dati.

Attualmente lavoro presso **Datev Koinos Italia**, dove sviluppo soluzioni cloud per l'ambito fiscale e immobiliare.

### Competenze principali

- **Linguaggi:** C#, VB.NET, SQL
- **Framework:** .NET (WinForms, WPF, Wisej), ASP.NET
- **Database:** SQL Server, Redis
- **Pattern:** Dependency Injection, programmazione asincrona, Dapper
- **Strumenti:** Docker, Git, Linux

## Tech stack del sito

| Tecnologia | Ruolo |
|---|---|
| [Jekyll](https://jekyllrb.com/) | Static site generator (Ruby) |
| [GitHub Pages](https://pages.github.com/) | Hosting |
| [Sass / SCSS](https://sass-lang.com/) | Preprocessore CSS |
| [Liquid](https://shopify.github.io/liquid/) | Template engine |
| [Docker](https://www.docker.com/) | Ambiente di sviluppo locale |
| Tema base | [Online CV](https://github.com/sharu725/online-cv) di Xiaoying Riley / sharu725 |

## Sviluppo locale

### Con Docker (consigliato)

```bash
docker-compose up
```

Il sito sarà disponibile su [http://localhost:4000](http://localhost:4000).

### Con Ruby in locale

```bash
bundle install
bundle exec jekyll serve
```

## Licenza

Il template originale "Orbit" è stato realizzato da **Xiaoying Riley** ([3rd Wave Media](http://themes.3rdwavemedia.com/)) ed è distribuito sotto licenza Creative Commons Attribution 3.0.

Il repository è stato personalizzato e adattato da Francesco Mammana per uso personale.

## Stampa e PDF

Il pulsante **PDF** apre direttamente la stampa nativa del browser, senza cambiare
pagina né mostrare comandi intermedi. Il documento è A4 fisso con testo
selezionabile; il CV sul sito si adatta anche allo schermo del telefono.
Il pulsante viene abilitato dopo il caricamento di immagini e font. Il browser
gestisce il salvataggio finale; il titolo della pagina viene ripristinato quando
si chiude o annulla la stampa. Non sono necessari popup o conversioni in immagini.

La lingua dell'HTML e dei messaggi di stampa si sceglie con `lang` in
`_config.yml`: `it` (predefinita) o `en`. Le varianti come `en-GB` riusano
le traduzioni inglesi. Altre lingue si aggiungono in `_data/ui.yml`; una lingua
non presente usa i messaggi italiani. Questa impostazione non traduce i testi
personali del CV, che restano in `_data/data.yml`.

Se `sidebar.name` manca o è vuoto, il nome proposto per il PDF usa il titolo
del sito; se manca anche questo, usa `CV`. CSS, formato A4 e impaginazione
non dipendono da queste impostazioni.

Dopo una build Jekyll, i test browser richiedono Node.js, Playwright, Chromium
e gli strumenti Poppler (`pdfinfo` e `pdftotext`):

```sh
bundle exec jekyll build
node --test _tests/print.browser.test.cjs
```

Per una build in un'altra cartella o con prefisso `/cv`, impostare rispettivamente
`CV_SITE_DIR` e `CV_BASEURL`. `CHROMIUM_PATH` permette di scegliere l'eseguibile.

Il test opzionale per un fork usa `CV_FORK_SITE_DIR`: una build di esempio con
`lang: en-GB`, `title: Example CV` e senza `sidebar.name` nei dati del CV.
