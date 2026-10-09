-- Kharwa - messages delete themselves after 30 days
--
-- Run this in the Supabase SQL Editor once, after schema.sql. Safe to run
-- again: the job is created by name, so a second run replaces it.
--
-- Every night at 3:17 (UTC) it deletes messages older than 30 days, and the
-- nudge records (kept for the bell's 15-minute limit) just as old.
--
-- To stop it:
--   select cron.unschedule('kharwa-delete-old-messages');

create extension if not exists pg_cron;

select cron.schedule(
  'kharwa-delete-old-messages',
  '17 3 * * *',
  $$
  delete from public.messages where created_at < now() - interval '30 days';
  delete from public.nudges   where sent_at    < now() - interval '30 days';
  $$
);
