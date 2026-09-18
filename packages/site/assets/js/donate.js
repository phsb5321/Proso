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
  if (keyEl && pixCopy) keyEl.textContent = pixCopy;

  var nameEl = $('donate-pix-name');
  if (nameEl && config.pixName) {
    nameEl.textContent = config.pixName + (config.pixCity ? ' — ' + config.pixCity : '');
    show(nameEl, true);
  } else if (nameEl) {
    show(nameEl, false);
  }

  var copyBtn = $('donate-pix-copy');
  if (copyBtn) {
    var resetLabel = function () {
      copyBtn.textContent = copyBtn.getAttribute('data-copy-label') || 'Copy';
    };
    var announce = function (ok) {
      copyBtn.textContent = ok
        ? copyBtn.getAttribute('data-copied-label') || 'Copied!'
        : copyBtn.getAttribute('data-failed-label') || 'Copy failed — select the key below';
      window.setTimeout(resetLabel, 3000);
    };
    var selectValue = function () {
      if (!keyEl) return;
      var range = document.createRange();
      range.selectNodeContents(keyEl);
      var selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };
    copyBtn.addEventListener('click', function () {
      if (!pixCopy) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pixCopy).then(
          function () {
            announce(true);
          },
          function () {
            selectValue();
            announce(false);
          },
        );
      } else {
        var copied = false;
        try {
          var area = document.createElement('textarea');
          area.value = pixCopy;
          document.body.appendChild(area);
          area.select();
          copied = document.execCommand('copy');
          document.body.removeChild(area);
        } catch (error) {
          void error;
          copied = false;
        }
        if (!copied) selectValue();
        announce(copied);
      }
    });
  }
})();
