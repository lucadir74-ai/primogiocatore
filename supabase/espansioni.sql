-- Primo Giocatore - espansioni nella collezione
-- v1.0.0 - 202610260130
-- Si può rilanciare senza danni. Va lanciato PRIMA di caricare il codice
-- nuovo.
--
-- 1. Sui giochi, il segno «espansione».
-- 2. assicura_giochi lo salva quando arriva da BGG. È identica a prima,
--    più l'espansione: un gioco già presente diventa espansione se BGG lo
--    dice, mai il contrario.

alter table public.giochi add column if not exists espansione boolean not null default false;

CREATE OR REPLACE FUNCTION public.assicura_giochi(p_righe jsonb)
 RETURNS SETOF giochi
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb;
  rec giochi;
  g giochi;
begin
  if auth.uid() is null then
    raise exception 'Serve un account.';
  end if;

  for r in select * from jsonb_array_elements(p_righe) loop
    rec := jsonb_populate_record(null::giochi, r);
    g := null;

    if rec.bgg_id is not null then
      select * into g from giochi where bgg_id = rec.bgg_id limit 1;
    elsif coalesce(rec.nome, '') <> '' then
      select * into g from giochi
      where bgg_id is null and lower(nome) = lower(rec.nome)
      order by (creato_da = auth.uid()) desc
      limit 1;
    end if;

    if g.id is not null then
      -- Già presente: si riempiono solo i campi vuoti.
      if (g.immagine_url is null and rec.immagine_url is not null)
         or (g.immagine_grande is null and rec.immagine_grande is not null)
         or (g.anno is null and rec.anno is not null)
         or (g.min_giocatori is null and rec.min_giocatori is not null)
         or (g.max_giocatori is null and rec.max_giocatori is not null)
         or (g.durata_minuti is null and rec.durata_minuti is not null)
         or (coalesce(r->>'espansione', '') = 'true' and not g.espansione) then
        update giochi set
          immagine_url    = coalesce(giochi.immagine_url, rec.immagine_url),
          immagine_grande = coalesce(giochi.immagine_grande, rec.immagine_grande),
          anno            = coalesce(giochi.anno, rec.anno),
          min_giocatori   = coalesce(giochi.min_giocatori, rec.min_giocatori),
          max_giocatori   = coalesce(giochi.max_giocatori, rec.max_giocatori),
          durata_minuti   = coalesce(giochi.durata_minuti, rec.durata_minuti),
          espansione      = giochi.espansione or coalesce(r->>'espansione', '') = 'true'
        where id = g.id
        returning * into g;
      end if;
    else
      insert into giochi (bgg_id, nome, anno, min_giocatori, max_giocatori, durata_minuti,
                          immagine_url, immagine_grande, tipo_punteggio, usa_fazioni, creato_da,
                          espansione)
      values (rec.bgg_id, coalesce(nullif(rec.nome, ''), 'Senza nome'), rec.anno,
              rec.min_giocatori, rec.max_giocatori, rec.durata_minuti,
              rec.immagine_url, rec.immagine_grande,
              coalesce(rec.tipo_punteggio, 'punti'), coalesce(rec.usa_fazioni, false),
              auth.uid(), coalesce(r->>'espansione', '') = 'true')
      on conflict (bgg_id) do nothing
      returning * into g;

      -- Aggiunto da qualcun altro nello stesso istante.
      if g.id is null then
        select * into g from giochi where bgg_id = rec.bgg_id limit 1;
      end if;
    end if;

    return next g;
  end loop;
end;
$function$;
