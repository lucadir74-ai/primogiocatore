-- Primo Giocatore - date degli eventi come giorni
-- v1.0.0 - 202611182100
-- Si può rilanciare senza danni.
--
-- La tabella eventi esisteva già prima di eventi_fase1.sql, con inizio e
-- fine come «data e ora»: lo script le ha lasciate così. L'app si
-- aspetta giorni (AAAA-MM-GG). Qui le colonne diventano giorni, solo se
-- non lo sono già, tenendo il giorno italiano di ogni data.
-- Alla fine mostra come sono le colonne e gli eventi.

do $$
declare
  c    text;
  tipo text;
begin
  foreach c in array array['inizio', 'fine'] loop
    select data_type into tipo from information_schema.columns
      where table_schema = 'public' and table_name = 'eventi' and column_name = c;
    if tipo = 'timestamp with time zone' then
      execute format('alter table public.eventi alter column %I type date using (%I at time zone ''Europe/Rome'')::date', c, c);
    elsif tipo is not null and tipo <> 'date' then
      -- data e ora senza fuso, o testo: basta il giorno com'è scritto
      execute format('alter table public.eventi alter column %I type date using left(%I::text, 10)::date', c, c);
    end if;
  end loop;
end $$;

select column_name, data_type,
       (select string_agg(nome || ': ' || inizio || ' → ' || fine, ' | ') from public.eventi) as eventi
from information_schema.columns
where table_schema = 'public' and table_name = 'eventi' and column_name in ('inizio', 'fine');
