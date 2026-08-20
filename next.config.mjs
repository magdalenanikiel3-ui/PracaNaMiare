/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["pdfjs-dist", "mammoth"] },
};
export default nextConfig;
