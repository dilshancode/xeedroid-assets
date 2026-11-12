/**
 * XEEDROID - Core Client Logic (Vanilla JS)
 * Production-quality, dependency-free, accessible
 */

(function () {
  'use strict';

  // --- 1. Theme & Palette Management ---
  const THEME_STORAGE_KEY = 'nexus_theme';
  const PALETTE_STORAGE_KEY = 'nexus_palette';
  const DEFAULT_PALETTE = 'raycast';

  function initTheme() {
    let savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    // Migrate existing sessions or initial load to default dark mode
    if (!localStorage.getItem('nexus_dark_default_applied')) {
      savedTheme = 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, 'dark');
        localStorage.setItem('nexus_dark_default_applied', 'true');
      } catch (e) {}
    }
    const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
    applyTheme(initialTheme);

    let savedPalette = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!savedPalette || savedPalette === 'default') {
      savedPalette = DEFAULT_PALETTE;
      try {
        localStorage.setItem(PALETTE_STORAGE_KEY, DEFAULT_PALETTE);
      } catch (e) {}
    }
    applyPalette(savedPalette);

    // Attach listeners to all theme toggles
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.add('theme-animating');
        setTimeout(() => btn.classList.remove('theme-animating'), 500);

        const isCurrentlyDark = document.documentElement.classList.contains('dark') ||
          document.documentElement.getAttribute('data-theme') === 'dark';
        const nextTheme = isCurrentlyDark ? 'light' : 'dark';
        applyTheme(nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      });
    });

    // Attach listeners to palette dropdown buttons
    initPaletteControls();

    // Listen for system theme changes only if user hasn't saved preference
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  function applyTheme(theme) {
    const isDark = theme !== 'light';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.setAttribute('data-theme', 'light');
    }

    document.querySelectorAll('[data-theme-toggle] .icon').forEach(icon => {
      icon.textContent = isDark ? 'light_mode' : 'dark_mode';
    });
  }

  function applyPalette(palette) {
    const chosen = (!palette || palette === 'default') ? DEFAULT_PALETTE : palette;
    document.documentElement.setAttribute('data-palette', chosen);

    // Update active state in palette selectors
    document.querySelectorAll('[data-palette-choice]').forEach(el => {
      const choice = el.getAttribute('data-palette-choice');
      const active = (choice === chosen) || (chosen === 'cobalt' && choice === 'default');
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function initPaletteControls() {
    const toggleBtn = document.querySelector('[data-palette-toggle]');
    const dropdown = document.querySelector('.palette-dropdown-menu');

    if (toggleBtn && dropdown) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
          dropdown.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    document.querySelectorAll('[data-palette-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.getAttribute('data-palette-choice');
        const resolvedChoice = (choice === 'default') ? 'cobalt' : choice;
        applyPalette(resolvedChoice);
        localStorage.setItem(PALETTE_STORAGE_KEY, resolvedChoice);
        if (dropdown) dropdown.classList.remove('open');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- 2. Mobile Navigation Drawer ---
  function initMobileNav() {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const drawer = document.getElementById('mobile-nav-drawer');

    if (!toggleBtn || !drawer) return;

    toggleBtn.addEventListener('click', () => {
      const isOpen = drawer.classList.contains('open');
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    // Close on link click
    drawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeDrawer);
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        closeDrawer();
      }
    });

    // Close automatically when resized to desktop viewport
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024 && drawer.classList.contains('open')) {
        closeDrawer();
      }
    });

    function openDrawer() {
      drawer.classList.add('open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      const icon = toggleBtn.querySelector('.icon');
      if (icon) icon.textContent = 'close';
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      drawer.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      const icon = toggleBtn.querySelector('.icon');
      if (icon) icon.textContent = 'menu';
      document.body.style.overflow = '';
    }
  }

  // --- 3. Toast Notifications ---
  function showToast(message, duration = 3000) {
    let toast = document.getElementById('nexus-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'nexus-toast';
      toast.className = 'toast-msg';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<span class="icon icon-filled" style="color: var(--accent);">info</span> <span class="toast-text"></span>';
    toast.querySelector('.toast-text').textContent = message;
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // --- 4. Category / Domain Filter Pills ---
  function initCategoryFilters() {
    // If on posts.html, it manages its own combined search + category filter controller
    if (document.getElementById('posts-grid-container')) return;

    const filterPills = document.querySelectorAll('.cat-pill');
    if (!filterPills.length) return;

    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active-pill'));
        pill.classList.add('active-pill');

        const selectedCat = pill.getAttribute('data-cat');
        const filterableCards = document.querySelectorAll('[data-category]');

        filterableCards.forEach(card => {
          const cardCat = card.getAttribute('data-category');
          if (selectedCat === 'all' || cardCat === selectedCat) {
            card.style.display = '';
            card.style.opacity = '1';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // --- 5. Interactive Video Player Modal ---
  function initVideoModal() {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('video-modal-iframe');
    const closeBtn = document.getElementById('video-modal-close');

    if (!modal || !iframe) return;

    function openModal(youtubeId) {
      iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;
      modal.removeAttribute('hidden');
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('hidden', '');
      iframe.src = '';
      document.body.style.overflow = '';
    }

    // Event delegation on document so dynamically injected videos from YouTube API also open the modal
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-youtube-id]');
      if (trigger) {
        e.preventDefault();
        const ytid = trigger.getAttribute('data-youtube-id');
        if (ytid) openModal(ytid);
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeModal();
      }
    });
  }

  // --- 6. Save Later & Bookmark Toggle ---
  function initSaveLater() {
    document.querySelectorAll('.btn-save-later').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const icon = btn.querySelector('.icon');
        const textSpan = btn.querySelector('.save-text');
        const isSaved = btn.getAttribute('data-saved') === 'true';

        if (!isSaved) {
          btn.setAttribute('data-saved', 'true');
          if (icon) {
            icon.textContent = 'bookmark';
            icon.classList.add('icon-filled');
          }
          if (textSpan) textSpan.textContent = 'Saved';
          showToast('Added to your saved list');
        } else {
          btn.setAttribute('data-saved', 'false');
          if (icon) {
            icon.textContent = 'bookmark_border';
            icon.classList.remove('icon-filled');
          }
          if (textSpan) textSpan.textContent = 'Save Later';
          showToast('Removed from saved list');
        }
      });
    });
  }

  // --- 7. Native Share API & Clipboard Fallback ---
  function initShareButtons() {
    document.querySelectorAll('.btn-share-dispatch').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const shareTitle = btn.getAttribute('data-title') || document.title;
        const shareUrl = btn.getAttribute('data-url') || window.location.href;

        if (navigator.share) {
          try {
            await navigator.share({
              title: shareTitle,
              text: shareTitle,
              url: shareUrl,
            });
          } catch (err) {
            // User cancelled or share failed
          }
        } else {
          try {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copied to clipboard!');
          } catch (err) {
            showToast('Could not copy link.');
          }
        }
      });
    });
  }

  // --- 8. Newsletter Forms ---
  function initNewsletterForms() {
    document.querySelectorAll('.newsletter-form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (!input || !input.value) return;

        const email = input.value;
        const container = form.parentElement;
        const successBox = container.querySelector('.newsletter-success');

        form.style.display = 'none';
        if (successBox) {
          successBox.style.display = 'block';
        } else {
          showToast(`Subscribed ${email} to weekly dispatch!`);
        }
      });
    });
  }

  // --- 9. Article Scroll Reading Progress Bar ---
  function initReadingProgress() {
    const progressBar = document.getElementById('reading-progress-bar');
    if (!progressBar) return;

    window.addEventListener('scroll', () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight <= 0) return;
      const progress = (window.scrollY / totalHeight) * 100;
      progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }, { passive: true });
  }

  // --- 10. Billing Cycle Switcher (Membership Tiers) ---
  function initBillingSwitcher() {
    const monthlyBtn = document.getElementById('billing-monthly-btn');
    const annualBtn = document.getElementById('billing-annual-btn');
    if (!monthlyBtn || !annualBtn) return;

    const prices = document.querySelectorAll('[data-monthly-price]');

    function setBilling(cycle) {
      if (cycle === 'annual') {
        annualBtn.classList.add('active');
        monthlyBtn.classList.remove('active');
        prices.forEach(el => {
          el.textContent = el.getAttribute('data-annual-price');
        });
      } else {
        monthlyBtn.classList.add('active');
        annualBtn.classList.remove('active');
        prices.forEach(el => {
          el.textContent = el.getAttribute('data-monthly-price');
        });
      }
    }

    monthlyBtn.addEventListener('click', () => setBilling('monthly'));
    annualBtn.addEventListener('click', () => setBilling('annual'));
  }

  // --- 11. Global Instant Search Filter ---
  function initHeaderSearch() {
    const searchInputs = document.querySelectorAll('.search-input');
    searchInputs.forEach(input => {
      input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        const cards = document.querySelectorAll('.video-card, .dispatch-mini-card, .lead-article-card, .topic-cluster-card');

        cards.forEach(card => {
          const text = card.textContent.toLowerCase();
          if (!query || text.includes(query)) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // --- 11b. Reading Progress Bar (kil0bit-inspired) ---
  function initReadingProgress() {
    const progressBar = document.querySelector('.reading-progress-bar');
    const articleWrapper = document.querySelector('.article-content-wrapper') || document.querySelector('article');

    if (!progressBar || !articleWrapper) return;

    const handleScroll = () => {
      const rect = articleWrapper.getBoundingClientRect();
      const totalHeight = articleWrapper.offsetHeight - window.innerHeight;
      if (totalHeight <= 0) return;

      const scrolled = Math.max(0, -rect.top);
      const progressPercent = Math.min(100, Math.max(0, (scrolled / totalHeight) * 100));
      progressBar.style.width = `${progressPercent}%`;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  // --- 11c. Code Snippet Copy-to-Clipboard ---
  function initCodeCopyButtons() {
    document.querySelectorAll('.article-code-block, pre').forEach(block => {
      if (block.querySelector('.btn-copy-code') || block.querySelector('.code-copy-btn')) return;

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-copy-code';
      copyBtn.setAttribute('aria-label', 'Copy code snippet');
      copyBtn.innerHTML = '<span class="icon" style="font-size: 14px;">content_copy</span><span>Copy</span>';

      copyBtn.addEventListener('click', async () => {
        const codeElement = block.querySelector('code') || block;
        const textToCopy = (codeElement.innerText || codeElement.textContent || '')
          .replace(/Copy$/, '')
          .replace(/Copied!$/, '')
          .trim();

        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.innerHTML = '<span class="icon" style="font-size: 14px;">check</span><span>Copied!</span>';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '<span class="icon" style="font-size: 14px;">content_copy</span><span>Copy</span>';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (err) {
          showToast('Could not copy code.');
        }
      });

      block.style.position = 'relative';
      block.appendChild(copyBtn);
    });
  }

  // --- 12. IntersectionObserver Scroll Reveal Animations ---
  function initScrollReveal() {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Default elements to automatically animate on scroll
    const targetSelectors = [
      '.hero-player-card',
      '.hero-content',
      '.section-header-row',
      '.page-header',
      '.news-lead-grid > *',
      '.watch-layout-grid > *',
      '.about-layout-grid > *',
      '.article-layout-grid > *',
      '.legal-content > *',
      '.editorial-content > *',
      '.ticker-bar',
      '.cat-pill',
      '.video-card',
      '.lead-article-card',
      '.dispatch-mini-card',
      '.creator-banner-box',
      '.pricing-card',
      '.topic-cluster-card',
      '.article-prose h2',
      '.article-prose h3',
      '.article-callout',
      '.article-code-block',
      '.article-pull-quote',
      '.chapter-item'
    ];

    // Apply staggered cascades to grid containers
    document.querySelectorAll('.videos-grid-4, .bento-grid-editorial, .topic-cluster-grid, .pricing-grid, .filter-pills-row').forEach(grid => {
      grid.classList.add('reveal-stagger');
    });

    // Tag elements with reveal class
    targetSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (!el.classList.contains('reveal-on-scroll')) {
          el.classList.add('reveal-on-scroll');
        }
      });
    });

    // Intersection Observer setup
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -20px 0px',
      threshold: 0.05
    };

    // Immediately reveal elements already in viewport on page load
    const checkInitialInView = () => {
      const windowHeight = window.innerHeight;
      document.querySelectorAll('.reveal-on-scroll').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < windowHeight - 10) {
          el.classList.add('is-visible');
        }
      });
    };
    checkInitialInView();

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target); // Unobserve once revealed for optimal performance
        }
      });
    }, observerOptions);

    document.querySelectorAll('.reveal-on-scroll:not(.is-visible)').forEach(el => {
      observer.observe(el);
    });

    // Sticky header scroll behavior
    const header = document.querySelector('.site-header');
    if (header) {
      const handleScroll = () => {
        if (window.scrollY > 20) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
    }
  }

  // --- 13. Feedback & Suggestion Modal ---
  function initFeedbackModal() {
    let modal = document.getElementById('feedback-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'feedback-modal';
      modal.className = 'feedback-modal-backdrop';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Feedback and Suggestions');
      modal.innerHTML = `
        <div class="feedback-modal-dialog">
          <div class="feedback-header">
            <div class="feedback-header-left">
              <div class="feedback-icon-badge">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M13.5 6.5l4 4L10 18l-4 1 1-4z"></path><path d="M16 9l-2-2"></path></svg>
              </div>
              <div>
                <h3 class="feedback-title">Share Feedback & Ideas</h3>
                <p class="feedback-subtitle">Have a video suggestion, bug report, or idea? We review every submission.</p>
              </div>
            </div>
            <button type="button" class="feedback-close-btn" id="feedback-modal-close" aria-label="Close Feedback Modal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <form id="nexus-feedback-form" class="feedback-form-body" novalidate>
            <div id="feedback-alert-banner" class="feedback-inline-alert" style="display: none;" role="alert">
              <svg class="alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span id="feedback-alert-text"></span>
            </div>
            <div class="feedback-field-group">
              <label class="feedback-field-label">CATEGORY</label>
              <div class="feedback-pill-options">
                <button type="button" class="feedback-type-btn active" data-type="Idea">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>
                  <span>Video Idea</span>
                </button>
                <button type="button" class="feedback-type-btn" data-type="Bug">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"></rect><path d="m19 7-3 2"></path><path d="m5 7 3 2"></path><path d="m19 19-3-2"></path><path d="m5 19 3-2"></path><path d="M20 13h-4"></path><path d="M4 13h4"></path><path d="m10 4 1 2"></path><path d="m14 4-1 2"></path></svg>
                  <span>Bug Report</span>
                </button>
                <button type="button" class="feedback-type-btn" data-type="Design">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
                  <span>UI & Design</span>
                </button>
                <button type="button" class="feedback-type-btn" data-type="General">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>
                  <span>General</span>
                </button>
              </div>
            </div>

            <div class="feedback-field-group">
              <div class="feedback-label-split">
                <label class="feedback-field-label">EXPERIENCE RATING</label>
                <span class="feedback-rating-badge" id="rating-label-text">5 — Excellent</span>
              </div>
              <div class="feedback-scale-row">
                <button type="button" class="feedback-scale-btn" data-rating="1" data-label="1 — Needs Work">1</button>
                <button type="button" class="feedback-scale-btn" data-rating="2" data-label="2 — Below Average">2</button>
                <button type="button" class="feedback-scale-btn" data-rating="3" data-label="3 — Average">3</button>
                <button type="button" class="feedback-scale-btn" data-rating="4" data-label="4 — Good">4</button>
                <button type="button" class="feedback-scale-btn active" data-rating="5" data-label="5 — Excellent">5</button>
              </div>
            </div>

            <div class="feedback-field-group">
              <label for="feedback-comment" class="feedback-field-label">YOUR MESSAGE / RECOMMENDATION</label>
              <textarea id="feedback-comment" class="feedback-textarea" rows="4" placeholder="Describe the issue, suggest a Windows 11 tutorial topic, or share your thoughts..." required></textarea>
            </div>

            <div class="feedback-field-group" style="margin-bottom: 4px;">
              <label for="feedback-email" class="feedback-field-label">EMAIL ADDRESS <span class="feedback-optional-tag">(Optional for response)</span></label>
              <input type="email" id="feedback-email" class="feedback-input-email" placeholder="you@example.com">
            </div>
          </form>

          <div class="feedback-footer">
            <button type="button" class="btn btn-secondary feedback-btn-cancel" id="feedback-modal-cancel">Cancel</button>
            <button type="submit" form="nexus-feedback-form" class="btn btn-primary feedback-btn-submit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              <span>Submit Feedback</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    let selectedCategory = 'Idea';
    let selectedRating = '5 — Excellent';

    // Type selection
    modal.querySelectorAll('.feedback-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCategory = btn.getAttribute('data-type');
      });
    });

    // 1-5 Rating scale selection
    const ratingLabel = modal.querySelector('#rating-label-text');
    modal.querySelectorAll('.feedback-scale-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        modal.querySelectorAll('.feedback-scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const label = btn.getAttribute('data-label') || `${btn.textContent.trim()} — Rating`;
        selectedRating = label;
        if (ratingLabel) {
          ratingLabel.textContent = label;
        }
      });
    });

    function closeFeedbackModal() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      resetFeedbackFormState();
    }

    // Attach open triggers across the document
    document.querySelectorAll('[data-feedback-trigger]').forEach(trigger => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        trigger.classList.add('feedback-animating');
        setTimeout(() => trigger.classList.remove('feedback-animating'), 600);
        openFeedbackModal();
      });
    });

    // Close triggers
    const closeBtn = modal.querySelector('#feedback-modal-close');
    const cancelBtn = modal.querySelector('#feedback-modal-cancel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        resetFeedbackFormState();
        closeFeedbackModal();
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetFeedbackFormState();
        closeFeedbackModal();
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        resetFeedbackFormState();
        closeFeedbackModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        resetFeedbackFormState();
        closeFeedbackModal();
      }
    });

    // Potentially inappropriate / abusive words & spam patterns list
    const INAPPROPRIATE_PATTERNS = [
      /\b(fuck|shit|bitch|asshole|bastard|dick|pussy|cunt|nigger|faggot|retard|idiot|dumbass|scam|scammer|trash|garbage|die|kill)\b/i,
      /\b(porn|xxx|crypto|casino|betting|viagra|whatsapp me|telegram me)\b/i,
      /(http:\/\/|https:\/\/)[^\s]+(\.ru|\.xyz|\.top|\.tk|\.click)/i
    ];

    function checkInappropriateContent(text) {
      if (!text) return false;
      return INAPPROPRIATE_PATTERNS.some(regex => regex.test(text));
    }

    function showInlineAlert(msg, targetInput) {
      const alertBox = modal.querySelector('#feedback-alert-banner');
      const alertText = modal.querySelector('#feedback-alert-text');
      if (alertBox && alertText) {
        alertText.textContent = msg;
        alertBox.classList.add('is-visible');
        alertBox.classList.remove('shake');
        void alertBox.offsetWidth; // Reflow for animation
        alertBox.classList.add('shake');
      }
      if (targetInput) {
        targetInput.classList.add('input-error');
        targetInput.focus();
        targetInput.addEventListener('input', () => {
          targetInput.classList.remove('input-error');
          if (alertBox) alertBox.classList.remove('is-visible');
        }, { once: true });
      }
    }

    function resetFeedbackFormState() {
      if (form) form.reset();
      delete form.dataset.bypassFlagged;
      selectedCategory = 'Video Idea';
      selectedRating = '5 — Excellent';
      const alertBox = modal.querySelector('#feedback-alert-banner');
      if (alertBox) {
        alertBox.classList.remove('is-visible');
        const alertText = modal.querySelector('#feedback-alert-text');
        if (alertText) alertText.textContent = '';
      }
      modal.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
      modal.querySelectorAll('.feedback-type-btn').forEach((b, i) => {
        if (i === 0) b.classList.add('active');
        else b.classList.remove('active');
      });
      modal.querySelectorAll('.feedback-scale-btn').forEach(b => {
        if (b.getAttribute('data-rating') === '5') b.classList.add('active');
        else b.classList.remove('active');
      });
      if (ratingLabel) ratingLabel.textContent = '5 — Excellent';
      const submitBtn = modal.querySelector('.feedback-btn-submit');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.querySelector('span').textContent = 'Submit Feedback';
      }
    }

    function openFeedbackModal() {
      resetFeedbackFormState();
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      const commentInput = modal.querySelector('#feedback-comment');
      if (commentInput) {
        setTimeout(() => commentInput.focus(), 100);
      }
    }

    // Form submission
    const form = modal.querySelector('#nexus-feedback-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const commentInput = modal.querySelector('#feedback-comment');
        const emailInput = modal.querySelector('#feedback-email');
        const comment = commentInput ? commentInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';

        // Validation 1: Message length check
        if (!comment || comment.length < 5) {
          showInlineAlert('Please enter a message of at least 5 characters.', commentInput);
          return;
        }

        // Validation 2: Potentially Inappropriate Language Filter (YouTube Basic Mode)
        const isFlagged = checkInappropriateContent(comment) || (email && checkInappropriateContent(email));
        if (isFlagged && !form.dataset.bypassFlagged) {
          showInlineAlert('⚠️ Potentially inappropriate language detected. Please review your message or click Submit again to hold it for review.', commentInput);
          form.dataset.bypassFlagged = 'true';
          return;
        }

        // Validation 3: Email format check (if provided)
        if (email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            showInlineAlert('Please enter a valid email address (e.g. name@example.com).', emailInput);
            return;
          }
        }

        const moderationStatus = isFlagged ? 'Held for Review' : 'Approved';

        const submitBtn = modal.querySelector('.feedback-btn-submit');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.7';
          submitBtn.querySelector('span').textContent = isFlagged ? 'Holding for Review...' : 'Submitting...';
        }

        // Clean standardized timestamp: "Nov 12, 2026, 11:30 PM"
        const now = new Date();
        const formattedTimestamp = now.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) + ', ' + now.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        // Store feedback entry in localStorage
        try {
          const stored = JSON.parse(localStorage.getItem('nexus_feedbacks') || '[]');
          stored.push({
            category: selectedCategory,
            rating: selectedRating,
            comment: comment,
            email: email || 'Anonymous',
            page: window.location.pathname,
            timestamp: formattedTimestamp
          });
          localStorage.setItem('nexus_feedbacks', JSON.stringify(stored));
        } catch (err) {}

        // Send via Dispatch Webhook (Google Sheets Web App, Discord, or custom endpoint)
        const webhookUrl = window.XEEDROID_FEEDBACK_WEBHOOK || window.XEEDROID_SHEETS_WEBHOOK;
        if (webhookUrl) {
          try {
            const isGoogleSheets = webhookUrl.includes('script.google.com');
            const payload = isGoogleSheets
              ? JSON.stringify({
                  timestamp: formattedTimestamp,
                  category: selectedCategory,
                  rating: selectedRating,
                  comment: comment,
                  email: email || 'Anonymous',
                  page: window.location.href,
                  status: moderationStatus
                })
              : JSON.stringify({
                  username: 'XEEDROID Feedback Bot',
                  avatar_url: 'https://cdn.jsdelivr.net/gh/dilshancode/xeedroid-assets@main/assets/icons/Logo_No_bg%201.png',
                  embeds: [{
                    title: isFlagged ? `⚠️ Flagged Feedback (Held): ${selectedCategory}` : `💬 New Feedback: ${selectedCategory}`,
                    color: isFlagged ? 16744448 : (selectedCategory === 'Bug Report' ? 15548997 : (selectedCategory === 'Video Idea' ? 3447003 : 5763719)),
                    fields: [
                      { name: 'Category', value: selectedCategory, inline: true },
                      { name: 'Rating', value: selectedRating, inline: true },
                      { name: 'Moderation Status', value: moderationStatus, inline: true },
                      { name: 'User Email', value: email || 'Anonymous', inline: true },
                      { name: 'Page URL', value: window.location.href, inline: false },
                      { name: 'Message', value: comment, inline: false }
                    ],
                    footer: { text: 'XEEDROID Community Hub • Instant Notification' },
                    timestamp: formattedTimestamp
                  }]
                });

            // mode: 'no-cors' allows Google Apps Script redirect responses to complete cleanly
            fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: payload,
              mode: isGoogleSheets ? 'no-cors' : 'cors'
            }).catch(() => {});
          } catch (e) {}
        }

        setTimeout(() => {
          closeFeedbackModal();
          resetFeedbackFormState();
          showToast('Thank you! Your feedback has been received.', 4000);
        }, 300);
      });
    }
  }

  // --- 14. Instant Navigation & Active Link Feedback ---
  function initPageTransitions() {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.site-header .nav-link, .mobile-nav-link').forEach(link => {
      const href = (link.getAttribute('href') || '').toLowerCase();
      if (href === currentPage) link.classList.add('active');
      else if (href.endsWith('.html')) link.classList.remove('active');
    });
  }

  function initFontLoadHandler() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
      setTimeout(() => {
        document.documentElement.classList.add('fonts-loaded');
      }, 1000);
    } else {
      document.documentElement.classList.add('fonts-loaded');
    }
  }

  function initServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
          registration.update().catch(() => {});
        }).catch(() => {
          navigator.serviceWorker.register('sw.js').catch(() => {});
        });
      });
    }
  }

  // Global Quick Shortcuts (e.g. Ctrl + K for search)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const search = document.querySelector('.search-input');
      if (search) {
        search.focus();
        search.select();
      }
    }
  });

  // Initialize all features on DOM ready
  function initDynamicCopyright() {
    const yr = new Date().getFullYear();
    const targetYr = yr > 2027 ? yr : 2027;
    const yearEl = document.getElementById('copyright-year');
    if (yearEl) {
      yearEl.textContent = targetYr;
    }
    const copyrightP = document.getElementById('copyright-text');
    if (copyrightP && !yearEl) {
      copyrightP.innerHTML = '© 2024 - ' + targetYr + ' XEEDROID. All Rights Reserved.';
    }
  }  function initAllAppFeatures() {
    initDynamicCopyright();
    initFontLoadHandler();
    initServiceWorker();
    initTheme();
    initMobileNav();
    initCategoryFilters();
    initVideoModal();
    initSaveLater();
    initShareButtons();
    initNewsletterForms();
    initReadingProgress();
    initCodeCopyButtons();
    initBillingSwitcher();
    initHeaderSearch();
    initScrollReveal();
    initFeedbackModal();
    initPageTransitions();
    initCoinToss();
  }

  // --- 15. About Page Logo Coin Flip Animation ---
  function initCoinToss() {
    const coin = document.getElementById('logo-coin');
    if (!coin || coin.dataset.coinBound) return;
    coin.dataset.coinBound = 'true';

    const inner = coin.querySelector('.coin-flip-inner');
    let flipTimer = null;

    function doFlip() {
      clearTimeout(flipTimer);
      coin.classList.remove('flipping');
      if (inner) inner.classList.remove('is-flipping');

      void coin.offsetWidth;
      if (inner) void inner.offsetWidth;

      coin.classList.add('flipping');
      if (inner) inner.classList.add('is-flipping');

      flipTimer = setTimeout(() => {
        coin.classList.remove('flipping');
        if (inner) inner.classList.remove('is-flipping');
      }, 1050);
    }

    coin.addEventListener('click', (e) => {
      e.preventDefault();
      doFlip();
    });

    coin.addEventListener('mouseenter', () => {
      doFlip();
    });

    const onAnimationEnd = () => {
      clearTimeout(flipTimer);
      coin.classList.remove('flipping');
      if (inner) inner.classList.remove('is-flipping');
    };

    coin.addEventListener('animationend', onAnimationEnd);
    if (inner) {
      inner.addEventListener('animationend', onAnimationEnd);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllAppFeatures);
  } else {
    initAllAppFeatures();
  }
})();
