"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerUsuarioPorId = exports.obtenerUsuarios = void 0;
const db_1 = __importDefault(require("../db"));
// Obtener todos los usuarios
const obtenerUsuarios = async (req, res) => {
    try {
        const result = await db_1.default.query('SELECT * FROM usuarios ORDER BY id_usuario ASC');
        res.status(200).json(result.rows);
    }
    catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};
exports.obtenerUsuarios = obtenerUsuarios;
// Obtener un usuario por ID
const obtenerUsuarioPorId = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db_1.default.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ mensaje: 'Usuario no encontrado' });
        }
        else {
            res.status(200).json(result.rows[0]);
        }
    }
    catch (error) {
        console.error('Error al obtener usuario por ID:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
};
exports.obtenerUsuarioPorId = obtenerUsuarioPorId;
