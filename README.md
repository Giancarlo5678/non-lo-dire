# Non lo dire

Party game stile Taboo, PWA per iPhone. A squadre, 60 secondi a turno per far
indovinare parole senza dire le 5 vietate. Si gioca dal vivo; l'app tiene punti,
timer, skip e round.

## Giocare
Apri la pagina pubblicata su iPhone (Safari) → Condividi → "Aggiungi alla schermata Home".
Funziona offline.

## Sviluppo
Nessuna dipendenza. `npm test` esegue i test della logica e valida il database carte.
Anteprima locale: `python3 -m http.server 8000` e apri http://localhost:8000
Dopo aver modificato un asset in cache, ricorda di aggiornare la costante `CACHE` in `sw.js` (es. `nonlodire-v1` → `nonlodire-v2`), altrimenti il service worker non distribuirà l'aggiornamento.
