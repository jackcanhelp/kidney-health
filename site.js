/* 腎臟健康衛教平台 — 共用腳本
 *
 * 1. Google Analytics 4（填入評估 ID 後才會啟用）
 * 2. 三個關鍵行為的事件追蹤：開啟 PDF、使用工具、點擊聯絡方式
 * 3. 頁尾年份自動更新
 *
 * ── 要開始收集數據，只需要改下面這一行 ──
 * 到 analytics.google.com 建立 GA4 資源，取得「評估 ID」（格式 G-XXXXXXXXXX），
 * 貼進引號中即可。留空的話完全不會載入任何追蹤程式碼。
 */
var GA_MEASUREMENT_ID = 'G-0120HSPY2J';

(function () {
  'use strict';

  // ---------------------------------------------------------------- GA4
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  var tracking = false;

  if (GA_MEASUREMENT_ID) {
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
    document.head.appendChild(tag);
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
    tracking = true;
  }

  function track(name, params) {
    if (tracking) gtag('event', name, params);
  }

  // ------------------------------------------------------------ 事件追蹤
  // 用事件代理，不必在每張卡片上掛 onclick，之後新增內容也會自動被涵蓋。
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;

    if (a) {
      var href = a.getAttribute('href') || '';

      if (/\.pdf($|[?#])/i.test(href)) {
        track('pdf_open', {
          file_name: decodeURIComponent(href.split('/').pop()),
          section: href.indexOf('衛教漫畫') > -1 ? '衛教漫畫' : '專業領域'
        });
        return;
      }
      if (href.indexOf('mailto:') === 0) {
        track('contact_click', { method: 'email' });
        return;
      }
      if (href.indexOf('facebook.com') > -1) {
        track('contact_click', { method: 'facebook' });
        return;
      }
      if (/scanner\.html|tools\.html/.test(href)) {
        track('tool_open', { tool_name: href.split('/').pop().replace('.html', '') });
        return;
      }
    }

    // 首頁的工具是用 modal 開啟的，沒有 <a href>，改抓標題文字
    var card = e.target.closest ? e.target.closest('[onclick*="openToolModal"]') : null;
    if (card) {
      var h = card.querySelector('h3');
      track('tool_open', { tool_name: h ? h.textContent.trim() : 'unknown' });
    }
  }, true);

  // -------------------------------------------------------------- 頁尾年份
  document.addEventListener('DOMContentLoaded', function () {
    var y = String(new Date().getFullYear());
    document.querySelectorAll('[data-current-year]').forEach(function (el) {
      el.textContent = y;
    });
  });
})();
