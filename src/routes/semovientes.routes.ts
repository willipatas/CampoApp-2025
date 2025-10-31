// En: src/routes/semovientes.routes.ts
import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import {
  listarSemovientes,
  crearSemoviente,
  actualizarSemoviente,
  // eliminarSemoviente, <-- Eliminado
  cambiarEstadoSemoviente,
  obtenerSemoviente,
  listarRegistrosMedicos,
  crearRegistroMedico,
  actualizarRegistroMedico,
  // eliminarRegistroMedico, <-- Eliminado
  getFichaCompletaSemoviente

} from '../controllers/semovientes.controller';

const router = Router();

router.use(authRequired);

// --- Rutas de Semovientes ---
router.get('/', listarSemovientes);
router.get('/:id', obtenerSemoviente);
router.get('/:id/ficha-completa', getFichaCompletaSemoviente);
router.post('/', crearSemoviente);
router.patch('/:id', actualizarSemoviente);
// router.delete('/:id', eliminarSemoviente); <-- Ruta Eliminada
router.patch('/:id/estado', cambiarEstadoSemoviente);

// --- RUTAS para Registros Médicos (/eventos) ---
router.get('/:id/eventos', listarRegistrosMedicos);
router.post('/:id/eventos', crearRegistroMedico);
router.patch('/:id/eventos/:idRegistro', actualizarRegistroMedico);
// router.delete('/:id/eventos/:idRegistro', eliminarRegistroMedico); <-- Ruta Eliminada
// -----------------------------------------------------

export default router;