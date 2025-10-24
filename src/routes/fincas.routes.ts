// src/routes/fincas.routes.ts
import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import {
  listarFincas,
  obtenerFinca,
  crearFinca,
  actualizarFinca,
  eliminarFinca
} from '../controllers/fincas.controller';

const router = Router();

router.use(authRequired);

router.get('/', listarFincas);          // GET    /api/fincas
router.get('/:id', obtenerFinca);       // GET    /api/fincas/:id
router.post('/', crearFinca);           // POST   /api/fincas
router.patch('/:id', actualizarFinca);  // PATCH  /api/fincas/:id
router.delete('/:id', eliminarFinca);   // DELETE /api/fincas/:id

export default router;
