import { z } from 'zod';

export const sexoEnum = z.enum(['Macho', 'Hembra']);

export const crearSemovienteSchema = z.object({
  nro_marca: z.string().min(1, 'Requerido'),
  nro_registro: z.string().optional().nullable(),
  nombre: z.string().min(1, 'Requerido'),
  fecha_nacimiento: z.coerce.date(), // acepta string ISO, number, etc.
  sexo: sexoEnum,
  id_raza: z.number().int().positive(),
  id_especie: z.number().int().positive(),
  id_madre: z.number().int().positive().optional().nullable(),
  id_padre: z.number().int().positive().optional().nullable(),
  id_finca: z.number().int().positive(),
});

export const actualizarSemovienteSchema = z.object({
  nro_marca: z.string().min(1).optional(),
  nro_registro: z.string().optional().nullable(),
  nombre: z.string().min(1).optional(),
  fecha_nacimiento: z.coerce.date().optional(),
  sexo: sexoEnum.optional(),
  id_raza: z.number().int().positive().optional(),
  id_especie: z.number().int().positive().optional(),
  id_madre: z.number().int().positive().optional().nullable(),
  id_padre: z.number().int().positive().optional().nullable(),
  id_finca: z.number().int().positive().optional(), // ⚠️ cambiar finca es raro; lo mantenemos opcional para movimientos futuros
}).refine(d => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export type CrearSemovienteInput = z.infer<typeof crearSemovienteSchema>;
export type ActualizarSemovienteInput = z.infer<typeof actualizarSemovienteSchema>;
