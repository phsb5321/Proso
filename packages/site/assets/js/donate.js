/**
 * Renders the donation page from window.PROSO_DONATE: every option hides
 * itself when its config value is empty, so the page can ship before the
 * accounts exist and light up one rail at a time.
 */
(function () {
  'use strict';

  var config = window.PROSO_DONATE || {};

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  var pixCopy = config.pixPayload || config.pixKey;

  show($('donate-pix'), Boolean(pixCopy));
  show($('donate-pix-pending'), !pixCopy);
  show($('donate-kofi'), Boolean(config.kofiUrl));
  show($('donate-sponsors'), Boolean(config.githubSponsorsUrl));

  if (config.kofiUrl) $('donate-kofi-link').href = config.kofiUrl;
  if (config.githubSponsorsUrl) $('donate-sponsors-link').href = config.githubSponsorsUrl;

  var qr = $('donate-pix-qr');
  if (qr && config.pixQrImage) {
    qr.src = config.pixQrImage;
    show(qr, true);
  } else if (qr) {
    show(qr, false);
  }

  var keyEl = $('donate-pix-value');
  if (keyEl && config.pixKey && !config.pixPayload) keyEl.textContent = config.pixKey;

  var nameEl = $('donate-pix-name');
  if (nameEl && config.pixName) {
    nameEl.textContent = config.pixName + (config.pixCity ? ' — ' + config.pixCity : '');
    show(nameEl, true);
  } else if (nameEl) {
    show(nameEl, false);
  }

  var copyBtn = $('donate-pix-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      if (!pixCopy) return;
      var done = function () {
        copyBtn.textContent = copyBtn.getAttribute('data-copied-label') || 'Copied!';
        window.setTimeout(function () {
          copyBtn.textContent = copyBtn.getAttribute('data-copy-label') || 'Copy';
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pixCopy).then(done, done);
      } else {
        var area = document.createElement('textarea');
        area.value = pixCopy;
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
        } catch (error) {
          void error;
        }
        document.body.removeChild(area);
        done();
      }
    });
  }
})();
