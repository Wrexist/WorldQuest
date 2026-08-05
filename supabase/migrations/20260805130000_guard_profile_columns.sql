-- `profiles` has six columns its own owner should not be able to write, and could.
--
-- `own_profile_update` has no column restriction — RLS cannot express one — and the
-- trigger beside it guarded exactly two fields. Everything else was editable by the user
-- it describes, and four of them were reachable exploits rather than untidiness:
--
--   · `timezone` is handed to `Intl.DateTimeFormat` by `startOfLocalDay`, which THROWS
--     on a zone it does not recognise. One PATCH of nonsense made every subsequent
--     lesson submission 500 for that account, permanently, with no way to recover from
--     the client. `submit-lesson` now falls back to UTC, but a column that can hold a
--     value no consumer can parse is a trap for the next consumer.
--   · `timezone` again, legitimately spelled: the XP soft cap and `isFirstLessonOfDay`
--     are evaluated in the user's local day. Moving the zone back and forth resets that
--     window on demand — the soft cap bypassed and +10 XP per reset, indefinitely.
--   · `birth_year` was mutable while `is_child` — derived from it at signup — was not.
--     Two fields that must agree, one of them frozen. Anything that ever recomputes the
--     second from the first loses the protection, and the trigger's own comment says
--     that protection is the point.
--   · `deleted_at` is in the `own_profile_select` predicate. Setting it on yourself
--     makes your own profile unreadable to you, for ever, from a client that has no
--     screen for undoing it.
--
-- And two that are not exploits but are moderation surface in a product for children:
-- `display_name` had no length limit and is shown to other people, and `handle` could be
-- set to `admin`, `moderator` or `support` by anyone.
--
-- All of it goes in the trigger that already exists for this, rather than in six checks
-- spread across the schema, because the rule is one rule: these columns are server-owned
-- or shape-constrained, and `service_role` is the exception.

create or replace function guard_protected_profile_columns()
returns trigger language plpgsql security definer
-- An empty search_path is required on SECURITY DEFINER: without it a caller can
-- shadow a referenced object and run code as the function owner.
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then return new; end if;

  if new.is_child is distinct from old.is_child then
    raise exception 'is_child is immutable';
  end if;
  if new.role is distinct from old.role then
    raise exception 'role may only be changed server-side';
  end if;

  -- Immutable once set, for the same reason `is_child` is: they are two views of one
  -- fact, and freezing only the derived one leaves the protection resting on nothing
  -- ever recomputing it. Null → a value is allowed, so a user who skipped the age gate
  -- can still answer it later; a value → a different value is not.
  if old.birth_year is not null and new.birth_year is distinct from old.birth_year then
    raise exception 'birth_year may only be set once';
  end if;

  -- Server-owned. A soft delete is an account action with consequences a client cannot
  -- undo, and a parent link is a claim that has to be verified rather than asserted.
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_at is set server-side';
  end if;
  if new.parent_id is distinct from old.parent_id then
    raise exception 'parent_id is set server-side';
  end if;

  -- A zone Intl cannot parse is a lesson nobody can submit. `pg_timezone_names` is the
  -- IANA database Postgres already ships, which is the same set Intl resolves against.
  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'timezone must be a known IANA zone';
  end if;

  -- Shown to other people, in a product whose users are children.
  if new.display_name is not null and length(new.display_name) > 40 then
    raise exception 'display_name is at most 40 characters';
  end if;

  -- The format check on the column admits these; nothing else refused them.
  if new.handle is distinct from old.handle
     and new.handle ~ '^(admin|administrator|moderator|mod|support|staff|worldquest|system|root|help)([_0-9]*)$' then
    raise exception 'that handle is reserved';
  end if;

  return new;
end $$;
