/* Sakura Shelf — simple cloud-first anime library. */
(() => {
  'use strict';

  const PREFS_KEY = 'sakura-shelf-preferences-v2';
  const CATEGORIES = ['Action','Adventure','Comedy','Drama','Fantasy','Romance','Horror','Mystery','Sci-Fi','Slice of Life','Sports','Other'];
  const AVATAR_SRC = 'assets/avatar-reference.png';
  const SUPABASE_URL = String(window.SAKURA_CONFIG?.supabaseUrl || '').trim().replace(/\/$/, '');
  const SUPABASE_KEY = String(window.SAKURA_CONFIG?.publishableKey || '').trim();
  const CATEGORY_RULES = [
    ['Action', /\b(action|martial arts|combat|fighting|samurai|military|super power|superhero|assassins?)\b/],
    ['Adventure', /\b(adventure|journey|travel|exploration)\b/],
    ['Romance', /\b(romance|romantic|boys love|girls love|yaoi|yuri|shoujo ai|shounen ai)\b/],
    ['Fantasy', /\b(fantasy|isekai|magic|magical girl|mahou shoujo|supernatural|mythology|vampires?|demons?|fairy tale)\b/],
    ['Sci-Fi', /\b(science fiction|sci fi|scifi|cyberpunk|space opera|mecha|space|futuristic)\b/],
    ['Sports', /\b(sports?|basketball|baseball|football|soccer|volleyball|tennis|swimming|boxing|cycling|racing)\b/],
    ['Mystery', /\b(mystery|suspense|thriller|psychological|detective|crime|investigation)\b/],
    ['Horror', /\b(horror|occult|gore|survival horror|supernatural horror)\b/],
    ['Drama', /\b(drama|tragedy|melodrama)\b/],
    ['Comedy', /\b(comedy|parody|gag humor|slapstick)\b/],
    ['Slice of Life', /\b(slice of life|iyashikei|healing|everyday life)\b/]
  ];

  let prefs = readJson(PREFS_KEY, { petals: true });
  let state = { anime: [], profile: { username: 'Sakura' } };
  let currentView = 'home';
  let editId = null;
  let selectedSearchItem = null;
  let lastSearchResults = [];
  let searchTimer = null;
  let searchToken = 0;
  let searchController = null;
  let cloudClient = null;
  let cloudSession = null;
  let authMode = 'login';
  let toastTimer = null;
  const searchCache = new Map();

  function readJson(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* Preferences are optional. */ }
  }
  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function safeCover(url) {
    const value = String(url || '').trim();
    return /^(https?:\/\/|assets\/)/i.test(value) ? value : '';
  }
  function getAvatarSrc() { return AVATAR_SRC; }
  function getSortedAnime(anime = state.anime) { return [...anime].sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)); }
  function averageRating(anime = state.anime) { return anime.length ? anime.reduce((sum,item) => sum + (Number(item.rating) || 0), 0) / anime.length : 0; }
  function categoryCounts(anime = state.anime) {
    const counts = {};
    anime.forEach(item => { const category = CATEGORIES.includes(item.category) ? item.category : 'Other'; counts[category] = (counts[category] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]);
  }
  function favoriteCategory(anime = state.anime) { return categoryCounts(anime)[0]?.[0] || '—'; }
  function fmtDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric' }).format(new Date(value)); }
    catch { return ''; }
  }
  function toast(message) {
    const el = document.getElementById('toast'); if (!el) return;
    el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
  function showLogin(message = '') {
    document.getElementById('login-screen')?.classList.remove('hidden');
    document.getElementById('app-frame')?.classList.add('hidden');
    const setup = document.getElementById('login-setup-note');
    const form = document.getElementById('auth-form');
    const switchButton = document.getElementById('auth-switch');
    const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);
    setup?.classList.toggle('hidden', configured);
    form?.querySelectorAll('input,button[type="submit"]').forEach(control => { control.disabled = !configured; });
    if (switchButton) switchButton.disabled = !configured;
    if (message) {
      const feedback = document.getElementById('auth-feedback');
      if (feedback) feedback.textContent = message;
    }
  }
  function showApp() {
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('app-frame')?.classList.remove('hidden');
  }
  function updateNameUI() {
    const name = state.profile.username || 'Sakura';
    document.querySelectorAll('[data-profile-name]').forEach(node => { node.textContent = name; });
  }
  function makePetals() {
    const layer = document.getElementById('petal-layer'); if (!layer) return;
    layer.innerHTML = '';
    if (prefs.petals === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const amount = window.innerWidth < 650 ? 3 : 6;
    for (let i = 0; i < amount; i++) {
      const petal = document.createElement('span'); petal.className = 'petal';
      petal.style.left = `${Math.random() * 100}%`;
      petal.style.animationDuration = `${16 + Math.random() * 15}s`;
      petal.style.animationDelay = `${-Math.random() * 25}s`;
      petal.style.setProperty('--drift', `${-55 + Math.random() * 110}px`);
      layer.appendChild(petal);
    }
  }
  function pageHeader(title, right = '') {
    return `<div class="page-header"><h1 class="page-title">${title}</h1>${right}</div>`;
  }
  function statCard(iconText, value, label, pink = false) {
    return `<div class="stat-card"><div class="stat-icon ${pink ? 'pink' : ''}">${iconText}</div><div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-label">${escapeHtml(label)}</div></div></div>`;
  }
  const glowColors = {'Action':'#a45e73','Adventure':'#9d7897','Comedy':'#b886a7','Drama':'#9179b6','Fantasy':'#9a79c1','Romance':'#cf8eb2','Horror':'#7c486e','Mystery':'#8079ad','Sci-Fi':'#758bae','Slice of Life':'#a080a2','Sports':'#719a9e','Other':'#88718a'};
  function coverMarkup(anime, extraClass = '') {
    const cover = safeCover(anime.cover || anime.cover_url);
    const glow = glowColors[anime.category] || glowColors.Other;
    const fallback = `<div class="cover-fallback" style="--cover-glow:${glow}"><span>${escapeHtml(anime.title)}</span></div>`;
    return `<div class="cover-wrap ${extraClass}" data-cover-wrap>${fallback}${cover ? `<img src="${escapeHtml(cover)}" alt="Cover of ${escapeHtml(anime.title)}" loading="lazy" data-cover-image>` : ''}</div>`;
  }
  function animeCard(anime, compact = false) {
    return `<article class="anime-card ${compact ? 'compact-card' : ''}" role="button" tabindex="0" data-open-anime="${escapeHtml(anime.id)}" aria-label="Open ${escapeHtml(anime.title)}">${coverMarkup(anime)}<div class="cover-meta"><div class="cover-title" title="${escapeHtml(anime.title)}">${escapeHtml(anime.title)}</div><div class="cover-rating"><span>★</span> ${Number(anime.rating || 0).toFixed(1)}<span class="rating-out-of">/ 10</span></div>${compact ? '' : `<div class="cover-actions"><span class="category-chip ${anime.category === 'Romance' ? 'pink' : ''}">${escapeHtml(anime.category || 'Other')}</span><button class="icon-btn" data-open-anime="${escapeHtml(anime.id)}" aria-label="Details for ${escapeHtml(anime.title)}">↗</button></div>`}</div></article>`;
  }
  function applyCoverFallbacks(root = document) {
    root.querySelectorAll('[data-cover-image]').forEach(img => {
      const fail = () => img.remove();
      img.addEventListener('error', fail, { once: true });
      if (img.complete && img.naturalWidth === 0) fail();
    });
  }

  function renderHome() {
    const el = document.getElementById('view-home');
    const list = getSortedAnime();
    const recent = list.slice(0, 5);
    el.innerHTML = `<div class="welcome-row"><div class="welcome-copy"><h1 class="page-title">Hello, <span class="accent" data-profile-name>${escapeHtml(state.profile.username || 'Sakura')}</span> <span class="accent">✿</span></h1></div></div>
      <div class="stat-grid">${statCard('▤', String(list.length), 'Total anime')}${statCard('✦', list.length ? averageRating().toFixed(1) : '—', 'Average rating', true)}${statCard('♡', favoriteCategory(), 'Top category')}</div>
      <section class="panel panel-pad home-recent"><div class="panel-heading"><h2>Recently added</h2><button class="text-button" data-view="library">View all →</button></div>
      ${recent.length ? `<div class="recent-grid">${recent.map(item => animeCard(item, true)).join('')}</div>` : `<div class="empty-state compact-empty"><strong>Your shelf is empty</strong><p>Search an anime to add it to your collection.</p><button class="btn btn-primary" data-view="add">＋ Add anime</button></div>`}</section>`;
    applyCoverFallbacks(el);
  }
  function renderLibrary() {
    const el = document.getElementById('view-library');
    el.innerHTML = `${pageHeader('My <span class="accent">library</span>', '<button class="btn btn-primary" data-view="add">＋ Add anime</button>')}
      <div class="library-tools"><div class="search-field"><span class="search-icon">⌕</span><input class="search-input" id="library-search" type="search" placeholder="Search your library…" autocomplete="off"></div><select class="field-control field-select" id="library-category" aria-label="Filter by category"><option value="all">All categories</option>${CATEGORIES.map(category => `<option>${escapeHtml(category)}</option>`).join('')}</select><span class="library-count" id="library-count"></span></div><div class="anime-grid" id="library-grid"></div>`;
    el.querySelector('#library-search').addEventListener('input', updateLibraryGrid);
    el.querySelector('#library-category').addEventListener('change', updateLibraryGrid);
    updateLibraryGrid();
  }
  function updateLibraryGrid() {
    const grid = document.getElementById('library-grid'); if (!grid) return;
    const search = (document.getElementById('library-search')?.value || '').trim().toLocaleLowerCase('en');
    const category = document.getElementById('library-category')?.value || 'all';
    const list = getSortedAnime(state.anime.filter(item => item.title.toLocaleLowerCase('en').includes(search) && (category === 'all' || item.category === category)));
    const count = document.getElementById('library-count'); if (count) count.textContent = `${list.length}`;
    grid.innerHTML = list.length ? list.map(item => animeCard(item)).join('') : `<div class="panel library-empty"><div class="empty-state"><strong>${search || category !== 'all' ? 'No anime found' : 'Your shelf is empty'}</strong><p>${search || category !== 'all' ? 'Try a different search.' : 'Add your first anime to get started.'}</p>${search || category !== 'all' ? '' : '<button class="btn btn-primary" data-view="add">＋ Add anime</button>'}</div></div>`;
    applyCoverFallbacks(grid);
  }

  function renderAdd() {
    selectedSearchItem = null;
    const el = document.getElementById('view-add');
    const existing = editId ? state.anime.find(item => String(item.id) === String(editId)) : null;
    if (existing) selectedSearchItem = { ...existing, originalTitle: existing.title, source: 'Your library', genres: [existing.category] };
    const rating = Number(existing?.rating) || 8;
    el.innerHTML = `${pageHeader(existing ? 'Edit rating' : 'Add <span class="accent">anime</span>')}
      <form class="panel form-panel simple-add-form" id="anime-form">
        <div class="form-field"><label for="anime-title">Anime title</label><div class="search-entry-row"><input class="field-control" id="anime-title" name="title" required maxlength="150" placeholder="Search an anime…" autocomplete="off" value="${escapeHtml(existing?.title || '')}" ${existing ? 'readonly' : ''}><button class="btn btn-primary search-submit" type="button" id="anime-search-button" ${existing ? 'disabled' : ''}>Search</button></div><div class="api-status" id="api-status">${existing ? 'Update the rating and save.' : 'Search the catalogue and select the correct anime.'}</div><div class="search-results" id="anime-search-results"></div></div>
        <div class="selected-anime ${existing ? '' : 'hidden'}" id="selected-anime">${existing ? `${coverMarkup(existing, 'selected-large-cover')}<div class="selected-copy"><strong id="selected-title">${escapeHtml(existing.title)}</strong><span class="category-chip ${existing.category === 'Romance' ? 'pink' : ''}" id="selected-category">${escapeHtml(existing.category)}</span></div>` : ''}</div>
        <input id="anime-cover-url" type="hidden" value="${escapeHtml(existing?.cover || '')}"><input id="anime-category" type="hidden" value="${escapeHtml(existing?.category || 'Other')}">
        <div class="form-field rating-field"><div class="field-label">Your rating</div><div class="rating-picker" id="rating-picker" role="group" aria-label="Rating from 1 to 10">${Array.from({length:10}, (_, i) => `<button type="button" class="rating-star ${i + 1 <= rating ? 'selected' : ''}" data-rating="${i + 1}" aria-label="${i + 1} out of 10">★</button>`).join('')}<span class="rating-number" id="rating-number">${rating.toFixed(1)} / 10</span></div><input type="hidden" id="anime-rating" value="${rating}"></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit" id="save-anime-button" ${existing ? '' : 'disabled'}>${existing ? 'Save rating' : '＋ Add to library'}</button><button class="btn" type="button" data-view="library">Cancel</button>${existing ? `<button class="btn btn-danger" type="button" id="delete-from-edit">Delete</button>` : ''}</div>
      </form>`;
    const titleInput = el.querySelector('#anime-title');
    titleInput.addEventListener('input', () => {
      selectedSearchItem = null; lastSearchResults = [];
      el.querySelector('#selected-anime').classList.add('hidden');
      el.querySelector('#save-anime-button').disabled = true;
      el.querySelector('#anime-cover-url').value = ''; el.querySelector('#anime-category').value = 'Other';
      el.querySelector('#anime-search-results').innerHTML = '';
      el.querySelector('#api-status').textContent = '';
    });
    el.querySelector('#anime-search-button').addEventListener('click', () => scheduleAnimeSearch(titleInput.value, true));
    titleInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !existing) { event.preventDefault(); scheduleAnimeSearch(titleInput.value, true); } });
    el.querySelectorAll('[data-rating]').forEach(button => button.addEventListener('click', () => setFormRating(Number(button.dataset.rating))));
    el.querySelector('#anime-form').addEventListener('submit', submitAnimeForm);
    if (existing) el.querySelector('#delete-from-edit').addEventListener('click', () => deleteAnime(existing.id));
    if (existing) { applyCoverFallbacks(el); }
  }
  function setFormRating(rating) {
    const hidden = document.getElementById('anime-rating'); if (hidden) hidden.value = String(rating);
    document.querySelectorAll('#rating-picker [data-rating]').forEach(button => button.classList.toggle('selected', Number(button.dataset.rating) <= rating));
    const number = document.getElementById('rating-number'); if (number) number.textContent = `${rating.toFixed(1)} / 10`;
  }
  function scheduleAnimeSearch(value, immediate = false) {
    clearTimeout(searchTimer); searchToken += 1;
    const token = searchToken;
    if (searchController) { searchController.abort(); searchController = null; }
    const target = document.getElementById('anime-search-results');
    const status = document.getElementById('api-status');
    if (!target) return;
    const query = String(value || '').trim();
    if (query.length < 2) { target.innerHTML = ''; if (status) status.textContent = 'Enter at least 2 characters.'; return; }
    if (status) status.textContent = 'Searching…';
    searchTimer = setTimeout(() => searchAnimeCatalog(query, token), immediate ? 0 : 250);
  }
  async function requestJson(url, options = {}) {
    const { method = 'GET', headers = {}, body, timeoutMs = 8500, signal } = options;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const abortFromParent = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', abortFromParent, { once: true });
    }
    try {
      const response = await fetch(url, { method, mode:'cors', cache:'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body), signal:controller.signal });
      if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
      const json = await response.json();
      if (json?.errors?.length) throw new Error(json.errors[0].message || 'Catalogue query failed');
      return json;
    } catch (error) {
      if (timedOut) throw new Error('request timed out');
      throw error;
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abortFromParent);
    }
  }
  function genreNames(genres) {
    return (Array.isArray(genres) ? genres : genres ? [genres] : []).map(item => {
      if (typeof item === 'string') return item;
      return item?.name || item?.title || item?.attributes?.title || item?.attributes?.name || item?.slug || '';
    }).filter(Boolean).map(value => String(value).replace(/[_-]+/g, ' ').trim());
  }
  function guessCategory(genres) {
    const values = genreNames(genres).map(name => name.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim());
    // Respect the source's genre order. For example, Action is usually the first genre for Attack on Titan.
    for (const value of values) {
      for (const [category, pattern] of CATEGORY_RULES) {
        if (pattern.test(value)) return category;
      }
      const exact = CATEGORIES.find(category => category.toLowerCase() === value);
      if (exact) return exact;
      if (/\b(shounen|seinen|battle shounen|action and adventure)\b/.test(value)) return 'Action';
      if (/\b(shoujo|josei|otome)\b/.test(value)) return 'Romance';
      if (/\b(science fiction|sci-fi)\b/.test(value)) return 'Sci-Fi';
    }
    return 'Other';
  }
  function normalizeAniListAnime(item, query) {
    const titles = item.title || {};
    const cover = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || '';
    const genres = item.genres || [];
    return { title:titles.english || titles.userPreferred || titles.romaji || query, originalTitle:titles.romaji || titles.native || titles.english || query,
      cover, category:guessCategory(genres), genres, year:item.startDate?.year || '', source:'AniList' };
  }
  async function searchAniList(query, signal) {
    const graphql = `query SearchAnime($search: String!) { Page(page: 1, perPage: 10) { media(search: $search, type: ANIME, sort: [SEARCH_MATCH, POPULARITY_DESC], isAdult: false) { id title { english romaji native userPreferred } coverImage { extraLarge large medium } genres startDate { year } } } }`;
    const json = await requestJson('https://graphql.anilist.co', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:{query:graphql,variables:{search:query}}, signal, timeoutMs:8500 });
    return (json?.data?.Page?.media || []).map(item => normalizeAniListAnime(item, query));
  }
  function normalizeJikanAnime(item, query) {
    const images = item.images || {};
    const cover = images.webp?.large_image_url || images.webp?.image_url || images.jpg?.large_image_url || images.jpg?.image_url || '';
    const genres = [...(item.genres || []), ...(item.themes || [])];
    return { title:item.title_english || item.title || query, originalTitle:item.title || item.title_english || query, cover,
      category:guessCategory(genres), genres, year:item.year || item.aired?.prop?.from?.year || '', source:'Jikan' };
  }
  async function searchJikan(query, signal) {
    const params = new URLSearchParams({ q:query, limit:'10', sfw:'true' });
    const json = await requestJson(`https://api.jikan.moe/v4/anime?${params}`, { headers:{Accept:'application/json'}, signal, timeoutMs:8500 });
    return (Array.isArray(json.data) ? json.data : []).map(item => normalizeJikanAnime(item, query));
  }
  async function searchKitsu(query, signal) {
    const params = new URLSearchParams({ 'filter[text]':query, 'page[limit]':'10', sort:'-userCount', include:'categories' });
    const json = await requestJson(`https://kitsu.io/api/edge/anime?${params}`, { headers:{Accept:'application/vnd.api+json'}, signal, timeoutMs:8500 });
    const namesById = new Map((json.included || []).filter(resource => resource.type === 'categories').map(resource => [String(resource.id), resource.attributes?.title || resource.attributes?.name || resource.attributes?.slug || '']));
    return (json.data || []).map(item => {
      const attributes = item.attributes || {}; const titles = attributes.titles || {};
      const links = item.relationships?.categories?.data || [];
      const genres = links.map(link => namesById.get(String(link.id))).filter(Boolean);
      const cover = attributes.posterImage?.large || attributes.posterImage?.original || attributes.posterImage?.medium || attributes.posterImage?.small || '';
      return { title:titles.en || titles.en_us || attributes.canonicalTitle || titles.en_jp || query,
        originalTitle:attributes.canonicalTitle || titles.ja_jp || titles.en_jp || query, cover, category:guessCategory(genres), genres,
        year:attributes.startDate ? String(attributes.startDate).slice(0,4) : '', source:'Kitsu' };
    });
  }
  function normalizeForMatch(value) {
    return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function mergeProviderResults(providerResults) {
    const merged = [];
    for (const { source, items } of providerResults) {
      for (const item of items) {
        const itemNames = [normalizeForMatch(item.title), normalizeForMatch(item.originalTitle)].filter(Boolean);
        const match = merged.find(existing => {
          const existingNames = [normalizeForMatch(existing.title), normalizeForMatch(existing.originalTitle)].filter(Boolean);
          return itemNames.some(name => existingNames.includes(name));
        });
        if (!match) { merged.push({ ...item, source }); continue; }
        if ((!match.cover || !match.cover.trim()) && item.cover) match.cover = item.cover;
        if ((!match.category || match.category === 'Other') && item.category && item.category !== 'Other') match.category = item.category;
        if ((!match.title || match.title === match.originalTitle) && item.title) match.title = item.title;
        if (!match.year && item.year) match.year = item.year;
        match.genres = [...new Set([...(match.genres || []), ...(item.genres || [])])];
        match.source = [...new Set(String(match.source).split(' + ').concat(source))].join(' + ');
      }
    }
    return merged;
  }
  function rankAnimeResults(query, results) {
    const wanted = normalizeForMatch(query);
    return results.map((item, index) => {
      const title = normalizeForMatch(item.title), original = normalizeForMatch(item.originalTitle);
      let rank = 5;
      if (title === wanted || original === wanted) rank = 0;
      else if (title.startsWith(wanted) || original.startsWith(wanted)) rank = 1;
      else if (title.includes(wanted) || original.includes(wanted)) rank = 2;
      else if (wanted.includes(title) || wanted.includes(original)) rank = 3;
      const category = item.category && item.category !== 'Other' ? item.category : guessCategory(item.genres);
      return { item:{ ...item, category:CATEGORIES.includes(category) ? category : 'Other' }, index, rank };
    }).sort((a,b) => a.rank - b.rank || a.index - b.index).map(entry => entry.item);
  }
  async function searchAnimeCatalog(query, token) {
    const status = document.getElementById('api-status');
    const resultsEl = document.getElementById('anime-search-results');
    if (!resultsEl || token !== searchToken) return;
    const cacheKey = query.trim().toLocaleLowerCase('en');
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 20 * 60 * 1000) { renderSearchResults(cached.results, query, token); if (status) status.textContent = ''; return; }
    resultsEl.innerHTML = `<div class="search-loading"><span class="loading-dot"></span><span>Searching…</span></div>`;
    const controller = new AbortController(); searchController = controller;
    const providers = [ ['Jikan', searchJikan], ['Kitsu', searchKitsu], ['AniList', searchAniList] ];
    let timeout;
    try {
      timeout = setTimeout(() => controller.abort(), 9500);
      const outcomes = await Promise.allSettled(providers.map(async ([source, searchFn]) => ({ source, items:await searchFn(query, controller.signal) })));
      if (token !== searchToken) return;
      const successes = []; const failures = [];
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') successes.push(outcome.value);
        else failures.push(`${providers[index][0]}: ${outcome.reason?.message || 'unavailable'}`);
      });
      const merged = mergeProviderResults(successes);
      const ranked = rankAnimeResults(query, merged);
      if (ranked.length) {
        searchCache.set(cacheKey, { results:ranked, at:Date.now() });
        if (searchCache.size > 40) searchCache.delete(searchCache.keys().next().value);
        renderSearchResults(ranked, query, token);
      } else if (successes.length === providers.length && failures.length === 0) {
        if (status) status.textContent = '';
        resultsEl.innerHTML = `<div class="search-empty"><span>✿</span><div><strong>No results found</strong><p>Try another spelling or the Japanese title.</p></div></div>`;
      } else {
        if (status) status.textContent = '';
        resultsEl.innerHTML = `<div class="search-empty search-api-failure"><span>!</span><div><strong>Search is temporarily unavailable</strong><p>Check your internet connection and try again.</p><details class="search-diagnostics"><summary>Technical details</summary><code>${escapeHtml(failures.join(' · '))}</code></details><button class="btn btn-sm" type="button" id="retry-anime-search">Try again</button></div></div>`;
        resultsEl.querySelector('#retry-anime-search')?.addEventListener('click', () => scheduleAnimeSearch(query, true));
      }
    } catch (error) {
      if (token === searchToken && error?.name !== 'AbortError') {
        if (status) status.textContent = '';
        resultsEl.innerHTML = `<div class="search-empty"><span>!</span><div><strong>Search failed</strong><p>Check the connection and try again.</p><button class="btn btn-sm" id="retry-anime-search" type="button">Try again</button></div></div>`;
        resultsEl.querySelector('#retry-anime-search')?.addEventListener('click', () => scheduleAnimeSearch(query, true));
      }
    } finally {
      clearTimeout(timeout);
      if (searchController === controller) searchController = null;
    }
  }
  function renderSearchResults(results, query, token) {
    const status = document.getElementById('api-status');
    const target = document.getElementById('anime-search-results');
    if (!target || token !== searchToken) return;
    lastSearchResults = results;
    if (status) status.textContent = `${results.length} results`;
    target.innerHTML = results.slice(0, 12).map((item, index) => `<button type="button" class="search-result" data-search-result="${index}">
      ${item.cover ? `<img class="result-cover" src="${escapeHtml(item.cover)}" alt="Cover of ${escapeHtml(item.title)}" loading="lazy">` : `<span class="result-cover result-cover-placeholder" aria-hidden="true">✿</span>`}
      <span class="result-result-copy"><span class="result-title">${escapeHtml(item.title)}</span><span class="result-subtitle">${escapeHtml(item.originalTitle)}${item.year ? ` · ${escapeHtml(item.year)}` : ''}</span></span><span class="search-result-meta"><span class="category-chip ${item.category === 'Romance' ? 'pink' : ''}">${escapeHtml(item.category)}</span><span class="result-select">Select →</span></span></button>`).join('');
    target.querySelectorAll('[data-search-result]').forEach(button => button.addEventListener('click', () => chooseSearchResult(Number(button.dataset.searchResult))));
    target.querySelectorAll('img.result-cover').forEach(img => img.addEventListener('error', () => {
      const placeholder = document.createElement('span'); placeholder.className = 'result-cover result-cover-placeholder'; placeholder.textContent = '✿';
      if (img.isConnected) img.replaceWith(placeholder);
    }, { once:true }));
  }
  function chooseSearchResult(index) {
    const item = lastSearchResults[index]; if (!item) return;
    selectedSearchItem = { ...item, category: CATEGORIES.includes(item.category) ? item.category : guessCategory(item.genres) };
    if (!selectedSearchItem.cover) {
      toast('This result has no cover image. Try another result.');
      selectedSearchItem = null;
      return;
    }
    const titleInput = document.getElementById('anime-title');
    if (titleInput) titleInput.value = selectedSearchItem.title;
    document.getElementById('anime-cover-url').value = selectedSearchItem.cover;
    document.getElementById('anime-category').value = selectedSearchItem.category;
    const selected = document.getElementById('selected-anime');
    selected.classList.remove('hidden');
    selected.innerHTML = `${coverMarkup(selectedSearchItem, 'selected-large-cover')}<div class="selected-copy"><strong id="selected-title">${escapeHtml(selectedSearchItem.title)}</strong><span class="category-chip ${selectedSearchItem.category === 'Romance' ? 'pink' : ''}" id="selected-category">${escapeHtml(selectedSearchItem.category)}</span></div>`;
    document.getElementById('anime-search-results').innerHTML = '';
    document.getElementById('api-status').textContent = '';
    document.getElementById('save-anime-button').disabled = false;
    applyCoverFallbacks(selected);
    toast(`Selected · ${selectedSearchItem.category}`);
  }
  async function submitAnimeForm(event) {
    event.preventDefault();
    const old = editId ? state.anime.find(item => String(item.id) === String(editId)) : null;
    const title = document.getElementById('anime-title').value.trim();
    if (!old && (!selectedSearchItem || selectedSearchItem.title !== title)) { toast('Search and select an anime first.'); return; }
    const source = old || selectedSearchItem;
    const rating = Math.max(1, Math.min(10, Number(document.getElementById('anime-rating').value) || 8));
    const entry = { id:old?.id || '', title:source.title, category:CATEGORIES.includes(source.category) ? source.category : guessCategory(source.genres), rating,
      cover:safeCover(source.cover || source.cover_url), created_at:old?.created_at || new Date().toISOString() };
    const submit = document.getElementById('save-anime-button');
    if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
    try {
      const saved = await saveAnimeEntry(entry, Boolean(old));
      if (old) state.anime = state.anime.map(item => String(item.id) === String(old.id) ? saved : item);
      else state.anime.push(saved);
      editId = null; selectedSearchItem = null; renderAll(); navigate('library'); toast(old ? 'Rating updated' : 'Anime added');
    } catch (error) {
      console.error(error); toast('Could not save. Check your database setup.');
      if (submit) { submit.disabled = false; submit.textContent = old ? 'Save rating' : '＋ Add to library'; }
    }
  }
  function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)); }
  function mapRemoteAnime(row) { return { id:row.id, title:row.title, cover:row.cover_url || '', category:row.category || 'Other', rating:Number(row.rating) || 0, created_at:row.created_at || new Date().toISOString() }; }
  async function saveAnimeEntry(entry, isEdit = false) {
    if (!cloudClient || !cloudSession?.user) throw new Error('You must be signed in.');
    const row = { user_id:cloudSession.user.id, title:entry.title, cover_url:entry.cover || null, category:entry.category, rating:entry.rating, created_at:entry.created_at };
    if (isEdit && isUuid(entry.id)) {
      const { data, error } = await cloudClient.from('anime').update(row).eq('id', entry.id).select().single();
      if (error) throw error; return mapRemoteAnime(data);
    }
    const { data, error } = await cloudClient.from('anime').insert(row).select().single();
    if (error) throw error; return mapRemoteAnime(data);
  }
  async function deleteAnime(id) {
    const anime = state.anime.find(item => String(item.id) === String(id)); if (!anime) return;
    if (!window.confirm(`Delete ${anime.title} from your library?`)) return;
    try {
      const { error } = await cloudClient.from('anime').delete().eq('id', id); if (error) throw error;
      state.anime = state.anime.filter(item => String(item.id) !== String(id));
      closeModal('detail-modal'); editId = null; renderAll(); navigate(currentView === 'add' ? 'library' : currentView); toast('Anime deleted');
    } catch (error) { console.error(error); toast('Could not delete this anime.'); }
  }
  function renderDetail(id) {
    const anime = state.anime.find(item => String(item.id) === String(id)); if (!anime) return;
    const box = document.getElementById('detail-content');
    box.innerHTML = `<div class="detail-layout"><div class="detail-cover">${coverMarkup(anime)}</div><div class="detail-body"><h2 class="detail-title" id="detail-title">${escapeHtml(anime.title)}</h2><span class="category-chip ${anime.category === 'Romance' ? 'pink' : ''}">${escapeHtml(anime.category || 'Other')}</span><div class="detail-rating"><span style="font-size:25px">★</span><strong>${Number(anime.rating || 0).toFixed(1)}</strong><span class="muted">/ 10</span></div><div class="detail-date">Added ${escapeHtml(fmtDate(anime.created_at))}</div><div class="detail-actions"><button class="btn btn-primary" data-edit-anime="${escapeHtml(anime.id)}">Edit rating</button><button class="btn btn-danger" data-delete-anime="${escapeHtml(anime.id)}">Delete</button></div></div></div>`;
    applyCoverFallbacks(box); openModal('detail-modal');
  }
  function renderStats() {
    const el = document.getElementById('view-stats'); const counts = categoryCounts(); const maxCount = Math.max(1, ...counts.map(item => item[1]));
    el.innerHTML = `${pageHeader('Statistics')}
      <div class="stat-grid">${statCard('▤', String(state.anime.length), 'Total anime')}${statCard('✦', state.anime.length ? averageRating().toFixed(1) : '—', 'Average rating', true)}${statCard('♡', favoriteCategory(), 'Top category')}</div>
      <section class="panel chart-panel"><div class="panel-heading"><h2>Anime by category</h2></div>${counts.length ? `<div class="category-list stats-category-list">${counts.map(([category,count],index) => `<div class="category-row"><span class="category-name">${escapeHtml(category)}</span><div class="progress-track"><div class="progress-fill" style="width:${Math.max(5,count/maxCount*100)}%;${index%2 ? 'background:linear-gradient(90deg,#bd8cb4,#e8afc2)' : ''}"></div></div><span class="category-percent">${Math.round(count/state.anime.length*100)}% · ${count}</span></div>`).join('')}</div>` : `<div class="empty-state"><strong>No statistics yet</strong><p>Add anime to see your favourite categories.</p></div>`}</section>`;
  }
  function renderProfile() {
    const el = document.getElementById('view-profile');
    el.innerHTML = `${pageHeader('Account')}
      <section class="panel profile-card account-card"><form id="username-form"><div class="form-field"><label for="profile-username">Username</label><input class="field-control" id="profile-username" maxlength="32" required value="${escapeHtml(state.profile.username || 'Sakura')}"><button class="btn btn-primary" type="submit">Save username</button></div></form>
      <form id="password-form"><div class="form-field"><label for="new-password">New password</label><input class="field-control" id="new-password" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></div><div class="form-field"><label for="confirm-password">Confirm password</label><input class="field-control" id="confirm-password" type="password" autocomplete="new-password" minlength="8" required placeholder="Repeat the new password"></div><button class="btn btn-primary" type="submit">Change password</button><div class="auth-feedback" id="password-feedback" role="status"></div></form></section>`;
    el.querySelector('#username-form').addEventListener('submit', saveProfile);
    el.querySelector('#password-form').addEventListener('submit', changePassword);
  }
  async function saveProfile(event) {
    event.preventDefault();
    const input = document.getElementById('profile-username');
    const username = String(input?.value || '').trim().slice(0,32);
    if (!username) { toast('Enter a username.'); return; }
    const button = document.querySelector('#username-form button[type="submit"]'); if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const { error } = await cloudClient.from('profiles').upsert({ id:cloudSession.user.id, username, updated_at:new Date().toISOString() }, { onConflict:'id' });
      if (error) throw error;
      state.profile.username = username; updateNameUI(); toast('Username saved');
    } catch (error) { console.error(error); toast('Could not save the username.'); }
    finally { if (button) { button.disabled = false; button.textContent = 'Save username'; } }
  }
  async function changePassword(event) {
    event.preventDefault();
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    const feedback = document.getElementById('password-feedback');
    if (password.length < 8) { feedback.textContent = 'Use at least 8 characters.'; return; }
    if (password !== confirm) { feedback.textContent = 'The passwords do not match.'; return; }
    const button = document.querySelector('#password-form button[type="submit"]'); if (button) { button.disabled = true; button.textContent = 'Updating…'; }
    feedback.textContent = '';
    try {
      const { error } = await cloudClient.auth.updateUser({ password }); if (error) throw error;
      document.getElementById('password-form').reset(); toast('Password updated');
    } catch (error) { feedback.textContent = error.message || 'Could not update the password.'; }
    finally { if (button) { button.disabled = false; button.textContent = 'Change password'; } }
  }
  function renderSettings() {
    const el = document.getElementById('view-settings');
    el.innerHTML = `${pageHeader('Settings')}<section class="panel settings-group"><div class="setting-row"><div><strong>Falling sakura petals</strong><small>Subtle background animation</small></div><label class="switch"><input type="checkbox" id="petals-toggle" ${prefs.petals !== false ? 'checked' : ''}><span></span></label></div><div class="setting-row"><div><strong>Account</strong><small>${escapeHtml(cloudSession?.user?.email || '')}</small></div><button class="btn btn-danger" id="sign-out">Sign out</button></div></section>`;
    el.querySelector('#petals-toggle').addEventListener('change', event => { prefs.petals = event.target.checked; savePrefs(); makePetals(); });
    el.querySelector('#sign-out').addEventListener('click', signOutCloud);
  }
  function renderAll() {
    renderHome(); renderLibrary(); renderStats(); renderProfile(); renderSettings(); updateNameUI();
    showView(currentView);
  }
  function showView(view) {
    const allowed = ['home','library','add','stats','profile','settings']; if (!allowed.includes(view)) view = 'home'; currentView = view;
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('hidden', el.id !== `view-${view}`));
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    if (view === 'add') renderAdd();
    if (view === 'settings') renderSettings();
    window.scrollTo({ top:0, behavior:'smooth' });
  }
  function navigate(view) { if (view === 'add') editId = null; showView(view); }
  function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); if (!document.querySelector('.modal-backdrop:not(.hidden)')) document.body.style.overflow = ''; }

  function updateAuthLabels() {
    const signup = authMode === 'signup';
    document.getElementById('auth-title').textContent = signup ? 'Create account' : 'Sign in';
    document.getElementById('auth-description').textContent = signup ? 'Create your personal anime shelf.' : 'Your anime library, wherever you are.';
    document.getElementById('auth-submit').textContent = signup ? 'Create account' : 'Sign in';
    document.getElementById('auth-switch').textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account';
    document.getElementById('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  }
  document.getElementById('auth-switch').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    document.getElementById('auth-feedback').textContent = '';
    updateAuthLabels();
  });
  document.getElementById('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const feedback = document.getElementById('auth-feedback');
    const submit = document.getElementById('auth-submit');
    if (!cloudClient) { feedback.textContent = 'Supabase is not configured. Follow the setup note above.'; return; }
    submit.disabled = true; submit.textContent = 'Please wait…'; feedback.textContent = '';
    try {
      if (authMode === 'signup') {
        const { data, error } = await cloudClient.auth.signUp({ email, password }); if (error) throw error;
        if (data.session) await activateCloudSession(data.session);
        else feedback.textContent = 'Check your email to confirm your account, then sign in.';
      } else {
        const { data, error } = await cloudClient.auth.signInWithPassword({ email, password }); if (error) throw error;
        await activateCloudSession(data.session);
      }
    } catch (error) { feedback.textContent = error.message || 'Authentication failed. Check your details.'; }
    finally { submit.disabled = false; updateAuthLabels(); }
  });
  async function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Add the project URL and publishable key to config.js.');
    if (!window.supabase?.createClient) throw new Error('Supabase client library could not load. Check your internet connection.');
    if (cloudClient) return cloudClient;
    cloudClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
    cloudClient.auth.onAuthStateChange((event, session) => {
      cloudSession = session;
      if (event === 'SIGNED_OUT') {
        state = { anime:[], profile:{ username:'Sakura' } };
        showLogin('You have signed out.');
      }
    });
    return cloudClient;
  }
  async function activateCloudSession(session) {
    if (!session?.user) { showLogin('Please sign in.'); return; }
    cloudSession = session;
    try {
      await loadCloudLibrary();
      showApp(); renderAll();
    } catch (error) {
      console.error('Could not load cloud data:', error);
      showLogin('Signed in, but the database is not ready. Run supabase-schema.sql in your Supabase SQL Editor.');
    }
  }
  async function loadCloudLibrary() {
    if (!cloudClient || !cloudSession?.user) throw new Error('No active session.');
    const userId = cloudSession.user.id;
    const [{ data:anime, error:animeError }, { data:profile, error:profileError }] = await Promise.all([
      cloudClient.from('anime').select('id,user_id,title,cover_url,category,rating,created_at').order('created_at', { ascending:false }),
      cloudClient.from('profiles').select('id,username').eq('id', userId).maybeSingle()
    ]);
    if (animeError) throw animeError;
    if (profileError) throw profileError;
    state.anime = (anime || []).map(mapRemoteAnime);
    const fallbackName = cloudSession.user.user_metadata?.username || cloudSession.user.email?.split('@')[0] || 'Sakura';
    state.profile = { username: profile?.username || fallbackName };
    if (!profile) {
      const { error } = await cloudClient.from('profiles').upsert({ id:userId, username:state.profile.username }, { onConflict:'id' });
      if (error) throw error;
    }
  }
  async function signOutCloud() {
    if (!cloudClient) return;
    const { error } = await cloudClient.auth.signOut();
    if (error) { toast('Could not sign out.'); return; }
    cloudSession = null; state = { anime:[], profile:{ username:'Sakura' } }; showLogin('You have signed out.');
  }
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close]'); if (close) { closeModal(close.dataset.close); return; }
    if (event.target.classList.contains('modal-backdrop')) { closeModal(event.target.id); return; }
    const nav = event.target.closest('[data-view]'); if (nav) { event.preventDefault(); navigate(nav.dataset.view); return; }
    const open = event.target.closest('[data-open-anime]'); if (open) { renderDetail(open.dataset.openAnime); return; }
    const edit = event.target.closest('[data-edit-anime]'); if (edit) { editId = edit.dataset.editAnime; closeModal('detail-modal'); showView('add'); return; }
    const del = event.target.closest('[data-delete-anime]'); if (del) { deleteAnime(del.dataset.deleteAnime); return; }
  });
  document.addEventListener('keydown', event => {
    const card = event.target.closest('[data-open-anime]');
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); renderDetail(card.dataset.openAnime); }
    if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(el => closeModal(el.id));
  });

  async function start() {
    makePetals(); showLogin(); updateAuthLabels();
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      showLogin('Add the project URL and publishable key to config.js to enable login.');
      return;
    }
    try {
      await initSupabase();
      const { data, error } = await cloudClient.auth.getSession(); if (error) throw error;
      if (data.session) await activateCloudSession(data.session);
      else showLogin();
    } catch (error) {
      console.error(error);
      showLogin('Could not connect to Supabase. Check config.js and your internet connection.');
    }
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('resize', () => { clearTimeout(window.__sakuraResize); window.__sakuraResize = setTimeout(makePetals, 240); });
  start();
})();
