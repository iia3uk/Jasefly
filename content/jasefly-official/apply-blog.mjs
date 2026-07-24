import { loadMcpEnv } from '../../mcp-cms/src/loadEnv.js'
import { clientFromEnv } from '../../mcp-cms/src/client.js'
import { posts } from './blog-posts.mjs'

loadMcpEnv()
const client = clientFromEnv()

async function main() {
  for (const post of posts) {
    const data = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      status: 'published',
      seo_title: post.seo_title,
      seo_description: post.seo_description,
      published_at: '2026-07-21 12:00:00',
    }
    console.log('create blog', post.slug)
    const res = await client.post('/admin/blog', data)
    console.log('  ->', res?.data?.id ?? res?.id ?? 'ok')
  }
  console.log('done blog')
}

main().catch((e) => {
  console.error(e.message || e)
  if (e.payload) console.error(JSON.stringify(e.payload, null, 2))
  process.exit(1)
})
