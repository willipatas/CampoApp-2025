// En: src/schemas/registros_medicos.schema.ts
import { z } from 'zod';

// Esquema para CREAR un registro médico
export const crearRegistroMedicoSchema = z.object({
  fecha_consulta: z.string().date(),
  tipo_evento_medico: z.string().max(50),
  diagnostico: z.string().nullable().optional(),
  tratamiento_aplicado: z.string().nullable().optional(),
  veterinario_responsable: z.string().max(100).nullable().optional(),
  costo: z.number().positive().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  nombre_vacuna: z.string().max(100).nullable().optional(),
  dosis: z.string().max(50).nullable().optional(),
  proxima_fecha: z.string().date().nullable().optional(),
});

// Esquema para ACTUALIZAR (todos los campos son opcionales)
export const actualizarRegistroMedicoSchema = crearRegistroMedicoSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
  });