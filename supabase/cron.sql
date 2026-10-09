-- Kharwa - prayer reminders, every minute
--
-- Run this in the Supabase SQL Editor AFTER schema.sql has been run and the
-- send-reminders Edge Function has been deployed. Safe to run again: the job
-- is created by name, so a second run replaces it rather than adding another.
--
-- Every minute, pg_cron asks pg_net to POST to the Edge Function, which
-- sends whatever reminders are due. The key below is the public anon key
-- (the same one in config.js), not the service_role key.
--
-- To stop reminders for everyone:
--   select cron.unschedule('kharwa-send-reminders');
--
-- To see the last few runs:
--   select status, return_message, start_time
--   from cron.job_run_details order by start_time desc limit 10;
--   select status_code, content, created from net._http_response order by created desc limit 10;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'kharwa-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://knnxeivkcazzowhorokt.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubnhlaXZrY2F6em93aG9yb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTQxMTcsImV4cCI6MjEwNjM5MDExN30.mGndcOGxzhTAb_r1-p7z85_IIO4R23eNrqxPoqmz4hQ'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
