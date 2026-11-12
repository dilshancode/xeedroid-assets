/**
 * XEEDROID YouTube Data API v3 & RSS Hybrid Client Module
 * Provides real-time channel statistics, live stream detection with viewer count,
 * and automated video grid fetching directly from YouTube in strict latest-upload-first order.
 * 
 * Includes client-side HTML escaping for 100% XSS security.
 */

(function (window) {
  'use strict';

  // --- Configuration ---
  const YT_CONFIG = {
    apiKey: window.YT_API_KEY || '',
    channelHandle: 'xeedroid',
    channelId: 'UC2zxf0Xk-8KT7r4DE5E3hdg', // XEEDROID official Channel ID
    uploadsPlaylistId: 'UU2zxf0Xk-8KT7r4DE5E3hdg', // Direct uploads playlist
    maxResults: 12,
    cacheTimeMs: 5 * 60 * 1000, // 5 minutes cache in localStorage
  };

  // Security: Escapes raw HTML strings to eliminate Cross-Site Scripting (XSS) risks
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Utility: Number formatting (e.g. 482400 -> 482.4K, 18400000 -> 18.4M)
  function formatNumber(num) {
    if (!num || isNaN(num)) return num || '0';
    const n = Number(num);
    if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  // Utility: Parse ISO 8601 Duration (PT14M18S -> 14:18)
  function parseDuration(durationStr) {
    if (!durationStr) return '';
    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '';
    const hours = parseInt(match[1] || 0, 10);
    const minutes = parseInt(match[2] || 0, 10);
    const seconds = parseInt(match[3] || 0, 10);

    const secFormatted = seconds < 10 ? `0${seconds}` : `${seconds}`;
    if (hours > 0) {
      const minFormatted = minutes < 10 ? `0${minutes}` : `${minutes}`;
      return `${hours}:${minFormatted}:${secFormatted}`;
    }
    return `${minutes}:${secFormatted}`;
  }

  // Utility: Relative time (e.g. "2 days ago")
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

  class YouTubeManager {
    constructor(config) {
      this.config = Object.assign({}, YT_CONFIG, config);
      this.channelData = null;
    }

    // Helper to determine video category from title/description
    categorizeVideo(title, description = '') {
      const text = `${title} ${description}`.toLowerCase();
      if (text.includes('iso') || text.includes('24h2') || text.includes('25h2') || text.includes('install windows')) return 'iso';
      if (text.includes('windows') || text.includes('undeletable') || text.includes('update') || text.includes('debloat') || text.includes('ai is bloat')) return 'windows';
      if (text.includes('chrome') || text.includes('edge') || text.includes('browser') || text.includes('adblock') || text.includes('download any video')) return 'browser';
      if (text.includes('vmware') || text.includes('virtual') || text.includes('convert') || text.includes('affinity') || text.includes('photoshop') || text.includes('seal') || text.includes('tool')) return 'tools';
      if (text.includes('youtube') || text.includes('creator') || text.includes('premiere')) return 'creator';
      return 'windows';
    }

    // Helper to get a human-readable badge for the card
    getCategoryBadge(category) {
      switch (category) {
        case 'iso': return 'Official ISO';
        case 'browser': return 'Browser Tips';
        case 'tools': return 'Software Utilities';
        case 'creator': return 'Creator Tips';
        default: return 'Windows 11';
      }
    }

    // Helper to detect if a video is a YouTube Short
    isShort(item) {
      const title = (item.title || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const link = (item.link || item.url || '').toLowerCase();
      return link.includes('/shorts/') || title.includes('#shorts') || desc.includes('#shorts');
    }

    get apiKey() {
      return window.YT_API_KEY || this.config.apiKey;
    }

    // 1. Resolve Channel Info via YouTube Data API
    async getChannelDetails() {
      if (!this.apiKey) return null;

      const cacheKey = `yt_channel_data_${this.config.channelHandle}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < this.config.cacheTimeMs) {
            this.channelData = parsed.data;
            return parsed.data;
          }
        } catch (e) {}
      }

      try {
        let url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&key=${encodeURIComponent(this.apiKey)}`;
        if (this.config.channelId) {
          url += `&id=${encodeURIComponent(this.config.channelId)}`;
        } else {
          url += `&forHandle=${encodeURIComponent(this.config.channelHandle.replace(/^@/, ''))}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        if (!data.items || !data.items.length) return null;

        const item = data.items[0];
        const result = {
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          customUrl: item.snippet.customUrl,
          thumbnails: item.snippet.thumbnails,
          subscribers: item.statistics.subscriberCount,
          videoCount: item.statistics.videoCount,
          viewCount: item.statistics.viewCount,
          uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
        };

        this.channelData = result;
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: result }));
        return result;
      } catch (err) {
        console.error('[XEEDROID YouTube API] Channel details fetch error:', err);
        return null;
      }
    }

    // 2. Check for Active Live Stream & Viewer Count
    async getLiveStream() {
      if (!this.apiKey) return null;
      const channel = this.channelData || await this.getChannelDetails();
      if (!channel) return null;

      try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channel.id)}&type=video&eventType=live&key=${encodeURIComponent(this.apiKey)}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.items || !searchData.items.length) return { isLive: false };

        const liveVideo = searchData.items[0];
        const videoId = liveVideo.id.videoId;

        const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(this.apiKey)}`;
        const videoRes = await fetch(videoUrl);
        const videoData = await videoRes.json();

        if (videoData.items && videoData.items.length) {
          const item = videoData.items[0];
          const liveDetails = item.liveStreamingDetails || {};
          return {
            isLive: true,
            videoId: videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
            concurrentViewers: liveDetails.concurrentViewers || 0,
          };
        }
        return { isLive: true, videoId: videoId, title: liveVideo.snippet.title };
      } catch (err) {
        console.error('[XEEDROID YouTube API] Live check error:', err);
        return null;
      }
    }

    // 3. Fetch Uploaded Videos (API first, fallback to RSS Feed)
    async getLatestVideos(count = YT_CONFIG.maxResults) {
      if (this.apiKey) {
        const apiVideos = await this.getVideosFromAPI(count);
        if (apiVideos && apiVideos.length) return apiVideos;
      }

      // Fallback: Fetch directly from YouTube RSS Feed (No API Key Required!)
      return await this.getVideosFromRSS(count);
    }

    // API Uploads Fetcher (Guaranteed strict latest-first order by YouTube)
    async getVideosFromAPI(count) {
      const channel = this.channelData || await this.getChannelDetails();
      if (!channel) return null;

      const cacheKey = `yt_latest_videos_api_${channel.id}_${count}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < this.config.cacheTimeMs) return parsed.data;
        } catch (e) {}
      }

      try {
        const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(channel.uploadsPlaylistId)}&maxResults=${count}&key=${encodeURIComponent(this.apiKey)}`;
        const res = await fetch(playlistUrl);
        const data = await res.json();
        if (!data.items || !data.items.length) return null;

        const videoIds = data.items.map(item => item.contentDetails.videoId).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${encodeURIComponent(videoIds)}&key=${encodeURIComponent(this.apiKey)}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        const videoMap = {};
        if (detailsData.items) {
          detailsData.items.forEach(v => {
            videoMap[v.id] = {
              duration: parseDuration(v.contentDetails?.duration),
              viewCount: v.statistics?.viewCount || 0,
            };
          });
        }

        const videos = data.items
          .filter(item => !this.isShort({
            title: item.snippet.title,
            description: item.snippet.description,
          }))
          .map(item => {
            const vidId = item.contentDetails.videoId;
            const meta = videoMap[vidId] || {};
            const category = this.categorizeVideo(item.snippet.title, item.snippet.description);
            return {
              id: vidId,
              title: item.snippet.title,
              description: item.snippet.description,
              publishedAt: item.snippet.publishedAt,
              thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
              duration: meta.duration || '08:00',
              viewsFormatted: 'XEEDROID',
              timeAgo: timeAgo(item.snippet.publishedAt),
              url: `/video-watch?v=${vidId}`,
              category: category,
              badgeText: this.getCategoryBadge(category)
            };
          });

        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: videos }));
        return videos;
      } catch (err) {
        console.error('[XEEDROID YouTube API] API fetch failed, falling back to RSS:', err);
        return null;
      }
    }

    // Native XML Atom parser (No third-party limit, fetches all 15 entries)
    parseAtomXml(xmlText) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const entries = Array.from(xmlDoc.querySelectorAll('entry'));
        return entries.map(entry => {
          const idEl = entry.querySelector('videoId') || entry.querySelector('id');
          const rawId = idEl ? idEl.textContent.trim() : '';
          const vidId = rawId.replace(/^yt:video:/, '').replace(/.*v=/, '');
          const titleEl = entry.querySelector('title');
          const title = titleEl ? titleEl.textContent.trim() : '';
          const pubEl = entry.querySelector('published') || entry.querySelector('updated');
          const publishedAt = pubEl ? pubEl.textContent.trim() : '';
          const descEl = entry.querySelector('description');
          const description = descEl ? descEl.textContent.trim() : '';

          return {
            id: vidId,
            title: title,
            description: description,
            publishedAt: publishedAt,
          };
        });
      } catch (e) {
        return [];
      }
    }

    // Zero API Key RSS Feed Fetcher (Multi-endpoint fallback)
    async getVideosFromRSS(count) {
      const cacheKey = `yt_latest_videos_rss_${this.config.channelId || this.config.channelHandle}_${count}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < this.config.cacheTimeMs) return parsed.data;
        } catch (e) {}
      }

      const channelId = this.config.channelId || 'UC2zxf0Xk-8KT7r4DE5E3hdg';
      const rawFeedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

      // Strategy 1: Fetch raw XML via allorigins CORS proxy (retrieves all 15 YouTube entries)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawFeedUrl)}`;
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const xmlText = await res.text();
          const rawVideos = this.parseAtomXml(xmlText);
          if (rawVideos && rawVideos.length) {
            const longVideos = rawVideos
              .filter(item => !this.isShort(item))
              .slice(0, count)
              .map(item => ({
                id: item.id,
                title: item.title,
                thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
                publishedAt: item.publishedAt,
                timeAgo: timeAgo(item.publishedAt),
                url: `/video-watch?v=${item.id}`,
              }));

            if (longVideos.length) {
              localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: longVideos }));
              return longVideos;
            }
          }
        }
      } catch (e) {
        console.warn('[XEEDROID YouTube] AllOrigins proxy fallback:', e);
      }

      // Strategy 2: rss2json.com fallback
      try {
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rawFeedUrl)}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data.status === 'ok' && data.items && data.items.length) {
          const longVideos = data.items
            .filter(item => !this.isShort(item))
            .slice(0, count)
            .map(item => {
              const vidId = item.guid.replace('yt:video:', '');
              return {
                id: vidId,
                title: item.title,
                thumbnail: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
                publishedAt: item.pubDate,
                timeAgo: timeAgo(item.pubDate),
                url: `/video-watch?v=${vidId}`,
              };
            });

          if (longVideos.length) {
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: longVideos }));
            return longVideos;
          }
        }
      } catch (err) {
        console.warn('[XEEDROID YouTube RSS] RSS fetch info:', err);
      }

      return [];
    }

    // 4. DOM UI Renderer
    async updateUI() {
      // A. Update Channel Stats if API Key is available
      if (this.apiKey) {
        const channel = await this.getChannelDetails();
        if (channel) {
          document.querySelectorAll('[data-yt-subscribers]').forEach(el => {
            el.textContent = formatNumber(channel.subscribers);
          });
          document.querySelectorAll('[data-yt-videos]').forEach(el => {
            el.textContent = formatNumber(channel.videoCount);
          });
          document.querySelectorAll('[data-yt-views]').forEach(el => {
            el.textContent = `${formatNumber(channel.viewCount)} views`;
          });
        }

        // B. Update Live Banner if streaming
        const live = await this.getLiveStream();
        if (live && live.isLive) {
          this.renderLiveBanner(live);
        }
      }

      // C. Render Latest Uploads Grid (only if not handled by video-catalog.js)
      if (!window.XEEDROID_Catalog) {
        const videoContainers = document.querySelectorAll('[data-yt-videos-container]');
        if (videoContainers.length) {
          const videos = await this.getLatestVideos(YT_CONFIG.maxResults);
          if (videos && videos.length) {
            videoContainers.forEach(container => {
              const limit = parseInt(container.getAttribute('data-limit') || YT_CONFIG.maxResults, 10);
              this.renderVideoGrid(container, videos.slice(0, limit));
            });
          }
        }
      }
    }

    renderLiveBanner(liveData) {
      const bannerTargets = document.querySelectorAll('[data-yt-live-banner]');
      bannerTargets.forEach(banner => {
        banner.style.display = 'flex';
        banner.innerHTML = `
          <div class="ticker-left">
            <span class="badge badge-live">
              <span class="badge-dot-pulse"></span>
              LIVE NOW — ${formatNumber(liveData.concurrentViewers)} Watching
            </span>
            <p class="ticker-text">
              <strong>${escapeHTML(liveData.title)}</strong>
            </p>
          </div>
          <div class="ticker-right">
            <button type="button" class="btn btn-sm btn-primary" data-youtube-id="${escapeHTML(liveData.videoId)}">
              <span class="icon icon-filled">play_arrow</span>
              <span>Watch Live</span>
            </button>
          </div>
        `;
      });
    }

    renderVideoGrid(container, videos) {
      container.innerHTML = videos.map(video => `
        <article class="video-card" data-youtube-id="${escapeHTML(video.id)}">
          <a href="${escapeHTML(video.url)}" class="video-card-thumb" aria-label="${escapeHTML(video.title)}">
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
              <a href="${escapeHTML(video.url)}" data-youtube-id="${escapeHTML(video.id)}">${escapeHTML(video.title)}</a>
            </h3>
            <div class="video-card-meta">
              <span>${escapeHTML(video.timeAgo || 'Recent')}</span>
            </div>
          </div>
        </article>
      `).join('');

      if (typeof window.initVideoModal === 'function') {
        window.initVideoModal();
      }
    }
  }

  // Instantiate and export globally
  window.XEEDROID_YouTube = new YouTubeManager();

  document.addEventListener('DOMContentLoaded', () => {
    window.XEEDROID_YouTube.updateUI();
  });

})(window);
