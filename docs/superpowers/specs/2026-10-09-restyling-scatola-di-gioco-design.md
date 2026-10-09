# Restyling "scatola di gioco" — design

Data: 2026-10-09. Stato: approvato in brainstorming, da rileggere.

## Obiettivo

Restyling grafico + migliorie di usabilità durante il gioco (opzione B). Nessuna
funzione nuova, nessuna modifica a regole o carte.

## Contesto d'uso

Durante il turno chi descrive tiene il telefono e legge la carta; un avversario guarda
da sopra la spalla per controllare le parole vietate e a volte preme lui "Vietata".
Quindi: carta leggibile da due persone anche di sbieco; i tasti di chi descrive e quello
dell'avversario ben separati.

## Identità visiva

Tono "gioco da tavolo": l'app sembra la scatola di un gioco e le carte carte stampate.
Motivo ricorrente: il **cartello di divieto** italiano (cerchio rosso, fondo bianco),
usato nel logo, nella fascia della carta e nel tasto "Vietata".

| Token | Valore | Uso |
|---|---|---|
| `--box` | `#A4161A` | fondo di setup e passaggio telefono (la "copertina"), tasto primario, fascia carta |
| `--paper` | `#FDFCFA` | fondo carta (bianco stampato, non crema) |
| `--ink` | `#1C1917` | testo sulla carta |
| `--table` | `#2B211C` | fondo di turno, fine turno e risultati (legno scuro) |
| `--ok` | `#2F7D4F` | "Indovinata" |

Caratteri, entrambi self-hosted in `fonts/` (woff2, licenza OFL) e in cache offline:
- **Zilla Slab** (600/700): parola da indovinare, titoli, punteggi, timer.
- **Atkinson Hyperlegible** (400/700): parole vietate e testo dell'interfaccia.

Movimento solo in risposta alle azioni, disattivato con `prefers-reduced-motion`:
- Indovinata → la carta esce a destra; Skip → esce a sinistra;
- Vietata → timbro rosso "VIETATA" sulla carta, poi carta successiva.
Negli ultimi 10 secondi il timer diventa rosso (comportamento già esistente, restilizzato).

Escluso esplicitamente dall'utente: pulsante "Annulla".

## Schermate

**Setup (copertina).** Fondo `--box`; cartello di divieto + titolo "Non lo dire" in Zilla Slab bianco
(rosso su `--table` avrebbe contrasto ~2:1, illeggibile).
Numero squadre e numero round con **stepper** `[−] n [+]` (limiti invariati: 2–6
squadre, 1–20 round) al posto di `<select>` e `<input type=number>`. Campi nome
squadra a tutta larghezza. "Inizia partita" primario; "Riprendi partita" secondario,
visibile solo se c'è una partita salvata (comportamento attuale).

**Passaggio del telefono.** Fondo `--box`. "Round N di M" piccolo, "Tocca a: <squadra>" grande,
pulsante "Via!", poi countdown 3-2-1 a tutto schermo (logica attuale).

**Turno.** Riga 1: timer grande `0:42` + barra a tutta larghezza. Riga 2: nome squadra
a sinistra, punti del turno a destra (oggi stanno sulla stessa riga del timer e la
schiacciano). Carta al centro: fascia rossa con la parola in bianco, sotto le 5 parole
vietate grandi separate da filetti. In basso una riga di tre tasti:
`[✗ Vietata]` a sinistra, `[Skip n]` al centro e più stretto, `[✓ Indovinata]` a destra.
Corregge il bug attuale per cui Vietata e Indovinata vanno a capo a mezza larghezza.

**Fine turno.** Riassunto del turno ("<squadra>: +4 questo turno") + **foglio
segnapunti**: una riga per squadra, punteggio in Zilla Slab, squadra in testa evidenziata.

**Risultati finali.** Vincitrice in grande, poi la classifica nello stesso stile segnapunti.

## Architettura e file

Resta vanilla JS, zero dipendenze, nessun build step.
- `style.css`: riscritto (token in `:root`).
- `index.html`: logo, stepper, struttura riga timer/meta.
- `app.js`: solo UI — stepper, classi per le animazioni carta, testi delle schermate.
  La logica di stato resta in `game.js`.
- `game.js`, `cards.js`: **invariati**.
- `fonts/`: file woff2 + `@font-face` in `style.css`.
- `sw.js`: aggiungere i font ad `ASSETS`, bump `CACHE` a `nonlodire-v3`.
- `README.md` / `HANDOFF.md`: aggiornare le parti su grafica e cache.

## Verifica

- `npm test`: 19 test della logica + validazione carte, tutti verdi.
- Screenshot iPhone (390×844) di tutte le schermate; i tre tasti del turno su una riga.
- Partita completa simulata (setup → turni → fine turno → risultati) senza errori in console.
- Offline: dopo la prima visita, ricarica senza rete → app e font visibili.
- Contrasto testo/sfondo almeno 4.5:1 per testi, focus da tastiera visibile.

## Pubblicazione

Commit a nome dell'utente, senza trailer. Push su `main` (deploy GitHub Pages, pubblico)
**solo dopo** che l'utente ha visto gli screenshot.
