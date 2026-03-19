// ═══════════════════════════════════════════════════════════════
//  Bodhisatvvam — Frontend JavaScript Patch
//  Drop this entire <script> block into bodhisatvam.html,
//  replacing your existing <script> section at the bottom.
//
//  Changes from v1:
//    ✅ Single API_BASE constant — change URL in ONE place
//    ✅ Frontend form validation before hitting the server
//    ✅ Loading state on the "Place Order" button
//    ✅ Order ID comes from server response (no mismatch)
//    ✅ Sticky cart icon with live item-count badge
//    ✅ searchProducts renamed (no name collision)
//    ✅ addEventListener used instead of inline onkeyup
//    ✅ Mobile CSS fix for "Pure Energy" rotating visual
// ═══════════════════════════════════════════════════════════════


// ── CONFIG ────────────────────────────────────────────────────
// ⚠️  Replace this with your actual Render URL.
// This is the ONLY place you need to change it.
const API_BASE = 'https://YOUR-RENDER-APP-NAME.onrender.com';


// ── CART STATE ────────────────────────────────────────────────
let cart = [];


// ── CART FUNCTIONS ────────────────────────────────────────────

/**
 * Adds an item to the cart and refreshes the UI.
 */
function addToCart(name, price) {
    const existing = cart.find(i => i.name === name);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ name, price, qty: 1 });
    }
    updateCart();
    showCartBadge();
}

/**
 * Removes an item from the cart by name.
 */
function removeFromCart(name) {
    cart = cart.filter(i => i.name !== name);
    updateCart();
}

/**
 * Re-renders the cart sidebar and updates the badge count.
 * Call this after any cart mutation.
 */
function updateCart() {
    const cartItems  = document.getElementById('cartItems');
    const cartTotal  = document.getElementById('cartTotal');
    const cartCount  = document.getElementById('cartCount');   // badge on sticky icon
    const cartBadge  = document.getElementById('stickyCartBadge'); // sticky badge

    if (!cartItems) return;

    const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

    // Update badge
    if (cartCount)  cartCount.textContent  = totalItems;
    if (cartBadge)  cartBadge.textContent  = totalItems;
    if (cartBadge)  cartBadge.style.display = totalItems > 0 ? 'flex' : 'none';

    // Render cart items
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart-msg">Your cart is empty 🌸</p>';
        if (cartTotal) cartTotal.textContent = '₹0';
        return;
    }

    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-qty">x${item.qty}</span>
            </div>
            <div class="cart-item-right">
                <span class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</span>
                <button class="cart-remove-btn" onclick="removeFromCart('${item.name}')" title="Remove">✕</button>
            </div>
        </div>
    `).join('');

    if (cartTotal) cartTotal.textContent = '₹' + totalPrice.toLocaleString('en-IN');
}

/**
 * Briefly animates the sticky cart icon to draw attention after adding an item.
 */
function showCartBadge() {
    const stickyCart = document.getElementById('stickyCart');
    if (!stickyCart) return;
    stickyCart.classList.add('cart-bump');
    setTimeout(() => stickyCart.classList.remove('cart-bump'), 400);
}


// ── CHECKOUT VALIDATION ───────────────────────────────────────

/**
 * Validates the checkout form fields.
 * Returns { valid: boolean, errors: string[] }
 */
function validateCheckoutForm() {
    const name    = document.getElementById('checkoutName')?.value.trim()    || '';
    const phone   = document.getElementById('checkoutPhone')?.value.trim()   || '';
    const address = document.getElementById('checkoutAddress')?.value.trim() || '';
    const errors  = [];

    if (name.length < 2)
        errors.push('Please enter your full name (at least 2 characters).');

    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 13)
        errors.push('Please enter a valid 10-digit phone number.');

    if (address.length < 10)
        errors.push('Please enter your full delivery address.');

    if (cart.length === 0)
        errors.push('Your cart is empty. Please add items before checking out.');

    return { valid: errors.length === 0, errors };
}

/**
 * Shows or clears a validation error message in the checkout form.
 */
function setCheckoutError(message) {
    let el = document.getElementById('checkoutError');
    if (!el) {
        // Create the error element if it doesn't exist in the HTML
        el = document.createElement('p');
        el.id = 'checkoutError';
        el.style.cssText = 'color:#c0392b; font-size:0.9rem; margin: 8px 0; text-align:center;';
        const btn = document.getElementById('placeOrderBtn');
        if (btn) btn.parentNode.insertBefore(el, btn);
    }
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
}


// ── PLACE ORDER ───────────────────────────────────────────────

/**
 * Main checkout function — validates, sends to backend, shows result.
 * The order ID displayed to the customer comes from the SERVER response,
 * ensuring it matches what's in the Google Sheet.
 */
async function placeOrder() {
    const btn = document.getElementById('placeOrderBtn');

    // 1. Frontend validation
    const { valid, errors } = validateCheckoutForm();
    if (!valid) {
        setCheckoutError(errors[0]); // Show the first error
        return;
    }
    setCheckoutError(''); // Clear any previous error

    // 2. Collect form data
    const name    = document.getElementById('checkoutName').value.trim();
    const phone   = document.getElementById('checkoutPhone').value.trim();
    const address = document.getElementById('checkoutAddress').value.trim();
    const total   = '₹' + cart.reduce((sum, i) => sum + (i.price * i.qty), 0).toLocaleString('en-IN');

    const orderData = { name, phone, address, items: cart, total };

    // 3. Set loading state
    const originalText    = btn.textContent;
    btn.textContent       = '⏳ Placing Order…';
    btn.disabled          = true;
    btn.style.opacity     = '0.7';
    btn.style.cursor      = 'not-allowed';

    try {
        // 4. Send to server
        const response = await fetch(`${API_BASE}/api/order`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(orderData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // 5. SUCCESS — use the server-returned orderId (matches the Sheet!)
            const serverOrderId = data.orderId || '#BDH-????';
            const successEl     = document.getElementById('successOrderId');
            if (successEl) successEl.textContent = serverOrderId;

            closeCheckout();

            setTimeout(() => {
                const overlay = document.getElementById('successOverlay');
                if (overlay) overlay.classList.add('open');
                cart = [];
                updateCart();
            }, 300);

        } else {
            // 6. Server returned an error with a message
            setCheckoutError(data.message || 'Something went wrong. Please try again.');
        }

    } catch (networkError) {
        // 7. Network failure (server unreachable)
        console.error('Connection failed:', networkError.message);
        setCheckoutError(
            'Could not connect to the server. Please check your internet connection or contact us on WhatsApp.'
        );
    } finally {
        // 8. Always restore the button
        btn.textContent   = originalText;
        btn.disabled      = false;
        btn.style.opacity = '1';
        btn.style.cursor  = 'pointer';
    }
}


// ── SEARCH ────────────────────────────────────────────────────

/**
 * Filters product cards by the search input.
 * Renamed from filterProducts to avoid name collision with category tabs.
 * Uses addEventListener below (no inline onkeyup needed in HTML).
 */
function searchProducts() {
    const input        = document.getElementById('searchBar')?.value.toLowerCase() || '';
    const productCards = document.querySelectorAll('.product-card');

    productCards.forEach(card => {
        const matches = card.innerText.toLowerCase().includes(input);
        card.style.display = matches ? '' : 'none';
    });
}


// ── MOBILE CSS FIX: ROTATING VISUAL ──────────────────────────

/**
 * Injects the CSS fix for the "Pure Energy" rotating visual
 * that breaks on mobile due to absolute positioning.
 * This avoids touching the main stylesheet.
 */
function injectMobileFix() {
    const style = document.createElement('style');
    style.textContent = `
        /* ── Mobile Fix: Rotating "Pure Energy" Visual ── */

        /* Parent must be relative so absolute children are contained */
        .pure-energy-container,
        .rotating-visual-wrapper {
            position: relative !important;
            overflow: hidden;
            width: 100%;
        }

        /* Center the rotating element using transform instead of raw top/left */
        .rotating-visual,
        .pure-energy-rotate {
            position: absolute;
            top:  50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(0deg);
            animation: spinEnergy 12s linear infinite;
        }

        @keyframes spinEnergy {
            from { transform: translate(-50%, -50%) rotate(0deg);   }
            to   { transform: translate(-50%, -50%) rotate(360deg); }
        }

        /* Stack layout on small screens */
        @media (max-width: 768px) {
            .pure-energy-container,
            .rotating-visual-wrapper {
                min-height: 280px; /* Ensure the container has height on mobile */
            }

            .rotating-visual,
            .pure-energy-rotate {
                width: 80vw;
                height: 80vw;
                max-width: 280px;
                max-height: 280px;
            }
        }

        /* ── Sticky Cart Icon ── */
        #stickyCart {
            position: fixed;
            bottom: 28px;
            right: 24px;
            z-index: 9999;
            background: #2c2c2c;
            color: #fff;
            border: none;
            border-radius: 50%;
            width: 56px;
            height: 56px;
            font-size: 1.4rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.35);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        #stickyCart:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 28px rgba(0,0,0,0.4);
        }
        #stickyCart.cart-bump {
            animation: cartBump 0.4s ease;
        }
        @keyframes cartBump {
            0%   { transform: scale(1);    }
            40%  { transform: scale(1.25); }
            70%  { transform: scale(0.95); }
            100% { transform: scale(1);    }
        }
        #stickyCartBadge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: #c0392b;
            color: #fff;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 0.7rem;
            font-weight: 700;
            display: none;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        }

        /* ── Cart Item Styling ── */
        .cart-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .cart-item-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .cart-item-name  { font-weight: 600; font-size: 0.92rem; }
        .cart-item-qty   { font-size: 0.78rem; opacity: 0.6; }
        .cart-item-right {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .cart-item-price { font-size: 0.9rem; }
        .cart-remove-btn {
            background: transparent;
            border: none;
            color: #c0392b;
            cursor: pointer;
            font-size: 0.85rem;
            padding: 2px 5px;
            border-radius: 4px;
            transition: background 0.15s;
        }
        .cart-remove-btn:hover { background: rgba(192,57,43,0.15); }
        .empty-cart-msg { text-align: center; opacity: 0.5; padding: 20px 0; font-size: 0.9rem; }
    `;
    document.head.appendChild(style);
}


// ── STICKY CART HTML INJECTION ────────────────────────────────

/**
 * Injects the sticky floating cart button into the page.
 * Clicking it opens the existing cart sidebar/panel.
 */
function injectStickyCart() {
    const existing = document.getElementById('stickyCart');
    if (existing) return; // Don't duplicate

    const btn = document.createElement('button');
    btn.id          = 'stickyCart';
    btn.title       = 'View Cart';
    btn.innerHTML   = `🛒<span id="stickyCartBadge">0</span>`;
    btn.addEventListener('click', () => {
        // Opens whichever cart panel/sidebar your HTML uses
        const cartPanel = document.getElementById('cartSidebar')
                       || document.getElementById('cart')
                       || document.getElementById('cartPanel');
        if (cartPanel) {
            cartPanel.classList.toggle('open');
            cartPanel.classList.toggle('active');
        }
    });
    document.body.appendChild(btn);
}


// ── INIT ──────────────────────────────────────────────────────

/**
 * Runs after the DOM is ready.
 * Attaches all event listeners and injects UI enhancements.
 */
document.addEventListener('DOMContentLoaded', () => {

    // 1. Inject CSS fixes
    injectMobileFix();

    // 2. Inject sticky cart button
    injectStickyCart();

    // 3. Wire up search bar (no inline onkeyup needed in HTML)
    const searchBar = document.getElementById('searchBar');
    if (searchBar) {
        searchBar.addEventListener('keyup', searchProducts);
        searchBar.addEventListener('input', searchProducts); // Also catches paste
    }

    // 4. Wire up place order button (if not using inline onclick)
    const orderBtn = document.getElementById('placeOrderBtn');
    if (orderBtn) {
        // Remove any existing inline handler to prevent double-fire
        orderBtn.removeAttribute('onclick');
        orderBtn.addEventListener('click', placeOrder);
    }

    // 5. Initial cart render
    updateCart();

    console.log('🌸 Bodhisatvvam frontend initialized.');
});
