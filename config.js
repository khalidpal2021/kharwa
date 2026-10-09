// Kharwa configuration.
//
// Fill in the two Supabase values from your project's Settings -> API page.
// The anon key is safe to ship in the browser; it is the public key the
// Supabase JS client is designed to use.
//
// VAPID_PUBLIC_KEY is the public half of the key pair for prayer reminders
// (Web Push). It is public by design; the private half is a Supabase secret
// and never belongs in this repo. See README -> Prayer reminders.
//
// Prayer times are not configured here: they come from the Islamic Society of
// Tracy's published timetable in js/timetable.js, falling back to a
// calculation for the ISOT masjid when a month is not on file.

window.KHARWA_CONFIG = {
  SUPABASE_URL: 'https://knnxeivkcazzowhorokt.supabase.co',
  VAPID_PUBLIC_KEY: 'BOl7FcOi9NRMVXlPV941RzFf0JFsqVE0M0F9pFfYI5-M7P5NHTo1fodDU9MruBw9t_VlqVHrAExtYPZZXJeAxlo',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubnhlaXZrY2F6em93aG9yb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTQxMTcsImV4cCI6MjEwNjM5MDExN30.mGndcOGxzhTAb_r1-p7z85_IIO4R23eNrqxPoqmz4hQ',
};
