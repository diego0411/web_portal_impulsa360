const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function containsNormalized(value, query) {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) {
    return true
  }

  return normalizeText(value).includes(normalizedQuery)
}

export function normalizeEmail(value) {
  return normalizeText(value)
}

export function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeEmail(value))
}
