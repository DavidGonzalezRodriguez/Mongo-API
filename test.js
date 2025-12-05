const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://user:TuContraseñaReal@cluster0.thd625u.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri);

async function test() {
    try {
        await client.connect();
        console.log("Conexión correcta!");
    } catch (err) {
        console.error("Error de conexión:", err);
    } finally {
        await client.close();
    }
}

test();
