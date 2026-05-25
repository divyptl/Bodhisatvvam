/**
 * supabase-sync.js — Supabase sync layer for Bodhisatvvam
 * 
 * Provides background sync functions. The server still reads/writes
 * local JSON files for speed. Supabase is the persistent backup that
 * survives Render restarts.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = (SUPABASE_URL && SUPABASE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

const DATA_DIR = path.join(__dirname, 'public', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SITE_CONTENT_FILE = path.join(DATA_DIR, 'site-content.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

// ── MAPPERS ──────────────────────────────────────────────

function productToDb(p) {
    return {
        id: p.id, name: p.name, emoji: p.emoji || '📦',
        category: p.category, description: p.desc || '',
        price: p.price, rating: p.rating || 5,
        badge: p.badge || '', images: p.images || []
    };
}

function dbToProduct(row) {
    return {
        id: row.id, name: row.name, emoji: row.emoji,
        category: row.category, desc: row.description,
        price: parseFloat(row.price), rating: row.rating,
        badge: row.badge, images: row.images || []
    };
}

function categoryToDb(c) {
    return {
        id: c.id, name: c.name, emoji: c.emoji || '📦',
        description: c.desc || '', default_product_desc: c.defaultProductDesc || '',
        id_prefix: c.idPrefix, display_order: c.displayOrder || 1
    };
}

function dbToCategory(row) {
    return {
        id: row.id, name: row.name, emoji: row.emoji,
        desc: row.description, defaultProductDesc: row.default_product_desc,
        idPrefix: row.id_prefix, displayOrder: row.display_order
    };
}

// ── PULL FROM SUPABASE → LOCAL JSON (runs on startup) ────

async function pullFromSupabase() {
    if (!supabase) return;
    console.log('🔄 Syncing data from Supabase...');

    try {
        // Products
        const { data: products, error: pErr } = await supabase
            .from('products').select('*').order('id');
        if (!pErr && products && products.length > 0) {
            const mapped = products.map(dbToProduct);
            fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(mapped, null, 2), 'utf-8');
            console.log(`   ✅ ${products.length} products synced`);
        } else if (pErr) {
            console.warn('   ⚠️ Products sync error:', pErr.message);
        } else {
            console.log('   ℹ️ No products in Supabase yet (using local JSON)');
        }
    } catch (e) { console.warn('   ⚠️ Products sync failed:', e.message); }

    try {
        // Categories
        const { data: categories, error: cErr } = await supabase
            .from('categories').select('*').order('display_order');
        if (!cErr && categories && categories.length > 0) {
            const mapped = categories.map(dbToCategory);
            fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(mapped, null, 2), 'utf-8');
            console.log(`   ✅ ${categories.length} categories synced`);
        } else if (cErr) {
            console.warn('   ⚠️ Categories sync error:', cErr.message);
        } else {
            console.log('   ℹ️ No categories in Supabase yet (using local JSON)');
        }
    } catch (e) { console.warn('   ⚠️ Categories sync failed:', e.message); }

    try {
        // Site Content
        const { data: content, error: sErr } = await supabase
            .from('site_content').select('*');
        if (!sErr && content && content.length > 0) {
            const obj = {};
            content.forEach(row => { obj[row.section] = row.data; });
            fs.writeFileSync(SITE_CONTENT_FILE, JSON.stringify(obj, null, 2), 'utf-8');
            console.log(`   ✅ ${content.length} content sections synced`);
        } else if (sErr) {
            console.warn('   ⚠️ Site content sync error:', sErr.message);
        } else {
            console.log('   ℹ️ No site content in Supabase yet (using local JSON)');
        }
    } catch (e) { console.warn('   ⚠️ Site content sync failed:', e.message); }

    try {
        // Customers
        const { data: customers, error: custErr } = await supabase.from('customers').select('*');
        if (!custErr && customers) {
            fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(customers, null, 2), 'utf-8');
            console.log(`   ✅ ${customers.length} customers synced`);
        }
    } catch (e) { console.warn('   ⚠️ Customers sync failed:', e.message); }

    console.log('🔄 Supabase sync complete.');
}

// ── PUSH TO SUPABASE (fire-and-forget after local writes) ─

async function syncProduct(product, action = 'upsert') {
    if (!supabase) return;
    try {
        if (action === 'delete') {
            await supabase.from('products').delete().eq('id', product);
        } else {
            await supabase.from('products').upsert(productToDb(product), { onConflict: 'id' });
        }
    } catch (e) { console.error('⚠️ Product sync failed:', e.message); }
}

async function syncBulkProducts(products) {
    if (!supabase) return;
    try {
        const rows = products.map(productToDb);
        await supabase.from('products').upsert(rows, { onConflict: 'id' });
    } catch (e) { console.error('⚠️ Bulk product sync failed:', e.message); }
}

async function syncCategory(category, action = 'upsert') {
    if (!supabase) return;
    try {
        if (action === 'delete') {
            await supabase.from('categories').delete().eq('id', category);
        } else {
            await supabase.from('categories').upsert(categoryToDb(category), { onConflict: 'id' });
        }
    } catch (e) { console.error('⚠️ Category sync failed:', e.message); }
}

async function syncAllCategories(categories) {
    if (!supabase) return;
    try {
        // Delete all then re-insert (simple approach for full sync)
        await supabase.from('categories').delete().neq('id', '___never___');
        if (categories.length > 0) {
            await supabase.from('categories').insert(categories.map(categoryToDb));
        }
    } catch (e) { console.error('⚠️ Categories sync failed:', e.message); }
}

async function syncSiteContent(section, data) {
    if (!supabase) return;
    try {
        await supabase.from('site_content').upsert(
            { section, data, updated_at: new Date().toISOString() },
            { onConflict: 'section' }
        );
    } catch (e) { console.error('⚠️ Site content sync failed:', e.message); }
}

async function syncAllSiteContent(content) {
    if (!supabase) return;
    try {
        const rows = Object.entries(content).map(([section, data]) => ({
            section, data, updated_at: new Date().toISOString()
        }));
        await supabase.from('site_content').upsert(rows, { onConflict: 'section' });
    } catch (e) { console.error('⚠️ Full site content sync failed:', e.message); }
}

async function syncCustomer(customer) {
    if (!supabase) return;
    try {
        await supabase.from('customers').upsert(customer, { onConflict: 'phone' });
    } catch (e) { console.error('⚠️ Customer sync failed:', e.message); }
}

// ── IMAGE STORAGE ────────────────────────────────────────

const BUCKET = 'product-images';

async function uploadImageToStorage(productId, fileBuffer, originalName) {
    if (!supabase) return null;
    try {
        const ext = path.extname(originalName).toLowerCase();
        const fileName = `${productId}/${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}${ext}`;

        const { data, error } = await supabase.storage
            .from(BUCKET)
            .upload(fileName, fileBuffer, {
                contentType: `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`,
                upsert: false
            });

        if (error) { console.error('Image upload error:', error.message); return null; }

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
        return urlData?.publicUrl || null;
    } catch (e) {
        console.error('Image upload failed:', e.message);
        return null;
    }
}

async function deleteImageFromStorage(imageUrl) {
    if (!supabase || !imageUrl) return;
    try {
        // Extract path from full URL: https://xxx.supabase.co/storage/v1/object/public/product-images/123/file.jpg
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const idx = imageUrl.indexOf(marker);
        if (idx === -1) return; // Not a Supabase URL, skip
        const filePath = imageUrl.substring(idx + marker.length);
        await supabase.storage.from(BUCKET).remove([filePath]);
    } catch (e) { console.error('Image delete failed:', e.message); }
}

// ── ORDER/BOOKING SYNC ───────────────────────────────────

async function saveOrder(orderData) {
    if (!supabase) return;
    try {
        await supabase.from('orders').upsert(orderData, { onConflict: 'order_id' });
    } catch (e) { console.error('⚠️ Order DB save failed:', e.message); }
}

async function saveBooking(bookingData) {
    if (!supabase) return;
    try {
        await supabase.from('bookings').upsert(bookingData, { onConflict: 'booking_id' });
    } catch (e) { console.error('⚠️ Booking DB save failed:', e.message); }
}

// ── EXPORTS ──────────────────────────────────────────────

module.exports = {
    supabase,
    isConfigured: !!supabase,
    pullFromSupabase,
    syncProduct,
    syncBulkProducts,
    syncCategory,
    syncAllCategories,
    syncSiteContent,
    syncAllSiteContent,
    syncCustomer,
    uploadImageToStorage,
    deleteImageFromStorage,
    saveOrder,
    saveBooking,
};
