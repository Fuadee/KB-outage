import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true
};

export default function nextConfig(phase) {
  return {
    ...baseConfig,
    // Keep generated output out of the legacy tracked `.next` directory and
    // keep dev/build processes from competing for the same manifests on Windows.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next-build"
  };
}
