-- Softball (D119), step 1 of 2: the sport value. A new enum value cannot be used in the same
-- transaction that adds it, so the functions that mention it live in the next migration.
alter type public.sport add value if not exists 'softball';
