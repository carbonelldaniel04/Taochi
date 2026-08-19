/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Work {
  id?: string;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string;
  category: "Viviendas" | "Comerciales" | "Ampliaciones" | "Remodelaciones";
  location?: string;
  date?: string;
  featured?: boolean;
  createdAt?: string | Date;
}

export interface Testimonial {
  id?: string;
  name: string;
  review: string;
  rating: number; // 1-5 stars
  photoUrl?: string;
  videoUrl?: string;
  projectTitle?: string;
  createdAt?: string | Date;
}

export interface WebContent {
  heroHeadline: string;
  heroSubheadline: string;
  heroVideoUrl?: string;
  heroImageUrl?: string;
  heroType?: "video" | "image";
  aboutText?: string;
  whatsappNumber?: string;
  whatsappMessage?: string;
  instagramUrl?: string;
  n8nWebhookUrl?: string;
  aiSystemInstruction?: string;
  statsCompletedWorks?: string;
  statsYearsExperience?: string;
  statsSatisfiedClients?: string;
}

export interface BudgetRequest {
  id?: string;
  nombre: string;
  telefono: string;
  email: string;
  localidad: string;
  mensaje: string;
  status: "Pendiente" | "En Contacto" | "Presupuestado" | "Rechazado";
  notes?: string;
  createdAt: string; // ISO string
}

export interface AdminUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}
