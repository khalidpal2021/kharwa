/* ===========================================================================
   data.js — Supabase client, the log cache, and realtime.
   Depends on the supabase-js UMD bundle (global `supabase`) and times.js.
   =========================================================================== */

const PEOPLE_IDS = ['khalid', 'marwa'];

/** How far back we load logs, which also caps how long a streak can be. */
const HISTORY_DAYS = 120;

const DEFAULT_PERSON = {
  display_name: '',
  calc_method: 'NorthAmerica',
  asr_madhab: 'standard',
};

const Data = {
  db: null,
  configured: false,

  /** person id -> people row */
  people: {
    khalid: { id: 'khalid', ...DEFAULT_PERSON, display_name: 'Khalid' },
    marwa:  { id: 'marwa',  ...DEFAULT_PERSON, display_name: 'Marwa' },
  },

  /** "person|date|prayer" -> status */
  logs: new Map(),

  /** The date-key window we have fetched. */
  loadedFrom: null,
  loadedTo: null,

  channel: null,

  /* ------------------------------------------------------------- setup --- */

  init() {
    const cfg = window.KHARWA_CONFIG || {};
    const url = cfg.SUPABASE_URL || '';
    const key = cfg.SUPABASE_ANON_KEY || '';

    this.configured =
      /^https:\/\/.+\.supabase\.co/.test(url) &&
      !url.includes('YOUR-PROJECT-REF') &&
      key.length > 20 &&
      !key.includes('YOUR-ANON-KEY');

    if (!this.configured) return false;

    this.db = supabase.createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 4 } },
    });
    return true;
  },

  /* --------------------------------------------------------- log cache --- */

  cacheKey(person, date, prayer) {
    return `${person}|${date}|${prayer}`;
  },

  status(person, date, prayer) {
    return this.logs.get(this.cacheKey(person, date, prayer)) || 'none';
  },

  setLocal(person, date, prayer, status) {
    const k = this.cacheKey(person, date, prayer);
    if (status === 'none') this.logs.delete(k);
    else this.logs.set(k, status);
  },

  /* ------------------------------------------------------------ reads ---- */

  async loadPeople() {
    if (!this.configured) return;
    const { data, error } = await this.db
      .from('people')
      .select('id, display_name, calc_method, asr_madhab');
    if (error) throw error;
    for (const row of data || []) {
      if (!PEOPLE_IDS.includes(row.id)) continue;
      this.people[row.id] = {
        ...this.people[row.id],
        ...row,
        display_name: row.display_name || this.people[row.id].display_name,
      };
    }
  },

  /** Load logs between two date keys inclusive, merging into the cache. */
  async loadLogs(fromKey, toKey) {
    if (!this.configured) return;
    const { data, error } = await this.db
      .from('prayer_logs')
      .select('person, log_date, prayer, status')
      .gte('log_date', fromKey)
      .lte('log_date', toKey);
    if (error) throw error;

    // Clear the window first so rows deleted elsewhere do not linger.
    for (const k of [...this.logs.keys()]) {
      const date = k.split('|')[1];
      if (date >= fromKey && date <= toKey) this.logs.delete(k);
    }
    for (const row of data || []) {
      this.setLocal(row.person, row.log_date, row.prayer, row.status);
    }
  },

  /** The default window: HISTORY_DAYS back through tomorrow. */
  async loadRecent() {
    const from = addDays(todayKey(), -HISTORY_DAYS);
    const to = addDays(todayKey(), 1);
    await this.loadLogs(from, to);
    this.loadedFrom = from;
    this.loadedTo = to;
  },

  /** Make sure a specific day is in the cache (for far-off day navigation). */
  async ensureDay(dateKeyStr) {
    if (!this.configured) return;
    if (this.loadedFrom && dateKeyStr >= this.loadedFrom && dateKeyStr <= this.loadedTo) return;
    await this.loadLogs(dateKeyStr, dateKeyStr);
  },

  /* ----------------------------------------------------------- writes ---- */

  async writeStatus(person, date, prayer, status) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');

    if (status === 'none') {
      const { error } = await this.db
        .from('prayer_logs')
        .delete()
        .eq('person', person)
        .eq('log_date', date)
        .eq('prayer', prayer);
      if (error) throw error;
      return;
    }

    const { error } = await this.db
      .from('prayer_logs')
      .upsert(
        { person, log_date: date, prayer, status, updated_at: new Date().toISOString() },
        { onConflict: 'person,log_date,prayer' }
      );
    if (error) throw error;
  },

  async saveSettings(person, patch) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db.from('people').update(patch).eq('id', person);
    if (error) throw error;
    this.people[person] = { ...this.people[person], ...patch };
  },

  /* --------------------------------------------------------- realtime ---- */

  /**
   * Subscribe to prayer_logs changes. `onChange` gets
   * { person, date, prayer, status, event } for every row that moves.
   */
  subscribe(onChange) {
    if (!this.configured || this.channel) return;

    this.channel = this.db
      .channel('kharwa-prayer-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prayer_logs' },
        (payload) => {
          const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
          if (!row || !row.person || !row.log_date || !row.prayer) return;

          const status = payload.eventType === 'DELETE' ? 'none' : row.status;
          this.setLocal(row.person, row.log_date, row.prayer, status);
          onChange({
            person: row.person,
            date: row.log_date,
            prayer: row.prayer,
            status,
            event: payload.eventType,
          });
        }
      )
      .subscribe();
  },
};
