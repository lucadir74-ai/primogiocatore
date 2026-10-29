// Primo Giocatore - banner "Notizie dalla Tana nazionale"
// v2.1.0 - 202610292300 (stile dei riquadri della Home, senza fascia verde né fondo bianco)
//
// Un banner sempre uguale nella Home, con il logo della Tana
// nazionale, nello stile dei riquadri della Home. Non legge più il
// feed del sito: toccandolo si apre la pagina degli articoli.

const ARTICOLI = 'https://www.goblins.net/articoli'

export default function DallaTana() {
  return (
    <a className="banner-tana" href={ARTICOLI} target="_blank" rel="noopener noreferrer"
      aria-label="Notizie dalla Tana nazionale: apri gli articoli su goblins.net">
      <img src="/logo-tdg-nazionale.png" alt="" width="180" height="92" />
      <span className="banner-tana-testo">
        <span className="banner-tana-titolo">Notizie dalla Tana nazionale</span>
        <span className="banner-tana-link">Leggi gli articoli su goblins.net →</span>
      </span>
    </a>
  )
}
