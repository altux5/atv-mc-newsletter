/// <reference types="node" />
import fs from 'fs'
import path from 'path'
import express, { type Request, type Response } from 'express'
import dotenv from 'dotenv'
import { Agent as UndiciAgent } from 'undici'

dotenv.config()

const app = express()
app.use(express.json({ limit: '1mb' }))

const requiredEnv = ['AI_BASE_URL', 'AI_MODEL', 'AI_CA_BUNDLE']
const missing = requiredEnv.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.warn(`[ai-proxy] Missing env vars: ${missing.join(', ')}. Using defaults where possible.`)
}

const baseUrl = process.env.AI_BASE_URL ?? 'https://gpt4ifx.icp.infineon.com'
const model = process.env.AI_MODEL ?? 'gpt-5-mini'
const caBundlePath = process.env.AI_CA_BUNDLE ?? 'ca-bundle.crt'
const caFullPath = path.isAbsolute(caBundlePath)
  ? caBundlePath
  : path.join(process.cwd(), caBundlePath)

if (!fs.existsSync(caFullPath)) {
  throw new Error(`[ai-proxy] CA bundle not found at ${caFullPath}. Download it and set AI_CA_BUNDLE.`)
}

const ca = fs.readFileSync(caFullPath)
// Undici Agent with custom CA for fetch
const dispatcher = new UndiciAgent({
  connect: {
    ca,
  },
  keepAliveTimeout: 30_000,
})

const username = process.env.AI_USERNAME
const password = process.env.AI_PASSWORD
const bearerToken = process.env.AI_TOKEN

if (!((username && password) || bearerToken)) {
  throw new Error(
    '[ai-proxy] Authentication required!\n' +
    '  Option 1: Set AI_USERNAME and AI_PASSWORD in .env for Basic Auth\n' +
    '  Option 2: Set AI_TOKEN in .env for Bearer Auth (preferred)\n' +
    '  See: https://gpt4ifx.icp.infineon.com/docs'
  )
}

const useBasic = Boolean(username && password)
const authHeader = useBasic
  ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  : `Bearer ${bearerToken}`

app.post('/api/refine', async (req: Request, res: Response) => {
  const { content, context } = req.body ?? {}

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing content to refine.' })
  }

  try {
    const requestInit: RequestInit & { dispatcher: UndiciAgent } = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        model,
        
        messages: [
          {
            role: 'system',
            content:
              'You are a precise newsletter editor. Improve clarity, grammar, and flow. Keep HTML tags/links/images intact. Return only refined HTML.',
          },
          {
            role: 'user',
            content: `Context: ${context || 'newsletter section'}\n\nHTML content:\n${content}`,
          },
        ],
      }),
      dispatcher,
    }

    const response = await fetch(`${baseUrl}/chat/completions`, requestInit)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ai-proxy] Upstream error:', response.status, errorText)
      return res.status(502).json({ error: 'AI service error', detail: errorText })
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const refined = data.choices?.[0]?.message?.content?.trim()

    if (!refined) {
      return res.status(500).json({ error: 'AI returned empty response.' })
    }

    return res.json({ refined })
  } catch (error) {
    console.error('[ai-proxy] Request failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
})

const port = Number(process.env.PROXY_PORT ?? 8788)
app.listen(port, () => {
  console.log(`[ai-proxy] listening on http://localhost:${port}`)
})

