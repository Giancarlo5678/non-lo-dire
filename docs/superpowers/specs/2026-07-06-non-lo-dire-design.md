# Design — "Non lo dire" (party game per iPhone, PWA)

**Data:** 6 luglio 2026
**Stato:** approvato dall'utente

## Cos'è

Party game in stile Taboo per giocare dal vivo. Un giocatore ha 60 secondi per far
indovinare alla propria squadra quante più parole possibili, senza pronunciare le
5 parole vietate associate a ciascuna parola. L'app è lo strumento di gioco:
mostra le carte, gestisce timer, punteggi e turni.

## Regole di gioco

- Da 2 a 6 squadre, con nomi modificabili (default "Squadra 1", "Squadra 2", …).
- Numero di round impostabile da 1 a 20. In ogni round ogni squadra fa un turno da 60 secondi.
- Parola indovinata: **+1** punto, si passa alla carta successiva.
- Parola vietata pronunciata: **−1** punto, si passa alla carta successiva.
- **3 skip** per turno: nuova carta senza variazione di punteggio.
- Chi descrive tiene il telefono e preme i pulsanti; un avversario guarda lo schermo
  con lui per verificare le parole vietate.
- A fine partita vince la squadra con più punti; i pareggi sono mostrati come pari merito.

## Scelte di fondo

- **PWA, non app nativa.** Xcode non è installato e non serve pubblicazione su App Store.
  La PWA si usa da Safari con "Aggiungi alla schermata Home", funziona offline, zero costi.
- **Vanilla JS, zero dipendenze e zero build.** Il gioco è locale (nessun server,
  nessun multiplayer online): una macchina a stati con 5 schermate e un timer.
- **Hosting su GitHub Pages** (gratuito, statico).

## Architettura e file

```
index.html            struttura delle 5 schermate
style.css             stile mobile-first (iPhone), tema leggibile a distanza
app.js                macchina a stati, timer, punteggi, persistenza
cards.js              database carte: ~1500 oggetti { parola, vietate: [5] }
sw.js                 service worker: cache di tutti gli asset → offline
manifest.webmanifest  nome, icone, display standalone
icons/                icona app (varie misure)
tests/logic.test.mjs  test logica di gioco (node, assert)
tests/validate-cards.mjs  validazione database carte
```

## Schermate e flusso

1. **Setup** — scelta numero squadre (2–6), nomi modificabili, numero round (1–20).
   Se in `localStorage` c'è una partita interrotta, propone "Riprendi partita".
2. **Passaggio telefono** — "Tocca a *[squadra]*, round X di Y. Passa il telefono a chi
   descrive". Pulsante grande "Via!" → countdown 3-2-1 → turno.
3. **Turno (60 s)** — parola in grande, le 5 vietate sotto ben leggibili, timer a barra +
   secondi rimanenti, punti del turno, skip rimasti. Pulsanti grandi: **✓ Indovinata** (+1),
   **✗ Vietata** (−1), **Skip** (disabilitato a 0 rimasti). Allo scadere: suono + vibrazione
   (dove supportata) e passaggio automatico al riepilogo.
4. **Fine turno** — punti fatti nel turno, classifica aggiornata, "Prossima squadra"
   (o "Risultati finali" se era l'ultimo turno).
5. **Fine partita** — classifica finale con vincitore evidenziato (pari merito gestito),
   "Nuova partita" (torna al Setup mantenendo nomi squadre).

## Stato e dati

- Un unico oggetto di stato: squadre (nome, punteggio), round corrente, indice squadra
  di turno, skip rimasti, indice carta corrente, fase corrente.
- **Persistenza:** stato salvato in `localStorage` a ogni azione. Se iOS ricarica la
  pagina (lock schermo, cambio app), la partita riprende da dov'era.
- **Mazzo anti-ripetizione:** le carte vengono mescolate una volta (ordine salvato in
  `localStorage`) e consumate progressivamente **anche tra partite diverse**. Si rimescola
  solo quando le ~1500 carte sono esaurite. Ripetizioni praticamente impossibili.
- **Timer:** basato su timestamp (`Date.now()`), non su conteggio di `setInterval` → nessun
  drift, robusto ai background. **Wake Lock API** per tenere lo schermo acceso nel turno.

## Database carte

- ~1500 carte italiane in `cards.js`: `{ w: "Mela", t: ["frutto", "Biancaneve", "rosso", "albero", "torta"] }`.
- Criteri di qualità: parole concrete e divertenti da descrivere a voce (oggetti, animali,
  cibi, personaggi, luoghi, azioni, mestieri…), niente astrattismi noiosi
  ("globalizzazione" no); le 5 vietate sono i 5 indizi più ovvi per quella parola.
- Generate in batch e validate da `tests/validate-cards.mjs`: parole uniche, esattamente
  5 vietate per carta, nessuna vietata uguale alla parola.

## Error handling

- Ripristino partita da `localStorage` (schermata Setup → "Riprendi partita").
- Timer a timestamp: se la pagina va in background, al ritorno il tempo residuo è corretto
  (il turno può risultare scaduto: si mostra il fine turno).
- Audio/vibrazione best-effort: se l'API non è disponibile si degrada in silenzio.

## Testing

- `tests/logic.test.mjs` (node, `assert`): punteggi ±1, skip (decremento e blocco a 0),
  rotazione squadre e round, fine partita, pareggi, consumo mazzo e rimescolamento.
- `tests/validate-cards.mjs`: integrità del database carte.
- Verifica manuale finale su iPhone reale (installazione da Safari, offline, Wake Lock).

## Fuori scope (per ora)

Multiplayer online, categorie/difficoltà delle carte, durata turno configurabile,
statistiche storiche, App Store. Da valutare solo se il gioco "prende".
