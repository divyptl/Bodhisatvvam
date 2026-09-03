/**
 * Upcoming Session Banner — Auto-injected across all pages
 * Displays the next upcoming free session (Amavasya Meditation)
 * 
 * To update: Edit the SESSION_DATA object below.
 * To remove: Delete the <script> tag from each page or set SESSION_DATA.active = false
 */
(function() {
  'use strict';

  const SESSION_DATA = {
    active: true,
    title: 'Special Amavasya Meditation',
    date: '10th September 2026',
    dateISO: '2026-09-10',
    time: '9:30 PM – 10:15 PM IST',
    duration: '45 Minutes of Deep Divine Connection',
    platform: 'Google Meet',
    platformIcon: '📹',
    price: 'FREE FOR ALL',
    coachName: 'Neepa Patel',
    coachTitle: 'Life Coach | Pranic Healer | NLP Trainer & Counselor',
    phone: '9824867959',
    tagline: 'Amavasya Night',
    subtitle: 'Open to All — Let\'s Meditate Together and Manifest Miracles',
    benefits: [
      'Release Negativity & Old Energy',
      'Deep Healing of Mind, Body & Soul',
      'Attract Abundance, Peace & Positivity',
      'Strengthen Intuition & Inner Clarity',
      'Manifest Your Desires with Divine Support',
      'Experience Deep Calm, Lightness & Higher Energy'
    ],
    callToAction: 'Your Presence Matters… Feel the Divine Energy, Heal & Transform Your Life.'
  };

  // Don't show on admin pages
  if (window.location.pathname.includes('admin')) return;

  // Don't show if session date has passed
  const sessionDate = new Date(SESSION_DATA.dateISO + 'T22:15:00+05:30');
  if (new Date() > sessionDate || !SESSION_DATA.active) return;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    /* ── UPCOMING SESSION BANNER ── */
    .upcoming-session-banner {
      background: linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 25%, #0d1b2a 50%, #1a0a2e 75%, #0a0a1a 100%);
      position: relative;
      overflow: hidden;
      padding: 0;
    }

    .upcoming-session-banner::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 20% 30%, rgba(212, 170, 96, 0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 70%, rgba(212, 170, 96, 0.08) 0%, transparent 50%),
        radial-gradient(circle at 50% 0%, rgba(255, 200, 87, 0.06) 0%, transparent 40%);
      pointer-events: none;
    }

    /* Animated stars */
    .upcoming-session-banner::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.5) 0%, transparent 100%),
        radial-gradient(1px 1px at 30% 45%, rgba(255,255,255,0.3) 0%, transparent 100%),
        radial-gradient(1px 1px at 50% 25%, rgba(255,255,255,0.4) 0%, transparent 100%),
        radial-gradient(1px 1px at 70% 65%, rgba(255,255,255,0.3) 0%, transparent 100%),
        radial-gradient(1px 1px at 90% 35%, rgba(255,255,255,0.5) 0%, transparent 100%),
        radial-gradient(1px 1px at 15% 75%, rgba(255,255,255,0.2) 0%, transparent 100%),
        radial-gradient(1.5px 1.5px at 85% 10%, rgba(212,170,96,0.6) 0%, transparent 100%),
        radial-gradient(1.5px 1.5px at 45% 85%, rgba(212,170,96,0.4) 0%, transparent 100%);
      animation: usb-twinkle 4s ease-in-out infinite alternate;
      pointer-events: none;
    }

    @keyframes usb-twinkle {
      0% { opacity: 0.6; }
      100% { opacity: 1; }
    }

    .usb-inner {
      position: relative;
      z-index: 2;
      max-width: 1000px;
      margin: 0 auto;
      padding: 60px 40px;
      text-align: center;
    }

    .usb-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 0.68rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: #d4aa60;
      margin-bottom: 8px;
      font-family: 'Jost', 'Montserrat', sans-serif;
      font-weight: 500;
    }
    .usb-eyebrow::before, .usb-eyebrow::after {
      content: '';
      width: 32px;
      height: 1px;
      background: linear-gradient(90deg, transparent, #d4aa60);
    }
    .usb-eyebrow::after {
      background: linear-gradient(90deg, #d4aa60, transparent);
    }

    .usb-title {
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-size: clamp(2rem, 4.5vw, 3.2rem);
      font-weight: 300;
      color: #f5efe3;
      line-height: 1.1;
      margin-bottom: 6px;
    }
    .usb-title em {
      color: #d4aa60;
      font-style: italic;
    }

    .usb-tagline-pill {
      display: inline-block;
      background: linear-gradient(135deg, rgba(212,170,96,0.2), rgba(212,170,96,0.05));
      border: 1px solid rgba(212,170,96,0.35);
      padding: 6px 22px;
      font-size: 0.72rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #d4aa60;
      margin-bottom: 28px;
      font-family: 'Jost', 'Montserrat', sans-serif;
    }

    .usb-details-row {
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 28px;
    }

    .usb-detail-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(212,170,96,0.2);
      padding: 16px 24px;
      min-width: 180px;
      backdrop-filter: blur(8px);
    }
    .usb-detail-label {
      font-size: 0.62rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(212,170,96,0.8);
      margin-bottom: 6px;
      font-family: 'Jost', 'Montserrat', sans-serif;
    }
    .usb-detail-value {
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-size: 1.2rem;
      color: #f5efe3;
      font-weight: 500;
    }
    .usb-detail-sub {
      font-size: 0.72rem;
      color: rgba(245,239,227,0.5);
      margin-top: 2px;
      font-family: 'Jost', 'Montserrat', sans-serif;
    }

    .usb-free-badge {
      display: inline-block;
      background: linear-gradient(135deg, #d4aa60 0%, #c47c3a 100%);
      color: #0a0a1a;
      font-family: 'Jost', 'Montserrat', sans-serif;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 12px 40px;
      margin-bottom: 24px;
      position: relative;
      box-shadow: 0 4px 30px rgba(212,170,96,0.3);
    }
    .usb-free-badge::before {
      content: '✦';
      margin-right: 10px;
    }
    .usb-free-badge::after {
      content: '✦';
      margin-left: 10px;
    }

    .usb-benefits {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 32px;
      max-width: 640px;
      margin: 0 auto 28px;
      text-align: left;
    }
    .usb-benefit {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.82rem;
      color: rgba(245,239,227,0.8);
      font-family: 'Jost', 'Montserrat', sans-serif;
      line-height: 1.5;
    }
    .usb-benefit::before {
      content: '🌸';
      flex-shrink: 0;
      font-size: 0.9rem;
    }

    .usb-cta-text {
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-size: 1.1rem;
      color: rgba(245,239,227,0.6);
      font-style: italic;
      margin-bottom: 24px;
      line-height: 1.6;
    }

    .usb-subtitle {
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-size: 1.3rem;
      color: rgba(245,239,227,0.75);
      font-style: italic;
      margin-bottom: 24px;
      line-height: 1.4;
    }

    .usb-coach {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(212,170,96,0.2);
      padding: 12px 28px;
      margin-top: 8px;
    }
    .usb-coach-avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(135deg, #d4aa60, #c47c3a);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      color: #0a0a1a;
      font-weight: 700;
      font-family: 'Cormorant Garamond', serif;
    }
    .usb-coach-info {
      text-align: left;
    }
    .usb-coach-name {
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-size: 1.15rem;
      color: #f5efe3;
      font-weight: 500;
    }
    .usb-coach-title {
      font-size: 0.68rem;
      color: rgba(245,239,227,0.45);
      letter-spacing: 0.05em;
      font-family: 'Jost', 'Montserrat', sans-serif;
    }

    .usb-contact-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
      padding: 12px 32px;
      background: #25D366;
      color: white;
      text-decoration: none;
      font-family: 'Jost', 'Montserrat', sans-serif;
      font-size: 0.8rem;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
    }
    .usb-contact-btn:hover {
      background: #20b85a;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(37,211,102,0.3);
    }

    /* Decorative divider lines */
    .usb-divider {
      width: 60px;
      height: 1px;
      background: linear-gradient(90deg, transparent, #d4aa60, transparent);
      margin: 20px auto;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .usb-inner { padding: 40px 20px; }
      .usb-details-row { flex-direction: column; align-items: center; }
      .usb-detail-card { min-width: 260px; }
      .usb-benefits { grid-template-columns: 1fr; max-width: 320px; }
      .usb-free-badge { font-size: 0.85rem; padding: 10px 28px; }
    }
  `;
  document.head.appendChild(style);

  // Build HTML
  const banner = document.createElement('section');
  banner.className = 'upcoming-session-banner';
  banner.id = 'upcoming-session';
  banner.innerHTML = `
    <div class="usb-inner">
      <div class="usb-eyebrow">Upcoming Session</div>
      <h2 class="usb-title">Special <em>Amavasya Meditation</em></h2>
      <div class="usb-tagline-pill">🌑 ${SESSION_DATA.tagline}</div>

      <div class="usb-details-row">
        <div class="usb-detail-card">
          <div class="usb-detail-label">📅 Date</div>
          <div class="usb-detail-value">${SESSION_DATA.date}</div>
          <div class="usb-detail-sub">Amavasya Night</div>
        </div>
        <div class="usb-detail-card">
          <div class="usb-detail-label">🕘 Time</div>
          <div class="usb-detail-value">${SESSION_DATA.time}</div>
          <div class="usb-detail-sub">${SESSION_DATA.duration}</div>
        </div>
        <div class="usb-detail-card">
          <div class="usb-detail-label">${SESSION_DATA.platformIcon} Platform</div>
          <div class="usb-detail-value">${SESSION_DATA.platform}</div>
          <div class="usb-detail-sub">Join From Anywhere</div>
        </div>
      </div>

      <div class="usb-free-badge">${SESSION_DATA.price}</div>

      <div class="usb-subtitle">"${SESSION_DATA.subtitle}"</div>

      <div class="usb-divider"></div>

      <div style="margin-bottom: 10px; font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; color: #d4aa60; font-family: 'Jost','Montserrat',sans-serif;">Benefits of Amavasya Meditation</div>
      <div class="usb-benefits">
        ${SESSION_DATA.benefits.map(b => `<div class="usb-benefit">${b}</div>`).join('')}
      </div>

      <div class="usb-cta-text">❤️ ${SESSION_DATA.callToAction}</div>

      <div class="usb-coach">
        <div class="usb-coach-avatar">N</div>
        <div class="usb-coach-info">
          <div class="usb-coach-name">Coach ${SESSION_DATA.coachName}</div>
          <div class="usb-coach-title">${SESSION_DATA.coachTitle}</div>
        </div>
      </div>

      <br>
      <a href="https://wa.me/91${SESSION_DATA.phone}?text=Hi%20Neepa%20Ma'am%2C%20I%20want%20to%20join%20the%20Amavasya%20Meditation%20on%20${encodeURIComponent(SESSION_DATA.date)}.%20Please%20share%20the%20Google%20Meet%20link.%20🙏" target="_blank" class="usb-contact-btn">
        📞 Register via WhatsApp — ${SESSION_DATA.phone}
      </a>
    </div>
  `;

  // Insert the banner
  // Strategy: Find the best insertion point depending on the page
  function insertBanner() {
    // For index.html — insert before the footer
    const footer = document.querySelector('footer');
    if (footer) {
      footer.parentNode.insertBefore(banner, footer);
      return;
    }

    // For pages with .container — insert after it
    const containers = document.querySelectorAll('.container, .main');
    if (containers.length > 0) {
      const lastContainer = containers[containers.length - 1];
      lastContainer.parentNode.insertBefore(banner, lastContainer.nextSibling);
      return;
    }

    // For booking page — insert before success overlay or before script
    const successOverlay = document.querySelector('.success-overlay');
    if (successOverlay) {
      successOverlay.parentNode.insertBefore(banner, successOverlay);
      return;
    }

    // Fallback: append to body before closing
    document.body.appendChild(banner);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertBanner);
  } else {
    insertBanner();
  }
})();
