-- Android joins iPhone and web as a platform a profile sync may come from.
--
-- Since Android 1.1.4 every `POST /api/progress` from an Android phone has been answered 400: the
-- API, two functions and two CHECK constraints name 'ios' and 'web' only. A read saved on Android
-- therefore never planted its piece, and XP, the streak and the accepted risk-notice version never
-- reached the account.
--
-- Additive. Two constraints and two functions learn one more value; no row is rewritten and nothing
-- is dropped that is not put back in the same statement. The functions are rewritten from their own
-- current text (today byte for byte the text of 20260919183000_atomic_progress.sql), so whatever
-- else they say is kept, with their owner, grants and search_path. One block, so it applies whole or
-- not at all, and it refuses to run if either function does not name the platforms exactly once
-- (which is also what a second run finds).

do $migration$
declare
  f regprocedure;
  def text;
  n integer;
begin
  alter table public.bobby_progress
    drop constraint bobby_progress_last_platform_check,
    add constraint bobby_progress_last_platform_check
      check (last_platform is null or last_platform in ('ios','web','android'));

  alter table public.bobby_progress_events
    drop constraint bobby_progress_events_platform_check,
    add constraint bobby_progress_events_platform_check
      check (platform in ('ios','web','android'));

  foreach f in array array[
    'public.bobby_apply_progress(uuid,text,jsonb,jsonb)'::regprocedure,
    'public.bobby_close_seed(uuid,uuid,integer,text,integer,jsonb,text[])'::regprocedure
  ] loop
    def := pg_get_functiondef(f);
    select count(*) into n from regexp_matches(def, $re$\('ios'\s*,\s*'web'\)$re$, 'g');
    if n <> 1 then
      raise exception '% names the platforms % times, expected exactly once', f, n;
    end if;
    execute regexp_replace(def, $re$\('ios'\s*,\s*'web'\)$re$, $to$('ios','web','android')$to$);
  end loop;
end
$migration$;
