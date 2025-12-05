// importFungi.js
import fetch from "node-fetch";
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("❌ ERROR: No has definido MONGO_URI");
    process.exit(1);
}

const client = new MongoClient(MONGO_URI);
const dbName = "Proyecto";
const collectionName = "hongos";

// ============================================
// 🔥 FUNCIÓN QUE HACE FETCH CON REINTENTOS
// ============================================
async function safeFetch(url, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP " + res.status);
            return await res.json();
        } catch (err) {
            console.log(`⚠️ Error fetch (Intento ${i + 1}/${retries}): ${err}`);
            await new Promise(r => setTimeout(r, 1500)); // esperar 1.5s
        }
    }
    throw new Error("❌ ERROR FATAL: fetch falló tras varios intentos");
}

// ============================================
// 🔥 OBTENER NOMBRE COMÚN EN ESPAÑOL
// ============================================
async function obtenerNombreComun(key) {
    const url = `https://api.gbif.org/v1/species/${key}/vernacularNames`;

    try {
        const data = await safeFetch(url);

        for (const n of data.results) {
            const lang = (n.language || "").toLowerCase();
            if (
                lang === "es" ||
                lang === "spa" ||
                lang.includes("span") ||
                lang.includes("espa")
            ) {
                return n.vernacularName;
            }
        }
    } catch {
        return null;
    }

    return null;
}

// ============================================
// 🔥 DESCARGAR TODAS LAS ESPECIES DE FUNGIS
// ============================================
async function run() {
    console.log("🚀 Iniciando importación de hongos desde GBIF...");

    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(collectionName);

    let offset = 0;
    const limit = 300; // bajar carga
    let totalInsertados = 0;

    while (true) {
        const url = `https://api.gbif.org/v1/species/search?kingdomKey=5&rank=SPECIES&limit=${limit}&offset=${offset}`;

        console.log(`📥 Descargando página offset=${offset} ...`);

        const data = await safeFetch(url);

        if (!data.results || data.results.length === 0) {
            console.log("🏁 No hay más resultados. Fin.");
            break;
        }

        const lote = [];

        for (const sp of data.results) {
            const scientificName = sp.scientificName;
            const key = sp.key;

            // nombre común
            const nombreComun = await obtenerNombreComun(key);

            lote.push({
                key: key,
                nombreCientifico: scientificName,
                nombreComun: nombreComun || null
            });
        }

        if (lote.length > 0) {
            await col.insertMany(lote);
            totalInsertados += lote.length;
            console.log(`✅ Insertados ${lote.length} (Total: ${totalInsertados})`);
        }

        offset += limit;
        await new Promise(r => setTimeout(r, 1000)); // pausa anti-baneo

        if (offset > 200000) break; // seguridad
    }

    console.log(`🎉 FINALIZADO. Total insertados: ${totalInsertados}`);
    await client.close();
}

run().catch(err => console.error("❌ Error:", err));
