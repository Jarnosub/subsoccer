#!/usr/bin/env node
/**
 * Subsoccer QR Sticker Production Generator
 * 
 * Generates:
 * - Unique serial numbers (random 5-char alphanumeric)
 * - EPS vector QR codes for each serial
 * - CSV manifest for InDesign Data Merge
 * - Organized by model in folders
 */

const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================
const MODELS = [
    { prefix: 'S3E', name: 'Subsoccer S3 Edge', count: 1720 },
    { prefix: 'S7B', name: 'Subsoccer S7 - Black', count: 120 },
    { prefix: 'S7W', name: 'Subsoccer S7 - White', count: 80 },
];

const BASE_URL = 'https://subsoccer.pro/instant-play.html';
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // No O/0, I/1/L
const OUTPUT_DIR = path.join(__dirname, 'qr-production-output');

// ============================================
// QR CODE GENERATOR (Pure JS, no dependencies)
// ============================================

// Minimal QR Code generator - generates QR matrix
// Using the qrcode-generator algorithm inline
// We'll use a simpler approach: generate SVG QR codes using a minimal implementation

// Actually, let's generate high-quality EPS using a proper QR library
// First check if qrcode is available, if not use a bundled minimal version

let QRCode;
try {
    QRCode = require('qrcode');
} catch (e) {
    console.log('📦 Installing qrcode package...');
    require('child_process').execSync('npm install qrcode', { stdio: 'inherit', cwd: __dirname });
    // Clear module cache and retry
    delete require.cache[require.resolve?.('qrcode') || 'qrcode'];
    const modulePath = path.join(__dirname, 'node_modules', 'qrcode');
    QRCode = require(modulePath);
}

// ============================================
// SERIAL NUMBER GENERATOR
// ============================================
function generateSerial(prefix) {
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
    }
    return `${prefix}-${code}`;
}

function generateUniqueSerials(prefix, count) {
    const serials = new Set();
    let attempts = 0;
    while (serials.size < count) {
        serials.add(generateSerial(prefix));
        attempts++;
        if (attempts > count * 10) throw new Error('Too many collisions');
    }
    return [...serials].sort();
}

// ============================================
// EPS GENERATOR
// ============================================
async function generateEPS(url, serial) {
    // Generate QR matrix
    const segments = QRCode.create(url, { errorCorrectionLevel: 'H' });
    const modules = segments.modules;
    const size = modules.size;
    const data = modules.data;

    const margin = 4;
    const scale = 10;
    const qrWidth = (size + 2 * margin) * scale;
    const width = qrWidth;
    const height = qrWidth + 50; // Extra space for serial text

    let eps = `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${width} ${height}\n%%Creator: Subsoccer QR Production Generator\n%%Title: ${serial}\n1 1 1 setrgbcolor\n`;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (data[r * size + c]) {
                const x = (c + margin) * scale;
                const y = height - 50 - ((r + margin + 1) * scale);
                eps += `${x} ${y} ${scale} ${scale} rectfill\n`;
            }
        }
    }

    // Serial number text below QR (white)
    eps += `\n/Helvetica-Bold findfont 18 scalefont setfont\n`;
    eps += `${width / 2} 18 moveto\n`;
    eps += `(${serial}) dup stringwidth pop 2 div neg 0 rmoveto show\n`;
    eps += `showpage\n`;

    return eps;
}

// ============================================
// SVG GENERATOR (alternative for InDesign)
// ============================================
async function generateSVG(url, serial) {
    const svgString = await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 4,
        width: 400,
        color: { dark: '#FFFFFF', light: 'none' }
    });

    // Add serial number text below
    const withText = svgString.replace('</svg>',
        `<text x="200" y="430" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="22" fill="#FFFFFF">${serial}</text>\n</svg>`
    ).replace(/height="400"/, 'height="450"').replace(/viewBox="0 0 [^"]*"/, 'viewBox="0 0 400 450"');

    return withText;
}

// ============================================
// MAIN
// ============================================
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('⚽ SUBSOCCER QR STICKER PRODUCTION GENERATOR');
    console.log('═══════════════════════════════════════════════════\n');

    // Create output directory
    if (fs.existsSync(OUTPUT_DIR)) {
        fs.rmSync(OUTPUT_DIR, { recursive: true });
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const allSerials = [];
    let totalGenerated = 0;

    for (const model of MODELS) {
        console.log(`\n📦 ${model.name} (${model.prefix}) — ${model.count} kpl`);

        // Create model directories
        const modelDir = path.join(OUTPUT_DIR, model.prefix);
        const epsDir = path.join(modelDir, 'EPS');
        const svgDir = path.join(modelDir, 'SVG');
        fs.mkdirSync(epsDir, { recursive: true });
        fs.mkdirSync(svgDir, { recursive: true });

        // Generate unique serials
        const serials = generateUniqueSerials(model.prefix, model.count);
        console.log(`   ✅ ${serials.length} uniikkia sarjanumeroa generoitu`);
        console.log(`   📎 Esimerkit: ${serials.slice(0, 3).join(', ')} ... ${serials.slice(-1)[0]}`);

        // Generate QR codes
        let progress = 0;
        for (const serial of serials) {
            const url = `${BASE_URL}?sn=${serial}`;

            // EPS
            const eps = await generateEPS(url, serial);
            const safeName = serial.replace(/[^a-zA-Z0-9_-]/g, '_');
            fs.writeFileSync(path.join(epsDir, `${safeName}.eps`), eps);

            // SVG
            const svg = await generateSVG(url, serial);
            fs.writeFileSync(path.join(svgDir, `${safeName}.svg`), svg);

            allSerials.push({
                serial_number: serial,
                product_model: model.name,
                prefix: model.prefix,
                url: url,
                eps_file: `${model.prefix}/EPS/${safeName}.eps`,
                svg_file: `${model.prefix}/SVG/${safeName}.svg`,
            });

            progress++;
            if (progress % 100 === 0 || progress === serials.length) {
                process.stdout.write(`   ⏳ ${progress}/${serials.length} QR koodeja generoitu\r`);
            }
        }
        console.log(`   ✅ ${serials.length} EPS + SVG tiedostoa luotu`);
        totalGenerated += serials.length;
    }

    // ============================================
    // CSV MANIFEST FOR INDESIGN DATA MERGE
    // ============================================
    console.log('\n📄 Luodaan InDesign Data Merge CSV...');

    // Main manifest with all serials
    const csvHeader = 'serial_number,product_model,prefix,url,@eps_file,@svg_file\n';
    const csvRows = allSerials.map(s =>
        `${s.serial_number},${s.product_model},${s.prefix},${s.url},${s.eps_file},${s.svg_file}`
    ).join('\n');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'data_merge_ALL.csv'), csvHeader + csvRows);

    // Per-model CSV files
    for (const model of MODELS) {
        const modelSerials = allSerials.filter(s => s.prefix === model.prefix);
        const modelCsv = csvHeader + modelSerials.map(s =>
            `${s.serial_number},${s.product_model},${s.prefix},${s.url},${s.eps_file},${s.svg_file}`
        ).join('\n');
        fs.writeFileSync(path.join(OUTPUT_DIR, `data_merge_${model.prefix}.csv`), modelCsv);
    }

    // ============================================
    // SUPABASE INSERT SCRIPT
    // ============================================
    console.log('📄 Luodaan Supabase insert SQL...');

    let sql = `-- Subsoccer QR Production Batch\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n`;
    sql += `-- Total: ${totalGenerated} serial numbers\n\n`;

    for (const model of MODELS) {
        const modelSerials = allSerials.filter(s => s.prefix === model.prefix);
        sql += `-- ${model.name}: ${modelSerials.length} kpl\n`;
        sql += `INSERT INTO hardware_registry (serial_number, product_model, product_category, batch_id, is_claimed) VALUES\n`;
        sql += modelSerials.map((s, i) =>
            `  ('${s.serial_number}', '${model.name}', 'table', 'PRODUCTION-2026Q3', false)${i < modelSerials.length - 1 ? ',' : ';'}`
        ).join('\n');
        sql += '\n\n';
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'insert_hardware_registry.sql'), sql);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ VALMIS!\n');
    console.log(`📁 Output: ${OUTPUT_DIR}/`);
    console.log(`   ├── data_merge_ALL.csv          (InDesign Data Merge, kaikki ${totalGenerated})`);
    for (const model of MODELS) {
        console.log(`   ├── data_merge_${model.prefix}.csv         (${model.count} kpl)`);
    }
    console.log(`   ├── insert_hardware_registry.sql (Supabase SQL insert)`);
    for (const model of MODELS) {
        const count = allSerials.filter(s => s.prefix === model.prefix).length;
        console.log(`   ├── ${model.prefix}/EPS/                    (${count} vektori-EPS)`);
        console.log(`   ├── ${model.prefix}/SVG/                    (${count} vektori-SVG)`);
    }

    console.log('\n📋 InDesign Data Merge ohje:');
    console.log('   1. Avaa tarra-template InDesignissa');
    console.log('   2. Window → Utilities → Data Merge');
    console.log('   3. Select Data Source → valitse data_merge_S3E.csv (tai ALL)');
    console.log('   4. Luo kuvaframe → raahaa @eps_file tai @svg_file kenttä siihen');
    console.log('   5. Create Merged Document → One Record Per Page');
    console.log('   6. Export PDF/X-4 painoon');
    console.log('═══════════════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
