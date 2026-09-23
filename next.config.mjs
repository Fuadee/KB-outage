/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: { "/api/jobs/*/social-image": ["./assets/fonts/*"] }
  }
};

export default nextConfig;
