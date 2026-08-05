-- Provision a new user's rows on signup.
--
-- Found by trying to run the real thing: `profiles` deliberately has no INSERT
-- policy (clients must not forge identity rows), which left signup with no way to
-- create one at all. It has to happen server-side, as a trigger.
--
-- This also creates the wallet and streak rows, so no other code path has to
-- handle "the user exists but has no wallet".

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_handle text;
  final_handle text;
  suffix int := 0;
  claimed_birth_year int;
begin
  -- A handle must satisfy profiles.handle's format check. Derive one from the
  -- user id rather than the email — an email local-part is PII and often invalid
  -- as a handle anyway.
  base_handle := 'explorer_' || substr(replace(new.id::text, '-', ''), 1, 8);
  final_handle := base_handle;

  while exists (select 1 from public.profiles p where p.handle = final_handle) loop
    suffix := suffix + 1;
    final_handle := substr(base_handle, 1, 17) || '_' || suffix::text;
  end loop;

  claimed_birth_year := nullif(new.raw_user_meta_data ->> 'birth_year', '')::int;

  insert into public.profiles (id, handle, locale, timezone, birth_year, is_child)
  values (
    new.id,
    final_handle,
    coalesce(new.raw_user_meta_data ->> 'locale', 'en'),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC'),
    claimed_birth_year,
    -- Computed ONCE, here, from the age gate. The column is immutable afterwards
    -- (see guard_protected_profile_columns), so a child cannot age out of
    -- protection by editing a field.
    case
      when claimed_birth_year is null then false
      when (extract(year from now())::int - claimed_birth_year) < 13 then true
      else false
    end
  );

  insert into public.wallets (user_id) values (new.id);
  insert into public.streaks (user_id) values (new.id);

  return new;
end $$;

-- Trigger functions must never be callable directly: PostgREST exposes every
-- public function as an RPC endpoint.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
