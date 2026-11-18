-- Practice library drafts (D125): a new item is inserted unpublished, checked on a phone, then
-- published. A platform admin reads unpublished items so that check can happen in the app; for
-- everyone else nothing changes. Publishing is `update public.library_items set is_published = true
-- where slug = '…'` in the SQL editor (the app still cannot write this table).

drop policy if exists library_items_read on public.library_items;
create policy library_items_read on public.library_items for select to authenticated
  using (is_published or (select public.is_platform_admin()));
