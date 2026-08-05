-- Schema-qualify the two functions no later migration already re-creates.
--
-- `create or replace function foo()` resolves the NAME against the migration session's
-- `search_path`, not against the `set search_path = ''` inside the body. On a runner
-- whose search_path puts another schema first, that creates a second function elsewhere
-- and leaves the `public` one unpatched — the replace silently misses its target.
--
-- Four migrations were written that way. Two are already covered forward:
-- `guard_protected_profile_columns` by 20260805210000 and `record_subscription_event`
-- by 20260805230000, both of which name `public.` explicitly. These two are not, so
-- they get it here.
--
-- ## Why this is a new file rather than an edit
--
-- The four were edited in place first, and that was wrong — flagged in review, and the
-- reviewer was right. Forward-only is not a rule about whether a migration has been
-- merged; it is a rule about whether it may have been APPLIED. A teammate with a local
-- database from this branch has already run those files, so an edited version reaches a
-- fresh database and never reaches theirs, and the two silently disagree. That the
-- change is cosmetic makes the divergence harder to find, not less real.
--
-- Replacing a function is idempotent and safe to repeat, so a forward migration costs
-- nothing here. That is not true of every fix, which is the reason the rule is absolute
-- rather than a judgement call.

create or replace function public.handle_new_user()
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

create or replace function public.touch_subscription_updated_at()
returns trigger language plpgsql
-- Empty search_path, as `harden_security_advisories` requires of every function here.
-- This one is not SECURITY DEFINER and does not need to be — it touches one column of
-- the row being written — but a function with a mutable search_path is a function whose
-- referenced objects can be shadowed, and the advisor flags it regardless.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
