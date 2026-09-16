export function logClientError(context, error) {
  const metadata = {
    context,
    name: error instanceof Error ? error.name : undefined,
    status: typeof error?.status === 'number' ? error.status : undefined,
  }

  if (import.meta.env.DEV) {
    metadata.message = error instanceof Error ? error.message : String(error ?? 'Error desconocido')
  }

  console.error('[portal]', metadata)
}
