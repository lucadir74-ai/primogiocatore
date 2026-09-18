// Primo Giocatore - locandina del tavolo
// v4.2.0 - 202609221400
//
// Un foglio A5 da stampare e appoggiare sul tavolo vero: chi passa
// inquadra il codice e si iscrive, senza che nessuno debba spiegare
// niente.

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const quando = (d) =>
  new Date(d).toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  })

export default function Locandina({ tavolo, onChiudi }) {
  const [codice, setCodice] = useState(null)
  const [errore, setErrore] = useState('')

  const link = `${window.location.origin}/?t=${tavolo.id}`

  useEffect(() => {
    QRCode.toDataURL(link, {
      width: 900,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#131C26', light: '#FFFFFF' },
    })
      .then(setCodice)
      .catch((e) => setErrore(e.message))
  }, [link])

  return (
    <div className="scheda">
      <div className="non-stampare">
        <button className="bottone-piatto" onClick={onChiudi}>← torna ai tavoli</button>
        <h2>Locandina da stampare</h2>
        <p className="sottotitolo">
          Un foglio A5: stampalo e appoggialo sul tavolo. Chi passa inquadra il codice
          e si iscrive da solo.
        </p>
        {errore && <div className="avviso errore">{errore}</div>}
        <button className="bottone" onClick={() => window.print()}>Stampa</button>
      </div>

      <div className="locandina">
        <div className="locandina-testa">
          <span className="locandina-segnalino">1°</span>
          <span className="locandina-marchio">Primo giocatore</span>
        </div>

        <h1 className="locandina-titolo">{tavolo.titolo || tavolo.giochi?.nome || 'Tavolo'}</h1>
        {tavolo.titolo && tavolo.giochi?.nome && (
          <p className="locandina-gioco">{tavolo.giochi.nome}</p>
        )}

        <p className="locandina-quando">{quando(tavolo.inizio)}</p>
        {tavolo.luoghi?.nome && <p className="locandina-dove">{tavolo.luoghi.nome}</p>}

        {codice && <img src={codice} alt="Codice da inquadrare" className="locandina-qr" />}

        <p className="locandina-invito">Inquadra il codice per iscriverti</p>

        <div className="locandina-dati">
          {tavolo.posti_max && (
            <span>{tavolo.posti_max} posti</span>
          )}
          {tavolo.dimostratore_nome && (
            <span>spiega {tavolo.dimostratore_nome}</span>
          )}
          {tavolo.giochi?.durata_minuti && (
            <span>circa {tavolo.giochi.durata_minuti} minuti</span>
          )}
        </div>

        {tavolo.descrizione && <p className="locandina-nota">{tavolo.descrizione}</p>}

        <p className="locandina-link">{link.replace(/^https?:\/\//, '')}</p>
      </div>
    </div>
  )
}
