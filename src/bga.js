// Primo Giocatore - partite da Board Game Arena, senza BG Stats
// v3.1.0 - 202610221300 (sincronizzazione automatica: importa le partite sicure a blocchi e riprende lo storico da dove era arrivata)
//
// BGA non ha un'API pubblica. La sua pagina «Cronologia delle partite»
// legge lo storico da /gamestats/gamestats/getGames.html, con il token
// di sessione della pagina. Un segnalibro, toccato su BGA, fa le stesse
// chiamate: niente password BGA, niente codici.
//
// Consegna: a lettura finita il segnalibro mostra «Apri in Primo
// Giocatore», un collegamento che porta le partite nell'indirizzo
// (dopo il #, che non viaggia verso nessun server). Funziona anche dove
// le schede non possono parlarsi tra loro, cosa che su BGA succede.
//
// Aggiornamenti: il segnalibro ricorda, nella memoria del browser per
// BGA, il tuo numero giocatore e la data dell'ultima consegna. La volta
// dopo legge solo le partite nuove: pochi secondi invece di minuti.
// Se quella memoria si perde rilegge tutto, e i doppioni non entrano
// comunque (vedi sotto).
//
// Doppioni:
// - ogni tavolo BGA ha un numero: si importa una volta sola per persona
//   (colonna partite.bga_tavolo, unica per chi registra);
// - le partite BGA già arrivate da BGG o da BG Stats si riconoscono da
//   gioco e punteggi nelle date del tavolo (le partite a turni durano
//   giorni) e ricevono il numero del tavolo invece di essere ricreate;
// - i giocatori si riconoscono dal numero BGA, che non cambia, poi dal
//   nome (ospiti collegati compresi, come negli altri import).

import { supabase, tutteLeRighe } from './supabase'
import { assicuraGiochi, trovaOCreaLuogo, mappaOspitiPerNome } from './giochiMiei'
import { impronta } from './impronta'

const LUOGO_BGA = 'Board Game Arena'

/* ---------------------------------------------------------------
   Il segnalibro
   --------------------------------------------------------------- */

// Il codice da salvare nei preferiti. origine: l'indirizzo dell'app.
// base: { id, fino } dal profilo, così anche la prima volta dopo averlo
// copiato il segnalibro sa chi sei e da dove ripartire.
// Una riga sola, senza commenti // (in un indirizzo non esistono righe).
export function segnalibroBga(origine, base = {}) {
  const righe = [
    '(async()=>{',
    `const PG=${JSON.stringify(origine)};`,
    `const BASE=${JSON.stringify({ id: base.id ? String(base.id) : '', fino: Number(base.fino) || 0 })};`,
    "if(window.__pgBga)return alert('Lettura già in corso su questa pagina');window.__pgBga=1;",
    "const M={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};",
    "const box=document.createElement('div');",
    "box.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:#111;color:#fff;font:14px sans-serif;padding:12px;border-radius:10px';",
    "box.innerHTML='<b>Primo Giocatore</b><div id=pgS style=\"margin:6px 0\">Avvio…</div><a id=pgA target=_blank style=\"display:none;padding:10px 16px;font-size:15px;background:#E5A32B;color:#111;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:6px\">Apri in Primo Giocatore</a><button id=pgR style=\"padding:10px 16px;font-size:15px;display:none\"></button> <button id=pgC style=\"padding:10px 16px;font-size:15px;display:none\">Copia i dati</button> <button id=pgT style=\"padding:10px 16px;font-size:15px;display:none\">Rileggi tutto</button> <button id=pgX style=\"padding:10px 16px;font-size:15px\">Chiudi</button>';",
    'document.body.appendChild(box);',
    "const $=q=>box.querySelector(q);const S=t=>{$('#pgS').textContent=t};",
    "$('#pgX').onclick=()=>{box.remove();window.__pgBga=0};",
    'const attendi=ms=>new Promise(r=>setTimeout(r,ms));',
    "let id=new URLSearchParams(location.search).get('player')||M.get('pgBgaId')||BASE.id||'';",
    "if(!id)id=(prompt('Il tuo numero giocatore BGA: è il numero nell’indirizzo della tua pagina profilo BGA')||'').trim();",
    "if(!/^[0-9]+$/.test(id)){S('Manca il numero giocatore BGA: apri la tua cronologia dal tuo profilo e riprova.');return}",
    "M.set('pgBgaId',id);",
    "const tok=(window.bgaConfig&&window.bgaConfig.requestToken)||'';",
    "if(!tok){S('Non trovo la sessione BGA in questa pagina: apri la tua Cronologia delle partite e riprova.');return}",
    'const leggiPagina=async pag=>{const r=await fetch(\'/gamestats/gamestats/getGames.html?player=\'+id+\'&opponent_id=0&finished=1&page=\'+pag+\'&updateStats=0\',{headers:{\'X-Requested-With\':\'XMLHttpRequest\',\'X-Request-Token\':tok},credentials:\'include\'});const testo=await r.text();let j=null;try{j=JSON.parse(testo)}catch(e){}return{j:j,info:\'HTTP \'+r.status+\' \'+(j&&j.error?j.error:testo.slice(0,120))}};',
    'const avvia=async tutto=>{',
    "const fino=tutto?0:Math.max(0,Math.max(Number(M.get('pgBgaFino')||0),BASE.fino)-7*86400);",
    "const tavoli=[];let nome='';let ultimo=0;",
    "for(const k of ['#pgA','#pgR','#pgC','#pgT'])$(k).style.display='none';",
    'const leggi=async da=>{',
    'for(let pag=da;pag<=1000;pag++){',
    "S((fino?'Cerco le partite nuove':'Leggo tutto lo storico BGA')+': pagina '+pag+', '+tavoli.length+' partite');",
    "let x=null;for(let prova=0;prova<4;prova++){try{x=await leggiPagina(pag)}catch(e){x={j:null,info:String(e)}}if(x.j&&String(x.j.status)==='1')break;if(prova<3){S('Pagina '+pag+': BGA non risponde, riprovo ('+(prova+1)+'/3)…');await attendi([3000,8000,20000][prova])}}",
    "if(!x.j||String(x.j.status)!=='1'){S('BGA ha rifiutato la pagina '+pag+' ('+tavoli.length+' partite lette finora). Risposta: '+x.info);$('#pgR').textContent='Riprova da pagina '+pag;$('#pgR').style.display='inline-block';$('#pgR').onclick=()=>leggi(pag);return}",
    'const lista=(x.j.data&&x.j.data.tables)||[];if(!lista.length)break;',
    'let vecchie=false;',
    'for(const t of lista){',
    'const fine=Number(t.end);if(fine>ultimo)ultimo=fine;',
    'if(fino&&fine<fino){vecchie=true;continue}',
    "if(String(t.cancelled)==='1'||String(t.normalend)!=='1')continue;",
    'let p=[];const gr=t.gameResult&&t.gameResult.rankedTeams;',
    'if(gr&&gr.length){for(const tm of gr)for(const pl of (tm.players||[]))p.push([Number(pl.id),String(pl.name||\'\'),pl.score==null?null:Number(pl.score),tm.rank==null?null:Number(tm.rank)])}',
    "else{const a=String(t.players||'').split(','),b=String(t.player_names||'').split(','),c=String(t.scores||'').split(','),d=String(t.ranks||'').split(',');p=a.map((x,k)=>[Number(x),b[k]||'',c[k]===''||c[k]==null?null:Number(c[k]),d[k]?Number(d[k]):null])}",
    'const io=p.find(g=>String(g[0])===id);if(io&&!nome)nome=io[1];',
    "tavoli.push({t:String(t.table_id),g:String(t.game_name),s:Number(t.start),e:fine,c:String(t.is_coop)==='1',p:p,b:(t.bot_player_ids||[]).map(Number)})",
    '}',
    'if(vecchie)break;await attendi(fino?400:1000)',
    '}',
    'consegna()};',
    'const consegna=()=>{',
    "$('#pgT').style.display='inline-block';$('#pgT').onclick=()=>avvia(true);",
    "if(!tavoli.length){S('Nessuna partita nuova su BGA dall’ultimo aggiornamento.');if(ultimo)M.set('pgBgaFino',String(Math.max(ultimo,Number(M.get('pgBgaFino')||0))));return}",
    "const dati={tipo:'pg-bga-dati',giocatore:id,nome:nome,tavoli:tavoli,completo:!fino};",
    'const testo=JSON.stringify(dati);',
    "const ricorda=()=>{M.set('pgBgaFino',String(Math.max(ultimo,Number(M.get('pgBgaFino')||0))))};",
    "const C=$('#pgC');C.style.display='inline-block';C.onclick=()=>{navigator.clipboard.writeText(testo).then(()=>{ricorda();alert('Copiato: incollalo in Primo Giocatore, sezione Dati e import')},()=>prompt('Copia questo testo',testo))};",
    "const url=PG+'/?bga=1#bga='+encodeURIComponent(testo);",
    "if(url.length<1800000){const A=$('#pgA');A.href=url;A.style.display='inline-block';A.onclick=()=>{ricorda();S('Aperto Primo Giocatore: continua lì. Puoi chiudere questo riquadro.')};S((fino?tavoli.length+' partite recenti: quelle già importate verranno saltate':tavoli.length+' partite lette')+'. Tocca «Apri in Primo Giocatore».')}",
    "else S(tavoli.length+' partite lette: sono troppe per un collegamento, tocca «Copia i dati» e incollale nell’app.')",
    '};',
    'await leggi(1)};',
    'await avvia(false)',
    '})()',
  ]
  return 'javascript:' + righe.join('')
}

/* ---------------------------------------------------------------
   Utilità
   --------------------------------------------------------------- */

const due = (n) => String(n).padStart(2, '0')

// Giorno e ora locali di un istante BGA (secondi).
function locale(sec) {
  const d = new Date(sec * 1000)
  return {
    giorno: `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`,
    istante: `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}:00`,
  }
}
const numeroGiorno = (g) => Math.floor(Date.parse(`${g}T00:00:00Z`) / 86400000)
const firma = (punti) => punti.filter((v) => v != null && !Number.isNaN(v)).map(Number).sort((a, b) => a - b).join(',')
// «Ark Nova», «ark-nova» e «arknova» diventano la stessa cosa.
const normale = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

function erroreMigrazione(e) {
  const m = (e?.message || '').toLowerCase()
  if (m.includes('bga_') || m.includes('giochi_bga')) {
    return new Error('Al database manca lo script SQL per Board Game Arena (bga_import.sql). Va eseguito una volta in Supabase.')
  }
  return e
}

/* ---------------------------------------------------------------
   Cosa mettere dentro il segnalibro
   --------------------------------------------------------------- */

// Il tuo numero BGA e la fine dell'ultima partita BGA importata (secondi).
export async function baseSegnalibro(profilo) {
  const { data, error } = await supabase.from('partite')
    .select('giocata_il')
    .eq('registrata_da', profilo.id)
    .not('bga_tavolo', 'is', null)
    .order('giocata_il', { ascending: false })
    .limit(1)
  if (error) throw erroreMigrazione(error)
  const ultima = data?.[0]?.giocata_il
  return { id: profilo.bga_id || '', fino: ultima ? Math.floor(new Date(ultima).getTime() / 1000) : 0 }
}

/* ---------------------------------------------------------------
   1. Lettura: controlli, giochi da abbinare, suggerimenti
   --------------------------------------------------------------- */

// Le tue partite, per riconoscere quelle già presenti.
async function archivio(profiloId) {
  try {
    return await tutteLeRighe(() => supabase.from('partite')
      .select('id, gioco_id, giocata_il, bga_tavolo, giochi ( bgg_id, nome ), partecipazioni ( punteggio_totale )')
      .eq('registrata_da', profiloId))
  } catch (e) { throw erroreMigrazione(e) }
}

export async function analizzaBga(profilo, arrivo) {
  const giocatore = String(arrivo?.giocatore || '')
  const tavoli = Array.isArray(arrivo?.tavoli) ? arrivo.tavoli : null
  if (!/^\d+$/.test(giocatore) || !tavoli) throw new Error('I dati non sembrano quelli del segnalibro BGA.')

  // È la tua cronologia? Il numero BGA, una volta salvato, deve coincidere.
  if (profilo.bga_id && String(profilo.bga_id) !== giocatore) {
    throw new Error('Questa è la cronologia di un altro giocatore BGA: apri la tua e riprova.')
  }
  const { data: altro } = await supabase.from('profili').select('id').eq('bga_id', giocatore).neq('id', profilo.id).maybeSingle()
  if (altro) throw new Error('Questo numero BGA è già collegato a un altro account di Primo Giocatore.')

  // Un tavolo una volta sola, anche se il segnalibro l'ha letto due volte.
  const unici = [...new Map(tavoli.filter((t) => t?.t && t?.g && Array.isArray(t.p)).map((t) => [String(t.t), t])).values()]

  const righe = await archivio(profilo.id)
  const giaTavoli = new Set(righe.filter((r) => r.bga_tavolo != null).map((r) => String(r.bga_tavolo)))
  const daGuardare = unici.filter((t) => !giaTavoli.has(String(t.t)))

  // Gli abbinamenti già noti (anche fatti da altri).
  const nomiBga = [...new Set(daGuardare.map((t) => t.g))]
  const mappa = new Map()
  for (let i = 0; i < nomiBga.length; i += 200) {
    const { data, error } = await supabase.from('giochi_bga').select('bga_nome, bgg_id, nome').in('bga_nome', nomiBga.slice(i, i + 200))
    if (error) throw erroreMigrazione(error)
    for (const r of data || []) mappa.set(r.bga_nome, { bgg_id: r.bgg_id, nome: r.nome })
  }

  // Suggerimenti per i giochi non abbinati.
  // a) Stessi punteggi, nelle date del tavolo, in una partita che hai già
  //    (di solito arrivata da BG Stats): quella partita dice il gioco.
  // b) In mancanza, un gioco del tuo archivio con lo stesso nome.
  const perFirma = new Map()
  const perNome = new Map()
  for (const r of righe) {
    if (r.bga_tavolo != null || !r.giochi?.bgg_id) continue
    const f = firma((r.partecipazioni || []).map((x) => x.punteggio_totale))
    if (f && f.includes(',')) {
      if (!perFirma.has(f)) perFirma.set(f, [])
      perFirma.get(f).push(r)
    }
    perNome.set(normale(r.giochi.nome), { bgg_id: r.giochi.bgg_id, nome: r.giochi.nome })
  }

  const conteggio = new Map()
  for (const t of daGuardare) conteggio.set(t.g, (conteggio.get(t.g) || 0) + 1)

  const giochiDaAbbinare = []
  for (const nomeBga of nomiBga) {
    if (mappa.has(nomeBga)) continue
    const voti = new Map()
    let tavoliConVoto = 0
    for (const t of daGuardare.filter((x) => x.g === nomeBga)) {
      const punti = t.p.map((g) => g[2])
      const f = firma(punti)
      // Punteggi troppo semplici (1-0 di Hive) si trovano ovunque: non provano niente.
      const somma = punti.reduce((s, v) => s + Math.abs(Number(v) || 0), 0)
      if (!f.includes(',') || somma < 10) continue
      const da = numeroGiorno(locale(t.s).giorno) - 1
      const a = numeroGiorno(locale(t.e).giorno) + 1
      const visti = new Set()
      for (const r of perFirma.get(f) || []) {
        const n = numeroGiorno(String(r.giocata_il).slice(0, 10))
        if (n < da || n > a || visti.has(r.giochi.bgg_id)) continue
        visti.add(r.giochi.bgg_id)
        const v = voti.get(r.giochi.bgg_id) || { bgg_id: r.giochi.bgg_id, nome: r.giochi.nome, voti: 0 }
        v.voti++
        voti.set(r.giochi.bgg_id, v)
      }
      if (visti.size) tavoliConVoto++
    }
    const migliore = [...voti.values()].sort((x, y) => y.voti - x.voti)[0]
    let suggerito = null
    if (migliore && migliore.voti >= Math.max(1, Math.ceil(tavoliConVoto / 2)) && (conteggio.get(nomeBga) < 3 || migliore.voti >= 2)) {
      suggerito = { bgg_id: migliore.bgg_id, nome: migliore.nome, perche: 'punteggi' }
    } else if (perNome.has(normale(nomeBga))) {
      suggerito = { ...perNome.get(normale(nomeBga)), perche: 'nome' }
    }
    giochiDaAbbinare.push({ bga_nome: nomeBga, tavoli: conteggio.get(nomeBga), suggerito })
  }
  giochiDaAbbinare.sort((a, b) => b.tavoli - a.tavoli)

  return {
    giocatore,
    nome: arrivo.nome || '',
    completo: Boolean(arrivo.completo),
    tavoli: daGuardare,
    giaImportati: unici.length - daGuardare.length,
    mappa,
    giochiDaAbbinare,
    righe,
  }
}

// Salva un abbinamento nel catalogo condiviso: vale per tutti.
export async function salvaAbbinamento(bgaNome, gioco) {
  const { error } = await supabase.from('giochi_bga')
    .upsert({ bga_nome: bgaNome, bgg_id: gioco.bgg_id, nome: gioco.nome || null }, { onConflict: 'bga_nome' })
  if (error) throw erroreMigrazione(error)
}

/* ---------------------------------------------------------------
   2. Classificazione: nuove, già presenti, incerte
   --------------------------------------------------------------- */

export async function classificaBga(analisi) {
  const abbinati = [...analisi.mappa.entries()]
  const giochi = await assicuraGiochi(abbinati.map(([, g]) => ({ bgg_id: g.bgg_id, nome: g.nome || 'Senza nome' })))
  const idPerBgg = new Map(giochi.map((g) => [g.bgg_id, g.id]))
  const giocoPerNome = new Map(abbinati.map(([n, g]) => [n, idPerBgg.get(g.bgg_id)]))

  // Le tue partite senza numero BGA, per gioco: ognuna si usa una volta.
  const libere = new Map()
  for (const r of analisi.righe) {
    if (r.bga_tavolo != null) continue
    if (!libere.has(r.gioco_id)) libere.set(r.gioco_id, [])
    libere.get(r.gioco_id).push({
      id: r.id,
      giorno: numeroGiorno(String(r.giocata_il).slice(0, 10)),
      firma: firma((r.partecipazioni || []).map((x) => x.punteggio_totale)),
      quanti: (r.partecipazioni || []).length,
      usata: false,
    })
  }

  const nuove = []
  const collegate = []   // { tavolo, partitaId }
  const incerte = []     // { tavolo, partitaId }
  let senzaGioco = 0

  // Dalla più vecchia: le partite uguali si consumano in ordine.
  const ordinati = [...analisi.tavoli].sort((a, b) => a.e - b.e)
  // Prima passata: le corrispondenze esatte, così una partita senza
  // punteggi non ruba il posto a quella giusta.
  const restano = []
  for (const t of ordinati) {
    const giocoId = giocoPerNome.get(t.g)
    if (!giocoId) { senzaGioco++; continue }
    const tav = { ...t, giocoId }
    const f = firma(t.p.map((g) => g[2]))
    const da = numeroGiorno(locale(t.s).giorno) - 1
    const a = numeroGiorno(locale(t.e).giorno) + 1
    const c = (libere.get(giocoId) || []).find((r) => !r.usata && r.firma && r.firma === f && r.giorno >= da && r.giorno <= a)
    if (c) { c.usata = true; collegate.push({ tavolo: tav, partitaId: c.id }) } else restano.push({ tav, da, a })
  }
  for (const { tav, da, a } of restano) {
    const c = (libere.get(tav.giocoId) || []).find((r) => !r.usata && !r.firma && r.quanti === tav.p.length && r.giorno >= da && r.giorno <= a)
    if (c) { c.usata = true; incerte.push({ tavolo: tav, partitaId: c.id }) } else nuove.push(tav)
  }

  return { nuove, collegate, incerte, senzaGioco }
}

/* ---------------------------------------------------------------
   3. Scrittura
   --------------------------------------------------------------- */

const aBlocchi = (v, n) => Array.from({ length: Math.ceil(v.length / n) }, (_, i) => v.slice(i * n, i * n + n))

// incerteNuove: true = le incerte entrano come partite nuove;
// false (consigliato) = vengono collegate a quelle che hai già.
export async function importaBga({ profilo, analisi, classi, incerteNuove = false, avanzamento = () => {} }) {
  const io = Number(analisi.giocatore)

  // Il numero BGA nel profilo: le prossime volte il segnalibro lo sa già.
  if (!profilo.bga_id) {
    const cambi = { bga_id: io }
    if (!profilo.bga_username?.trim() && analisi.nome) cambi.bga_username = analisi.nome
    const { error } = await supabase.from('profili').update(cambi).eq('id', profilo.id)
    if (error) throw erroreMigrazione(error)
  }

  // Le partite che hai già ricevono il numero del tavolo.
  const daCollegare = [...classi.collegate, ...(incerteNuove ? [] : classi.incerte)]
  let fatte = 0
  for (const blocco of aBlocchi(daCollegare, 10)) {
    avanzamento({ fase: 'Collego le partite che avevi già', fatto: fatte, totale: daCollegare.length })
    const esiti = await Promise.all(blocco.map(({ tavolo, partitaId }) =>
      supabase.from('partite').update({ bga_tavolo: Number(tavolo.t) }).eq('id', partitaId).eq('registrata_da', profilo.id)))
    const sbaglio = esiti.find((x) => x.error)
    if (sbaglio) throw erroreMigrazione(sbaglio.error)
    fatte += blocco.length
  }

  const daCreare = [...classi.nuove, ...(incerteNuove ? classi.incerte.map((x) => x.tavolo) : [])]
  if (!daCreare.length) return { collegate: daCollegare.length, nuove: 0 }

  // I giocatori: prima il numero BGA, poi il nome.
  avanzamento({ fase: 'Giocatori', fatto: 0, totale: 1 })
  const ospiti = await tutteLeRighe(() => supabase.from('ospiti')
    .select('id, nome, creato_da, utente_collegato, bga_id'))
  const perBga = new Map()
  for (const o of ospiti) {
    if (o.bga_id == null || o.utente_collegato === profilo.id) continue
    // A parità di numero vince l'ospite collegato a un account.
    if (!perBga.has(String(o.bga_id)) || o.utente_collegato) perBga.set(String(o.bga_id), o.id)
  }
  const perNome = mappaOspitiPerNome(ospiti, profilo.id)
  const ospitePerId = new Map(ospiti.map((o) => [o.id, o]))

  const giocatori = new Map()   // numero BGA -> nome
  for (const t of daCreare) for (const [id, nome] of t.p) if (id !== io && !giocatori.has(String(id))) giocatori.set(String(id), nome)

  const scelto = new Map()      // numero BGA -> ospite
  const daAggiornare = []
  const daInserire = []
  const bot = (id) => daCreare.some((t) => (t.b || []).map(String).includes(id)) || Number(id) <= 0

  // Gli iscritti che hanno il numero BGA nel profilo: un ospite già
  // collegato al loro account, senza «sono io» da approvare.
  const daChiedere = [...giocatori].filter(([id]) => !bot(id) && !perBga.has(id))
  const perAccount = new Map()
  for (const blocco of aBlocchi(daChiedere, 200)) {
    const { data, error } = await supabase.rpc('ospiti_per_account_bga', {
      p_bga: blocco.map(([id]) => Number(id)),
      p_nomi: blocco.map(([, nome]) => nome || ''),
    })
    if (error) {
      // Senza lo script SQL nuovo si va avanti come prima (per nome).
      if (/ospiti_per_account_bga/.test(error.message || '')) break
      throw error
    }
    for (const r of data || []) perAccount.set(String(r.bga_id), r.ospite_id)
  }

  for (const [id, nomeGrezzo] of giocatori) {
    const nome = (nomeGrezzo || '').trim() || 'Sconosciuto'
    // I bot non hanno un numero stabile da ricordare.
    const eBot = bot(id)
    let ospite = eBot ? null : perBga.get(id) || perAccount.get(id)
    if (!ospite) {
      ospite = perNome.get(nome.toLowerCase())
      const o = ospite && ospitePerId.get(ospite)
      if (o && !eBot && o.bga_id == null && o.creato_da === profilo.id) daAggiornare.push({ id: o.id, bga_id: Number(id) })
    }
    if (ospite) scelto.set(id, ospite)
    else daInserire.push({ nome, creato_da: profilo.id, ...(eBot ? {} : { bga_id: Number(id) }), _bga: id })
  }

  for (const blocco of aBlocchi(daAggiornare, 10)) {
    await Promise.all(blocco.map((x) => supabase.from('ospiti').update({ bga_id: x.bga_id }).eq('id', x.id)))
  }
  // Due giocatori nuovi con lo stesso nome restano due ospiti: hanno
  // numeri BGA diversi, quindi sono persone diverse.
  for (const blocco of aBlocchi(daInserire, 200)) {
    const { data, error } = await supabase.from('ospiti')
      .insert(blocco.map(({ _bga, ...r }) => r)).select('id')
    if (error) throw erroreMigrazione(error)
    data.forEach((o, i) => scelto.set(blocco[i]._bga, o.id))
  }

  const luogoId = await trovaOCreaLuogo(LUOGO_BGA, profilo.id, 'online')

  // Le partite, a blocchi.
  fatte = 0
  for (const blocco of aBlocchi(daCreare, 200)) {
    avanzamento({ fase: 'Importo le partite', fatto: fatte, totale: daCreare.length })
    const righe = blocco.map((t) => {
      const { giorno, istante } = locale(t.e)
      const punti = t.p.map((g) => g[2])
      return {
        gioco_id: t.giocoId,
        luogo_id: luogoId,
        giocata_il: istante,
        durata_minuti: null,
        tipo_punteggio: t.c ? 'coop' : 'punti',
        // BGA non dice in modo esplicito se una cooperativa è vinta:
        // tutti primi = vinta, è l'unico segnale nei dati.
        esito_coop: t.c ? (t.p.length && t.p.every((g) => g[3] === 1) ? 'vinta' : 'persa') : null,
        note: null,
        chiave_esterna: `bga:${t.t}`,
        bga_tavolo: Number(t.t),
        impronta: impronta({ giocoId: t.giocoId, giocataIl: giorno, punteggi: punti }),
        registrata_da: profilo.id,
      }
    })
    const { data: inserite, error } = await supabase.from('partite').insert(righe).select('id, bga_tavolo')
    if (error) throw erroreMigrazione(error)
    const perTavolo = new Map(inserite.map((p) => [String(p.bga_tavolo), p.id]))

    const partecipazioni = []
    for (const t of blocco) {
      const partitaId = perTavolo.get(String(t.t))
      if (!partitaId) continue
      let ioMesso = false
      for (const [id, , punti, posto] of t.p) {
        const sonoIo = id === io && !ioMesso
        if (sonoIo) ioMesso = true
        const ospiteId = sonoIo ? null : scelto.get(String(id))
        if (!sonoIo && !ospiteId) continue
        partecipazioni.push({
          partita_id: partitaId,
          utente_id: sonoIo ? profilo.id : null,
          ospite_id: ospiteId || null,
          punteggio_totale: punti,
          posizione: t.c ? null : posto,
          vincitore: !t.c && posto === 1,
        })
      }
    }
    for (const b of aBlocchi(partecipazioni, 400)) {
      const { error: e2 } = await supabase.from('partecipazioni').insert(b)
      if (e2) {
        // Senza giocatori le partite resterebbero orfane: si tolgono,
        // così alla prossima importazione rientrano intere.
        await supabase.from('partite').delete().in('id', inserite.map((p) => p.id))
        throw e2
      }
    }
    fatte += blocco.length
  }

  return { collegate: daCollegare.length, nuove: daCreare.length }
}

/* ---------------------------------------------------------------
   4. Collegamento con password (api/bga.js)
   --------------------------------------------------------------- */

export async function chiamaBga(azione, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/bga', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify({ azione, ...extra }),
  })
  let dati = null
  try { dati = await r.json() } catch { /* niente */ }
  if (!dati) throw new Error(`Il server non ha risposto (HTTP ${r.status}).`)
  if (dati.errore) throw new Error(dati.errore)
  return dati
}

// Le partite dal server, pagina dopo pagina (una chiamata non basta
// per uno storico lungo). tutto: rilegge dall'inizio.
export async function leggiDaServer(profilo, { tutto = false, avanzamento = () => {} } = {}) {
  const base = await baseSegnalibro(profilo)
  const fino = tutto || !base.fino ? 0 : base.fino - 7 * 86400
  const tavoli = []
  let da = 1
  let ultima = null
  for (let giro = 0; giro < 40; giro++) {
    avanzamento({ fase: fino ? 'Cerco le partite nuove su BGA' : `Leggo tutto lo storico BGA: ${tavoli.length} partite`, fatto: 0, totale: 1 })
    const r = await chiamaBga('leggi', { fino, da })
    if (r.scaduta) return { scaduta: true }
    if (r.collegato === false) return { scollegato: true }
    tavoli.push(...r.tavoli)
    ultima = r
    if (!r.continua) break
    da = r.continua
  }
  return { tipo: 'pg-bga-dati', giocatore: ultima.giocatore, nome: ultima.nome, tavoli, completo: !fino }
}

const CHIAVE_ORA = 'primo-giocatore:bga-ultima-sincro'
const CHIAVE_STORICO = 'primo-giocatore:bga-storico'
const OGNI_ORE_BGA = 1

// Importa da un blocco di tavoli solo quello che non chiede decisioni:
// le partite nuove di giochi già riconosciuti e quelle che coincidono
// esattamente con una che hai già. Restano fuori, e si contano, i
// tavoli di giochi da abbinare e le partite incerte.
async function importaSicure(profilo, arrivo) {
  const a = await analizzaBga(profilo, arrivo)
  if (!a.tavoli.length) return { nuove: 0, inSospeso: 0 }
  const c = await classificaBga(a)
  const inSospeso = c.incerte.length + c.senzaGioco
  if (!c.nuove.length && !c.collegate.length) return { nuove: 0, inSospeso }
  const r = await importaBga({ profilo, analisi: a, classi: { ...c, incerte: [] } })
  return { nuove: r.nuove, inSospeso }
}

function leggiStorico(chiave) {
  try { return JSON.parse(localStorage.getItem(chiave) || 'null') } catch { return null }
}
function scriviStorico(chiave, valore) {
  try { localStorage.setItem(chiave, JSON.stringify(valore)) } catch { /* resta solo per ora */ }
}

// All'apertura dell'app, al massimo una volta all'ora, per chi ha
// collegato BGA. Si salva un blocco alla volta, man mano che arriva:
// se l'app si chiude a metà, il lavoro fatto resta.
// La prima volta (nessuna partita BGA ancora importata) si legge tutto
// lo storico; la pagina a cui si è arrivati resta sul telefono, così
// la volta dopo si riprende da lì invece di ricominciare.
// Le partite che chiedono una scelta non bloccano più le altre: si
// contano e si rimandano a Dati e import.
export async function sincronizzaBgaSeServe(profilo) {
  if (!profilo?.bga_id) return null
  try {
    const ultima = Number(localStorage.getItem(`${CHIAVE_ORA}:${profilo.id}`) || 0)
    if (Date.now() - ultima < OGNI_ORE_BGA * 3600000) return null
    localStorage.setItem(`${CHIAVE_ORA}:${profilo.id}`, String(Date.now()))
  } catch { /* senza memoria si prova lo stesso */ }

  const chiave = `${CHIAVE_STORICO}:${profilo.id}`
  let storico = leggiStorico(chiave)
  if (storico?.fatto) storico = null
  const base = await baseSegnalibro(profilo)
  if (!storico && !base.fino) storico = { da: 1 }
  const fino = storico ? 0 : base.fino - 7 * 86400

  let da = storico?.da || 1
  let nuove = 0
  let inSospeso = 0
  for (let giro = 0; giro < 40; giro++) {
    const r = await chiamaBga('leggi', { fino, da })
    if (r.scaduta) return { scaduta: true }
    if (r.collegato === false) return null
    if (r.tavoli?.length) {
      const esito = await importaSicure(profilo, { giocatore: r.giocatore, nome: r.nome, tavoli: r.tavoli, completo: false })
      nuove += esito.nuove
      inSospeso += esito.inSospeso
    }
    if (!r.continua) {
      if (storico) scriviStorico(chiave, { fatto: true })
      break
    }
    da = r.continua
    if (storico) scriviStorico(chiave, { da })
  }

  if (!nuove && !inSospeso) return null
  return { nuove, inSospeso }
}
