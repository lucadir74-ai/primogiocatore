// Primo Giocatore - pagina di benvenuto (landing)
// v1.0.0 - 202610211500
//
// La vede chi apre l'app senza essere entrato: cos'è, a chi serve,
// e i due tasti per iscriversi o entrare. Chi su questo telefono è già
// entrato una volta salta direttamente all'accesso.

import Condividi from './Condividi.jsx'

const PUNTI = [
  {
    icona: 'M5 5h14v14H5z M9 9h.01 M15 15h.01 M15 9h.01 M9 15h.01',
    titolo: 'Registra le partite',
    testo: 'Giocatori, cronometro e punteggi, anche con il segnapunti per voci o per mani.',
  },
  {
    icona: 'M5 20V10 M12 20V4 M19 20v-7',
    titolo: 'Statistiche e Primeggio',
    testo: 'Vittorie, serie, avversari e l\u2019IPG: la classifica di forza dei giocatori della Tana, per gioco e generale.',
  },
  {
    icona: 'M3 10h18 M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3 M6 10v9 M18 10v9',
    titolo: 'Tavoli in Tana',
    testo: 'Guarda i tavoli delle serate, iscriviti e, se vuoi, offriti di spiegare il gioco.',
  },
  {
    icona: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
    titolo: 'Porta con te lo storico',
    testo: 'Collezione e partite da BoardGameGeek, partite online da Board Game Arena.',
  },
]

export default function Benvenuto({ onIscriviti, onEntra, linkNonSocio }) {
  return (
    <div className="benvenuto">
      <section className="benvenuto-apertura">
        <img className="benvenuto-logo" src="/logo-tdg-roma.png" alt="Logo della Tana dei Goblin Roma" />
        <h2>L&rsquo;app dei soci della Tana dei Goblin di Roma</h2>
        <p>Registra le partite, scala la classifica e trova il tuo posto ai tavoli delle serate.</p>
        <div className="benvenuto-tasti">
          <button type="button" className="bottone" onClick={onIscriviti}>Iscriviti</button>
          <button type="button" className="bottone bottone-secondario" onClick={onEntra}>Ho già un account</button>
        </div>
      </section>

      <ul className="benvenuto-punti">
        {PUNTI.map((p) => (
          <li key={p.titolo}>
            <span className="benvenuto-icona" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={p.icona} /></svg>
            </span>
            <div>
              <h3>{p.titolo}</h3>
              <p>{p.testo}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="scheda benvenuto-installa">
        <h3>Mettila sul telefono</h3>
        <p>Non serve lo store: aprila dal browser e aggiungila alla schermata Home.</p>
        <p><strong>iPhone</strong> (Safari): tasto Condividi, poi &laquo;Aggiungi alla schermata Home&raquo;.</p>
        <p><strong>Android</strong> (Chrome): menu &#8942;, poi &laquo;Installa app&raquo; o &laquo;Aggiungi a schermata Home&raquo;.</p>
      </section>

      <div className="benvenuto-condividi">
        <Condividi variante="bottone" />
      </div>

      <p className="benvenuto-nota">
        Riservata ai soci della Tana dei Goblin di Roma.{' '}
        <a href={linkNonSocio} target="_blank" rel="noopener noreferrer">Non sei socio? Scrivici su WhatsApp</a>
      </p>
    </div>
  )
}
