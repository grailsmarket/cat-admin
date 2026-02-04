/**
 * Check if a category has been set up in the grails frontend.
 * 
 * Checks:
 * 1. Avatar image exists at grails.app
 * 2. Header image exists at grails.app
 */
export type GrailsCheckResult = {
  isLive: boolean
  checks: {
    avatar: boolean
    header: boolean
  }
}

export async function checkCategoryInGrails(categorySlug: string): Promise<GrailsCheckResult> {
  const checkUrl = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  // Check images on grails.app (support multiple extensions)
  const avatarUrls = [
    `https://grails.app/clubs/${categorySlug}/avatar.jpg`,
    `https://grails.app/clubs/${categorySlug}/avatar.jpeg`,
    `https://grails.app/clubs/${categorySlug}/avatar.png`,
    `https://grails.app/clubs/${categorySlug}/avatar.webp`,
  ]
  const headerUrls = [
    `https://grails.app/clubs/${categorySlug}/header.jpg`,
    `https://grails.app/clubs/${categorySlug}/header.jpeg`,
    `https://grails.app/clubs/${categorySlug}/header.png`,
    `https://grails.app/clubs/${categorySlug}/header.webp`,
  ]

  // Run all checks in parallel
  const [avatarChecks, headerChecks] = await Promise.all([
    Promise.all(avatarUrls.map(url => checkUrl(url))),
    Promise.all(headerUrls.map(url => checkUrl(url))),
  ])
  
  const avatarExists = avatarChecks.some(exists => exists)
  const headerExists = headerChecks.some(exists => exists)

  return {
    isLive: avatarExists && headerExists,
    checks: {
      avatar: avatarExists,
      header: headerExists,
    }
  }
}

/**
 * Simple boolean check for backwards compatibility
 */
export async function isCategoryLiveInGrails(categorySlug: string): Promise<boolean> {
  const result = await checkCategoryInGrails(categorySlug)
  return result.isLive
}

