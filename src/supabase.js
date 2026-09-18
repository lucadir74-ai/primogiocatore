import { createClient } from '@supabase/supabase-js'

// Questi due valori arrivano dalle variabili d'ambiente (vedi README, passo 4).
const url = import.meta.env.VITE_SUPABASE_URL
const chiave = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurato = Boolean(url && chiave)

export const supabase = configurato
  ? createClient(url, chiave)
  : null

// I colori dei segnalini: identità della persona dentro l'app.
export const COLORI = [
  { id: 'rosso',  nome: 'Rosso',  hex: '#D1463A' },
  { id: 'blu',    nome: 'Blu',    hex: '#2E6FB0' },
  { id: 'giallo', nome: 'Giallo', hex: '#E5A32B' },
  { id: 'verde',  nome: 'Verde',  hex: '#3E8E5A' },
  { id: 'viola',  nome: 'Viola',  hex: '#7A5195' },
]

// Come si chiama una persona dentro l'app: il soprannome se ce l'ha,
// altrimenti nome e cognome. Un posto solo, per non doverlo ricordare.
export const daMostrare = (p) =>
  (p?.nickname && p.nickname.trim()) || p?.nome || 'Sconosciuto'

// Supabase restituisce al massimo mille righe per interrogazione.
// Questa funzione le chiede a blocchi finché non finiscono: senza,
// oltre le mille partite le statistiche sarebbero semplicemente
// sbagliate, senza dare nessun errore.
export async function tutteLeRighe(costruisciQuery, blocco = 1000) {
  const righe = []
  for (let da = 0; ; da += blocco) {
    const { data, error } = await costruisciQuery().range(da, da + blocco - 1)
    if (error) throw error
    righe.push(...(data || []))
    if (!data || data.length < blocco) break
    if (righe.length > 50000) break   // rete di sicurezza
  }
  return righe
}
