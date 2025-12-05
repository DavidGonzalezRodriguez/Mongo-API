const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// MongoDB - Usar variable de entorno en Render
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db;

// Conexión global — SOLO UNA VEZ
async function conectarBD() {
    try {
        await client.connect();
        db = client.db("Proyecto"); // <<-- Nombre de TU base
        console.log("🔵 Conectado a MongoDB");
    } catch (err) {
        console.error("❌ Error conectando a MongoDB:", err);
    }
}

conectarBD();

// (el resto de tu código sigue igual...)


const collectionCuaderno = "cuaderno";
const collectionUsuarios = "usuarios";

// Validar ObjectId
function isValidObjectId(id) {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

// ---------------- LOGIN ----------------
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const usuarios = db.collection(collectionUsuarios);
        const usuario = await usuarios.findOne({ email });

        if (!usuario)
            return res.json({ success: false, message: "Usuario no encontrado" });

        if (usuario.password !== password)
            return res.json({ success: false, message: "Contraseña incorrecta" });

        res.json({ success: true, message: "Login exitoso" });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error en login" });
    }
});

// ---------------- CUADERNO ----------------

// GET todos los elementos
app.get("/cuaderno", async (req, res) => {
    try {
        const cuaderno = db.collection(collectionCuaderno);
        const elementos = await cuaderno.find().toArray();

        console.log("📌 ELEMENTOS ENVIADOS:", elementos);

        res.json(elementos);
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error cargando elementos" });
    }
});

// POST nuevo elemento
app.post("/cuaderno", async (req, res) => {
    try {
        const nuevo = req.body;

        if (nuevo.fecha) nuevo.fecha = new Date(nuevo.fecha);
        if (nuevo.latitud) nuevo.latitud = Number(nuevo.latitud);
        if (nuevo.longitud) nuevo.longitud = Number(nuevo.longitud);

        const cuaderno = db.collection(collectionCuaderno);
        const result = await cuaderno.insertOne(nuevo);

        res.json({ success: true, id: result.insertedId });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error insertando" });
    }
});

// PUT editar elemento
app.put("/cuaderno/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const update = req.body;

        if (!isValidObjectId(id))
            return res.json({ success: false, message: "ID no válido" });

        if (update.fecha) update.fecha = new Date(update.fecha);
        if (update.latitud) update.latitud = Number(update.latitud);
        if (update.longitud) update.longitud = Number(update.longitud);

        const cuaderno = db.collection(collectionCuaderno);

        const result = await cuaderno.updateOne(
            { _id: new ObjectId(id) },
            { $set: update }
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error actualizando" });
    }
});

// DELETE elemento
app.delete("/cuaderno/:id", async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id))
            return res.json({ success: false, message: "ID no válido" });

        const cuaderno = db.collection(collectionCuaderno);
        await cuaderno.deleteOne({ _id: new ObjectId(id) });

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error eliminando" });
    }
});

// SERVIDOR LISTO
app.listen(port, "0.0.0.0", () =>
    console.log(`Servidor escuchando en http://0.0.0.0:${port}`)
);
