# Non lo dire

Party game in stile Taboo per serate tra amici. Ci si divide in squadre e a turno
una persona deve far indovinare più parole possibili in **60 secondi**, senza mai
pronunciare le **cinque parole vietate** stampate sulla carta. Si gioca dal vivo,
attorno a un tavolo: il telefono fa solo l'arbitro — tiene il tempo, conta i punti,
gestisce skip e round.

**Zero dipendenze, zero build.** È una PWA in JavaScript vanilla: una manciata di
file statici, nessun framework, nessun `npm install`. Si installa su iPhone dal browser
e **funziona completamente offline**, comprese tutte le carte.

**Live:** https://giancarlo5678.github.io/non-lo-dire/

## Cosa fa

- **1491 carte in italiano** — parole comuni divise in 75 categorie tematiche
  (animali, cibo, sport, mestieri, luoghi, fiabe, tecnologia, città italiane…),
  ognuna con esattamente cinque parole vietate.
- **Da 2 a 6 squadre, da 1 a 20 round** — nomi delle squadre liberi, con
  segnaposto automatico se li lasci vuoti.
- **Timer da 60 secondi** ancorato a un istante di scadenza, non a un contatore
  che scende: se il telefono si blocca o l'app va in background il tempo resta
  corretto. Barra di avanzamento e numeri rossi negli ultimi 10 secondi.
- **Punteggio a somma algebrica** — parola indovinata `+1`, parola vietata
  pronunciata `−1`, così barare costa.
- **Tre skip a turno** — per le carte impossibili, oltre non si va.
- **Lo schermo non si spegne** durante il turno (Wake Lock API dove disponibile).
- **Mazzo che non si ripete** — l'ordine è mescolato una volta e la posizione
  raggiunta viene ricordata tra una partita e l'altra: nella serata successiva si
  riparte dalle carte non ancora uscite, non dall'inizio.
- **Partita ripristinabile** — lo stato vive in `localStorage`, quindi se chiudi
  l'app per sbaglio ritrovi il pulsante "Riprendi partita".
- **Classifica con pari merito** — a punteggio uguale la posizione è la stessa
  (1, 1, 3), come nelle classifiche sportive.
- **Passaggio del telefono guidato** — tra un turno e l'altro una schermata dice
  a chi tocca, con conto alla rovescia 3-2-1 prima che la carta compaia.

## Architettura

Tre livelli separati, con una regola sola: la logica di gioco non tocca il DOM.

```
┌───────────────────────────────┐
│  app.js — UI ed effetti       │   5 schermate, timer, Wake Lock,
│                               │   localStorage, service worker
└──────────────┬────────────────┘
               │ chiama funzioni pure, riassegna lo stato
               ▼
┌───────────────────────────────┐
│  game.js — logica pura        │   stato, punteggi, skip, round,
│  DOM-free, testata            │   mazzo, classifica
└──────────────┬────────────────┘
               │ legge
               ▼
┌───────────────────────────────┐
│  cards.js — dati              │   { w: 'Parola', t: [5 vietate] }
└───────────────────────────────┘

sw.js  ──▶  cache di tutti gli asset: dopo la prima visita si gioca offline
```

- **`game.js` non conosce il browser.** Ogni funzione prende uno stato e ne
  restituisce uno nuovo, senza mutare l'input. È questo che la rende testabile
  senza aprire un browser: i 20 test girano in Node in una trentina di millisecondi.
- **Il timer usa una scadenza assoluta** (`turnEndsAt`), non un decremento. Un
  `setInterval` sospeso mentre lo schermo è spento non fa perdere il conto.
- **Il service worker serve prima dalla cache**, con la rete come ripiego e
  `index.html` come ultima risorsa: da qui l'offline completo.

## Requisiti

Per giocare: un telefono con un browser recente. Nient'altro.

Per sviluppare:

- Node 18+ (solo per i test — nessun pacchetto da installare)
- Python 3 (solo per l'anteprima locale)

## Setup

```bash
git clone https://github.com/Giancarlo5678/non-lo-dire.git
cd non-lo-dire
```

Fine. Non c'è un `npm install`: non ci sono dipendenze.

## Avvio

```bash
python3 -m http.server 8000
```

Poi apri http://localhost:8000. Serve un server vero — `index.html` aperto come
file non funziona, perché i moduli ES e il service worker richiedono `http://`.

## Installare su iPhone

Apri il [sito](https://giancarlo5678.github.io/non-lo-dire/) in **Safari** →
Condividi → **Aggiungi alla schermata Home**. Da lì parte a schermo intero, senza
barra del browser, e funziona senza connessione.

## Come si gioca

1. **Prepara** — scegli quante squadre (2–6), scrivi i nomi e quanti round
   giocare. Ogni round fa giocare tutte le squadre una volta.
2. **Passa il telefono** a chi deve descrivere, premi *Via!* e aspetta il 3-2-1.
3. **Descrivi** la parola grande senza mai pronunciare le cinque sotto, né loro
   derivati. Chi ascolta indovina a voce.
   - **✓ Indovinata** → `+1` e carta successiva
   - **✗ Vietata** → `−1` e carta successiva, se ti sfugge una parola proibita
   - **Skip** → carta successiva senza punti, massimo tre volte a turno
4. **Fine turno** — l'app mostra il bilancio del turno e la classifica aggiornata,
   poi passa alla squadra dopo.
5. **Risultati finali** dopo l'ultimo round. *Nuova partita* riparte tenendo i
   nomi delle squadre e proseguendo il mazzo da dove era rimasto.

## Struttura

```
index.html      le 5 schermate (setup, passaggio, turno, fine turno, risultati)
style.css       stile "scatola di gioco", token colore e font in :root
fonts/          Zilla Slab + Atkinson Hyperlegible (woff2, OFL), per l'offline
app.js          UI: router delle schermate, timer, Wake Lock, salvataggio, SW
game.js         logica pura: newGame, correct, taboo, skip, nextTurn, standings
cards.js        1491 carte { w, t[5] }, raggruppate per categoria nei commenti
sw.js           service worker, cache-first
manifest.webmanifest + icons/    metadati PWA e icone
tools/make-icons.mjs             rigenera le icone
tests/logic.test.mjs             20 test di game.js
tests/validate-cards.mjs         controlli di integrità sul mazzo
docs/superpowers/                spec di design e piano di implementazione
HANDOFF.md                       note per riprendere in mano il progetto
```

## Test

```bash
npm test            # 20 test della logica + validazione del mazzo
npm run test:logic  # solo la logica
```

`validate-cards.mjs` è la rete di sicurezza quando si toccano le carte: verifica
che ogni parola sia unica nel mazzo, che ogni carta abbia **esattamente** cinque
vietate, che non ci siano vietate duplicate e che nessuna vietata coincida con la
parola da indovinare. Passa quando stampa `validate-cards: OK (1491 cards)`.

## Modifiche tipiche

| Vuoi… | Metti mano a |
|-------|--------------|
| Aggiungere o correggere carte | `cards.js`, poi `node tests/validate-cards.mjs` |
| Cambiare durata turno o numero di skip | `TURN_MS` e `SKIPS_PER_TURN` in `game.js` |
| Cambiare le regole di punteggio | `correct` / `taboo` / `nextTurn` in `game.js`, e aggiorna i test |
| Grafica e colori | token in `:root` in `style.css`, font in `fonts/` |
| Flusso delle schermate | oggetto `renderers` in `app.js` |

## Deploy

Push su `main`: GitHub Pages ripubblica da solo in circa un minuto.

⚠️ **Se hai toccato un file in cache** (`index.html`, `style.css`, `app.js`,
`game.js`, `cards.js`, `fonts/`), devi incrementare la costante `CACHE` in `sw.js`
(ora `nonlodire-v4` → `nonlodire-v5`, e così via). Altrimenti il service worker
continua a servire la versione vecchia a chi ha già aperto l'app, e la modifica
non arriva a nessuno.

## Stato e roadmap

Funziona ed è in uso: partita completa, offline, installabile, ripristinabile.
Le note di sviluppo stanno in [HANDOFF.md](HANDOFF.md).

Non fatto, per scelta:

- **Categorie o difficoltà selezionabili** — il mazzo è unico e mescolato.
- **Durata del turno configurabile** — 60 secondi fissi.
- **Statistiche storiche** tra una serata e l'altra.
- **Multiplayer online** — il gioco è dal vivo, un telefono solo passa di mano.

## Contribuire

Issue e PR benvenute, soprattutto carte nuove: sono la parte che invecchia prima.
Prima di aprire una PR sul mazzo lancia `npm test`. Interfaccia e carte restano in
italiano — il gioco si basa su sinonimi e modi di dire, non è traducibile parola
per parola.

## Licenza

Nessuna licenza esplicita: tutti i diritti riservati all'autore.
