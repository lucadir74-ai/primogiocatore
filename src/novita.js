// Primo Giocatore - versioni e novità
// v1.0.0 - 202611181200
//
// L'elenco che si legge in Profilo → Info, dalla versione più recente.
// A ogni uscita: una voce nuova in cima e lo stesso numero in package.json
// (è da lì che l'app prende la versione che mostra).

import { version } from '../package.json'

export const VERSIONE = version

export const FIRMA = {
  nome: 'Luca Di Russo',
  soprannome: 'lucadir',
}

export const NOVITA = [
  {
    versione: '4.37.0',
    data: '2026-11-21',
    voci: [
      'Registro delle operazioni (solo amministratore, in Persone → Soci): caricamenti, modifiche e consultazioni dell’elenco soci, schede aperte, ruoli e decisioni sugli accessi',
    ],
  },
  {
    versione: '4.36.0',
    data: '2026-11-21',
    voci: [
      'Privacy: la città non si chiede più, né all’iscrizione né nel profilo; quelle già salvate vengono cancellate',
      'Soci: importando il CSV si può «sostituire tutto l’elenco» della Tana; prima di confermare si vede chi verrà tolto',
      'Soci: dal file si leggono solo nickname, nome, cognome, email e Tana; le altre colonne vengono scartate',
    ],
  },
  {
    versione: '4.35.0',
    data: '2026-11-21',
    voci: [
      'Partita appena registrata: tasto «Ripeti tavolo», stesso gioco e stessi giocatori, con lo stesso luogo ed evento; punti, fazioni e ordine di turno da capo',
      'Storico: «Ripeti tavolo» su ogni partita, non solo sull’ultima',
    ],
  },
  {
    versione: '4.34.0',
    data: '2026-11-20',
    voci: [
      'Partita: «partita cooperativa» si sceglie partita per partita, anche se il gioco nel catalogo dice altro (per i giochi segnati male e per quelli che si giocano in tutti e due i modi)',
      'Chi ha inserito il gioco, o un organizzatore, da lì lo può segnare cooperativo o competitivo anche per le prossime partite',
      'Cooperative: si può segnare il punteggio di squadra (facoltativo), oppure i punti a testa accanto a ogni nome',
      'Storico e Statistiche: le cooperative perse mostrano «persa insieme» (prima non si vedeva niente) e il punteggio di squadra una volta sola',
      'Statistiche: le cooperative vinte si contano a parte anche gioco per gioco, per giocatore e per fazione, e non gonfiano più il confronto con l’atteso',
      'Giochi nuovi da BGG con la meccanica «Cooperative Game»: nascono già cooperativi',
      'Import da BGG: le partite dei giochi cooperativi entrano cooperative, vinte o perse da tutti',
    ],
  },
  {
    versione: '4.33.0',
    data: '2026-11-18',
    voci: [
      'Menu più semplice: in basso cinque tasti (Giocatori si apre da Statistiche, Contatti dalla Home)',
      'Profilo riordinato in poche voci: Il mio profilo, Porta le tue partite, Da sistemare (ospiti, luoghi, giochi doppi), Persone (soci e ruoli), Eventi',
      'Partite: solo l’elenco, con ricerca e filtro dal vivo / online; per gioco, giocatore e luogo c’è Statistiche',
      'Gli avvisi in cima stanno in un riquadro solo',
      'Ospiti: nuova parte «Si sono iscritti», che trova chi ha giocato come ospite per nome e cognome, anche scritti un po’ diversi, e lo unisce con un tocco',
      'Ospiti e Luoghi: ognuno vede i tasti solo per quello che ha inserito lui; gli organizzatori per tutto',
      'Luoghi: l’unione di due luoghi la fa il database in un colpo solo',
      'Ruoli: dare o togliere un ruolo chiede conferma',
      'Profilo: le modifiche valgono solo dopo «Salva», e si possono annullare',
    ],
  },
  {
    versione: '4.32.0',
    data: '2026-11-18',
    voci: [
      'Nuova sezione Info nel Profilo: versione dell’app, autore e novità di ogni uscita',
      'Calendario delle serate: orari a bottoni come nei tavoli',
      'Appello delle serate: Sì / Forse / No accanto a ogni dimostratore',
      'Classifiche e Statistiche: la spiegazione completa del calcolo dell’IPG',
      'Partita: durata scritta in ore e minuti',
      'Ospiti: sotto ogni ospite si aprono le sue partite e il cognome si vede ovunque',
      'Invio a BGG: gli ospiti partono con nome e cognome',
    ],
  },
  {
    versione: '4.31.1',
    data: '2026-11-14',
    voci: [
      'Home: dal menu in basso ogni pagina si apre dall’inizio, con tavoli e IPG già a posto',
    ],
  },
  {
    versione: '4.31.0',
    data: '2026-11-14',
    voci: [
      'Apertura senza attese: accesso e profilo dal telefono, poi si aggiornano dalla rete',
      'Classifiche per gioco: nell’elenco anche la propria posizione, «è 1° su N»',
      'Statistiche: tasto per le Classifiche con la propria posizione in Primeggio',
    ],
  },
  {
    versione: '4.30.0',
    data: '2026-11-13',
    voci: [
      'Versione nuova dell’app: si propone invece di ricaricare la pagina da sola',
      'Avviso «server in ritardo» ed elenco delle risposte lente in Dati e import',
      'Primeggio e Classifiche più leggeri da caricare',
      'Ricerca nello storico delle partite',
      '«Rifai l’ultima» solo per le partite dal vivo; niente Modifica sulle partite arrivate da BGA',
    ],
  },
  {
    versione: '4.29.0',
    data: '2026-11-13',
    voci: [
      'Richieste con tempo massimo: l’app non resta più bloccata ad aspettare',
      'Schermata d’errore con il tasto «Ricarica»',
      'Profilo non più riletto a ogni ritorno all’app',
    ],
  },
  {
    versione: '4.28.1',
    data: '2026-11-12',
    voci: [
      'Avvisi delle richieste riletti al massimo una volta al minuto',
    ],
  },
  {
    versione: '4.28.0',
    data: '2026-11-12',
    voci: [
      'Ospiti riconosciuti da soli con nick o nome e cognome; i dubbi li conferma chi li ha inseriti',
      'Ospiti da riconoscere: mai per il solo nome di battesimo, con «vedi le partite» per capire chi è',
      'Ricerca veloce anche con migliaia di ospiti',
      'Home: il riquadro «Prossimi tavoli», con quanti hanno ancora posto',
      'Tavoli: schede compatte che si aprono al tocco, pronte anche per eventi con tanti tavoli',
      'Contatti: un’icona per ogni tipo e il tipo «Indirizzo», che apre la mappa',
      'Senza rete si rivedono anche contatti e ospiti da riconoscere',
    ],
  },
  {
    versione: '4.27.0',
    data: '2026-11-12',
    voci: [
      'Pagina «Partite»: nuova partita e storico insieme',
      'Contatti della Tana, anche nella barra in basso',
      'Dati e import: procedura guidata in quattro passi',
    ],
  },
  {
    versione: '4.26.0',
    data: '2026-11-10',
    voci: [
      'Si apre e si consulta anche senza rete: Tavoli, Giochi, Giocatori, Classifiche e Profilo',
      'Partita senza rete: giochi e giocatori già pronti, e ciò che scrivi parte da solo quando torna la rete',
      'Guida per installare l’app su iPhone',
      'Niente doppioni: avviso se la partita è già registrata',
      'Cosa manca su BGG: confronto con l’archivio e invio delle partite mancanti',
      'Tavoli: luogo «Tana dei Goblin Roma» e ore 20:45 già messi, note accanto al titolo',
      'Pagine più veloci grazie all’archivio sul telefono',
    ],
  },
  {
    versione: '4.25.1',
    data: '2026-11-03',
    voci: [
      'Dalla Home si va a Dati e import per il primo import',
      'Scheda iscritto: spiega perché le partite BGA importate sono meno di quelle del profilo',
    ],
  },
  {
    versione: '4.25.0',
    data: '2026-11-03',
    voci: [
      'Home nella barra in fondo; «Esci» solo nel Profilo',
    ],
  },
]
