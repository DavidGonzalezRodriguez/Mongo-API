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

// Iniciar SOLO DESPUÉS de conectar a Mongo
conectarBD().then(() => {
    app.listen(port, "0.0.0.0", () =>
        console.log(`Servidor escuchando en http://0.0.0.0:${port}`)
    );
});




const collectionCuaderno = "cuaderno";
const collectionUsuarios = "usuarios";
const collectionFungi = "hongos";


// Validar ObjectId
function isValidObjectId(id) {
    return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

// ---------------- FUNGIS: GUARDAR EN MONGO ----------------
app.post("/fungi", async (req, res) => {
    try {
        const { key, nombreCientifico, nombreComun } = req.body;

        if (!key || !nombreCientifico) {
            return res.json({ success: false, message: "Faltan campos obligatorios" });
        }

        const fungi = db.collection(collectionFungi);

        // Evitar duplicados por key
        const existe = await fungi.findOne({ key });

        if (existe) {
            return res.json({ success: false, message: "Ya existe este hongo" });
        }

        const nuevo = { key, nombreCientifico, nombreComun };

        await fungi.insertOne(nuevo);

        res.json({ success: true, message: "Hongo guardado correctamente" });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error guardando hongo" });
    }
});
// ---------------- FUNGIS: BÚSQUEDA PARCIAL ----------------
app.get("/fungi/search", async (req, res) => {
    try {
        const texto = (req.query.texto || "").trim();

        if (!texto) return res.json([]);

        const fungi = db.collection(collectionFungi);

        const filtro = {
            $or: [
                { nombreCientifico: { $regex: texto, $options: "i" } },
                { nombreComun: { $regex: texto, $options: "i" } }
            ]
        };

        const resultados = await fungi
            .find(filtro)
            .limit(100)
            .toArray();

        res.json(resultados);

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error buscando hongos" });
    }
});


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

        // -------------- NUEVO: devolvemos datos reales ---------------
        res.json({
            success: true,
            message: "Login exitoso",
            user: {
                id: usuario._id,
                nombre: usuario.nombre,
                email: usuario.email
            }
        });
        // --------------------------------------------------------------

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error en login" });
    }
});

// ---------------- REGISTRO ----------------
app.post("/register", async (req, res) => {
    try {
        const { nombre, email, password } = req.body;

        if (!nombre || !email || !password) {
            return res.json({ success: false, message: "Faltan campos" });
        }

        const usuarios = db.collection(collectionUsuarios);

        // Evitar correos duplicados
        const existe = await usuarios.findOne({ email });
        if (existe) {
            return res.json({ success: false, message: "El email ya está registrado" });
        }

        const nuevo = {
            nombre,
            email,
            password
        };

        const result = await usuarios.insertOne(nuevo);

        res.json({
            success: true,
            message: "Registro exitoso",
            userId: result.insertedId
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Error en registro" });
    }
});



// ---------------- CUADERNO ----------------

// GET todos los elementos
app.get("/cuaderno", async (req, res) => {
    try {
        const cuaderno = db.collection(collectionCuaderno);

        const userId = req.query.userId;
        console.log("🔍 userId recibido:", userId);

        let filtro = {};

        if (userId) {
            console.log("➡️ Aplicando filtro por userId");

            if (!ObjectId.isValid(userId)) {
                console.log("❌ userId inválido");
                return res.json({ success: false, message: "userId no válido" });
            }

            filtro = { userId: new ObjectId(userId) };
        } else {
            console.log("❌ Android NO envió userId → no se filtra");
        }

        const elementos = await cuaderno.find(filtro).toArray();

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

        // 🔥 VALIDAR userId
        if (!nuevo.userId) {
            return res.json({
                success: false,
                message: "Falta userId"
            });
        }

        // 🔥 Convertir userId a ObjectId REAL
        if (!ObjectId.isValid(nuevo.userId)) {
            return res.json({
                success: false,
                message: "userId no es válido"
            });
        }

        nuevo.userId = new ObjectId(nuevo.userId);

        // Convertir tipos
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


