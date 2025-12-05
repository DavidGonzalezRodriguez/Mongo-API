const fetch = require("node-fetch");
const { MongoClient } = require("mongodb");

// 🔥 TU URI DE ATLAS
const MONGO_URI = "mongodb+srv://David:Alejandria123@cluster0.mumjhqv.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "Proyecto";
const COLLECTION = "hongos";

const PAGE_SIZE = 500;

// 🔥 URL CORRECTA (SIN SALTOS, SIN ESPACIOS, SIN LIMIT=0)
const BASE = "https://api.gbif.org/v1/species/search?kingdomKey=5&rank=SPECIES";

// ---------------------------------------------
// FETCH con reintentos
// ---------------------------------------------
async function safeFetch(url) {
    for (let i = 1; i <= 5; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            return await res.json();
        } catch (e) {
            console.log(`⚠️ Error fetch (${i}/5):`, e.message);
            await new Promise(r => setTimeout(r, 500 * i));
        }
    }
    throw new Error("❌ fetch falló tras 5 intentos");
}

// ---------------------------------------------
// NOMBRE COMÚN EN ESPAÑOL
// ---------------------------------------------
async function getVernacularName(key) {
    const url = `https://api.gbif.org/v1/species/${key}/vernacularNames`;

    try {
        const data = await safeFetch(url);
        if (!data.results) return null;

        for (const v of data.results) {
            const lang = (v.language || "").toLowerCase();
            if (lang.startsWith("es") || lang.includes("span")) {
                return v.vernacularName || null;
            }
        }
    } catch (_) { }

    return null;
}

// ---------------------------------------------
// PROCESO PRINCIPAL
// ---------------------------------------------
async function run() {

    console.log("🔵 Conectando a Mongo...");
    const client = new MongoClient(MONGO_URI);
    await client.connect();

    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION);

    console.log("🧽 Limpiando colección...");
    await col.deleteMany({});

    // Obtener TOTAL correcto
    console.log("📥 Obteniendo count total...");
    const meta = await safeFetch(`${BASE}&limit=0`);
    const total = meta.count || 0;

    console.log(`📌 Total especies fungi (GBIF): ${total}`);

    let offset = 0;
    let totalInsertados = 0;

    while (offset < total) {

        console.log(`📥 Descargando bloque offset=${offset}...`);

        let data;
        try {
            data = await safeFetch(`${BASE}&limit=${PAGE_SIZE}&offset=${offset}`);
        } catch (e) {
            console.log("⏭️ Saltando por error...");
            offset += PAGE_SIZE;
            continue;
        }

        const batch = [];

        for (const sp of data.results) {

            // Garantizar que realmente sean fungi species
            if (sp.kingdomKey !== 5) continue;
            if (sp.rank !== "SPECIES") continue;

            const common = await getVernacularName(sp.key);

            batch.push({
                key: sp.key,
                scientificName: sp.scientificName || null,
                canonicalName: sp.canonicalName || null,
                vernacularName: common || null,

                phylum: sp.phylum || null,
                class: sp.class || null,
                order: sp.order || null,
                family: sp.family || null,
                genus: sp.genus || null,

                updated: new Date()
            });
        }

        if (batch.length > 0) {
            await col.insertMany(batch);
            console.log(`   ✔ Guardadas ${batch.length}`);
        }

        totalInsertados += batch.length;
        offset += PAGE_SIZE;
    }

    console.log("🎉 COMPLETADO — Total final insertado:", totalInsertados);

    await client.close();
}

run().catch(err => console.error("❌ Error:", err));
