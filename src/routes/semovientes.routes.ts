import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import {
  listarSemovientes,
  obtenerSemoviente,
  crearSemoviente,
  actualizarSemoviente,
  eliminarSemoviente,
} from '../controllers/semovientes.controller';

const router = Router();

router.use(authRequired);

// Listar con filtros / paginación
router.get('/', listarSemovientes);

// Detalle
router.get('/:id', obtenerSemoviente);

// Crear (AdminFinca o SuperAdmin)
router.post('/', crearSemoviente);

// Editar (AdminFinca o SuperAdmin)
router.patch('/:id', actualizarSemoviente);

// Eliminar (AdminFinca o SuperAdmin)
router.delete('/:id', eliminarSemoviente);

export default router;
