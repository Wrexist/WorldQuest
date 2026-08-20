-- Supabase's default table grants, applied AFTER the migrations.
--
-- After, because a table created by a migration would otherwise miss a grant applied
-- before it existed — and the ORDER is not cosmetic. Without these every client write is
-- refused at the GRANT layer, so an RLS assertion passes without RLS ever being consulted:
-- the first version of this harness "proved" six security properties that way, and proved
-- none of them.
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
