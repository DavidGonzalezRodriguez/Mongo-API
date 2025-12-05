const fs = require("fs");
const readline = require("readline");
const { MongoClient } = require("mongodb");

// CONFIG
const MONGO_URI = "mongodb+srv://David:Alejandria123@cluster0.mumjhqv.mongodb.net/?retryWrites=true&w=majority";
const DB_NAME = "Proyecto";
const COLLECTION = "hongos";

const TAXON_FILE = "./backbone/taxon.tsv";
const VERNACULAR_FILE = "./backbone/vernacularname.tsv";

function createLimiter(max) {
    let active = 0;
    const queue = [];

    const run = async (fn) => {
        if (active >= max) await new Promise(r => queue.push(r));
        active++;
        try { return await fn(); }
        finally {
            active--;
            if (queue.length) queue.shift()();
        }
    };
    return run;
}

// =======================
// 🔥 NORMALIZADOR GLOBAL
// =======================
function normalizar(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")   // quitar acentos
        .replace(/[^a-z0-9 ]/g, " ")       // quitar símbolos
        .replace(/\s+/g, " ")              // espacios dobles
        .trim();
}

// Variantes españolas
const spanishVariants = new Set([
    "es", "spa", "spanish",
    "es-es", "es-mx", "es-ar", "es-cl",
    "es-co", "es-pe", "es-ec", "es-uy",
    "español", "castellano"
]);

// FILTROS TAXONÓMICOS REALES DE HONGOS
const phylaValidos = new Set([
    "Basidiomycota",
    "Ascomycota"
]);

const clasesValidas = new Set([
    "Agaricomycetes",
    "Leotiomycetes",
    "Sordariomycetes",
    "Dothideomycetes",
    "Eurotiomycetes",
    "Pezizomycetes"
]);

const ordenesValidos = new Set([
    "Agaricales",
    "Boletales",
    "Russulales",
    "Polyporales",
    "Cantharellales",
    "Pezizales",
    "Helotiales",
    "Hypocreales",
    "Eurotiales"
]);

const ranksValidos = new Set([
    "species",
    "subspecies",
    "variety",
    "form",
    "forma",
    "infraspecificname",
    "infraspecific epithet"
]);

// ----------- 1) Obtener taxonIDs válidos de hongos ----------
async function obtenerTaxonIdsHongo() {
    const set = new Set();
    const rl = readline.createInterface({
        input: fs.createReadStream(TAXON_FILE),
        crlfDelay: Infinity
    });

    let header = [];

    for await (const line of rl) {
        if (!line.trim()) continue;
        const cols = line.split("\t");

        if (header.length === 0) {
            header = cols;
            continue;
        }

        const obj = {};
        for (let i = 0; i < header.length; i++) obj[header[i]] = cols[i] || "";

        // Filtros reales de hongos
        if (obj.kingdom !== "Fungi") continue;
        if (!phylaValidos.has(obj.phylum)) continue;
        if (!clasesValidas.has(obj.class)) continue;
        if (!ordenesValidos.has(obj.order)) continue;
        if (!ranksValidos.has((obj.taxonRank || "").toLowerCase())) continue;

        if (!obj.genericName || !obj.specificEpithet) continue;

        const sc = obj.scientificName || "";
        if (sc.startsWith("SH") || sc.startsWith("OTU")) continue;

        const lower = sc.toLowerCase();
        if (lower.includes("environmental") || lower.includes("uncultured")) continue;

        set.add(obj.taxonID);
    }

    return set;
}

// ----------- 2) Cargar nombres comunes ES ----------
async function cargarNombresComunesFiltrados(hongoIDs) {
    const map = new Map();

    const rl = readline.createInterface({
        input: fs.createReadStream(VERNACULAR_FILE),
        crlfDelay: Infinity
    });

    let header = [];

    for await (const line of rl) {
        if (!line.trim()) continue;
        const cols = line.split("\t");

        if (header.length === 0) {
            header = cols;
            continue;
        }

        const obj = {};
        for (let i = 0; i < header.length; i++) obj[header[i]] = cols[i] || "";

        const lang = (obj.language || "").toLowerCase();

        if (spanishVariants.has(lang) && hongoIDs.has(obj.taxonID)) {
            if (!map.has(obj.taxonID)) map.set(obj.taxonID, obj.vernacularName);
        }
    }

    return map;
}

// ----------- 3) Importar en Mongo ----------
async function importarTaxones(mapVernacular, col) {
    const rl = readline.createInterface({
        input: fs.createReadStream(TAXON_FILE),
        crlfDelay: Infinity
    });

    const insertLimiter = createLimiter(6);
    let header = [];
    let batch = [];
    let total = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;
        const cols = line.split("\t");

        if (header.length === 0) {
            header = cols;
            continue;
        }

        const obj = {};
        for (let i = 0; i < header.length; i++) obj[header[i]] = cols[i] || "";

        // Filtros EXACTOS
        if (obj.kingdom !== "Fungi") continue;
        if (!phylaValidos.has(obj.phylum)) continue;
        if (!clasesValidas.has(obj.class)) continue;
        if (!ordenesValidos.has(obj.order)) continue;
        if (!ranksValidos.has((obj.taxonRank || "").toLowerCase())) continue;
        if (!obj.genericName || !obj.specificEpithet) continue;

        const sc = obj.scientificName || "";
        if (sc.startsWith("SH") || sc.startsWith("OTU")) continue;

        const lower = sc.toLowerCase();
        if (lower.includes("environmental") || lower.includes("uncultured")) continue;

        const vern = mapVernacular.get(obj.taxonID) || null;

        batch.push({
            _id: obj.taxonID,
            scientificName: obj.scientificName,
            vernacularName: vern,

            // 🔥 CAMPOS NORMALIZADOS PARA BÚSQUEDA PARCIAL
            scientificNameNorm: normalizar(obj.scientificName),
            vernacularNameNorm: normalizar(vern || "")
        });

        if (batch.length >= 2000) {
            const chunk = batch;
            batch = [];

            insertLimiter(async () => {
                try { await col.insertMany(chunk, { ordered: false }); }
                catch (e) { if (e.code !== 11000) throw e; }
            });

            total += chunk.length;
        }
    }

    if (batch.length) {
        await col.insertMany(batch, { ordered: false });
        total += batch.length;
    }

    return total;
}

// ----------- MAIN ----------
async function run() {
    console.log("🔵 Conectando a Mongo...");
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const col = client.db(DB_NAME).collection(COLLECTION);

    await col.deleteMany({});

    console.log("📌 1) Filtrando hongos reales...");
    const hongoIDs = await obtenerTaxonIdsHongo();
    console.log("✔ Hongos válidos:", hongoIDs.size);

    console.log("📌 2) Cargando nombres comunes ES...");
    const mapVernacular = await cargarNombresComunesFiltrados(hongoIDs);
    console.log("✔ Nombres comunes ES:", mapVernacular.size);

    console.log("📌 3) Importando en Mongo...");
    const total = await importarTaxones(mapVernacular, col);

    console.log("🎉 FIN | Especies importadas:", total);

    await client.close();
}

run().catch(console.error);
