// src/routes/usuarios.routes.ts
import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/roles.middleware';

import {
  getMiPerfil,
  listarUsuarios,
  actualizarMiPerfil,
  actualizarUsuarioAdmin,
  eliminarUsuario,
  cambiarMiContrasena,
  cambiarPassword,            // <-- la ruta única para cambiar contraseña (self o SuperAdmin)
  resetearContrasenaAdmin,    // <-- opcional, con path distinto
} from '../controllers/usuarios.controller';

const router = Router();

// Todas requieren estar autenticado
router.use(authRequired);

// Perfil propio
router.get('/me', getMiPerfil);
router.patch('/me', actualizarMiPerfil);
router.patch('/me/password', cambiarMiContrasena);

// ⚠️ Solo SuperAdmin puede ver a TODOS los usuarios
router.get('/', requireRole('SuperAdmin'), listarUsuarios);

// Listado y administración (permite Administrador **o** SuperAdmin)
// Si tu requireRole actual no acepta arrays, ver “Paso 2”
router.get('/', requireRole('Administrador'), listarUsuarios);
router.patch('/:id', requireRole('Administrador'), actualizarUsuarioAdmin);
router.delete('/:id', requireRole('Administrador'), eliminarUsuario);

// ✅ Cambiar contraseña (UN SOLO endpoint):
// - SuperAdmin: cambia la de terceros con { nueva }
// - Usuario: cambia la suya con { contrasena_actual, nueva }
router.patch('/:id/password', cambiarPassword);

// (Opcional) Reset explícito con otra ruta (evitas colisión):
// Permite Admin o SuperAdmin. Si tu requireRole no acepta arrays, ver “Paso 2”
router.patch('/:id/password/reset', requireRole('Administrador'), resetearContrasenaAdmin);

export default router;
