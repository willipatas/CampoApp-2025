import { z } from 'zod';

export const crearFincaSchema = z.object({
  nombre_finca: z.string().min(3),
  ubicacion: z.string().optional().nullable(),
  nombre_admin: z.string().optional().nullable(),
  telefono_admin: z.string().optional().nullable(),
  administrador_id: z.number().int().positive().optional().nullable()
});

export const actualizarFincaSchema = z.object({
  nombre_finca: z.string().min(3).optional(),
  ubicacion: z.string().optional().nullable(),
  nombre_admin: z.string().optional().nullable(),
  telefono_admin: z.string().optional().nullable(),
  administrador_id: z.number().int().positive().optional().nullable()
}).refine(d => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export type CrearFincaInput = z.infer<typeof crearFincaSchema>;
export type ActualizarFincaInput = z.infer<typeof actualizarFincaSchema>;
