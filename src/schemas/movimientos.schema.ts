import { z } from 'zod';

export const crearMovimientoSchema = z.object({
  tipo: z.enum(['Traslado', 'Venta', 'Robo', 'Extravio', 'Recuperado']),
  fecha: z.string().datetime().optional(),
  destino_id: z.number().int().positive().optional(),
  observaciones: z.string().max(500).optional(),
});

export type CrearMovimientoInput = z.infer<typeof crearMovimientoSchema>;
