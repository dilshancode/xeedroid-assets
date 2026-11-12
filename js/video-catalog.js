/**
 * XEEDROID Video Catalog Manager
 * Features:
 * 1. Contains entire video catalog (27+ long videos, strictly no shorts).
 * 2. 15 videos per page with interactive Pagination (< Previous, 1, 2, Next Page >).
 * 3. YouTube-style Date Sorting (Latest / Newest first vs Oldest first).
 * 4. Auto-update: fetches YouTube RSS / API for any new uploads and prepends them live.
 * 5. Minimal 3-field cards: Thumbnail + Title + Date only.
 */

(function (window) {
  'use strict';

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(dateString) {
    if (!dateString) return 'Recent';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (isNaN(seconds) || seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  // List of older excluded video IDs
  const EXCLUDED_IDS = new Set([
    '4bCcjkuntmg',
    'JfFTUDUVm2w',
    'Sa76BVuOohs',
    'ZpLXeMLnqJ4',
    'wSDVO9ipOIw',
    'jlQpjwRHh-o',
    'VUmYmnhf_YI',
    '3iagYYCM5RE',
    'LM1RXNEG_To',
    'JY2u8zCEvSE'
  ]);

  function isExcluded(item) {
    if (EXCLUDED_IDS.has(item.id)) return true;
    const title = (item.title || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const link = (item.link || item.url || '').toLowerCase();
    const isShort = link.includes('/shorts/') || title.includes('#shorts') || desc.includes('#shorts') || title.includes('#youtubeshorts');
    if (isShort) return true;
    return false;
  }

  class VideoCatalog {
    constructor() {
      this.videos = Array.isArray(window.XEEDROID_ARCHIVE_VIDEOS)
        ? [...window.XEEDROID_ARCHIVE_VIDEOS]
        : [];
      const urlParams = new URLSearchParams(window.location.search);
      const pageFromUrl = parseInt(urlParams.get('page'), 10);
      this.currentPage = (!isNaN(pageFromUrl) && pageFromUrl > 0) ? pageFromUrl : 1;
      this.pageSize = 12;
      const sortFromUrl = urlParams.get('sort');
      this.sortOrder = (sortFromUrl === 'oldest' || sortFromUrl === 'latest') ? sortFromUrl : 'latest'; // 'latest' | 'oldest'
      this.channelId = 'UC2zxf0Xk-8KT7r4DE5E3hdg';
    }

    async init() {
      // 1. Initial render with full 27 long videos archive
      this.render();

      // 2. Setup sorting and pagination listeners
      this.setupControls();

      // 3. Auto-fetch in background to check if any new video was uploaded
      await this.checkForNewUploads();
    }

    // Sort videos by timestamp/date
    getSortedVideos() {
      const list = [...this.videos];
      if (this.sortOrder === 'oldest') {
        list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      } else {
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
      return list;
    }

    // Check YouTube live feed for newly published videos
    async checkForNewUploads() {
      try {
        // Fast Cache Guard: If checked within last 15 minutes, skip external network call
        const lastSync = localStorage.getItem('xeedroid_last_feed_sync');
        if (lastSync && Date.now() - parseInt(lastSync, 10) < 15 * 60 * 1000) {
          return;
        }

        const rawFeedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${this.channelId}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s maximum timeout

        let xmlText = '';
        try {
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawFeedUrl)}`;
          const res = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) xmlText = await res.text();
        } catch (e) {
          clearTimeout(timeoutId);
        }

        if (!xmlText) {
          const altController = new AbortController();
          const altTimeoutId = setTimeout(() => altController.abort(), 2000);
          try {
            const altUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rawFeedUrl)}`;
            const r = await fetch(altUrl, { signal: altController.signal });
            clearTimeout(altTimeoutId);
            const d = await r.json();
            if (d.status === 'ok' && d.items) {
              localStorage.setItem('xeedroid_last_feed_sync', Date.now().toString());
              this.mergeLiveVideos(d.items.map(it => ({
                id: it.guid.replace('yt:video:', ''),
                title: it.title,
                publishedAt: it.pubDate,
                link: it.link,
              })));
              return;
            }
          } catch (e) {
            clearTimeout(altTimeoutId);
          }
        }

        if (xmlText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
          const entries = Array.from(xmlDoc.querySelectorAll('entry'));
          const liveList = entries.map(entry => {
            const idEl = entry.querySelector('videoId') || entry.querySelector('id');
            const rawId = idEl ? idEl.textContent.trim() : '';
            const vidId = rawId.replace(/^yt:video:/, '').replace(/.*v=/, '');
            const titleEl = entry.querySelector('title');
            const title = titleEl ? titleEl.textContent.trim() : '';
            const pubEl = entry.querySelector('published');
            const publishedAt = pubEl ? pubEl.textContent.trim() : '';
            return { id: vidId, title: title, publishedAt: publishedAt };
          });
          this.mergeLiveVideos(liveList);
        }
      } catch (err) {
        console.warn('[XEEDROID] Live sync note:', err);
      }
    }

    mergeLiveVideos(liveList) {
      if (!liveList || !liveList.length) return;
      let hasNew = false;
      const existingIds = new Set(this.videos.map(v => v.id));

      liveList.forEach(item => {
        if (!existingIds.has(item.id) && !isExcluded(item)) {
          const t = item.publishedAt ? new Date(item.publishedAt).getTime() : Date.now();
          const d = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
          this.videos.unshift({
            id: item.id,
            title: item.title,
            date: d,
            relativeDate: timeAgo(item.publishedAt),
            timestamp: t,
            thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
          });
          existingIds.add(item.id);
          hasNew = true;
        }
      });

      if (hasNew) {
        this.render();
      }
    }

    setupControls() {
      // Custom curved dropdown menu controller
      const dropdown = document.getElementById('custom-sort-wrapper');
      const trigger = document.getElementById('custom-sort-btn');
      const label = document.getElementById('custom-sort-label');

      // Sync active UI state with initial sortOrder
      if (this.sortOrder === 'oldest') {
        if (label) label.textContent = 'Date added (oldest)';
        dropdown?.querySelectorAll('.custom-sort-item').forEach(btn => {
          const isOldest = btn.getAttribute('data-sort-val') === 'oldest';
          btn.classList.toggle('active', isOldest);
          btn.setAttribute('aria-selected', isOldest ? 'true' : 'false');
        });
      }

      if (dropdown && trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = dropdown.classList.toggle('open');
          trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
          if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
          }
        });

        // Option click handlers
        dropdown.querySelectorAll('.custom-sort-item').forEach(item => {
          item.addEventListener('click', () => {
            const val = item.getAttribute('data-sort-val');
            if (val && val !== this.sortOrder) {
              this.sortOrder = val;

              // Update active states
              dropdown.querySelectorAll('.custom-sort-item').forEach(btn => {
                const isActive = btn === item;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
              });

              if (label) {
                label.textContent = item.querySelector('span')?.textContent || 'Date added';
              }

              this.goToPage(1, true);
            }

            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
          });
        });
      }

      // Legacy fallback if select exists
      const sortSelect = document.getElementById('video-date-sort');
      if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
          this.sortOrder = e.target.value;
          this.goToPage(1, true);
        });
      }

      // Handle browser forward / back button navigation
      window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        const p = parseInt(params.get('page'), 10) || 1;
        const s = params.get('sort');
        let changed = false;

        if (this.currentPage !== p) {
          this.currentPage = p;
          changed = true;
        }

        if (s && (s === 'oldest' || s === 'latest') && this.sortOrder !== s) {
          this.sortOrder = s;
          if (label) {
            label.textContent = s === 'oldest' ? 'Date added (oldest)' : 'Date added (newest)';
          }
          dropdown?.querySelectorAll('.custom-sort-item').forEach(btn => {
            const isActive = btn.getAttribute('data-sort-val') === s;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
          });
          changed = true;
        }

        if (changed) {
          this.render();
        }
      });
    }

    goToPage(page, updateUrl = true, smoothScroll = true) {
      this.currentPage = page;
      if (updateUrl) {
        const url = new URL(window.location.href);
        if (this.currentPage > 1) {
          url.searchParams.set('page', this.currentPage);
        } else {
          url.searchParams.delete('page');
        }
        if (this.sortOrder && this.sortOrder !== 'latest') {
          url.searchParams.set('sort', this.sortOrder);
        } else {
          url.searchParams.delete('sort');
        }
        window.history.pushState({ page: this.currentPage, sort: this.sortOrder }, '', url.toString());
      }
      this.render();
      if (smoothScroll) {
        const target = document.querySelector('.videos-grid-section');
        if (target) {
          window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        }
      }
    }

    render() {
      const container = document.querySelector('[data-yt-videos-container]');
      if (!container) return;

      const limitAttr = container.getAttribute('data-limit');
      const limit = limitAttr ? parseInt(limitAttr, 10) : null;

      const sorted = this.getSortedVideos();
      const totalVideos = sorted.length;

      // When rendered inside a container with a limit (e.g. 4 on homepage)
      if (limit && !isNaN(limit)) {
        const limitedVideos = sorted.slice(0, limit);
        container.innerHTML = limitedVideos.map(video => `
        <article class="video-card" data-youtube-id="${escapeHTML(video.id)}">
          <a href="/video-watch?v=${escapeHTML(video.id)}" class="video-card-thumb" aria-label="${escapeHTML(video.title)}">
            <img src="${escapeHTML(video.thumbnail)}" alt="${escapeHTML(video.title)}" loading="lazy">
            <div class="video-card-overlay">
              <div class="video-card-play-icon" aria-hidden="true">
  <svg viewBox="0 0 48 48" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer Crimson Glowing Badge Circle -->
    <circle cx="24" cy="24" r="23" fill="url(#playBadgeGrad)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
    <!-- Angular Chevron Layer 1 (White sharp border) -->
    <path d="M19 14.5L34 24L19 33.5V14.5Z" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round" />
    <!-- Angular Chevron Layer 2 (Inner glowing core) -->
    <path d="M20.5 17L31.5 24L20.5 31V17Z" fill="#ffffff" />
    <defs>
      <linearGradient id="playBadgeGrad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF2A3B" />
        <stop offset="1" stop-color="#B80E1C" />
      </linearGradient>
    </defs>
  </svg>
</div>
            </div>
          </a>
          <div class="video-card-body">
            <h3 class="video-card-title line-clamp-2">
              <a href="/video-watch?v=${escapeHTML(video.id)}" data-youtube-id="${escapeHTML(video.id)}">${escapeHTML(video.title)}</a>
            </h3>
            <div class="video-card-meta">
              <span>${escapeHTML(video.date || video.relativeDate || 'Recent')}</span>
            </div>
          </div>
        </article>
      `).join('');

        if (typeof window.initVideoModal === 'function') {
          window.initVideoModal();
        }
        return;
      }

      const totalPages = Math.ceil(totalVideos / this.pageSize) || 1;

      if (this.currentPage > totalPages) this.currentPage = totalPages;
      if (this.currentPage < 1) this.currentPage = 1;

      const startIndex = (this.currentPage - 1) * this.pageSize;
      const pageVideos = sorted.slice(startIndex, startIndex + this.pageSize);

      // Render cards: ONLY Thumbnail, Title, and Date
      container.innerHTML = pageVideos.map(video => `
        <article class="video-card" data-youtube-id="${escapeHTML(video.id)}">
          <a href="/video-watch?v=${escapeHTML(video.id)}" class="video-card-thumb" aria-label="${escapeHTML(video.title)}">
            <img src="${escapeHTML(video.thumbnail)}" alt="${escapeHTML(video.title)}" loading="lazy">
            <div class="video-card-overlay">
              <div class="video-card-play-icon" aria-hidden="true">
  <svg viewBox="0 0 48 48" width="48" height="48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer Crimson Glowing Badge Circle -->
    <circle cx="24" cy="24" r="23" fill="url(#playBadgeGrad)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
    <!-- Angular Chevron Layer 1 (White sharp border) -->
    <path d="M19 14.5L34 24L19 33.5V14.5Z" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round" />
    <!-- Angular Chevron Layer 2 (Inner glowing core) -->
    <path d="M20.5 17L31.5 24L20.5 31V17Z" fill="#ffffff" />
    <defs>
      <linearGradient id="playBadgeGrad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF2A3B" />
        <stop offset="1" stop-color="#B80E1C" />
      </linearGradient>
    </defs>
  </svg>
</div>
            </div>
          </a>
          <div class="video-card-body">
            <h3 class="video-card-title line-clamp-2">
              <a href="/video-watch?v=${escapeHTML(video.id)}" data-youtube-id="${escapeHTML(video.id)}">${escapeHTML(video.title)}</a>
            </h3>
            <div class="video-card-meta">
              <span>${escapeHTML(video.date || video.relativeDate || 'Recent')}</span>
            </div>
          </div>
        </article>
      `).join('');

      // Re-bind modal clicks
      if (typeof window.initVideoModal === 'function') {
        window.initVideoModal();
      }

      // Render Pagination
      this.renderPagination(totalPages, totalVideos);
    }

    renderPagination(totalPages, totalVideos) {
      const paginationContainer = document.getElementById('video-pagination');
      if (!paginationContainer) return;

      if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
      }

      let pagesHtml = '';
      for (let i = 1; i <= totalPages; i++) {
        if (i === this.currentPage) {
          pagesHtml += `<span class="pagination-page-btn active" aria-current="page">${i}</span>`;
        } else {
          pagesHtml += `<button type="button" class="pagination-page-btn" data-page="${i}" aria-label="Page ${i}">${i}</button>`;
        }
      }

      paginationContainer.innerHTML = `
        <nav class="video-pagination-nav" aria-label="Video Catalog Pagination">
          <div class="video-pagination-controls">
            <button type="button" class="pagination-nav-btn" id="page-prev-btn" ${this.currentPage === 1 ? 'disabled' : ''} aria-label="Previous Page">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
              <span>Previous</span>
            </button>
            <div class="pagination-pages-group">
              ${pagesHtml}
            </div>
            <button type="button" class="pagination-nav-btn" id="page-next-btn" ${this.currentPage === totalPages ? 'disabled' : ''} aria-label="Next Page">
              <span>Next</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </div>
          <span class="pagination-status-label">
            Showing <strong style="color: var(--text-primary); font-weight: 600;">${(this.currentPage - 1) * this.pageSize + 1}–${Math.min(this.currentPage * this.pageSize, totalVideos)}</strong> of <strong style="color: var(--text-primary); font-weight: 600;">${totalVideos}</strong> tutorials
          </span>
        </nav>
      `;

      // Pagination click listeners
      const prevBtn = paginationContainer.querySelector('#page-prev-btn');
      const nextBtn = paginationContainer.querySelector('#page-next-btn');

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1, true);
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (this.currentPage < totalPages) {
            this.goToPage(this.currentPage + 1, true);
          }
        });
      }

      paginationContainer.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = parseInt(btn.getAttribute('data-page'), 10);
          if (p && p !== this.currentPage) {
            this.goToPage(p, true);
          }
        });
      });
    }
  }

  // Instantiate and run on DOM load
  window.XEEDROID_Catalog = new VideoCatalog();

  function initCatalog() {
    window.XEEDROID_Catalog.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalog);
  } else {
    initCatalog();
  }

})(window);
