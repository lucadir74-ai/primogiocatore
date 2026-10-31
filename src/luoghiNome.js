// Primo Giocatore - il nome di un luogo per chi guarda
// v1.0.0 - 202611011100
//
// Un luogo di tipo «casa» spesso si chiama solo «Casa»: il proprietario
// lo vede col suo nome, gli altri con nome_per_altri («Casa di lucadir»),
// calcolato nel database (luoghi_casa_di.sql). Per gli altri tipi di
// luogo i due nomi coincidono.
// mioId null (pagina pubblica, locandina): si usa sempre il nome per gli altri.

export function nomeLuogo(luogo, mioId = null) {
  if (!luogo) return ''
  if (luogo.nome_per_altri && luogo.creato_da && luogo.creato_da !== mioId) return luogo.nome_per_altri
  return luogo.nome || ''
}

// Le partite dell'archivio con il nome del luogo già giusto per chi guarda
// (così Storico, Statistiche e Home non devono pensarci).
export function luoghiPerChiGuarda(righe, mioId) {
  for (const p of righe || []) {
    const l = p.luoghi
    if (l && l.nome_per_altri && l.creato_da && l.creato_da !== mioId && l.nome !== l.nome_per_altri) {
      p.luoghi = { ...l, nome: l.nome_per_altri, nome_proprio: l.nome }
    }
  }
  return righe
}
