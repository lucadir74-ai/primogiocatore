# Partite a squadre: piano di lavoro

Stato: **da fare** (deciso il 21/11/2026, da riprendere).

## Perché

Oggi l'app non conosce le partite a squadre (Codenames, Tichu, Crokinole in
coppia, Decrypto…). L'unica «squadra» è quella delle cooperative, dove tutti
giocano insieme (spunta «partita cooperativa», punteggio di squadra o punti a
testa, versione 4.34.0).

Cosa succede adesso con un gioco a squadre:

- **Registrazione**: l'unico modo è dare lo stesso punteggio ai compagni, così
  risultano pari in testa, e poi usare «Vittoria condivisa». Senza punteggi non
  si riesce.
- **Statistiche, «× atteso»**: in un 2 contro 2 si dovrebbe vincere 1 volta su
  2, ma l'app conta 1 su 4 (`1 / numero di giocatori`). Chi gioca spesso a
  squadre risulta più forte di quanto è.
- **Testa a testa**: il compagno di squadra conta come avversario. Se vincete
  insieme, risulta che vi siete «battuti» a vicenda.
- **IPG (Primeggio)**: ogni giocatore è trattato come una squadra da solo.
- **Import**:
  - BG Stats salva già `partecipazioni.squadra` (numero della squadra) e
    `partite.a_squadre` (`src/bgstats.js`, righe ~261 e ~305), ma l'app non li
    mostra né li usa.
  - BGA (`src/bgaFormato.js`, `rankedTeams`) dà ai compagni lo stesso
    piazzamento, quindi vincono insieme. Il numero della squadra però non viene
    salvato.

## Come farlo

### 1. Registrazione (`src/Partita.jsx`)

- Spunta **«a squadre»** nella partita, come «partita cooperativa».
  Esclude la cooperativa: una cooperativa è già una squadra sola.
- Ogni giocatore viene assegnato a una squadra (Squadra 1, 2, 3…) con un tocco
  sul giocatore.
- **Un punteggio per squadra.** Vince la squadra con più punti, e tutti i suoi
  giocatori risultano vincitori. `posizione` = piazzamento della squadra.
  Se il gioco non ha punti, si sceglie a mano la squadra vincitrice.
  Se due squadre sono pari in testa, servono gli stessi strumenti di oggi:
  «ha vinto» oppure vittoria condivisa, ma per squadra.
- Salvataggio: per ogni giocatore `squadra`, `punteggio_totale` = punteggio
  della squadra, `posizione`, `vincitore`.
- Da tenere allineati:
  - bozza della partita in corso (`bozza.js`);
  - «Ripeti tavolo» (`src/rivincita.js` e `fotoRivincita` in `Partita.jsx`):
    deve rifare anche le squadre;
  - modifica di una partita (`caricaPartita`);
  - coda senza rete (`src/coda.js`, `scriviPartita`).

### 2. Database (script SQL da far girare su Supabase)

- Verificare che esistano `partecipazioni.squadra` e `partite.a_squadre`.
  Lo schema di base non è nel repository: l'import da BG Stats li scrive, quindi
  probabilmente ci sono. In ogni caso usare `add column if not exists`.
- Aggiornare `salva_partita`, che oggi non salva la squadra.
  L'ultima versione è in `supabase/eventi_fase3.sql` (c'è anche in
  `partite_sicure.sql`): aggiungere `squadra` nell'insert di `partecipazioni`
  e `a_squadre` su `partite`.
- Se serve, aggiungere i campi anche a `classifica_evento`
  (`supabase/eventi_fase5.sql`) e a `primeggio_leggero.sql`, perché l'IPG li
  possa leggere.

### 3. Storico e Statistiche (`src/Storico.jsx`, `src/Statistiche.jsx`)

- Storico: giocatori raggruppati per squadra, punteggio una volta per squadra,
  «Vince la squadra di …».
- **Atteso** = `1 / numero di squadre` invece di `1 / numero di giocatori`
  (oggi `quanti(p)` e `contaEsito`).
- **Testa a testa**: i compagni non contano come avversari. Eventualmente una
  voce a parte, «in squadra insieme».
- Punteggi tipici del gioco: un punteggio per squadra, non uno per giocatore
  (come già si fa per le cooperative con `punteggioSquadra`).

### 4. IPG (`src/primeggioCalcolo.js`, anche `api/primeggio.js`)

- Oggi: `rate(voci.map((v) => [v.r]), { rank })`, cioè ogni giocatore è una
  squadra da solo.
- Con le squadre: raggruppare i giocatori per squadra,
  `rate([[a, b], [c, d]], { rank: [rank squadra 1, rank squadra 2] })`.
  OpenSkill gestisce le squadre da solo.
- Attenzione: il calcolo gira anche sul server (`api/primeggio.js`) e serve per
  le classifiche degli eventi. Le due versioni devono restare uguali.

### 5. Import ed export

- BG Stats: già scrive `squadra` e `a_squadre`. Basta che l'app li usi.
- BGA: salvare anche il numero della squadra da `rankedTeams`.
- Invio a BGG (`api/bgginvio.js`): BGG non ha un campo squadra per i giocatori.
  Si può mettere la squadra nel campo «colore» oppure lasciarla fuori.

## Ordine proposto

1. Database, registrazione e Storico. Già utile da solo: le partite a squadre
   si segnano bene.
2. Statistiche e IPG.
3. Import BGA ed export BGG.

## Da decidere con Luca

- Il punteggio è solo per squadra, o anche a testa con la somma per squadra?
  Proposta: per squadra.
- Un gioco può essere segnato «a squadre» di base nel catalogo, come per le
  cooperative, o basta la spunta nella partita? Proposta: spunta nella partita,
  con «Ripeti tavolo» che la ricorda.
- Le partite a squadre contano nell'IPG come le altre, o pesano meno?
