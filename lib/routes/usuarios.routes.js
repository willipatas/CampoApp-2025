"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const usuarios_controller_1 = require("../controllers/usuarios.controller");
const router = (0, express_1.Router)();
// Ruta para obtener todos los usuarios
router.get('/usuarios', usuarios_controller_1.obtenerUsuarios);
// Ruta para obtener un usuario por ID
router.get('/usuarios/:id', usuarios_controller_1.obtenerUsuarioPorId);
exports.default = router;
