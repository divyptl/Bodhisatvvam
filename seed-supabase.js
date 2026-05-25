/**
 * seed-supabase.js — One-time migration script
 * 
 * Reads your existing JSON files and uploads everything to Supabase.
 * Run this ONCE after setting up your Supabase project:
 * 
 *   set SUPABASE_URL=https://your-project.supabase.co
 *   set SUPABASE_SERVICE_KEY=eyJhbG...
 *   node seed-supabase.js
 */

// (dotenv omitted as variables are passed directly)
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables first.');
    console.error('   Example (PowerShell):');
    console.error('   $env:SUPABASE_URL="https://your-project.supabase.co"');
    console.error('   $env:SUPABASE_SERVICE_KEY="eyJhbG..."');
    console.error('   node seed-supabase.js');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PRODUCTS_FILE = path.join(__dirname, 'public', 'data', 'products.json');
const CATEGORIES_FILE = path.join(__dirname, 'public', 'data', 'categories.json');
const SITE_CONTENT_FILE = path.join(__dirname, 'public', 'data', 'site-content.json');

function readJSON(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { return null; }
}

async function seed() {
    console.log('🌱 Seeding Supabase with local data...\n');

    // 1. Categories
    const categories = readJSON(CATEGORIES_FILE);
    if (categories && categories.length > 0) {
        const rows = categories.map(c => ({
            id: c.id, name: c.name, emoji: c.emoji || '📦',
            description: c.desc || '', default_product_desc: c.defaultProductDesc || '',
            id_prefix: c.idPrefix, display_order: c.displayOrder || 1
        }));
        const { error } = await supabase.from('categories').upsert(rows, { onConflict: 'id' });
        if (error) console.error('❌ Categories:', error.message);
        else console.log(`✅ ${rows.length} categories seeded`);
    } else {
        console.log('⏭️  No categories to seed');
    }

    // 2. Products
    const products = readJSON(PRODUCTS_FILE);
    if (products && products.length > 0) {
        const rows = products.map(p => ({
            id: p.id, name: p.name, emoji: p.emoji || '📦',
            category: p.category, description: p.desc || '',
            price: p.price, rating: p.rating || 5,
            badge: p.badge || '', images: p.images || []
        }));
        const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });
        if (error) console.error('❌ Products:', error.message);
        else console.log(`✅ ${rows.length} products seeded`);
    } else {
        console.log('⏭️  No products to seed');
    }

    // 3. Site Content
    const content = readJSON(SITE_CONTENT_FILE);
    if (content && Object.keys(content).length > 0) {
        const rows = Object.entries(content).map(([section, data]) => ({
            section, data, updated_at: new Date().toISOString()
        }));
        const { error } = await supabase.from('site_content').upsert(rows, { onConflict: 'section' });
        if (error) console.error('❌ Site content:', error.message);
        else console.log(`✅ ${rows.length} content sections seeded`);
    } else {
        console.log('⏭️  No site content to seed');
    }

    console.log('\n🎉 Seeding complete! Your Supabase database is ready.');
}

seed().catch(e => console.error('Fatal:', e));
