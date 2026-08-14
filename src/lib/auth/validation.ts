import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('Enter a valid email').max(254),
  password: z.string().min(1, 'Password is required').max(200),
  next: z.string().max(500).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email').max(254),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(200),
    confirmPassword: z.string().min(1, 'Confirm your password').max(200),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const GENERIC_LOGIN_ERROR = 'Unable to sign in with those credentials.';
export const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If an account is eligible, password reset instructions have been sent.';
export const GENERIC_ACCESS_DENIED = 'You do not have access to Studio OS.';
