// Primo Giocatore - il nome di un luogo per chi guarda
// v1.1.0 - 202611091500 (luogo della Tana: un nome solo)
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

// Il luogo già scritto in una partita nuova: quasi tutte si giocano in
// sede. Si salva come «sede», così lo vedono tutti e resta uno solo.
export const LUOGO_TANA = 'Tana dei Goblin Roma'

// I modi in cui la Tana si scrive a mano o arriva dagli import («Tana dei
// Goblin di Roma», «TdG Roma», «tana», «Sede»…): finiscono tutti su
// LUOGO_TANA. Le Tane di altre città («Tana dei Goblin Milano») no.
// Stessa regola dello script luogo_tana_unico.sql.
const TANA_SOLA = /^(la |presso (la )?)?(tana|tdg|goblins?|sede)( (dei|de) goblins?)?( (di |de )?(roma|rm))?( sede)?$/
export function eLuogoTana(nome) {
  const n = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
  if (!n) return false
  return TANA_SOLA.test(n) || (/goblin|tdg/.test(n) && /\b(roma|rm)\b/.test(n))
}
