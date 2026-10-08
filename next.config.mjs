/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  generateEtags: false,
  images: {
    unoptimized: true
  }
}

export default nextConfig
