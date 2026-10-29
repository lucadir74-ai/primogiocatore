// Primo Giocatore - banner "Notizie dalla Tana nazionale"
// v2.0.0 - 202610292245 (banner fisso al posto della striscia di notizie)
//
// Un banner sempre uguale nella Home, con il logo della Tana
// nazionale e la grafica del sito goblins.net. Non legge più il
// feed del sito: toccandolo si apre la pagina degli articoli.

const ARTICOLI = 'https://www.goblins.net/articoli'

export default function DallaTana() {
  return (
    <a className="banner-tana" href={ARTICOLI} target="_blank" rel="noopener noreferrer"
      aria-label="Notizie dalla Tana nazionale: apri gli articoli su goblins.net">
      <span className="banner-tana-striscia">La Tana dei Goblin</span>
      <span className="banner-tana-corpo">
        <img src="/logo-tdg-nazionale.png" alt="" width="180" height="92" />
        <span className="banner-tana-testo">
          <span className="banner-tana-titolo">Notizie dalla Tana nazionale</span>
          <span className="banner-tana-link">Leggi tutti gli articoli →</span>
        </span>
      </span>
    </a>
  )
}
