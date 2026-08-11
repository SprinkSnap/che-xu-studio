import { z } from 'zod';

const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 4000;
const MAX_URL = 500;
const MAX_PHONE = 40;

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(MAX_NAME),
  email: z.email('Enter a valid email').max(MAX_EMAIL),
  serviceInterest: z.enum([
    'brand-identity',
    'custom-website',
    'custom-seo-launch',
    'seo-growth',
    'website-care',
    'not-sure',
    'other',
  ]),
  message: z.string().trim().min(1, 'Message is required').max(MAX_MESSAGE),
  phone: z.string().trim().max(MAX_PHONE).optional().or(z.literal('')),
  marketingConsent: z.boolean().default(false),
  /** Honeypot — must be empty. */
  website: z.string().max(0).optional().or(z.literal('')),
  turnstileToken: z.string().min(1, 'Please complete the security check'),
  // Detailed brief (optional)
  currentWebsite: z.string().trim().max(MAX_URL).optional().or(z.literal('')),
  businessType: z.string().trim().max(120).optional().or(z.literal('')),
  primaryGoal: z.string().trim().max(500).optional().or(z.literal('')),
  pagesFeatures: z.string().trim().max(1000).optional().or(z.literal('')),
  budgetRange: z
    .enum(['under-2k', '2k-5k', '5k-10k', '10k-plus', 'monthly', 'unsure', ''])
    .optional(),
  targetTimeline: z
    .enum(['asap', '1-2-months', '3-plus-months', 'flexible', ''])
    .optional(),
  preferredContact: z.enum(['email', 'phone', 'either', '']).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(20),
  turnstileToken: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
