import { Router } from 'express';
import { authRequired } from '../middlewares/auth.middleware';
import { crearMovimiento, listarMovimientos } from '../controllers/movimientos.controller';

const router = Router();

// Ruta completa al montarla con app.use('/api', router):
// POST /api/semovientes/:id/movimientos
router.post('/semovientes/:id/movimientos', authRequired, crearMovimiento);
router.get('/semovientes/:id/movimientos', authRequired, listarMovimientos);

export default router;
