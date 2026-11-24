// Campo numerico con pulsanti − e +: su telefono il browser non mostra le
// frecce native di <input type="number">, quindi le disegniamo noi.
export default function CampoNumero({ id, valore, onCambia, min = 1, max }) {
  const n = parseInt(valore, 10)
  const passo = (d) => {
    let v = (Number.isFinite(n) ? n : min) + d
    if (v < min) v = min
    if (max != null && v > max) v = max
    onCambia(String(v))
  }
  return (
    <div className="campo-numero">
      <button type="button" className="campo-numero-passo" aria-label="Diminuisci"
        disabled={Number.isFinite(n) && n <= min} onClick={() => passo(-1)}>−</button>
      <input id={id} type="number" inputMode="numeric" min={min} max={max}
        value={valore} onChange={(e) => onCambia(e.target.value)} />
      <button type="button" className="campo-numero-passo" aria-label="Aumenta"
        disabled={max != null && Number.isFinite(n) && n >= max} onClick={() => passo(1)}>+</button>
    </div>
  )
}
