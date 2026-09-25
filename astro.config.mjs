// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  // GitHub Pages project site. Update `site` to your GitHub username and `base`
  // to your repo name if they differ.
  site: 'https://deep-dive.avetavos.com',
  base: '/react',
  output: 'static',
  integrations: [starlight({
      title: 'React Deep Dive',
      head: [
        { tag: 'script', attrs: { type: 'module', src: '/react/enhance.js' } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/react/manifest.webmanifest' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/react/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/react/icon-192.png' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#149ECA' } },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: "React Deep Dive" } },
        { tag: 'script', content: "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/react/sw.js',{scope:'/react/'}).catch(function(){})})}" },
      ],
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        th: { label: 'ไทย', lang: 'th' },
      },
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/avetavos/react-deep-dive' }],
      sidebar: [
        { label: 'Foundations & Mental Model', items: [{ autogenerate: { directory: 'foundations' } }] },
        { label: 'Hooks In Depth', items: [{ autogenerate: { directory: 'hooks' } }] },
        { label: 'State Management & Data Flow', items: [{ autogenerate: { directory: 'state-and-data' } }] },
        { label: 'Concurrent React & Suspense', items: [{ autogenerate: { directory: 'concurrent-and-suspense' } }] },
        { label: 'React 19: Actions, RSC & Forms', items: [{ autogenerate: { directory: 'react-19' } }] },
        { label: 'Performance & Patterns', items: [{ autogenerate: { directory: 'performance-and-patterns' } }] },
        { label: 'Tooling, Testing & Production', items: [{ autogenerate: { directory: 'tooling-and-production' } }] },
        { label: 'Glossary', translations: { th: 'อภิธานศัพท์' }, link: 'glossary' },
      ],
      }), preact()],
});
