import type { Metadata, Viewport } from 'next'
import Providers from './providers'
import 'ethereum-identity-kit/css'
import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cat Admin - Categories Management',
  description: 'Admin interface for managing ENS name categories',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en' className='dark'>
      <body className='antialiased'>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

