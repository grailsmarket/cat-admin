/**
 * Check if a category's images are accessible via the grails backend API.
 *
 * This is an informational check — NOT a gate for category creation.
 */
export type GrailsCheckResult = {
  isLive: boolean
  checks: {
    avatar: boolean
    header: boolean
  }
}

const GRAILS_API_URL = process.env.GRAILS_API_URL || 'https://api.grails.app/api/v1'

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

  const [avatarExists, headerExists] = await Promise.all([
    checkUrl(`${GRAILS_API_URL}/clubs/${categorySlug}/avatar`),
    checkUrl(`${GRAILS_API_URL}/clubs/${categorySlug}/header`),
  ])

  return {
    isLive: avatarExists && headerExists,
    checks: {
      avatar: avatarExists,
      header: headerExists,
    },
  }
}

export async function isCategoryLiveInGrails(categorySlug: string): Promise<boolean> {
  const result = await checkCategoryInGrails(categorySlug)
  return result.isLive
}
