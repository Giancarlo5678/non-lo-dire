# HANDOFF — Non lo dire

Punto di ripartenza per modifiche future. Se leggi questo dopo un po', parti da qui.

## Cos'è
Party game stile Taboo, **PWA vanilla JavaScript** (zero dipendenze, nessun build step),
installabile su iPhone da Safari. Si gioca dal vivo; l'app tiene punti, timer, skip e round.

- **Live:** https://giancarlo5678.github.io/non-lo-dire/
- **Repo:** https://github.com/Giancarlo5678/non-lo-dire (pubblica, branch `main`)
- **Stato:** completa e deployata. Working tree pulito, `main` = `origin/main`.

## Ripartire da zero (se la cartella locale non c'è più)
```bash
git clone https://github.com/Giancarlo5678/non-lo-dire.git
cd non-lo-dire
```
Nessuna dipendenza da installare. Serve solo Node (per i test) e Python3 (per l'anteprima).

## Struttura dei file
| File | Responsabilità |
|------|----------------|
| `game.js` | **Logica pura** (DOM-free, testata): stato, punteggi, skip, round, mazzo, classifica. Ogni funzione ritorna nuovo stato, non muta gli input. |
| `app.js` | UI: le 5 schermate, timer (timestamp), Wake Lock, persistenza `localStorage`, service worker. |
| `cards.js` | ~1491 carte `{ w: 'Parola', t: ['5','parole','vietate','...'] }`. |
| `index.html` / `style.css` | Markup 5 schermate + stile "scatola di gioco" (token colore in `:root`). |
| `fonts/` | Zilla Slab e Atkinson Hyperlegible in woff2 (OFL), inclusi per l'offline. |
| `sw.js` | Service worker, cache offline di tutti gli asset. |
| `manifest.webmanifest` / `icons/` | Metadati PWA + icone col cartello di divieto (rigenerabili con `node tools/make-icons.mjs`). |
| `tests/logic.test.mjs` | 20 test della logica (node:test). |
| `tests/validate-cards.mjs` | Validazione database carte. |
| `docs/superpowers/` | Spec di design e piano di implementazione. |

## Comandi
```bash
npm test                       # 20 test logica + validazione carte
python3 -m http.server 8000    # anteprima locale → http://localhost:8000
```

## Deploy (dopo una modifica)
1. `git add -A && git commit -m "..."` e `git push` su `main`.
2. **Se hai toccato un asset cacheato** (app.js, game.js, cards.js, style.css, index.html, fonts/):
   bumpa la costante `CACHE` in `sw.js` (ora `nonlodire-v5` → `-v6`, ecc.), altrimenti il
   service worker continua a servire la versione vecchia.
3. GitHub Pages ripubblica da solo da `main` in ~1 minuto.

## Dove mettere le mani per le modifiche tipiche
- **Aggiungere/cambiare carte** → `cards.js` (poi `node tests/validate-cards.mjs`: parole
  uniche, esattamente 5 vietate, nessuna vietata = parola).
- **Regole di gioco** (punti, durata turno, numero skip) → costanti e funzioni in `game.js`
  (`TURN_MS`, `SKIPS_PER_TURN`, `correct`/`taboo`/`skip`/`nextTurn`). Aggiorna i test.
- **Grafica/layout** → `style.css` (token colore e font in `:root`) e `index.html`. Design di riferimento: `docs/superpowers/specs/2026-10-09-restyling-scatola-di-gioco-design.md`.
- **Flusso schermate / timer** → `app.js` (oggetto `renderers`).

## Metodo di lavoro consigliato per riprendere
Il progetto è nato con il flusso Superpowers (brainstorming → spec → piano →
subagent-driven). Per modifiche piccole basta editare + `npm test` + push. Per feature
grosse, ripartire da brainstorming/spec.

## Rifiniture minori note (non bloccanti, opzionali)
- Un paio di carte concettualmente vicine restano in `cards.js` (es. "Costruzioni" /
  "Costruzioni Lego", "Cuscino gonfiabile" / "Materassino gonfiabile"): puramente estetico.
- Idee non implementate (fuori scope): categorie/difficoltà carte, durata turno
  configurabile, statistiche storiche, multiplayer online.
