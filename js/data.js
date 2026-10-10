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
  qada_start: null,
  show_learn: null, // null: the person's default, see showsLearn()
};

/** PostgREST caps a response (1000 rows on Supabase), so reads page through. */
const PAGE_ROWS = 1000;

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

  /** person id -> date key of their first ever log, or null */
  firstLog: {},

  /** person id -> { fajr: 3, witr: 1, ... }, prayers owed from before Kharwa */
  backlog: {},

  /** Who can be nudged: people with a device signed up for pushes. */
  pushPeople: new Set(),

  /** "from|to|date|prayer" -> when that nudge was last sent, in ms */
  nudgedAt: new Map(),

  /** False until the qada_backlog table exists (schema.sql has been re-run). */
  backlogReady: false,

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

  /** Only on time and late are kept. Older rows stored as 'missed' read as
      empty, and show as missed once the prayer's window has passed. */
  setLocal(person, date, prayer, status) {
    const k = this.cacheKey(person, date, prayer);
    if (status === 'on_time' || status === 'late') this.logs.set(k, status);
    else this.logs.delete(k);
  },

  /* ------------------------------------------------------------ reads ---- */

  async loadPeople() {
    if (!this.configured) return;
    // * rather than a column list, so a database without qada_start yet still loads.
    const { data, error } = await this.db
      .from('people')
      .select('*');
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
    const data = [];
    for (let at = 0; ; at += PAGE_ROWS) {
      const { data: page, error } = await this.db
        .from('prayer_logs')
        .select('person, log_date, prayer, status')
        .gte('log_date', fromKey)
        .lte('log_date', toKey)
        .order('id', { ascending: true })
        .range(at, at + PAGE_ROWS - 1);
      if (error) throw error;
      data.push(...(page || []));
      if (!page || page.length < PAGE_ROWS) break;
    }

    // Clear the window first so rows deleted elsewhere do not linger.
    for (const k of [...this.logs.keys()]) {
      const date = k.split('|')[1];
      if (date >= fromKey && date <= toKey) this.logs.delete(k);
    }
    for (const row of data) {
      this.setLocal(row.person, row.log_date, row.prayer, row.status);
    }
  },

  /** The default window: HISTORY_DAYS back through tomorrow, or further back
      to the earliest qada start, so every owed prayer is in the cache. */
  async loadRecent() {
    let from = addDays(todayKey(), -HISTORY_DAYS);
    for (const p of PEOPLE_IDS) {
      const start = this.qadaStart(p);
      if (start && start < from) from = start;
    }
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

  /** The Learn tab: the person's own choice, else on for Khalid and off for
      Marwa, which also covers a database without the show_learn column. */
  showsLearn(person) {
    const v = this.people[person]?.show_learn;
    return typeof v === 'boolean' ? v : person !== 'marwa';
  },

  /* --------------------------------------------------------------- qada -- */

  /** Where a person's qada count starts: their own setting, else their first log. */
  qadaStart(person) {
    return this.people[person]?.qada_start || this.firstLog[person] || null;
  },

  /** Each person's first log date, and the backlog. Call before loadRecent,
      which reaches back to the qada start. */
  async loadQada() {
    if (!this.configured) return;

    const firsts = await Promise.all(PEOPLE_IDS.map((p) => this.db
      .from('prayer_logs')
      .select('log_date')
      .eq('person', p)
      .order('log_date', { ascending: true })
      .limit(1)));
    PEOPLE_IDS.forEach((p, i) => {
      if (firsts[i].error) throw firsts[i].error;
      this.firstLog[p] = firsts[i].data?.[0]?.log_date || null;
    });

    // Missing until schema.sql is re-run: then there is simply no backlog.
    const { data, error } = await this.db
      .from('qada_backlog')
      .select('person, prayer, count');
    this.backlogReady = !error;
    this.backlog = {};
    for (const row of data || []) {
      (this.backlog[row.person] ||= {})[row.prayer] = row.count;
    }
  },

  /** Upsert some of one person's backlog counts: { fajr: 3, witr: 0 }. */
  async saveBacklog(person, counts) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const rows = Object.entries(counts).map(([prayer, count]) => (
      { person, prayer, count, updated_at: new Date().toISOString() }
    ));
    if (!rows.length) return;
    const { error } = await this.db
      .from('qada_backlog')
      .upsert(rows, { onConflict: 'person,prayer' });
    if (error) throw error;
    this.backlog[person] = { ...this.backlog[person], ...counts };
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

  /* -------------------------------------------------- prayer reminders --- */

  /** This device's reminder row, by its push endpoint, or null. */
  async loadPushSubscription(endpoint) {
    if (!this.configured) return null;
    const { data, error } = await this.db
      .from('push_subscriptions')
      .select('person, settings')
      .eq('endpoint', endpoint)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Saves this device's subscription for a person, with its settings. */
  async savePushSubscription(person, subscription, settings) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { endpoint, keys } = subscription.toJSON();
    const { error } = await this.db
      .from('push_subscriptions')
      .upsert({ person, endpoint, keys, settings }, { onConflict: 'endpoint' });
    if (error) throw error;
  },

  async deletePushSubscription(endpoint) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;
  },

  /** Who has at least one device signed up for pushes. False until the
      push_subscriptions table exists. */
  async loadPushPeople() {
    if (!this.configured) return;
    const { data, error } = await this.db.from('push_subscriptions').select('person');
    if (error) return; // schema.sql not re-run yet: nobody can be nudged
    this.pushPeople = new Set(data.map((r) => r.person));
  },

  /** A day's nudges, so a bell knows when it was last rung. */
  async loadNudges(date) {
    if (!this.configured) return;
    const { data, error } = await this.db
      .from('nudges')
      .select('from_person, to_person, prayer, log_date, sent_at')
      .eq('log_date', date);
    if (error) return;
    for (const r of data) this.noteNudge(r.from_person, r.to_person, r.log_date, r.prayer, Date.parse(r.sent_at));
  },

  nudgeKey(from, to, date, prayer) {
    return `${from}|${to}|${date}|${prayer}`;
  },

  noteNudge(from, to, date, prayer, at) {
    const k = this.nudgeKey(from, to, date, prayer);
    if (!(this.nudgedAt.get(k) >= at)) this.nudgedAt.set(k, at);
  },

  /** When `from` last nudged `to` about a prayer, in ms, or 0. */
  lastNudge(from, to, date, prayer) {
    return this.nudgedAt.get(this.nudgeKey(from, to, date, prayer)) || 0;
  },

  /** Asks the send-nudge Edge Function to push to all of `to`'s devices.
      Resolves to { ok, sent_at } or { ok: false, reason, last_at }. */
  async sendNudge(from, to, prayer, date) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { data, error } = await this.db.functions.invoke('send-nudge', {
      body: { from, to, prayer, date },
    });
    if (error) {
      throw new Error(error.context?.status === 404
        ? 'the send-nudge function is not deployed yet.'
        : error.message);
    }
    if (!data?.ok && !data?.reason) throw new Error(data?.error || 'the nudge could not be sent.');
    return data;
  },

  /* ------------------------------------------------------------ messages --- */

  /** The Us thread, oldest first: the last 30 days (older ones are deleted). */
  async loadMessages() {
    if (!this.configured) return [];
    const since = new Date(Date.now() - 31 * 86400_000).toISOString();
    const { data, error } = await this.db
      .from('messages')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(2000);
    if (error) throw error;
    return data || [];
  },

  /** Through the send-message Edge Function, which saves it and pushes it.
      Resolves to { ok, message, devices } or { ok: false, reason }. */
  async sendMessage(fields) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { data, error } = await this.db.functions.invoke('send-message', { body: fields });
    if (error) {
      throw new Error(error.context?.status === 404
        ? 'the send-message function is not deployed yet.'
        : error.message);
    }
    if (!data?.ok && !data?.reason) throw new Error(data?.error || 'the message could not be sent.');
    return data;
  },

  /** Ayahs either of you added to a mood in "Ayahs for the moment". */
  async loadPresets() {
    if (!this.configured) return [];
    const { data, error } = await this.db
      .from('us_presets')
      .select('id, person, mood, surah, ayah_from, ayah_to, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addPreset(person, mood, surah, ayahFrom, ayahTo = ayahFrom) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { data, error } = await this.db
      .from('us_presets')
      .upsert({ person, mood, surah, ayah_from: ayahFrom, ayah_to: ayahTo },
        { onConflict: 'mood,surah,ayah_from,ayah_to', ignoreDuplicates: true })
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  async removePreset(id) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db.from('us_presets').delete().eq('id', id);
    if (error) throw error;
  },

  /** Only your own: long-press in the thread. */
  async deleteMessage(person, id) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db.from('messages').delete().eq('id', id).eq('from_person', person);
    if (error) throw error;
  },

  /** Everything sent to `person` is read now. */
  async markMessagesRead(person) {
    if (!this.configured) return;
    const { error } = await this.db
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('to_person', person)
      .is('read_at', null);
    if (error) throw error;
  },

  /** New, read and deleted messages, live: onChange({ event, row }). */
  subscribeMessages(onChange) {
    if (!this.configured || this.messageChannel) return;
    this.messageChannel = this.db
      .channel('kharwa-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (row?.id) onChange({ event: payload.eventType, row });
      })
      .subscribe();
  },

  /** Asks the send-reminders Edge Function for a test notification now. */
  /** A test from the Settings menu: `kind` is what it imitates (a prayer
      reminder, a nudge, a note), `delay` seconds before it is sent. Only to
      this person's own devices; nothing is written. Resolves to the
      function's answer, or throws with the reason in words. */
  async sendTestPush(endpoint, kind = 'basic', delay = 0) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { data, error } = await this.db.functions.invoke('send-reminders', {
      body: { test: true, endpoint, kind, delay },
    });
    if (error) {
      // A non-2xx answer: say what the function said, not just its status.
      const status = error.context?.status;
      if (status === 404) throw new Error('the send-reminders function is not deployed.');
      let said = '';
      try { said = (await error.context.json())?.error || ''; } catch { /* not JSON */ }
      throw new Error(said || `send-reminders answered ${status || error.message}.`);
    }
    // Each function names itself; a bare `reason` with no name is how the
    // other functions answered before they did. Either way, what is deployed
    // under this name is not the reminders code.
    const wrong = (data?.fn && data.fn !== 'send-reminders') ? data.fn
      : (!data?.fn && data?.reason === 'bad_request') ? 'send-message' : null;
    if (wrong) {
      throw new Error(`send-reminders is running the ${wrong} code. `
        + 'Redeploy it from supabase/functions/send-reminders/index.ts.');
    }
    if (data?.ok) return data;
    if (data?.error) throw new Error(data.error);
    throw new Error(`send-reminders answered ${JSON.stringify(data)}.`);
  },

  /* ----------------------------------------------------- quran reading --- */

  /** Both people's last reading position: { khalid: { surah, ayah, updated_at }, ... } */
  async loadQuranProgress() {
    if (!this.configured) return {};
    const { data, error } = await this.db
      .from('quran_progress')
      .select('person, surah, ayah, updated_at');
    if (error) throw error;
    return Object.fromEntries((data || []).map((r) => [r.person, r]));
  },

  async saveQuranProgress(person, surah, ayah) {
    if (!this.configured) return;
    const { error } = await this.db
      .from('quran_progress')
      .upsert(
        { person, surah, ayah, updated_at: new Date().toISOString() },
        { onConflict: 'person' }
      );
    if (error) throw error;
  },

  /** One person's bookmarks, newest first: [{ surah, ayah, created_at }] */
  async loadBookmarks(person) {
    if (!this.configured) return [];
    const { data, error } = await this.db
      .from('quran_bookmarks')
      .select('surah, ayah, created_at')
      .eq('person', person)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async addBookmark(person, surah, ayah) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db
      .from('quran_bookmarks')
      .upsert({ person, surah, ayah }, { onConflict: 'person,surah,ayah', ignoreDuplicates: true });
    if (error) throw error;
  },

  async removeBookmark(person, surah, ayah) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db
      .from('quran_bookmarks')
      .delete()
      .eq('person', person)
      .eq('surah', surah)
      .eq('ayah', ayah);
    if (error) throw error;
  },

  /* ---------------------------------------------------- hadith reading --- */

  /** Every person's position in every collection, newest first:
      [{ person, book, section, hadith_number, updated_at }] */
  async loadHadithProgress() {
    if (!this.configured) return [];
    const { data, error } = await this.db
      .from('hadith_progress')
      .select('person, book, section, hadith_number, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  /** One row per person per collection. */
  async saveHadithProgress(person, book, section, hadithNumber) {
    if (!this.configured) return;
    const { error } = await this.db
      .from('hadith_progress')
      .upsert(
        { person, book, section, hadith_number: hadithNumber, updated_at: new Date().toISOString() },
        { onConflict: 'person,book' }
      );
    if (error) throw error;
  },

  /** One person's hadith bookmarks, newest first: [{ book, hadith_number, created_at }] */
  async loadHadithBookmarks(person) {
    if (!this.configured) return [];
    const { data, error } = await this.db
      .from('hadith_bookmarks')
      .select('book, hadith_number, created_at')
      .eq('person', person)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async addHadithBookmark(person, book, hadithNumber) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db
      .from('hadith_bookmarks')
      .upsert(
        { person, book, hadith_number: hadithNumber },
        { onConflict: 'person,book,hadith_number', ignoreDuplicates: true }
      );
    if (error) throw error;
  },

  async removeHadithBookmark(person, book, hadithNumber) {
    if (!this.configured) throw new Error('Supabase is not configured yet.');
    const { error } = await this.db
      .from('hadith_bookmarks')
      .delete()
      .eq('person', person)
      .eq('book', book)
      .eq('hadith_number', hadithNumber);
    if (error) throw error;
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
