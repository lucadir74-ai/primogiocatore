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
    versione: '4.56.0',
    data: '2026-11-24',
    voci: [
      'Calendario interno con un link: /tavoli/calendario (o /tavoli/calendario/2026-12 per un mese) apre i Tavoli già sul calendario; chi non è entrato passa dall’accesso e poi ci arriva',
      'Aperto dal link, in cima le serate del mese a cui non hai ancora risposto, con Sì / Forse / No a portata di dito',
      'Calendario: pallino rosso sulle serate scoperte, dove nessun dimostratore ha ancora detto sì; toccando un giorno, subito sotto vedi chi c’è e chi forse',
      'Organizzatori: aprendo la sede puoi dare un titolo alla serata (torneo, demo…); nel calendario l’ora è sottolineata e, toccando il giorno, il titolo compare sopra chi c’è',
      'Organizzatori: «Invita a segnarsi su WhatsApp» (messaggio pronto con il link al mese) e «Copia link»',
    ],
  },
  {
    versione: '4.55.0',
    data: '2026-11-24',
    voci: [
      'Home: i tavoli di un evento hanno l’etichetta col nome dell’evento, che apre il suo programma',
      'Nuovo tavolo: se il giorno scelto cade in un evento, l’app chiede se il tavolo ne fa parte',
      'Tavolo: senza foto, nel cerchio di chi spiega c’è l’iniziale del nome al posto del «?»',
      'Classifica dell’evento: in cima partite, giocatori e giochi; nuove classifiche avversari diversi, giochi diversi, giochi impegnativi, e i Premi',
      'Classifiche → Eventi si vede anche prima che l’evento cominci; tasto «Classifica dell’evento» nella pagina dell’evento; durante l’evento in Statistiche la riga «come sto andando»',
      'Gestisci l’evento: Partecipazione, cioè quanti hanno giocato, quante partite e quanti sono entrati col link',
    ],
  },
  {
    versione: '4.54.1',
    data: '2026-11-24',
    voci: [
      'Indirizzi: se scritto per intero non si trova, la ricerca riprova da sola senza CAP e con il nome della via accorciato (OpenStreetMap scrive per esempio «Piazza J. F. Kennedy»)',
    ],
  },
  {
    versione: '4.54.0',
    data: '2026-11-24',
    voci: [
      'Eventi: alla creazione si mettono luogo e indirizzo (con «Trova»), e si possono cambiare nei dati dell’evento',
      'Tavoli di un evento: nel modulo «Dove» mostra la sede e l’indirizzo dell’evento; chi è socio può comunque scegliere un altro luogo',
    ],
  },
  {
    versione: '4.53.0',
    data: '2026-11-24',
    voci: [
      'Ricalcolo dell’IPG più veloce: le partite si leggono in quattro parti insieme, e i pesi BGG mancanti si chiedono dopo, col tempo che avanza (prima fino a 30 secondi a ogni ricalcolo). L’esito dice quanto dura ogni passaggio',
    ],
  },
  {
    versione: '4.52.2',
    data: '2026-11-24',
    voci: [
      'Ricalcolo dell’IPG: se il database impiega troppo, il server legge a pezzi più piccoli da solo e scrive più blocchi insieme; se non riesce, l’errore dice in quale passaggio',
    ],
  },
  {
    versione: '4.52.1',
    data: '2026-11-23',
    voci: [
      'Ricalcola ora: l’esito dice anche quante variazioni di IPG partita per partita sono state salvate per lo Storico',
    ],
  },
  {
    versione: '4.52.0',
    data: '2026-11-23',
    voci: [
      'Storico: aprendo una partita, sotto ogni giocatore con un account c’è quanto quella partita ha fatto salire o scendere il suo IPG (nel gioco e globale). Vale per tutte le partite, anche le vecchie, dopo il primo ricalcolo',
    ],
  },
  {
    versione: '4.51.0',
    data: '2026-11-23',
    voci: [
      'Primeggio: anche per le partite arrivate da BGG (con l’avviso «Da BGG» e dopo l’import in Dati e import) compare quanto sale o scende l’IPG',
    ],
  },
  {
    versione: '4.50.0',
    data: '2026-11-23',
    voci: [
      'Primeggio: anche dopo l’import da BG Stats compare quanto sale o scende l’IPG (fino a 30 partite nuove)',
    ],
  },
  {
    versione: '4.49.0',
    data: '2026-11-23',
    voci: [
      'Primeggio: anche per le partite arrivate da BGA (con l’avviso delle partite nuove e dopo l’import a mano) compare quanto sale o scende l’IPG',
    ],
  },
  {
    versione: '4.48.0',
    data: '2026-11-23',
    voci: [
      'Primeggio: appena registrata una partita, per ogni giocatore con un account compare quanto sale o scende il suo IPG in quel gioco e quello globale (stima; il valore vero arriva col ricalcolo di notte)',
    ],
  },
  {
    versione: '4.47.0',
    data: '2026-11-23',
    voci: [
      'Barre di avanzamento: nel ricalcolo dell’IPG, nell’aggiornamento della collezione BGG e in ogni fase dell’import da BGA e da BG Stats (prima, nelle fasi senza totale, la barra restava vuota)',
    ],
  },
  {
    versione: '4.46.0',
    data: '2026-11-23',
    voci: [
      'BGA: l’ora delle partite importate dall’app era un’ora avanti (due d’estate). Ora è giusta, e quelle già salvate si correggono da sole nei prossimi giorni',
    ],
  },
  {
    versione: '4.45.1',
    data: '2026-11-23',
    voci: [
      'BGA: torna l’avviso «Da BGA: partite nuove» in cima, anche per le partite entrate dal server a telefono spento, con «Guarda» per aprire lo storico',
    ],
  },
  {
    versione: '4.45.0',
    data: '2026-11-23',
    voci: [
      'Trascina giù la pagina col dito, dall’inizio, per aggiornare l’app: partono subito anche le sincronizzazioni con BGA e BGG',
      'Collezione BGG: si aggiorna da sola una volta al giorno, aprendo l’app (per chi l’ha già importata almeno una volta)',
    ],
  },
  {
    versione: '4.44.1',
    data: '2026-11-22',
    voci: [
      'BGA: aprendo l’app la partita appena finita entra subito, senza aspettare il giro orario del server',
    ],
  },
  {
    versione: '4.44.0',
    data: '2026-11-22',
    voci: [
      'Eventi: nell’evento si nominano solo gli organizzatori; chi partecipa entra da solo con il link o il QR, e chi spiega lo decide ogni tavolo',
      'Tavoli: ogni evento aperto ha una scheda in cima, che apre i suoi tavoli giorno per giorno, con l’ora e chi spiega',
      'Tavolo di un evento: la scelta della data propone i giorni dell’evento, c’è «Spiego io», e chi spiega si sceglie senza preferenze per i dimostratori della Tana',
      'Chi organizza un evento gestisce tutti i suoi tavoli: iscritti da accettare, modifiche, partite',
    ],
  },
  {
    versione: '4.43.3',
    data: '2026-11-22',
    voci: [
      'Classifiche: il ricalcolo notturno sostituisce la classifica solo quando quella nuova è completa (prima, se si interrompeva a metà, le classifiche restavano vuote o a pezzi)',
      'Soci: ogni organizzatore decide solo gli account della propria Tana (o senza Tana), in vista di Pescara',
      'Sito più protetto: non si può mostrare l’app dentro pagine di altri siti',
    ],
  },
  {
    versione: '4.43.2',
    data: '2026-11-22',
    voci: [
      'BGA: torna la sincronizzazione automatica ogni 10 minuti anche a telefono spento (dal 10 novembre si fermava sul server; le partite entravano solo aprendo l’app)',
    ],
  },
  {
    versione: '4.43.1',
    data: '2026-11-22',
    voci: [
      'Partite a squadre: chi si aggiunge al tavolo va nella squadra scelta in alto (prima finiva nella squadra con meno giocatori)',
    ],
  },
  {
    versione: '4.43.0',
    data: '2026-11-22',
    voci: [
      'Partite a squadre: si sceglie quante squadre (con − e +), poi si tocca una squadra e i giocatori da metterci, invece di toccare ogni giocatore finché arriva alla squadra giusta',
    ],
  },
  {
    versione: '4.42.0',
    data: '2026-11-22',
    voci: [
      'Partite a squadre: nella partita c’è la spunta «a squadre», accanto a «partita cooperativa». Un tocco su «Sq.» cambia la squadra di un giocatore, e si scrive un punteggio per squadra (o si tocca «ha vinto» se il gioco non ha punti)',
      'Storico e Statistiche: i giocatori stanno sotto la loro squadra, con il punteggio una volta sola; «Ripeti tavolo» rifà anche le squadre',
      'Statistiche: in un 2 contro 2 l’atteso è una vittoria su due, non su quattro, e il compagno di squadra non conta più come avversario nel testa a testa',
      'IPG: le partite a squadre restano fuori, perché non si può sapere quanto ha pesato ognuno',
    ],
  },
  {
    versione: '4.41.1',
    data: '2026-11-22',
    voci: [
      'BGG: un dispositivo o un browser nuovo non rilegge più da solo tutto l’archivio (aveva reimportato partite già presenti da BG Stats); parte dalle recenti',
      'BGG: se non si riesce a leggere l’elenco delle partite già mandate o scartate, la sincronizzazione si ferma e riprova dopo, invece di importare doppioni',
    ],
  },
  {
    versione: '4.41.0',
    data: '2026-11-22',
    voci: [
      'Profilo: «Scarica i miei dati» in JSON o CSV, con tutto quello che l’app ha su di te',
      'Elimina account: ricorda che non tocca l’iscrizione all’associazione',
      'Persone → Soci → Ex soci (solo amministratore): chi è stato tolto dall’elenco, da quanti giorni, e l’eliminazione del suo account',
    ],
  },
  {
    versione: '4.40.0',
    data: '2026-11-21',
    voci: [
      'Privacy: nome e cognome li vedono gli altri soci solo se nel profilo spunti «Gli altri soci possono vedere il mio nome e cognome»; altrimenti vedono il nick',
      'Gli organizzatori della Tana continuano a vedere nomi e cognomi; il riconoscimento degli ospiti usa sempre i nomi veri',
    ],
  },
  {
    versione: '4.39.0',
    data: '2026-11-21',
    voci: [
      'Informativa privacy al primo accesso: si legge e si accetta prima di entrare; l’app registra data e versione accettate',
      'Persone → Soci → Informativa (solo amministratore): si incolla il testo dell’associazione, si guarda l’anteprima e si pubblica; ogni versione nuova va riaccettata da tutti',
    ],
  },
  {
    versione: '4.38.0',
    data: '2026-11-21',
    voci: [
      'Iscrizione dei soci: si scrive il nick oppure l’email con cui ci si è associati; il link per attivare l’account arriva all’email che risulta all’associazione, che a schermo non compare mai',
      'Iscrizione: limite ai tentativi; chi ha già un account riceve il link per scegliere una password nuova',
      'Dal link della mail si sceglie subito la password; nick, nome e cognome arrivano dall’elenco soci',
    ],
  },
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
