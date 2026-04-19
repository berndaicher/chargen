import { writeFileSync } from 'fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#283F37"/>
  <text x="256" y="260" font-family="Verdana,sans-serif" font-size="220" font-weight="bold" fill="#FECE15" text-anchor="middle" dominant-baseline="middle">C</text>
  <text x="256" y="410" font-family="Verdana,sans-serif" font-size="56" fill="#fafafa" text-anchor="middle">chargen</text>
</svg>`;

writeFileSync(new URL('../public/favicon-512x512.svg', import.meta.url), svg);
console.log('Created favicon-512x512.svg');
