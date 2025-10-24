"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const db_1 = __importDefault(require("./db"));
const app = (0, express_1.default)();
// Middlewares base
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Endpoint de salud simple
app.get('/ping', (_req, res) => {
    res.json({ ok: true, message: 'Servidor vivo 👋' });
});
// Endpoint para probar la BD
app.get('/ping-db', async (_req, res, next) => {
    try {
        const result = await db_1.default.query('SELECT NOW() as now');
        res.json({ ok: true, db_time: result.rows[0].now });
    }
    catch (err) {
        next(err);
    }
});
// Manejador de errores (al final)
app.use((err, _req, res, _next) => {
    const status = err.statusCode || 500;
    const message = err.message || 'Error interno del servidor';
    if (process.env.NODE_ENV !== 'production')
        console.error(err);
    res.status(status).json({ ok: false, mensaje: message });
});
// Levantar servidor
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
    console.log(`✅ Servidor listo en http://localhost:${PORT}`);
});
exports.default = app;
