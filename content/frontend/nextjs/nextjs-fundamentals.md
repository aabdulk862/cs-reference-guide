# Next.js Fundamentals

Next.js is a React framework that provides production-grade infrastructure for building full-stack web applications. It extends React with server-side rendering, static site generation, file-system routing, API routes, and built-in optimizations that would otherwise require significant custom configuration. Understanding Next.js architecture is essential for modern frontend engineering roles, as it represents the dominant approach to building performant React applications that require SEO, fast initial loads, and seamless developer experience.

---

## Quick Reference

- **App Router (Next.js 13+)** — File-system based routing using the `app/` directory with React Server Components by default
- **Server Components vs Client Components** — Server Components render on the server with zero client JS bundle cost; Client Components hydrate in the browser for interactivity
- **SSR (Server-Side Rendering)** — Pages rendered on each request; use when data changes frequently and SEO matters
- **SSG (Static Site Generation)** — Pages pre-rendered at build time; use for content that rarely changes
- **ISR (Incremental Static Regeneration)** — Static pages that revalidate after a configurable interval, combining SSG performance with fresh data
- **Route Handlers** — API endpoints defined in `route.ts` files within the app directory, replacing the older `pages/api/` pattern
- **Middleware** — Runs before a request is completed; used for authentication, redirects, A/B testing, and geolocation-based routing
- **Server Actions** — Functions that execute on the server, callable directly from Client Components without manual API routes
- **Streaming and Suspense** — Progressive rendering that sends HTML chunks as they become ready, improving Time to First Byte
- **Image Optimization** — The `next/image` component automatically resizes, optimizes format, and lazy-loads images

---

## When to Use

Next.js is the right choice when your React application needs capabilities beyond what a client-side SPA provides, but the decision should be informed by your specific requirements.

**Choose Next.js when:**

- SEO is critical and you need search engines to index fully rendered HTML rather than waiting for client-side JavaScript execution
- Initial page load performance matters for user retention, particularly on mobile devices or slow networks where large JavaScript bundles create unacceptable delays
- You need a mix of static and dynamic content within the same application, such as marketing pages (static) alongside a dashboard (dynamic)
- Your team wants a unified full-stack framework where API routes, server logic, and frontend code coexist in a single repository with shared types
- You need edge computing capabilities, deploying middleware and server functions to CDN edge nodes for low-latency responses globally
- Data fetching patterns vary by page: some pages need real-time data (SSR), others can be pre-built (SSG), and some need periodic refresh (ISR)

**Consider alternatives when:**

- Your application is entirely behind authentication with no SEO requirements, where a client-side SPA with code splitting may be simpler
- You need real-time bidirectional communication (WebSockets) as the primary interaction pattern, where frameworks like Remix or custom Node.js servers may be more appropriate
- Your team lacks Node.js deployment infrastructure and cannot run a server (pure static hosting only)

---

## Code Examples

### Example 1: App Router with Server and Client Components

```typescript
// app/dashboard/page.tsx — Server Component (default)
// This component runs ONLY on the server. It can directly access databases,
// read files, and call internal services without exposing secrets to the client.

import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { DashboardChart } from './DashboardChart';

export default async function DashboardPage() {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  // Direct database access — no API route needed
  const metrics = await prisma.metric.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  // Server Component passes serializable data to Client Component
  return (
    <main>
      <h1>Dashboard</h1>
      <DashboardChart data={metrics} />
    </main>
  );
}
```

```typescript
// app/dashboard/DashboardChart.tsx — Client Component
// The 'use client' directive marks this as a Client Component.
// It ships JavaScript to the browser and can use hooks, event handlers, and browser APIs.

'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

interface Metric {
  id: string;
  value: number;
  createdAt: string;
}

export function DashboardChart({ data }: { data: Metric[] }) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d'>('7d');

  const filtered = timeRange === '7d' ? data.slice(0, 7) : data;

  return (
    <div>
      <button onClick={() => setTimeRange('7d')}>7 Days</button>
      <button onClick={() => setTimeRange('30d')}>30 Days</button>
      <LineChart width={600} height={300} data={filtered}>
        <XAxis dataKey="createdAt" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="value" stroke="#8884d8" />
      </LineChart>
    </div>
  );
}
```

The Server Component fetches data directly from the database without an intermediate API layer, reducing latency and eliminating client-side loading states for the initial render. The Client Component receives pre-fetched data as props and handles interactive state locally.

### Example 2: Server Actions for Form Handling

```typescript
// app/posts/new/page.tsx — Server Action defined inline
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(10).max(50000),
  published: z.coerce.boolean().default(false),
});

export default function NewPostPage() {
  async function createPost(formData: FormData) {
    'use server';

    const parsed = PostSchema.safeParse({
      title: formData.get('title'),
      content: formData.get('content'),
      published: formData.get('published'),
    });

    if (!parsed.success) {
      throw new Error('Validation failed: ' + parsed.error.message);
    }

    await prisma.post.create({
      data: parsed.data,
    });

    revalidatePath('/posts');
    redirect('/posts');
  }

  return (
    <form action={createPost}>
      <input name="title" placeholder="Post title" required />
      <textarea name="content" placeholder="Write your post..." required />
      <label>
        <input type="checkbox" name="published" />
        Publish immediately
      </label>
      <button type="submit">Create Post</button>
    </form>
  );
}
```

Server Actions eliminate the need for separate API routes for form submissions. The function marked with `'use server'` executes entirely on the server, with Next.js automatically handling the network request, serialization, and error propagation. This pattern reduces boilerplate while maintaining type safety between client and server.

### Example 3: Middleware for Authentication and Routing

```typescript
// middleware.ts — Runs at the edge before every matched request
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based access control
  if (pathname.startsWith('/admin') && token.role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Middleware executes at the edge (CDN level) before the request reaches your application server. This makes authentication checks extremely fast and prevents unauthorized requests from consuming server resources. The matcher configuration excludes static assets from middleware processing.

---

## Common Pitfalls

**1. Making everything a Client Component.** Developers coming from traditional React SPAs instinctively add `'use client'` to every file. This defeats the purpose of Server Components, shipping unnecessary JavaScript to the browser and losing the ability to do direct server-side data access. Only add `'use client'` when you need hooks, event handlers, or browser APIs.

**2. Fetching data in Client Components when Server Components would suffice.** If a component only displays data without user interaction, it should be a Server Component that fetches data directly. Using `useEffect` + `fetch` in a Client Component adds loading states, increases bundle size, and creates layout shift that Server Components avoid entirely.

**3. Misunderstanding the caching behavior.** Next.js aggressively caches fetch requests by default in the App Router. A `fetch()` call in a Server Component is cached indefinitely unless you specify `{ cache: 'no-store' }` or `{ next: { revalidate: seconds } }`. This catches developers off guard when data appears stale. Always explicitly declare your caching intent.

**4. Putting secrets in Client Components.** Environment variables prefixed with `NEXT_PUBLIC_` are exposed to the browser bundle. Database URLs, API keys, and secrets must only be accessed in Server Components, Route Handlers, or Server Actions. A single `NEXT_PUBLIC_DATABASE_URL` in your `.env` file exposes your database to the internet.

**5. Not leveraging the `loading.tsx` convention.** Next.js automatically wraps page components in Suspense boundaries when a `loading.tsx` file exists in the same directory. Without it, navigation to pages with async data fetching shows no feedback, making the app feel unresponsive. Always provide loading states for data-heavy pages.

**6. Ignoring the build output analysis.** The `next build` command shows a breakdown of static vs dynamic routes, bundle sizes per route, and first-load JS. Ignoring this output means missing opportunities to convert dynamic routes to static ones, identify oversized bundles, and catch unintentional client-side dependencies.

---

## Real-World Use Cases

**E-commerce storefronts:** Product listing pages are statically generated at build time for instant loading and SEO, while the shopping cart and checkout flow use Client Components for interactivity. Product pages use ISR with a 60-second revalidation window so price changes propagate without full rebuilds. The product catalog of 100,000+ items uses on-demand ISR to generate pages only when first requested.

**Content management platforms:** Marketing sites with hundreds of blog posts use SSG for content pages, with a headless CMS webhook triggering on-demand revalidation when editors publish changes. The admin dashboard uses SSR with authentication middleware, and the public API uses Route Handlers with edge caching for global low-latency access.

**SaaS dashboards:** The landing page and documentation are statically generated for performance and SEO. The authenticated dashboard uses Server Components to fetch user-specific data directly from the database, with Client Components only for interactive charts and real-time notifications via WebSocket connections established client-side.

**Multi-tenant platforms:** Middleware handles tenant detection from subdomains or custom domains, routing requests to tenant-specific configurations. Each tenant's public pages are statically generated with ISR, while their admin panels use SSR with tenant-scoped database queries. The middleware layer adds less than 1ms latency at the edge.

---

## Interview Questions

**Q: Explain the difference between Server Components and Client Components in Next.js 13+. When would you choose one over the other?**

A: Server Components render exclusively on the server and send only HTML to the client, with zero JavaScript bundle cost. They can directly access databases, file systems, and internal services. Client Components include the `'use client'` directive, ship JavaScript to the browser, and support hooks, event handlers, and browser APIs. Choose Server Components for data display, layout, and anything that does not require interactivity. Choose Client Components for forms, interactive widgets, components using `useState`/`useEffect`, and anything needing browser APIs like `window` or `localStorage`. The key insight is that Server Components can import Client Components (passing serializable props), but Client Components cannot import Server Components directly.

**Q: How does Incremental Static Regeneration (ISR) work, and what problem does it solve?**

A: ISR solves the trade-off between static performance and data freshness. With pure SSG, updating content requires a full rebuild. With SSR, every request hits the server. ISR serves a cached static page immediately while triggering background regeneration after a configurable revalidation period. When a user requests a page past its revalidation window, they receive the stale cached version instantly while Next.js regenerates the page in the background. The next visitor gets the fresh version. On-demand ISR extends this by allowing webhooks to trigger regeneration of specific pages immediately when content changes, without waiting for the revalidation timer. The trade-off is that some users see slightly stale data (up to the revalidation interval), which is acceptable for most content but not for real-time data.

**Q: How would you handle authentication in a Next.js application? Compare middleware-based vs layout-based approaches.**

A: Middleware-based authentication runs at the edge before any page rendering, making it ideal for protecting entire route groups with minimal latency. It checks for a valid session token and redirects unauthenticated users before any server resources are consumed. Layout-based authentication checks the session in a Server Component layout that wraps protected routes, redirecting if unauthorized. The middleware approach is faster (edge execution, no server round-trip) and more secure (prevents any server-side code from executing for unauthorized users), but has limitations: it cannot access databases directly (edge runtime restrictions) and can only read cookies/headers. The layout approach has full Node.js runtime access but executes after the request reaches the server. In practice, use middleware for the initial gate (token existence check) and layout-level checks for fine-grained authorization (role verification requiring database lookups).

**Q: What are the caching layers in Next.js, and how do you control them?**

A: Next.js has four caching layers: the Request Memoization cache (deduplicates identical fetch calls within a single render), the Data Cache (persists fetch results across requests, controlled by `revalidate` options), the Full Route Cache (caches rendered HTML and RSC payload for static routes), and the Router Cache (client-side cache of visited routes for instant back/forward navigation). Control them via: `fetch` options (`cache: 'no-store'` disables Data Cache), route segment config (`export const dynamic = 'force-dynamic'` disables Full Route Cache), `revalidatePath`/`revalidateTag` for on-demand invalidation, and `router.refresh()` to bypass Router Cache. The most common mistake is not understanding that the Data Cache persists across deployments by default, requiring explicit invalidation strategies.

---

## Production Tips

**Implement proper error boundaries and not-found handling.** Create `error.tsx` and `not-found.tsx` files at each route segment level. The `error.tsx` file catches runtime errors and provides recovery UI without crashing the entire application. The `not-found.tsx` file handles missing resources gracefully. Without these, a single component error can white-screen your entire application in production.

**Use the Bundle Analyzer to identify client-side bloat.** Install `@next/bundle-analyzer` and regularly inspect your client bundles. Large dependencies that are only used in one route should be dynamically imported with `next/dynamic`. Server Components that accidentally import client-side libraries (like `moment` or `lodash`) will silently increase your bundle size. Set bundle size budgets in CI and fail builds that exceed them.

**Configure proper caching headers for static assets.** Next.js automatically sets immutable cache headers for hashed static assets in `_next/static/`, but custom API routes and ISR pages need explicit `Cache-Control` headers. Use `stale-while-revalidate` for API responses that can tolerate brief staleness, and set appropriate `s-maxage` values for CDN caching. Misconfigured caching is the most common cause of both stale data bugs and unnecessary server load.

---

## Related Topics

- [React Fundamentals](../frontend/react/index.md) — Core React concepts including component lifecycle, hooks, and state management that Next.js builds upon
- [System Design](../system-design/system-design/index.md) — Architectural patterns for building scalable web applications including caching strategies and CDN configuration
