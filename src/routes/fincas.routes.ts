// src/routes/fincas.routes.ts
import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import {
  listarFincas,
  obtenerFinca,
  crearFinca,
  actualizarFinca,
  eliminarFinca,
  listarEventosPorFinca,
  reporteInventarioFinca,
  reporteSanitarioFinca
} from '../controllers/fincas.controller';

const router = Router();

router.use(authRequired);

router.get('/', listarFincas);          // GET    /api/fincas
router.get('/:id', obtenerFinca);       // GET    /api/fincas/:id
router.get('/:id/eventos', listarEventosPorFinca); // GET /api/fincas/1/eventos
router.get('/:id/reportes/inventario', reporteInventarioFinca); // GET /api/fincas/1/reportes/inventario
router.get('/:id/reportes/sanitario', reporteSanitarioFinca); // GET /api/fincas/1/reportes/sanitario
router.post('/', crearFinca);           // POST   /api/fincas
router.patch('/:id', actualizarFinca);  // PATCH  /api/fincas/:id
router.delete('/:id', eliminarFinca);   // DELETE /api/fincas/:id

export default router;
