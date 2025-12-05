
const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db("Proyecto");
        const collection = db.collection("fungi");

        console.log("🔵 Conectado a MongoDB");

        let limit = 300;
        let offset = 0;

        // 👇 SOLO especies aceptadas del reino Fungi
        let total = 1;

        while (offset < total) {

            const url = `https://api.gbif.org/v1/species/search?kingdomKey=5&rank=SPECIES&status=ACCEPTED&limit=${limit}&offset=${offset}`;

            console.log(`📡 Descargando página offset ${offset}`);

            const resp = await fetch(url);
            const data = await resp.json();

            if (offset === 0) total = data.count; // número real de aceptadas

            const results = data.results || [];
            let batch = [];

            for (const item of results) {
                if (!item.key || !item.scientificName) continue;

                let nombreComun = "";

                if (item.vernacularNames) {
                    const esp = item.vernacularNames.find(v =>
                        (v.language || "").toLowerCase().startsWith("es")
                    );
                    const eng = item.vernacularNames.find(v =>
                        (v.language || "").toLowerCase().startsWith("en")
                    );

                    if (esp) nombreComun = esp.vernacularName;
                    else if (eng) nombreComun = eng.vernacularName;
                }

                batch.push({
                    key: item.key,
                    nombreCientifico: item.scientificName,
                    nombreComun
                });
            }

            if (batch.length > 0) {
                const ops = batch.map(doc => ({
                    updateOne: {
                        filter: { key: doc.key },
                        update: { $set: doc },
                        upsert: true
                    }
                }));

                await collection.bulkWrite(ops);
                console.log(`✔ Guardados/actualizados: ${batch.length}`);
            }

            offset += limit;

            await new Promise(r => setTimeout(r, 300)); // evitar ban
        }

        console.log("🎉 IMPORTACIÓN COMPLETA (solo especies aceptadas)");

        process.exit(0);

    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

run();
