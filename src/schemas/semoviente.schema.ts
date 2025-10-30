import { z } from 'zod';

const baseSemovienteSchema = z.object({
  nro_marca: z.string().min(1),
  nro_registro: z.string().nullable().optional(),
  nombre: z.string().min(1),
  fecha_nacimiento: z.string().date(),
  sexo: z.enum(['Macho', 'Hembra']),
  id_raza: z.number().int().positive(),
  id_especie: z.number().int().positive(),
  id_finca: z.number().int().positive(),
});

const nacimientoSchema = baseSemovienteSchema.extend({
  tipo_ingreso: z.literal('Nacimiento'),
  id_madre: z.number().int().positive(),
  id_padre: z.number().int().positive(),
  fecha_ingreso: z.string().date().optional().nullable(),
  valor_compra: z.union([z.literal(0), z.literal(null)]).optional(),
});

const compraSchema = baseSemovienteSchema.extend({
  tipo_ingreso: z.literal('Compra'),
  id_madre: z.number().int().positive().nullable().optional(),
  id_padre: z.number().int().positive().nullable().optional(),
  fecha_ingreso: z.string().date(),
  valor_compra: z.number().positive(),
});

export const crearSemovienteSchema = z.discriminatedUnion('tipo_ingreso', [
  nacimientoSchema,
  compraSchema,
]);

export const actualizarSemovienteSchema = z.object({
  nro_marca: z.string().min(1).optional(),
  nro_registro: z.string().nullable().optional(),
  nombre: z.string().min(1).optional(),
  fecha_nacimiento: z.string().date().optional(),
  sexo: z.enum(['Macho', 'Hembra']).optional(),
  id_raza: z.number().int().positive().optional(),
  id_especie: z.number().int().positive().optional(),
  id_madre: z.number().int().positive().nullable().optional(),
  id_padre: z.number().int().positive().nullable().optional(),
  
  peso_actual: z.number().positive().nullable().optional(),
  fecha_peso: z.string().date().nullable().optional(),
  fecha_ingreso: z.string().date().nullable().optional(), 
  nro_chip: z.string().max(50).nullable().optional(),
  nro_sanitario: z.string().max(50).nullable().optional(),
  
}).refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });


export const cambiarEstadoSemovienteSchema = z.object({
  estado: z.enum(['Activo', 'Vendido', 'Fallecido', 'Robado', 'Traslado', 'Inactivo', 'Perdido']),
  fecha: z.string().date().optional(),
  motivo: z.string().max(50).optional(),
  observaciones: z.string().max(500).optional(),
});

export type CrearSemovienteInput = z.infer<typeof crearSemovienteSchema>;
export type ActualizarSemovienteInput = z.infer<typeof actualizarSemovienteSchema>;
export type CambiarEstadoSemovienteInput = z.infer<typeof cambiarEstadoSemovienteSchema>;