import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    // Restrict to known trusted domains
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'grails.app',
      },
      {
        protocol: 'https',
        hostname: '*.ethid.org',
      },
      {
        protocol: 'https',
        hostname: 'euc.li', // ENS avatar service
      },
      {
        protocol: 'https',
        hostname: 'metadata.ens.domains',
      },
    ],
  },
  // Security headers for public-facing admin panel
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://grails.app https://*.ethid.org https://euc.li https://metadata.ens.domains https://i.seadn.io https://ipfs.io https://*.ipfs.io data: blob:",
              "font-src 'self'",
              // connect-src is permissive for blockchain APIs (ethereum-identity-kit, wagmi, etc.)
              "connect-src 'self' https: wss:",
              "frame-src 'self' https://*.walletconnect.com https://*.walletconnect.org",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig

