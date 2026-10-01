// Kharwa configuration.
//
// The anon key is safe to ship in the browser; it is the public key the
// Supabase JS client is designed to use. Both values come from the project's
// Settings -> API page.

window.KHARWA_CONFIG = {
  SUPABASE_URL: 'https://knnxeivkcazzowhorokt.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtubnhlaXZrY2F6em93aG9yb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTQxMTcsImV4cCI6MjEwNjM5MDExN30.mGndcOGxzhTAb_r1-p7z85_IIO4R23eNrqxPoqmz4hQ',

  // Used when the browser will not give us a location.
  FALLBACK_LOCATION: {
    name: 'Tracy, CA',
    latitude: 37.7397,
    longitude: -121.4252,
  },
};
