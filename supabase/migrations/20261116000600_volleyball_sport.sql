-- Volleyball (D121), step 1 of 2: the enum value alone. Postgres refuses to use a new enum value
-- in the transaction that added it, so the functions that mention it come in the next migration.
alter type public.sport add value if not exists 'volleyball';
