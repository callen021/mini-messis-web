-- D142: the first drill pictures. Toe Taps, Inside-Inside Touches and Sole Rolls each get one
-- photo, the same for all three levels.
--
-- Data only: no table, function or policy changes. Each level of a drill stores
-- `image: { path, width, height }`, an object in the public `practice-library` bucket. The files
-- are not in the repository; they are put in the bucket by hand (toe-taps/drill.webp,
-- inside-inside-touches/drill.webp, sole-rolls/drill.webp). Until a file is there the app shows no picture, as before.

create function pg_temp.set_drill_picture(p_slug text, p_path text, p_width int, p_height int)
returns void language sql as $$
  update public.library_items i
     set content = jsonb_set(
           i.content,
           '{home,levels}',
           (select jsonb_agg(
                     l.lvl || jsonb_build_object(
                       'image',
                       jsonb_build_object('path', p_path, 'width', p_width, 'height', p_height))
                     order by l.n)
              from jsonb_array_elements(i.content #> '{home,levels}') with ordinality as l(lvl, n))
         )
   where i.slug = p_slug
     and i.category = 'home'
     and jsonb_array_length(i.content #> '{home,levels}') > 0;
$$;

select pg_temp.set_drill_picture('toe-taps', 'toe-taps/drill.webp', 1000, 1250);
select pg_temp.set_drill_picture('inside-inside-touches', 'inside-inside-touches/drill.webp', 1000, 750);
select pg_temp.set_drill_picture('sole-rolls', 'sole-rolls/drill.webp', 1000, 1250);
