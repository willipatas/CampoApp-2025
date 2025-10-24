"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
// Cargar variables de entorno
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = parseInt(process.env.PORT || '3000');

// Middlewares
app.use((0, cors_1.default)()); // Habilita CORS
app.use(express_1.default.json()); // Para parsear application/json
app.use(express_1.default.urlencoded({ extended: true })); // Para parsear application/x-www-form-urlencoded
// Ruta de ejemplo
app.get('/', (req, res) => {
    res.send('¡Hola desde el servidor TypeScript con Express!');
});
// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
