-- Primo Giocatore - privacy, fase 5: INDAGINE (sola lettura, non cambia niente)
-- v1.0.0 - 202611212200
--
-- Per nascondere nome e cognome agli altri soci devo sapere quali
-- funzioni del database li usano e cosa restituiscono all'app. Alcune
-- non sono nei file del progetto: questa query le elenca.
-- Incolla il risultato a Claude (basta copiare la tabella).

select p.proname                                  as funzione,
       pg_get_function_identity_arguments(p.oid)  as argomenti,
       pg_get_function_result(p.oid)              as restituisce,
       p.prosecdef                                as security_definer,
       (p.prosrc ~* '\mcognome\M')                as usa_cognome
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prokind = 'f'
   and p.prosrc ~* 'profili'
   and p.prosrc ~* '\m(nome|cognome)\M'
 order by p.proname;
