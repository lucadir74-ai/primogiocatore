-- ============================================================
-- PRIMO GIOCATORE - SCHEMA v1.3.0 - 202609141800
-- Regole di accesso per registrare le partite.
-- Da eseguire in Supabase: SQL Editor > New query > Incolla > Run
-- ============================================================

-- OSPITI: giocatori senza account.
-- Leggibili da tutti (servono per mostrare i nomi nelle partite),
-- ma li crea e modifica solo chi li ha inseriti.
create policy "ospiti lettura" on ospiti for select using (true);

create policy "ospiti creazione" on ospiti for insert
  with check (creato_da = auth.uid());

create policy "ospiti modifica" on ospiti for update
  using (creato_da = auth.uid());

-- LUOGHI: nome e tipo sono condivisi, così due persone non creano
-- due volte la stessa sede.
create policy "luoghi lettura" on luoghi for select using (true);

create policy "luoghi creazione" on luoghi for insert
  with check (creato_da = auth.uid());

create policy "luoghi modifica" on luoghi for update
  using (creato_da = auth.uid());

-- PARTECIPAZIONI: la regola di lettura scritta nello schema iniziale
-- era troppo larga (bastava che la partita esistesse). La rifaccio
-- allineata a quella delle partite.
drop policy if exists "partecipazioni lettura" on partecipazioni;

create policy "partecipazioni lettura" on partecipazioni for select using (
  exists (
    select 1 from partite pa
    where pa.id = partita_id
      and (
        pa.registrata_da = auth.uid()
        or (pa.gruppo_id is not null and e_membro(pa.gruppo_id))
        or partecipazioni.utente_id = auth.uid()
      )
  )
);
