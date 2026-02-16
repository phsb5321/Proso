/**
 * VoxPage Landing Page — Progressive Enhancement
 * Pricing toggle, mobile navigation, hero animation, smooth scroll.
 * Site works fully without this file.
 */

(function () {
  'use strict';

  // --- Pricing Toggle ---
  function initPricingToggle() {
    const toggles = document.querySelectorAll('[id="pricing-toggle"]');

    toggles.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        const isAnnual = toggle.getAttribute('aria-checked') === 'true';
        const newState = !isAnnual;
        toggle.setAttribute('aria-checked', String(newState));

        // Update all pricing sections on this page
        document.querySelectorAll('.pricing-grid').forEach(function (grid) {
          grid.closest('section').setAttribute('data-billing', newState ? 'annual' : 'monthly');
        });

        // Update toggle label active states
        const container = toggle.closest('.pricing-toggle');
        if (container) {
          var labels = container.querySelectorAll('.pricing-toggle__label');
          labels.forEach(function (label, i) {
            label.classList.toggle('pricing-toggle__label--active', i === (newState ? 1 : 0));
          });
        }
      });
    });
  }

  // --- Mobile Navigation ---
  function initMobileNav() {
    var toggles = document.querySelectorAll('.nav-toggle');

    toggles.forEach(function (toggle) {
      toggle.addEventListener('click', function () {
        var expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));

        var navId = toggle.getAttribute('aria-controls');
        var nav = navId ? document.getElementById(navId) : null;
        if (nav) {
          nav.classList.toggle('is-open', !expanded);
        }

        // Animate hamburger to X
        var spans = toggle.querySelectorAll('span');
        if (!expanded) {
          spans[0].style.transform = 'rotate(45deg) translateY(7px)';
          spans[1].style.opacity = '0';
          spans[2].style.transform = 'rotate(-45deg) translateY(-7px)';
        } else {
          spans[0].style.transform = '';
          spans[1].style.opacity = '';
          spans[2].style.transform = '';
        }
      });
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.site-nav')) {
        document.querySelectorAll('.site-nav__links.is-open').forEach(function (nav) {
          nav.classList.remove('is-open');
        });
        document.querySelectorAll('.nav-toggle[aria-expanded="true"]').forEach(function (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          var spans = toggle.querySelectorAll('span');
          spans[0].style.transform = '';
          spans[1].style.opacity = '';
          spans[2].style.transform = '';
        });
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.site-nav__links.is-open').forEach(function (nav) {
          nav.classList.remove('is-open');
        });
        document.querySelectorAll('.nav-toggle[aria-expanded="true"]').forEach(function (toggle) {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
          var spans = toggle.querySelectorAll('span');
          spans[0].style.transform = '';
          spans[1].style.opacity = '';
          spans[2].style.transform = '';
        });
      }
    });
  }

  // --- Smooth Scroll ---
  function initSmoothScroll() {
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var targetId = link.getAttribute('href');
        if (targetId === '#' || targetId === '#main') return; // skip-link handled natively

        var target = document.querySelector(targetId);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({
            behavior: prefersReducedMotion ? 'instant' : 'smooth',
            block: 'start'
          });
          // Update URL without jumping
          history.pushState(null, '', targetId);
        }
      });
    });
  }

  // --- Hero Word Animation ---
  function initHeroAnimation() {
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    var words = document.querySelectorAll('.browser-mockup__content .word');
    if (words.length === 0) return;

    var currentIndex = 0;
    var intervalMs = 300;
    var pauseMs = 2000;

    function highlightNext() {
      // Clear previous
      words.forEach(function (w) { w.classList.remove('highlighted'); });

      // Highlight current
      if (currentIndex < words.length) {
        words[currentIndex].classList.add('highlighted');
        currentIndex++;
        setTimeout(highlightNext, intervalMs);
      } else {
        // Pause then restart
        currentIndex = 0;
        setTimeout(highlightNext, pauseMs);
      }
    }

    // Start after a brief delay
    setTimeout(highlightNext, 800);
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    initPricingToggle();
    initMobileNav();
    initSmoothScroll();
    initHeroAnimation();
  });
})();
