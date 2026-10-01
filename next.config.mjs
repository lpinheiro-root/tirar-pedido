/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['mssql', 'exceljs', 'unpdf', 'xml-crypto', 'node-forge'],
    // faturas em PDF passam do limite padrão de 1 MB das server actions
    serverActions: { bodySizeLimit: '15mb' },
  },
};

export default nextConfig;
