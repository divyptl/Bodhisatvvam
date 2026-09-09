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
    title: '21 Days Spiritual Transformation & Healing Journey',
    date: '14th September 2026',
    dateISO: '2026-09-14',
    time: '5:00 AM / 9:30 PM',
    duration: '21 Days of Healing & Transformation',
    platform: 'Online Video Call',
    platformIcon: '📹',
    price: '₹2100 FOR 21 DAYS',
    coachName: 'Neepa Patel',
    coachTitle: 'Life Coach | Pranic Healer | NLP Trainer & Counselor',
    phone: '9824867959',
    tagline: 'Heal • Balance • Manifest • Transform',
    subtitle: 'Release old energies, heal from within and step into a more powerful, peaceful & abundant version of yourself.',
    benefits: [
      'Energy & Body Cleansing',
      'Aura Cleansing & Protection',
      '7 Chakra Balancing',
      'Emotional & Inner Child Healing',
      'Abundance & Money Healing',
      'Manifestation & Intention Activation',
      'Deep Protection & Negative Energy Release',
      'Self-Love & Confidence',
      'Higher Self & Spiritual Connection',
      'Karmic Release & Life Transformation'
    ],
    callToAction: 'Your Healing Journey Starts Here...'
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

    /* Registration form replaces WhatsApp CTA */
    .usb-reg-form {
      max-width: 420px;
      margin: 24px auto 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .usb-reg-label {
      font-size: 0.72rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #d4aa60;
      font-family: 'Jost', 'Montserrat', sans-serif;
      margin-bottom: 4px;
    }
    .usb-reg-row {
      display: flex;
      gap: 12px;
    }
    .usb-reg-input {
      flex: 1;
      padding: 14px 18px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(212,170,96,0.3);
      color: #f5efe3;
      font-family: 'Jost', 'Montserrat', sans-serif;
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.25s, box-shadow 0.25s;
    }
    .usb-reg-input::placeholder {
      color: rgba(245,239,227,0.35);
    }
    .usb-reg-input:focus {
      border-color: #d4aa60;
      box-shadow: 0 0 0 3px rgba(212,170,96,0.15);
    }
    .usb-reg-btn {
      padding: 16px 32px;
      background: linear-gradient(135deg, #d4aa60 0%, #c47c3a 100%);
      color: #0a0a1a;
      border: none;
      font-family: 'Jost', 'Montserrat', sans-serif;
      font-size: 0.88rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    .usb-reg-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(212,170,96,0.35);
    }
    .usb-reg-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .usb-reg-error {
      color: #e09456;
      font-size: 0.82rem;
      font-family: 'Jost', 'Montserrat', sans-serif;
      min-height: 20px;
      text-align: center;
    }

    /* Success state */
    .usb-reg-success {
      display: none;
      text-align: center;
      padding: 20px;
      background: rgba(45,106,79,0.15);
      border: 1px solid rgba(45,106,79,0.3);
      margin-top: 20px;
      max-width: 420px;
      margin-left: auto;
      margin-right: auto;
      animation: usb-fadeIn 0.5s ease;
    }
    .usb-reg-success.show { display: block; }
    .usb-reg-success-icon { font-size: 2.5rem; margin-bottom: 8px; }
    .usb-reg-success-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.4rem;
      color: #a8c5aa;
      margin-bottom: 6px;
    }
    .usb-reg-success-text {
      font-size: 0.85rem;
      color: rgba(245,239,227,0.7);
      line-height: 1.6;
      font-family: 'Jost', 'Montserrat', sans-serif;
    }
    .usb-reg-success-id {
      font-family: 'Cormorant Garamond', serif;
      font-size: 0.95rem;
      color: #d4aa60;
      margin-top: 8px;
    }

    @keyframes usb-fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
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
      .usb-details-row { flex-direction: column; align-items: center; gap: 12px; }
      .usb-detail-card { min-width: auto; width: 100%; max-width: 320px; }
      .usb-benefits { grid-template-columns: 1fr; max-width: 320px; }
      .usb-free-badge { font-size: 0.85rem; padding: 10px 28px; }
      .usb-reg-row { flex-direction: column; }
      .usb-reg-form { padding: 0 8px; }
      .usb-title { font-size: clamp(1.6rem, 4vw, 2.4rem); }
      .usb-subtitle { font-size: 1.1rem; }
      .usb-coach { padding: 10px 20px; flex-wrap: wrap; justify-content: center; }
    }
    @media (max-width: 480px) {
      .usb-inner { padding: 32px 16px; }
      .usb-eyebrow { font-size: 0.6rem; letter-spacing: 0.2em; }
      .usb-tagline-pill { font-size: 0.65rem; padding: 5px 16px; }
      .usb-detail-card { padding: 12px 16px; }
      .usb-detail-value { font-size: 1rem; }
      .usb-benefit { font-size: 0.78rem; }
      .usb-free-badge { font-size: 0.78rem; padding: 10px 20px; }
      .usb-reg-btn { padding: 14px 24px; font-size: 0.82rem; }
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
      <h2 class="usb-title">${SESSION_DATA.title.split('&').map((p, i) => i === 0 ? p + ' & <br><em>' : p + '</em>').join('')}</h2>
      <div class="usb-tagline-pill">✨ ${SESSION_DATA.tagline}</div>

      <div class="usb-details-row">
        <div class="usb-detail-card">
          <div class="usb-detail-label">📅 Date</div>
          <div class="usb-detail-value">${SESSION_DATA.date}</div>
          <div class="usb-detail-sub">Daily Sessions</div>
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

      <div style="margin-bottom: 10px; font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; color: #d4aa60; font-family: 'Jost','Montserrat',sans-serif;">What You Will Experience</div>
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
      <div class="usb-reg-label">🙏 Limited Seats Available</div>
      <div class="usb-reg-form" id="usbRegForm">
        <button class="usb-reg-btn" onclick="window.location.href='/booking.html?session=21%20Days%20Spiritual%20Transformation'">
          🌙 Book Your Journey Now (₹2100)
        </button>
      </div>
    </div>
  `;

  // Insert the banner
  // Strategy: Find the best insertion point depending on the page
  function insertBanner() {
    // For index.html — insert before the diwali section
    const diwaliSection = document.getElementById('diwaliCombo');
    if (diwaliSection) {
      diwaliSection.parentNode.insertBefore(banner, diwaliSection);
      return;
    }

    // Fallback: insert before the footer
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
