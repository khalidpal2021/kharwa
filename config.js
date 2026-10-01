// Kharwa configuration.
//
// Fill in the two Supabase values from your project's
// Settings -> API page. The anon key is safe to ship in the browser;
// it is the public key the Supabase JS client is designed to use.

window.KHARWA_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',

  // Used when the browser will not give us a location.
  FALLBACK_LOCATION: {
    name: 'Tracy, CA',
    latitude: 37.7397,
    longitude: -121.4252,
  },
};
