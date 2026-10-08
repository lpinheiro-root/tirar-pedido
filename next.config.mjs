/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['mssql', 'exceljs', 'unpdf', 'xml-crypto', 'node-forge', 'tesseract.js'],
    // faturas em PDF (várias de uma vez, às vezes como imagem) passam do limite padrão de 1 MB
    serverActions: { bodySizeLimit: '50mb' },
  },
};

export default nextConfig;
