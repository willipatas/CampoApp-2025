import { z } from 'zod';

export const registroSchema = z.object({
  nombre_usuario: z.string().min(3, 'Mínimo 3 caracteres'),
  correo_electronico: z.string().email('Correo inválido'),
  contrasena: z.string().min(8, 'Mínimo 8 caracteres'),
  nombre_completo: z.string().min(3, 'Mínimo 3 caracteres'),
  // rol global (no es el rol por finca)
  rol: z.enum(['Administrador', 'Empleado', 'SuperAdmin']).default('Empleado'),

  // 👇 Asignación por finca (opcional)
  asignacion: z
    .object({
      id_finca: z.number().int().positive(),
      rol_finca: z.enum(['AdminFinca', 'Empleado', 'Veterinario']),
    })
    .optional(),
});

export const loginSchema = z.object({
  usuario: z.string().min(3, 'Usuario o correo'),
  contrasena: z.string().min(8, 'Mínimo 8 caracteres'),
});

export const actualizarPerfilSchema = z
  .object({
    nombre_completo: z.string().min(3, 'Mínimo 3 caracteres').optional(),
    correo_electronico: z.string().email('Correo inválido').optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const actualizarUsuarioAdminSchema = z.object({
  nombre_usuario: z.string().min(3, 'Mínimo 3 caracteres').optional(),
  correo_electronico: z.string().email('Correo inválido').optional(),
  nombre_completo: z.string().min(3, 'Mínimo 3 caracteres').optional(),
  rol: z.enum(['Administrador', 'Empleado', 'SuperAdmin']).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

export const cambiarContrasenaSchema = z.object({
  contrasena_actual: z.string().min(8, 'Mínimo 8 caracteres'),
  contrasena_nueva: z.string().min(8, 'Mínimo 8 caracteres'),
});

export const resetPwdAdminSchema = z.object({
  nueva: z.string().min(8, 'Mínimo 8 caracteres'),
});
export type ResetPwdAdminInput = z.infer<typeof resetPwdAdminSchema>;

export const cambiarPasswordSelfSchema = z.object({
  contrasena_actual: z.string().min(6, 'Mínimo 6 caracteres'),
  nueva: z.string().min(8, 'Mínimo 8 caracteres'),
});

export const cambiarPasswordAdminSchema = z.object({
  nueva: z.string().min(8, 'Mínimo 8 caracteres'),
});

// 👉 ÚNICO rol global permitido: SuperAdmin (si no viene, queda Usuario normal)
export const registroExtendidoSchema = z.object({
  nombre_usuario: z.string().min(3),
  correo_electronico: z.string().email(),
  contrasena: z.string().min(8),
  nombre_completo: z.string().min(3),

  // Rol global opcional (sólo permitido: SuperAdmin)
  rol_global: z.enum(['SuperAdmin']).optional(),

  // Asignación opcional a una finca con rol de finca
  asignacion: z
    .object({
      id_finca: z.number().int().positive(),
      rol_finca: z.enum(['AdminFinca', 'Empleado', 'Veterinario']),
    })
    .optional(),
});
export type RegistroExtendidoInput = z.infer<typeof registroExtendidoSchema>;