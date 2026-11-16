-- Hockey (D122), step 1 of 2: the enum value alone (a new enum value cannot be used in the
-- transaction that added it).
alter type public.sport add value if not exists 'hockey';
