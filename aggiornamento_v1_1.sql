-- ============================================================
-- PRIMO GIOCATORE - SCHEMA v1.1.0 - 202609141500
-- Aggiunte per il catalogo giochi e le collezioni BGG.
-- Da eseguire in Supabase: SQL Editor > New query > Incolla > Run
-- ============================================================

-- 1. Anno di pubblicazione: arriva da BGG, mancava nello schema iniziale.
alter table giochi add column if not exists anno smallint;

-- 2. Chi possiede cosa. Separata dalle partite: possedere e aver giocato
--    sono due fatti diversi, e servono a domande diverse
--    ("quali miei giochi non tocco da un anno", "quanti ne ho giocati senza averli").
create table if not exists collezioni (
  utente_id     uuid not null references profili(id) on delete cascade,
  gioco_id      uuid not null references giochi(id) on delete cascade,
  origine       text not null default 'manuale' check (origine in ('bgg','manuale')),
  aggiornato_il timestamptz not null default now(),
  primary key (utente_id, gioco_id)
);

create index if not exists idx_collezioni_utente on collezioni (utente_id);

alter table collezioni enable row level security;

-- Le collezioni sono pubbliche in lettura: servono per sapere chi può
-- portare un gioco a un tavolo. Ognuno modifica solo la propria.
create policy "collezioni lettura" on collezioni for select using (true);
create policy "collezioni proprie" on collezioni for all
  using (utente_id = auth.uid())
  with check (utente_id = auth.uid());

-- 3. Il catalogo giochi è condiviso: chi è autenticato può aggiornare
--    i dati di un gioco (arrivano da BGG) e impostare il tipo di punteggio.
create policy "giochi modifica" on giochi for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
