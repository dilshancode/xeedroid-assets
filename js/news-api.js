/**
 * XEEDROID — Live Tech & Windows News Client with Inline Page Container Reader View
 * Clean, compact editorial layout matching top tech publications (Medium, The Verge, Windows Central).
 */

(function(window) {
  'use strict';

  const CACHE_KEY = 'xeedroid_live_news_v10';
  const CACHE_TTL_MS = 15 * 60 * 1000;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('xeedroid_live_news_') && k !== CACHE_KEY) {
        localStorage.removeItem(k);
      }
    }
  } catch(e) {}
 // 15 minutes cache
  const MAX_EXTERNAL_AGE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days (48 hours)

  const FEEDS = [
    { name: 'Pureinfotech', url: 'https://pureinfotech.com/feed/', defaultCategory: 'windows', categoryLabel: 'Windows & PC' },
    { name: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all', defaultCategory: 'hardware', categoryLabel: 'Hardware & Chips' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', defaultCategory: 'gadgets', categoryLabel: 'Gadgets' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', defaultCategory: 'ai', categoryLabel: 'AI & Software' },
    { name: 'Android Central', url: 'https://www.androidcentral.com/feed', defaultCategory: 'mobile', categoryLabel: 'Mobile & Android' },
    { name: 'IGN', url: 'https://feeds.feedburner.com/ign/news', defaultCategory: 'gaming', categoryLabel: 'Gaming' },
    { name: '9to5Mac', url: 'https://9to5mac.com/feed/', defaultCategory: 'mobile', categoryLabel: 'Mobile' }
  ];

  const SOURCE_FALLBACKS = {
    'techcrunch': 'assets/images/source-techcrunch.svg',
    'the verge': 'assets/images/source-verge.svg',
    "tom's hardware": 'assets/images/source-tomshardware.svg',
    'pureinfotech': 'assets/images/source-pureinfotech.svg',
    'android central': 'assets/images/source-androidcentral.svg',
    'ign': 'assets/images/source-ign.svg',
    '9to5mac': 'assets/images/source-9to5mac.svg'
  };

  const CATEGORY_FALLBACKS = {
    ai: 'assets/images/source-techcrunch.svg',
    mobile: 'assets/images/source-androidcentral.svg',
    hardware: 'assets/images/source-tomshardware.svg',
    gaming: 'assets/images/source-ign.svg',
    gadgets: 'assets/images/source-verge.svg',
    windows: 'assets/images/source-pureinfotech.svg',
    iphone: 'assets/images/source-9to5mac.svg'
  };

  function getCategoryFallback(cat, titleStr = '', sourceName = '') {
    const sLower = (sourceName || '').toLowerCase().trim();
    if (SOURCE_FALLBACKS[sLower]) {
      return SOURCE_FALLBACKS[sLower];
    }
    const cLower = (cat || '').toLowerCase().trim();
    return CATEGORY_FALLBACKS[cLower] || 'assets/images/source-techcrunch.svg';
  }

  let loadedArticlesMap = {};
  let pollIntervalId = null;

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function unescapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/gi, '&');
  }

  function cleanDescription(desc) {
    if (!desc) return '';
    const unescaped = unescapeHTML(desc);
    const plainText = unescaped.replace(/<[^>]+>/g, '').trim();
    return plainText.length > 180 ? plainText.substring(0, 180) + '...' : plainText;
  }

  function extractImage(item) {
    // 1. Direct thumbnail string or object
    if (typeof item.thumbnail === 'string' && item.thumbnail.startsWith('http') && !item.thumbnail.includes('gravatar') && !item.thumbnail.includes('pixel')) {
      return item.thumbnail;
    }
    if (item.thumbnail && typeof item.thumbnail === 'object') {
      const u = item.thumbnail.url || item.thumbnail.link || item.thumbnail.href;
      if (typeof u === 'string' && u.startsWith('http') && !u.includes('gravatar') && !u.includes('pixel')) return u;
    }

    // 2. Enclosure object or string
    if (item.enclosure && typeof item.enclosure === 'object') {
      const u = item.enclosure.link || item.enclosure.url || item.enclosure.href || item.enclosure.thumbnail;
      if (typeof u === 'string' && u.startsWith('http') && !u.includes('gravatar') && !u.includes('pixel')) return u;
    }

    // 3. HTML parsing with entity decoding for WordPress / TechCrunch / Atom feeds
    const rawBody = (item.content || '') + ' ' + (item.description || '') + ' ' + (item['content:encoded'] || '');
    const htmlBody = unescapeHTML(rawBody);

    // 3a. Standard <img ... src="..."> or data-src / data-lazy-src
    const imgMatch = htmlBody.match(/<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1] && imgMatch[1].startsWith('http') && !imgMatch[1].includes('gravatar') && !imgMatch[1].includes('pixel') && !imgMatch[1].includes('favicon')) {
      return imgMatch[1];
    }

    // 3b. Srcset attribute
    const srcsetMatch = htmlBody.match(/srcset=["']([^"']+)["']/i);
    if (srcsetMatch && srcsetMatch[1]) {
      const firstUrl = srcsetMatch[1].split(',')[0].trim().split(' ')[0];
      if (firstUrl && firstUrl.startsWith('http') && !firstUrl.includes('gravatar')) return firstUrl;
    }

    // 3c. Direct media URL inside HTML tags (supports TechCrunch / WordPress / CDN uploads)
    const mediaMatch = htmlBody.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s"'<>]*)?/i);
    if (mediaMatch && mediaMatch[0] && !mediaMatch[0].includes('gravatar') && !mediaMatch[0].includes('favicon') && !mediaMatch[0].includes('pixel')) {
      return mediaMatch[0];
    }

    return null;
  }

  async function fetchOpenGraphImage(link) {
    if (!link || !link.startsWith('http')) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(link)}`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 'success' && data.data && data.data.image && data.data.image.url) {
        return data.data.image.url;
      }
    } catch (e) {}
    return null;
  }

  function timeAgo(dateString) {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return 'Just now';
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;
      const diffDays = Math.floor(diffHours / 24);
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } catch (e) {
      return 'Recently';
    }
  }

  
  const ENTERTAINMENT_REGEX = /\b(movie|movies|film|films|cinema|cinematic|trailer|trailers|tv series|tv show|tv shows|television|tv|season|season \d+|episode|episodes|showrunner|hbo|netflix|disney\+|dc studios|marvel studios|batman|wonder woman|superman|lanterns|lantern|green lantern|james gunn|peter safran|hollywood|actor|actress|director|cast|box office|spoilers|reboot|prequel|sequel|comic book|comic books|adaptation|screenplay|variety|hollywood reporter)\b/i;

  function refineCategory(feedConfig, item) {
    const combinedText = `${item.title || ''} ${item.description || ''} ${(item.categories || []).join(' ')}`;
    if (feedConfig.name === 'IGN' || feedConfig.defaultCategory === 'gaming' || (item.category && item.category.toLowerCase() === 'gaming')) {
      if (ENTERTAINMENT_REGEX.test(combinedText)) {
        return {
          category: 'entertainment',
          categoryLabel: 'Movies & TV'
        };
      }
    }
    return {
      category: feedConfig.defaultCategory || 'news',
      categoryLabel: feedConfig.categoryLabel || (feedConfig.defaultCategory ? feedConfig.defaultCategory.toUpperCase() : 'TECH')
    };
  }

  async function fetchFeed(feedConfig) {
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedConfig.url)}`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 'ok' || !data.items) throw new Error('Invalid feed payload');

    const now = Date.now();
    // Filter out posts older than 2 days (48 hours)
    const freshItems = data.items.filter(item => {
      if (!item.pubDate) return false;
      const pubTime = new Date(item.pubDate).getTime();
      if (isNaN(pubTime)) return false;
      const ageMs = now - pubTime;
      return ageMs >= 0 && ageMs <= MAX_EXTERNAL_AGE_MS;
    });

    const parsedArticles = await Promise.all(freshItems.map(async (item, idx) => {
      let img = extractImage(item);
      if (!img && item.link) {
        img = await fetchOpenGraphImage(item.link);
      }
      if (!img) {
        img = getCategoryFallback(feedConfig.defaultCategory, item.title, feedConfig.name);
      }

      return {
        id: `rss-${feedConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${idx}`,
        title: item.title,
        link: item.link,
        content: item.content || item.description || '',
        description: cleanDescription(item.description),
        pubDate: item.pubDate,
        timeLabel: timeAgo(item.pubDate),
        image: img,
        source: feedConfig.name,
        category: feedConfig.defaultCategory,
        categoryLabel: feedConfig.categoryLabel || feedConfig.defaultCategory.toUpperCase(),
        author: item.author || feedConfig.name
      };
    }));

    return parsedArticles;
  }

  async function getLiveNews(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (now - parsed.timestamp < CACHE_TTL_MS && parsed.articles && parsed.articles.length > 0) {
            // Re-verify cached articles are still within the 2-day limit
            const freshCached = parsed.articles.filter(a => {
              if (!a.pubDate) return false;
              const t = new Date(a.pubDate).getTime();
              return !isNaN(t) && (now - t) <= MAX_EXTERNAL_AGE_MS;
            });
            if (freshCached.length > 0) {
              return freshCached;
            }
          }
        }
      } catch (e) {}
    }

    const feedPromises = FEEDS.map(f => fetchFeed(f).catch(err => {
      console.warn(`Failed to fetch RSS for ${f.name}:`, err);
      return [];
    }));

    const results = await Promise.all(feedPromises);
    const combined = results.flat();

    // Secondary safety check: ensure all combined posts are within 2 days
    const recentArticles = combined.filter(a => {
      if (!a.pubDate) return false;
      const t = new Date(a.pubDate).getTime();
      return !isNaN(t) && (now - t) <= MAX_EXTERNAL_AGE_MS;
    });

    recentArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    if (recentArticles.length > 0) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: now,
          articles: recentArticles.slice(0, 45)
        }));
      } catch (e) {}
    }

    return recentArticles.slice(0, 45);
  }

  /**
   * Inline Article Expansion — Industry Standard Sizing (Medium / The Verge style)
   */
  function openInlineArticle(article) {
    const mainGridSection = document.getElementById('main-posts-grid-section');
    const headerBannerSection = document.getElementById('posts-header-banner-section');
    const leadArticleSection = document.getElementById('posts-lead-article-section');
    const filterPillsSection = document.getElementById('posts-filter-pills-section');
    const inlineContainer = document.getElementById('inline-article-reader-container');

    if (!inlineContainer) return;

    const titleEsc = escapeHTML(article.title);
    const descEsc = escapeHTML(article.description);
    const sourceEsc = escapeHTML(article.source || 'XEEDROID');
    const authorEsc = escapeHTML(article.author || sourceEsc);
    const timeEsc = escapeHTML(article.timeLabel || 'Recently');
    const linkEsc = article.link || '#';
    const imgEsc = article.image;

    let rawContent = article.content || article.description || '';
    rawContent = rawContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    inlineContainer.innerHTML = `
      <div style="padding: var(--space-lg) 0 var(--space-4xl); max-width: 760px; margin: 0 auto;">
        
        <!-- Top Action Bar: Back Navigation & Webpage Link -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: var(--space-lg); padding-bottom: var(--space-sm); border-bottom: 1px solid var(--border-subtle);">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.XEEDROID_NEWS.closeInlineArticle()" style="gap: 6px;">
            <span class="icon" style="font-size: 16px;">arrow_back</span>
            <span>Back to All Posts</span>
          </button>
          
          <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="gap: 6px;">
            <span>Visit Original Webpage</span>
            <span class="icon" style="font-size: 14px;">open_in_new</span>
          </a>
        </div>

        <!-- Source Badge & Date -->
        <div style="display: flex; align-items: center; gap: 8px; color: var(--accent); margin-bottom: 10px;" class="font-label-sm">
          <span class="badge badge-subtle" style="background: var(--accent-light); color: var(--accent); font-weight: 600;">${sourceEsc}</span>
          <span style="color: var(--text-secondary);">• ${timeEsc}</span>
        </div>

        <!-- Article Headline -->
        <h1 class="font-display" style="font-size: 2.125rem; line-height: 1.25; margin-bottom: var(--space-md); color: var(--text-primary);">
          ${titleEsc}
        </h1>

        <!-- Author / Source Byline Card -->
        <div style="background: var(--surface-lowest); border: 1px solid var(--border-subtle); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-default); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-md); margin-bottom: var(--space-xl); box-shadow: var(--shadow-sm);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--surface-low); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; color: var(--accent);">
              <span class="icon icon-filled" style="font-size: 20px;">newspaper</span>
            </div>
            <div>
              <strong class="font-label-md" style="display: block; color: var(--text-primary); font-size: 13px;">${sourceEsc}</strong>
              <span class="font-body-sm" style="color: var(--text-secondary); font-size: 12px;">Article by ${authorEsc}</span>
            </div>
          </div>

          <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="font-label-sm" style="color: var(--accent); display: flex; align-items: center; gap: 4px;">
            <span>Open Original Webpage</span>
            <span class="icon" style="font-size: 14px;">open_in_new</span>
          </a>
        </div>

        <!-- Tastefully Sized Cover Image (Max-Height 360px) -->
        <figure style="margin-bottom: var(--space-xl);">
          <div style="border-radius: var(--radius-default); overflow: hidden; border: 1px solid var(--border-subtle); background: var(--surface-mid); max-height: 360px;">
            <img src="${imgEsc}" alt="${titleEsc}" style="width: 100%; max-height: 360px; object-fit: cover; display: block;" onerror="this.parentElement.style.display='none'">
          </div>
        </figure>

        <!-- Article Body Content -->
        <div class="article-prose" style="font-size: 1.05rem; line-height: 1.8; color: var(--text-primary);">
          <div>
            ${(function() {
              if (!rawContent || rawContent.length < 50) {
                return `<p>${descEsc}</p>`;
              }
              // If rawContent starts with an img tag identical to hero img, clean it to avoid duplicate hero image
              let cleaned = rawContent;
              if (imgEsc) {
                cleaned = cleaned.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/i, function(match, p1) {
                  if (p1 === imgEsc || match.includes(imgEsc)) return '';
                  return match;
                });
              }
              return cleaned;
            })()}
          </div>
        </div>

        <!-- Bottom Action Footer -->
        <div style="margin-top: var(--space-3xl); border-top: 1px solid var(--border-subtle); padding-top: var(--space-lg); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-md);">
          <button type="button" class="btn btn-secondary" onclick="window.XEEDROID_NEWS.closeInlineArticle()" style="gap: 8px;">
            <span class="icon">arrow_back</span>
            <span>Back to All Posts</span>
          </button>
          
          <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="gap: 8px;">
            <span>Read Original Article on ${sourceEsc}</span>
            <span class="icon" style="font-size: 16px;">open_in_new</span>
          </a>
        </div>

      </div>
    `;

    if (headerBannerSection) headerBannerSection.style.display = 'none';
    if (leadArticleSection) leadArticleSection.style.display = 'none';
    if (filterPillsSection) filterPillsSection.style.display = 'none';
    if (mainGridSection) mainGridSection.style.display = 'none';

    inlineContainer.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeInlineArticle() {
    const mainGridSection = document.getElementById('main-posts-grid-section');
    const headerBannerSection = document.getElementById('posts-header-banner-section');
    const leadArticleSection = document.getElementById('posts-lead-article-section');
    const filterPillsSection = document.getElementById('posts-filter-pills-section');
    const inlineContainer = document.getElementById('inline-article-reader-container');

    if (inlineContainer) {
      inlineContainer.style.display = 'none';
      inlineContainer.innerHTML = '';
    }

    if (headerBannerSection) headerBannerSection.style.display = 'block';
    if (leadArticleSection) leadArticleSection.style.display = 'block';
    if (filterPillsSection) filterPillsSection.style.display = 'block';
    if (mainGridSection) mainGridSection.style.display = 'block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getCategoryLabel(cat) {
    switch ((cat || '').toLowerCase()) {
      case 'ai': return 'AI & SOFTWARE';
      case 'mobile': return 'MOBILE & ANDROID';
      case 'hardware': return 'HARDWARE & CHIPS';
      case 'gaming': return 'GAMING';
      case 'entertainment': return 'MOVIES & TV';
      case 'gadgets': return 'GADGETS';
      case 'windows': return 'WINDOWS & PC';
      case 'iphone': return 'MOBILE';
      default: return (cat || 'TECH').toUpperCase();
    }
  }

  function renderNewsCard(article, index) {
    const titleEsc = escapeHTML(article.title);
    const descEsc = escapeHTML(article.description);
    const sourceEsc = escapeHTML(article.source);
    const timeEsc = escapeHTML(article.timeLabel);
    const imgEsc = article.image;
    const linkEsc = article.link || '#';
    
    // Always detect Movies & TV dynamically at render time
    let cat = (article.category || 'news').toLowerCase();
    let catLabel = article.categoryLabel ? article.categoryLabel.toUpperCase() : getCategoryLabel(cat);

    const fullText = `${article.title || ''} ${article.description || ''} ${sourceEsc}`;
    if (sourceEsc === 'IGN' || cat === 'gaming' || ENTERTAINMENT_REGEX.test(fullText)) {
      if (ENTERTAINMENT_REGEX.test(fullText)) {
        cat = 'entertainment';
        catLabel = 'MOVIES & TV';
      }
    }

    const fallbackImg = getCategoryFallback(cat, article.title, article.source);

    return `
      <article class="lead-article-card post-item-card" data-category="${cat}" data-rss-card="true">
        <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="lead-article-image" style="aspect-ratio: 16/9; position: relative; display: block; overflow: hidden;">
          <img src="${imgEsc}" alt="${titleEsc}" loading="lazy" style="object-fit: cover; width: 100%; height: 100%;" onerror="this.onerror=null; this.src='${fallbackImg}';">
          <span class="badge badge-dark-glass" style="position: absolute; top: 12px; left: 12px; background: rgba(9, 9, 11, 0.85); color: #fff;">${sourceEsc}</span>
          <span class="video-duration-badge" style="bottom: 12px; right: 12px;">${timeEsc}</span>
        </a>
        <div style="padding: var(--space-md); flex: 1; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span class="badge badge-subtle" style="font-size: 10px; padding: 2px 6px; background: var(--accent-light); color: var(--accent);">${catLabel}</span>
            <span class="font-code" style="color: var(--text-secondary); font-size: 11px;">Via ${sourceEsc}</span>
          </div>
          <h3 class="font-headline-sm" style="margin-bottom: 8px; font-size: 1.15rem;">
            <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" style="color: var(--text-primary);">
              ${titleEsc}
            </a>
          </h3>
          <p class="font-body-sm line-clamp-3" style="color: var(--text-secondary); margin-bottom: var(--space-md); flex: 1;">
            ${descEsc}
          </p>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid var(--border-subtle); padding-top: 12px; margin-top: auto;">
            <span class="font-label-sm" style="color: var(--text-muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px;">${sourceEsc}</span>
            <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="padding: 0; color: var(--accent); font-weight: 700; white-space: nowrap; font-size: 13px;">Read Article →</a>
          </div>
        </div>
      </article>
    `;
  }

  function openArticleFromData(id) {
    if (loadedArticlesMap[id] && loadedArticlesMap[id].link) {
      window.open(loadedArticlesMap[id].link, '_blank', 'noopener,noreferrer');
    }
  }

  function selectBestFeaturedPost(articles) {
    if (!articles || articles.length === 0) return null;

    // 1. Look for explicit 'featured', 'top', or 'breaking' tag/label
    const explicitFeatured = articles.find(a => 
      (a.category && ['featured', 'top', 'breaking'].includes(a.category.toLowerCase())) ||
      (a.title && /featured|breaking|must read/i.test(a.title))
    );
    if (explicitFeatured) return explicitFeatured;

    // 2. Look for top quality article (has a valid image + good description)
    const qualityArticle = articles.find(a => 
      a.image && 
      a.description && a.description.length > 60
    );
    if (qualityArticle) return qualityArticle;

    // 3. Fallback to newest article
    return articles[0];
  }

  function updateFeaturedHeroCard(article) {
    const leadSection = document.getElementById('posts-lead-article-section');
    if (!leadSection || !article) return;

    const titleEsc = escapeHTML(article.title);
    const descEsc = escapeHTML(article.description);
    const sourceEsc = escapeHTML(article.source || 'TECH PUBLICATION');
    const timeEsc = escapeHTML(article.timeLabel || 'Recently');
    const imgEsc = article.image;
    const linkEsc = article.link || '#';
    const cat = article.category || 'windows';
    const catLabel = article.categoryLabel ? article.categoryLabel.toUpperCase() : getCategoryLabel(cat);
    const fallbackImg = getCategoryFallback(cat, article.title, article.source);

    leadSection.setAttribute('data-category', cat);
    leadSection.innerHTML = `
      <article class="lead-article-card" style="padding: var(--space-xl);">
        <div class="news-lead-grid">
          <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="lead-article-image" style="aspect-ratio: 16/9; margin-bottom: 0; position: relative; display: block; overflow: hidden; border-radius: var(--radius-sm);">
            <img src="${imgEsc}" alt="${titleEsc}" loading="lazy" style="object-fit: cover; width: 100%; height: 100%;" onerror="this.onerror=null; this.src='${fallbackImg}';">
            <span class="badge badge-live" style="position: absolute; top: 16px; left: 16px;">FEATURED TOP STORY</span>
            <span class="badge badge-dark-glass" style="position: absolute; top: 16px; right: 16px;">${sourceEsc}</span>
          </a>

          <div>
            <div style="display: flex; align-items: center; gap: 8px; color: var(--accent); margin-bottom: 8px;" class="font-label-sm">
              <span>${catLabel}</span>
              <span style="color: var(--text-secondary);">• ${timeEsc}</span>
              <span style="color: var(--text-secondary);">• VIA ${sourceEsc.toUpperCase()}</span>
            </div>
            <h2 class="font-headline-lg" style="margin-bottom: 12px;">
              <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" style="color: var(--text-primary);">
                ${titleEsc}
              </a>
            </h2>
            <p class="font-body-md" style="color: var(--text-secondary); line-height: 1.8; margin-bottom: var(--space-md);">
              ${descEsc}
            </p>
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-top: 1px solid var(--border-subtle); padding-top: var(--space-md);">
              <div class="author-profile">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--surface-low); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; color: var(--accent);">
                  <span class="icon icon-filled" style="font-size: 20px;">newspaper</span>
                </div>
                <div>
                  <span class="font-label-md" style="display: block; font-weight: 600;">${sourceEsc}</span>
                  <span class="font-body-sm" style="color: var(--text-secondary);">External Tech Publication</span>
                </div>
              </div>
              <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                <span>Read Full Story on ${sourceEsc}</span>
                <span class="icon" style="font-size: 16px;">open_in_new</span>
              </a>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function updateHomepageNewsSection(articles) {
    if (!articles || articles.length === 0) return;

    const homeLead = document.getElementById('home-lead-article');
    const homeStacked = document.getElementById('home-stacked-dispatches');

    if (!homeLead && !homeStacked) return;

    const topFeatured = selectBestFeaturedPost(articles) || articles[0];

    // 1. Render Featured Lead Article (1 card)
    if (homeLead && topFeatured) {
      const titleEsc = escapeHTML(topFeatured.title);
      const descEsc = escapeHTML(topFeatured.description);
      const sourceEsc = escapeHTML(topFeatured.source || 'TECH DISPATCH');
      const timeEsc = escapeHTML(topFeatured.timeLabel || 'Recent');
      const imgEsc = topFeatured.image;
      const linkEsc = topFeatured.link || 'posts.html';
      const catUpper = (topFeatured.categoryLabel || topFeatured.category || 'TECH GUIDE').toUpperCase();
      const fallbackImg = getCategoryFallback(topFeatured.category || 'ai', topFeatured.title);

      homeLead.setAttribute('data-category', topFeatured.category || 'all');
      homeLead.innerHTML = `
        <div>
          <div class="lead-article-image" style="aspect-ratio: 16/9; position: relative; overflow: hidden; border-radius: var(--radius-md); margin-bottom: var(--space-md);">
            <img src="${imgEsc}" alt="${titleEsc}" loading="lazy" style="object-fit: cover; width: 100%; height: 100%;" onerror="this.onerror=null; this.src='${fallbackImg}'">
            <span class="badge badge-live" style="position: absolute; top: 12px; left: 12px;">FEATURED GUIDE</span>
            <span class="badge badge-dark-glass" style="position: absolute; top: 12px; right: 12px; background: rgba(9, 9, 11, 0.85); color: #fff;">${sourceEsc}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; color: var(--accent); margin-bottom: 8px;" class="font-label-sm">
            <span>${catUpper}</span>
            <span style="color: var(--text-muted);">• ${timeEsc}</span>
          </div>

          <h3 class="font-headline-lg" style="margin-bottom: 12px;">
            <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" style="color: var(--text-primary); text-decoration: none;">
              ${titleEsc}
            </a>
          </h3>

          <p class="font-body-md line-clamp-3" style="color: var(--text-secondary); line-height: 1.7; margin-bottom: var(--space-md);">
            ${descEsc}
          </p>
        </div>

        <div class="author-meta-row" style="margin-top: auto; padding-top: var(--space-md); border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
          <div class="author-profile">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--surface-low); border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; color: var(--accent);">
              <span class="icon icon-filled" style="font-size: 18px;">newspaper</span>
            </div>
            <div>
              <span class="font-label-md" style="display: block; color: var(--text-primary); font-weight: 600;">${sourceEsc}</span>
              <span class="font-body-sm" style="color: var(--text-secondary);">Verified Tech Source</span>
            </div>
          </div>
          <a href="${linkEsc}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost" style="color: var(--accent); font-weight: 700;">
            <span>Read Full Guide →</span>
          </a>
        </div>
      `;
    }

    // 2. Render Stacked Dispatches Column (4 cards -> Total 5 cards with Lead)
    if (homeStacked) {
      const remainingArticles = articles
        .filter(a => a.id !== topFeatured.id)
        .slice(0, 4);

      if (remainingArticles.length > 0) {
        homeStacked.innerHTML = remainingArticles.map(art => {
          const tEsc = escapeHTML(art.title);
          const dEsc = escapeHTML(art.description);
          const source = escapeHTML(art.source || 'Tech Source');
          const time = escapeHTML(art.timeLabel || 'Recently');
          const img = art.image;
          const link = art.link || 'posts.html';
          const catLabel = escapeHTML((art.categoryLabel || art.category || 'GUIDE').toUpperCase());
          const fallbackImg = getCategoryFallback(art.category || 'ai', art.title);

          return `
            <article class="dispatch-mini-card" data-category="${escapeHTML(art.category || 'news')}">
              <a href="${link}" target="_blank" rel="noopener noreferrer" class="dispatch-mini-thumb" aria-label="${tEsc}">
                <img src="${img}" alt="${tEsc}" loading="lazy" style="object-fit: cover;" onerror="this.onerror=null; this.src='${fallbackImg}'">
              </a>
              <div class="dispatch-mini-content">
                <div style="display: flex; align-items: center; gap: 8px; color: var(--accent);" class="font-label-sm">
                  <span>${catLabel}</span>
                  <span style="color: var(--text-muted);">• ${time}</span>
                  <span style="color: var(--text-muted); font-size: 11px;">(${source})</span>
                </div>
                <h4 class="font-headline-sm line-clamp-2" style="font-size: 1.02rem; margin: 4px 0;">
                  <a href="${link}" target="_blank" rel="noopener noreferrer" style="color: var(--text-primary); text-decoration: none;">${tEsc}</a>
                </h4>
                <p class="font-body-sm line-clamp-2" style="color: var(--text-secondary); margin: 0;">
                  ${dEsc}
                </p>
              </div>
            </article>
          `;
        }).join('');
      }
    }
  }

  async function loadLiveNewsIntoGrid(containerId, forceFresh = false) {
    const container = document.getElementById(containerId);
    try {
      const articles = await getLiveNews(forceFresh);
      if (!articles || articles.length === 0) return;

      // Automatically update homepage section if present
      if (document.getElementById('home-lead-article') || document.getElementById('home-stacked-dispatches')) {
        updateHomepageNewsSection(articles);
      }

      // Automatically update article recommendations (sidebar & bottom) if present
      if (typeof window.updateArticleRecommendations === 'function') {
        window.updateArticleRecommendations(articles);
      }

      if (container) {
        // Automatically select and update the top featured hero post
        const topFeatured = selectBestFeaturedPost(articles);
        if (topFeatured) {
          updateFeaturedHeroCard(topFeatured);
        }

        // Remove existing live RSS cards before inserting updated ones
        const existingRssCards = container.querySelectorAll('[data-rss-card="true"]');
        existingRssCards.forEach(el => el.remove());

        articles.forEach(a => {
          loadedArticlesMap[a.id] = a;
        });

        const htmlString = articles.map((art, idx) => renderNewsCard(art, idx)).join('');
        container.insertAdjacentHTML('beforeend', htmlString);

        if (typeof window.refreshPostsFilter === 'function') {
          window.refreshPostsFilter();
        } else {
          const activePill = document.querySelector('#category-filter-list .active-pill');
          if (activePill) {
            activePill.click();
          }
        }
      }
    } catch (err) {
      console.warn('Unable to load live RSS news feed:', err);
    }
  }

  function startLivePolling(containerId = 'posts-grid-container', intervalMs = 5 * 60 * 1000) {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
    }
    pollIntervalId = setInterval(() => {
      loadLiveNewsIntoGrid(containerId, true);
    }, intervalMs);
  }

  function stopLivePolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  }

  function getCachedArticlesSync() {
    const now = Date.now();
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (now - parsed.timestamp < CACHE_TTL_MS && parsed.articles && parsed.articles.length > 0) {
          const freshCached = parsed.articles.filter(a => {
            if (!a.pubDate) return false;
            const t = new Date(a.pubDate).getTime();
            return !isNaN(t) && (now - t) <= MAX_EXTERNAL_AGE_MS;
          });
          if (freshCached.length > 0) {
            return freshCached;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function hydrateFromCacheSync() {
    const cachedArticles = getCachedArticlesSync();
    if (cachedArticles && cachedArticles.length > 0) {
      if (document.getElementById('home-lead-article') || document.getElementById('home-stacked-dispatches')) {
        updateHomepageNewsSection(cachedArticles);
      }

      if (typeof window.updateArticleRecommendations === 'function') {
        window.updateArticleRecommendations(cachedArticles);
      }

      const topFeatured = selectBestFeaturedPost(cachedArticles);
      if (topFeatured) {
        updateFeaturedHeroCard(topFeatured);
      }

      const container = document.getElementById('posts-grid-container');
      if (container && container.querySelectorAll('[data-rss-card="true"]').length === 0) {
        cachedArticles.forEach(a => {
          loadedArticlesMap[a.id] = a;
        });
        const htmlString = cachedArticles.map((art, idx) => renderNewsCard(art, idx)).join('');
        container.insertAdjacentHTML('beforeend', htmlString);

        if (typeof window.refreshPostsFilter === 'function') {
          window.refreshPostsFilter();
        } else {
          const activePill = document.querySelector('#category-filter-list .active-pill');
          if (activePill) {
            activePill.click();
          }
        }
      }
    }
  }

  // Expose API
  window.XEEDROID_NEWS = {
    getLiveNews,
    loadLiveNewsIntoGrid,
    openInlineArticle,
    openArticleFromData,
    closeInlineArticle,
    startLivePolling,
    stopLivePolling,
    selectBestFeaturedPost,
    updateFeaturedHeroCard,
    updateHomepageNewsSection,
    hydrateFromCacheSync
  };

  // Run 0ms synchronous hydration immediately on script parse
  try {
    hydrateFromCacheSync();
  } catch (e) {}

  
  // --- Category & Search Filter Controller for Posts View ---
  function initPostsFilterController() {
    // If posts page provides its own pagination + filter controller, don't conflict
    if (document.getElementById('posts-pagination')) return;

    const filterPills = document.querySelectorAll('#category-filter-list .cat-pill');
    const searchInput = document.getElementById('posts-search-input');
    const statusText = document.getElementById('filter-status-text');

    if (!filterPills.length) return;

    function applyPostsFilter() {
      const activePill = document.querySelector('#category-filter-list .active-pill');
      const selectedCat = activePill ? (activePill.getAttribute('data-cat') || 'all').toLowerCase() : 'all';
      const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

      // 1. Featured Top Lead Article
      const leadSection = document.getElementById('posts-lead-article-section');
      if (leadSection) {
        const leadCat = (leadSection.getAttribute('data-category') || '').toLowerCase();
        const leadText = leadSection.textContent.toLowerCase();
        const matchCat = (selectedCat === 'all' || leadCat === selectedCat || (selectedCat === 'mobile' && (leadCat === 'mobile' || leadCat === 'iphone')));
        const matchSearch = (!q || leadText.includes(q));
        leadSection.style.display = (matchCat && matchSearch) ? 'block' : 'none';
      }

      // 2. Grid Cards (both initial fallback & dynamic RSS cards)
      const cards = document.querySelectorAll('#posts-grid-container .post-item-card, #all-posts-grid .post-item-card');
      let visibleCount = 0;

      cards.forEach(card => {
        const cardCat = (card.getAttribute('data-category') || '').toLowerCase();
        const cardText = card.textContent.toLowerCase();

        let matchCat = false;
        if (selectedCat === 'all') {
          matchCat = true;
        } else if (selectedCat === 'mobile') {
          matchCat = (cardCat === 'mobile' || cardCat === 'iphone');
        } else {
          matchCat = (cardCat === selectedCat);
        }

        const matchSearch = (!q || cardText.includes(q));

        if (matchCat && matchSearch) {
          card.style.display = '';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      if (statusText) {
        statusText.textContent = selectedCat === 'all' 
          ? (q ? `Showing ${visibleCount} result${visibleCount === 1 ? '' : 's'}` : `Showing ${visibleCount} external posts`)
          : `Showing ${visibleCount} in ${selectedCat}`;
      }
    }

    filterPills.forEach(pill => {
      pill.addEventListener('click', function(e) {
        e.preventDefault();
        filterPills.forEach(p => p.classList.remove('active-pill'));
        this.classList.add('active-pill');
        applyPostsFilter();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', applyPostsFilter);
    }

    // Expose globally so when live articles are injected, filter updates immediately
    window.refreshPostsFilter = applyPostsFilter;
    applyPostsFilter();
  }

  function initAllNewsFeatures() {
    initPostsFilterController();
    if (document.getElementById('posts-grid-container') || document.getElementById('home-lead-article') || document.getElementById('sidebar-recommended-container')) {
      loadLiveNewsIntoGrid('posts-grid-container');
      startLivePolling('posts-grid-container', 5 * 60 * 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllNewsFeatures);
  } else {
    initAllNewsFeatures();
  }

})(window);
