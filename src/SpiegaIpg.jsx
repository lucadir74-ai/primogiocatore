// Primo Giocatore - Primeggio: la spiegazione del calcolo dell'IPG
// v1.0.0 - 202611151200
//
// Il testo completo di come nasce il numero, in una sezione che si apre
// a richiesta. Sta in fondo alle Classifiche e sotto la classifica
// Primeggio delle Statistiche. Le spiegazioni brevi (la «i» accanto ai
// numeri) restano dove sono.

// Gli stessi numeri del calcolo sul server (src/primeggioCalcolo.js):
// se cambiano là, vanno cambiati anche qui.
const MIN_GIOCO = 5
const MIN_GLOBALE = 20
const TETTO_PARTITE = 20
const PESO_NEUTRO = '2,5'

export default function SpiegaIpg() {
  return (
    <details className="dettagli-piccoli spiega-ipg">
      <summary>Come si calcola l&rsquo;IPG?</summary>

      <h4>Che cos&rsquo;è</h4>
      <p>
        L&rsquo;IPG (Indice Primo Giocatore) è il numero che misura la forza al tavolo. Ognuno ne ha
        uno per ogni gioco a cui ha giocato e uno globale, che li riassume. Il Primeggio è la
        classifica che ne esce.
      </p>

      <h4>Quali partite contano</h4>
      <ul>
        <li>Le partite competitive con almeno due giocatori, di cui si sa com&rsquo;è finita. Le cooperative non contano.</li>
        <li>La stessa partita registrata da più persone conta una volta sola.</li>
        <li>
          L&rsquo;ordine d&rsquo;arrivo si prende dalle posizioni registrate; se mancano, dai punteggi; se
          mancano anche quelli, il vincitore è primo e tutti gli altri secondi a pari merito.
        </li>
        <li>Gli ospiti contano come avversari, ma l&rsquo;IPG e la classifica sono solo per chi ha un account.</li>
      </ul>

      <h4>L&rsquo;IPG di un gioco</h4>
      <p>
        Per ogni gioco l&rsquo;app tiene due valori per ciascun giocatore: la <strong>forza stimata</strong> e
        l&rsquo;<strong>incertezza</strong> della stima. All&rsquo;inizio sono uguali per tutti. Le partite si
        ripercorrono in ordine di data e dopo ognuna si aggiornano tutti i presenti al tavolo:
      </p>
      <ul>
        <li>chi arriva davanti sale, chi arriva dietro scende;</li>
        <li>battere chi è più forte fa salire molto, battere chi è più debole poco; perdere da chi è più debole fa scendere molto;</li>
        <li>conta la posizione, non il distacco nei punti;</li>
        <li>a ogni partita l&rsquo;incertezza si riduce: più si gioca, più la stima è sicura e meno si muove.</li>
      </ul>
      <p>Il numero che si vede è volutamente prudente:</p>
      <p className="spiega-formula">IPG = 1000 + 25 × (forza − 3 × incertezza)</p>
      <p>
        Chi non ha mai giocato vale 1000. Con poche partite l&rsquo;incertezza è alta e l&rsquo;IPG resta basso
        anche vincendo: per questo nelle prime partite tende a salire, e nessuno va in cima per un
        colpo di fortuna. Un giocatore medio con molte partite si assesta intorno ai 1500.
      </p>

      <h4>L&rsquo;IPG globale</h4>
      <p>
        È la media degli IPG dei singoli giochi, in cui ogni gioco conta in proporzione a:
      </p>
      <p className="spiega-formula">peso BoardGameGeek × partite a quel gioco (al massimo {TETTO_PARTITE})</p>
      <p>
        Il peso è la complessità votata su BoardGameGeek, da 1 a 5: i giochi impegnativi contano di
        più. Un gioco senza peso vale {PESO_NEUTRO}. Il tetto di {TETTO_PARTITE} partite evita che un solo gioco
        giocato centinaia di volte schiacci tutto il resto.
      </p>
      <p>
        Un esempio: IPG 1600 a un gioco di peso 3,5 giocato 30 volte (conta 3,5 × 20 = 70) e IPG 1200
        a un gioco di peso 1,5 giocato 4 volte (conta 1,5 × 4 = 6). Il globale è
        (1600 × 70 + 1200 × 6) ÷ 76 = 1568.
      </p>

      <h4>Chi entra in classifica</h4>
      <ul>
        <li>Nella classifica di un gioco: chi ha almeno {MIN_GIOCO} partite competitive a quel gioco.</li>
        <li>In quella generale: chi ha almeno {MIN_GLOBALE} partite competitive in tutto.</li>
      </ul>
      <p>Sotto queste soglie l&rsquo;IPG c&rsquo;è già e si vede, ma senza posto in classifica.</p>

      <p className="spiega-fonte">
        Il motore è OpenSkill (metodo Weng-Lin), della stessa famiglia di TrueSkill usato nei
        videogiochi online. Gli IPG si ricalcolano sul server, uguali per tutti.
      </p>
    </details>
  )
}
