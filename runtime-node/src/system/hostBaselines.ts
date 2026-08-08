/** Host/core baselines — package-owned resources register via PackageSurfaceRegistry. */

export const HOST_TRASHABLE: Record<string, string> = {
  media: 'media',
  'skill-categories': 'skill_categories',
  skills: 'skills',
  experience: 'experience',
  education: 'education',
  services: 'services',
  testimonials: 'testimonials',
  pages: 'pages',
  'lab-experiments': 'lab_experiments',
};

export const HOST_CONTENT_RESOURCES = [
  'social-links',
  'statistics',
  'experience',
  'education',
  'skill-categories',
  'skills',
  'testimonials',
  'navigation',
  'homepage-sections',
  'pages',
  'services',
] as const;

export const HOST_DASHBOARD_COUNT_TABLES = [
  'contact_messages',
  'media',
  'services',
  'testimonials',
  'pages',
  'users',
  'experience',
  'education',
  'skills',
] as const;
