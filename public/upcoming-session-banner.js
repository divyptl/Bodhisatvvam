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
      .usb-details-row { flex-direction: column; align-items: center; }
      .usb-detail-card { min-width: 260px; }
      .usb-benefits { grid-template-columns: 1fr; max-width: 320px; }
      .usb-free-badge { font-size: 0.85rem; padding: 10px 28px; }
      .usb-reg-row { flex-direction: column; }
      .usb-reg-form { padding: 0 8px; }
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
      <div class="usb-reg-label">🙏 Register Now — It's Free</div>
      <div class="usb-reg-form" id="usbRegForm">
        <div class="usb-reg-row">
          <input type="text" class="usb-reg-input" id="usbRegName" placeholder="Your Full Name" maxlength="100">
          <input type="tel" class="usb-reg-input" id="usbRegPhone" placeholder="WhatsApp Number" maxlength="15">
        </div>
        <button class="usb-reg-btn" id="usbRegBtn" onclick="window._usbRegister()">
          🌙 Register for Free Session
        </button>
        <div class="usb-reg-error" id="usbRegError"></div>
      </div>
      <div class="usb-reg-success" id="usbRegSuccess">
        <div class="usb-reg-success-icon">🌸</div>
        <div class="usb-reg-success-title">You're Registered!</div>
        <div class="usb-reg-success-text" id="usbRegSuccessText">
          We'll send the Google Meet link to your WhatsApp before the session.
        </div>
        <div class="usb-reg-success-id" id="usbRegSuccessId"></div>
      </div>
    </div>
  `;

  // Registration form submission handler
  window._usbRegister = async function() {
    const nameEl = document.getElementById('usbRegName');
    const phoneEl = document.getElementById('usbRegPhone');
    const btn = document.getElementById('usbRegBtn');
    const errEl = document.getElementById('usbRegError');
    const form = document.getElementById('usbRegForm');
    const successEl = document.getElementById('usbRegSuccess');

    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    errEl.textContent = '';

    // Validation
    if (!name || name.length < 2) {
      errEl.textContent = 'Please enter your full name.';
      nameEl.focus();
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      errEl.textContent = 'Please enter a valid phone number.';
      phoneEl.focus();
      return;
    }

    // Check if already registered (localStorage)
    const regKey = 'usb_meditation_' + SESSION_DATA.dateISO;
    if (localStorage.getItem(regKey)) {
      errEl.textContent = 'You have already registered for this session! 🌸';
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Registering…';

    try {
      const API = window.location.origin;
      const res = await fetch(API + '/api/meditation-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: digits,
          sessionTitle: SESSION_DATA.title,
          sessionDate: SESSION_DATA.dateISO,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Store in localStorage to prevent re-registration
        localStorage.setItem(regKey, JSON.stringify({ id: data.registrationId, name }));

        // Show success
        form.style.display = 'none';
        document.querySelector('.usb-reg-label').style.display = 'none';
        successEl.classList.add('show');
        document.getElementById('usbRegSuccessText').textContent = data.message;
        document.getElementById('usbRegSuccessId').textContent = 'Registration ID: ' + data.registrationId;
      } else {
        errEl.textContent = data.message || 'Registration failed. Please try again.';
      }
    } catch (e) {
      errEl.textContent = 'Could not connect. Please try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = '🌙 Register for Free Session';
    }
  };

  // Check if already registered on page load
  function checkExistingRegistration() {
    const regKey = 'usb_meditation_' + SESSION_DATA.dateISO;
    const existing = localStorage.getItem(regKey);
    if (existing) {
      try {
        const data = JSON.parse(existing);
        const form = document.getElementById('usbRegForm');
        const label = banner.querySelector('.usb-reg-label');
        const successEl = document.getElementById('usbRegSuccess');
        if (form) form.style.display = 'none';
        if (label) label.style.display = 'none';
        if (successEl) {
          successEl.classList.add('show');
          document.getElementById('usbRegSuccessText').textContent =
            'You\'re all set! We\'ll send the Google Meet link to your WhatsApp before the session.';
          document.getElementById('usbRegSuccessId').textContent =
            'Registration ID: ' + (data.id || '—');
        }
      } catch (e) { /* ignore */ }
    }
  }

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
    document.addEventListener('DOMContentLoaded', () => {
      insertBanner();
      checkExistingRegistration();
    });
  } else {
    insertBanner();
    checkExistingRegistration();
  }
})();
