interface RefineOptions {
  context?: string
}

interface RefineResponse {
  refined: string
}

export async function refineContent(html: string, options: RefineOptions = {}): Promise<string> {
  const response = await fetch('/api/refine', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: html,
      context: options.context,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to refine content')
  }

  const data = (await response.json()) as RefineResponse
  if (!data.refined) {
    throw new Error('No refined content returned')
  }

  return data.refined
}

