import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import {
  listarSemovientes,
  crearSemoviente,
  actualizarSemoviente,
  eliminarSemoviente,
  cambiarEstadoSemoviente,
} from '../controllers/semovientes.controller';

const router = Router();

router.use(authRequired);

router.get('/', listarSemovientes);
router.post('/', crearSemoviente);
router.patch('/:id', actualizarSemoviente);
router.delete('/:id', eliminarSemoviente);
router.patch('/:id/estado', cambiarEstadoSemoviente);

export default router;
