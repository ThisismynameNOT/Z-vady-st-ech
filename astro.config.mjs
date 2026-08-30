import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tina from '@tinacms/astro/integration';
import { tinaAdminDevRedirect } from '@tinacms/astro/vite';

export default defineConfig({
  site: process.env.SITE_URL || undefined,
  output: 'server',
  adapter: cloudflare(),
  session: false,
  trailingSlash: 'always',
  integrations: [tina()],
  vite: {
    plugins: [tinaAdminDevRedirect()],
    ssr: { noExternal: ['@tinacms/astro', '@tinacms/bridge'] },
  },
  redirects: {
    '/index.html': '/',
    '/firma.html': '/firma/',
    '/sluzby.html': '/sluzby/',
    '/realizace.html': '/realizace/',
    '/reference.html': '/reference/',
    '/kontakt.html': '/kontakt/',
    '/ochrana-osobnich-udaju.html': '/ochrana-osobnich-udaju/',
  },
});
