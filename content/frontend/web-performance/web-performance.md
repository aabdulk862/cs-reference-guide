# Web Performance

## Quick Reference

- Core Web Vitals: LCP (Largest Contentful Paint) < 2.5s, INP (Interaction to Next Paint) < 200ms, CLS (Cumulative Layout Shift) < 0.1
- Code splitting with dynamic `import()` reduces initial bundle size by 40-60% for typical SPAs
- `loading="lazy"` on images below the fold defers loading until 1250px from viewport (Chrome default)
- HTTP/2 multiplexing eliminates the need for domain sharding and sprite sheets — serve individual assets
- `rel="preload"` for critical resources (fonts, hero images); `rel="preconnect"` for third-party origins
- Service Workers enable offline-first caching strategies: Cache First, Network First, Stale While Revalidate
- `content-visibility: auto` skips rendering of off-screen content, reducing initial render time by 50%+ for long pages
- TTFB (Time to First Byte) < 800ms; optimize with CDN, edge computing, and server-side caching

## When to Use

Web performance optimization applies to every production web application, but the investment level should match the business impact. Prioritize performance work when Core Web Vitals scores directly affect SEO rankings (Google uses them as ranking signals), when conversion rates correlate with load time (Amazon found every 100ms of latency costs 1% in sales), when serving users on slow networks or low-end devices (emerging markets, mobile-first audiences), or when infrastructure costs scale with payload size (CDN bandwidth, server compute). Performance optimization is less critical for internal tools with captive audiences on fast networks, for prototypes and MVPs where iteration speed matters more, or for applications where functionality gaps outweigh speed improvements. The key principle: measure first, optimize the bottleneck, measure again. Premature optimization without profiling data wastes engineering time on non-impactful changes.

## Code Examples

### Code Splitting with React.lazy and Route-Based Splitting

```typescript
import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

// Route-based code splitting — each route loads its own chunk
const Dashboard = lazy(() => import(/* webpackChunkName: "dashboard" */ './pages/Dashboard'));
const ProductList = lazy(() => import(/* webpackChunkName: "products" */ './pages/ProductList'));
const ProductDetail = lazy(() => import(/* webpackChunkName: "product-detail" */ './pages/ProductDetail'));
const Checkout = lazy(() => import(/* webpackChunkName: "checkout" */ './pages/Checkout'));
const AdminPanel = lazy(() => import(/* webpackChunkName: "admin" */ './pages/AdminPanel'));

// Preload on hover for perceived instant navigation
function preloadRoute(importFn: () => Promise<any>) {
  return () => { importFn(); };
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<ProductList />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/admin/*" element={<AdminPanel />} />
      </Routes>
    </Suspense>
  );
}

// Component-level splitting for heavy libraries
const HeavyChart = lazy(() => import(/* webpackChunkName: "chart" */ './components/HeavyChart'));
const MarkdownEditor = lazy(() => import(/* webpackChunkName: "editor" */ './components/MarkdownEditor'));

function AnalyticsDashboard({ data }) {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <button
        onClick={() => setShowChart(true)}
        onMouseEnter={preloadRoute(() => import('./components/HeavyChart'))}
      >
        Show Analytics
      </button>
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <HeavyChart data={data} />
        </Suspense>
      )}
    </div>
  );
}
```

### Image Optimization with Responsive Loading

```typescript
import { useState, useRef, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
}

function OptimizedImage({ src, alt, width, height, priority = false, sizes }: OptimizedImageProps) {
  // Generate srcset for responsive images
  const widths = [320, 640, 768, 1024, 1280, 1920];
  const srcSet = widths
    .filter(w => w <= width * 2) // Don't upscale beyond 2x
    .map(w => `${src}?w=${w}&format=webp ${w}w`)
    .join(', ');

  const defaultSizes = sizes || `
    (max-width: 640px) 100vw,
    (max-width: 1024px) 50vw,
    33vw
  `;

  return (
    <picture>
      {/* AVIF for browsers that support it (30-50% smaller than WebP) */}
      <source
        type="image/avif"
        srcSet={widths.filter(w => w <= width * 2).map(w => `${src}?w=${w}&format=avif ${w}w`).join(', ')}
        sizes={defaultSizes}
      />
      {/* WebP fallback */}
      <source
        type="image/webp"
        srcSet={srcSet}
        sizes={defaultSizes}
      />
      {/* Original format as final fallback */}
      <img
        src={`${src}?w=768&format=webp`}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        style={{ aspectRatio: `${width} / ${height}` }}
      />
    </picture>
  );
}

// Intersection Observer for lazy-loaded components
function useLazyLoad(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, isVisible };
}
```

### Service Worker Caching Strategies

```typescript
// service-worker.ts
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/css/main.css',
  '/manifest.json',
];

// Install: pre-cache static assets
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !key.includes(CACHE_VERSION))
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: strategy-based routing
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    // Network First for API calls (fresh data preferred)
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (request.destination === 'image') {
    // Cache First for images (rarely change)
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
  } else if (STATIC_ASSETS.includes(url.pathname)) {
    // Cache First for pre-cached static assets
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else {
    // Stale While Revalidate for everything else
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
  }
});

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });

  return cached || fetchPromise;
}
```

### Performance Monitoring and Web Vitals

```typescript
import { onCLS, onINP, onLCP, onFCP, onTTFB, Metric } from 'web-vitals';

interface PerformanceEntry {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
  url: string;
}

function reportWebVitals(metric: Metric) {
  const entry: PerformanceEntry = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
    url: window.location.href,
  };

  // Send to analytics endpoint
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/vitals', JSON.stringify(entry));
  } else {
    fetch('/api/vitals', {
      method: 'POST',
      body: JSON.stringify(entry),
      keepalive: true,
    });
  }
}

// Initialize monitoring
onCLS(reportWebVitals);
onINP(reportWebVitals);
onLCP(reportWebVitals);
onFCP(reportWebVitals);
onTTFB(reportWebVitals);

// Custom performance marks for business metrics
function measureUserFlow(flowName: string) {
  performance.mark(`${flowName}-start`);

  return {
    end() {
      performance.mark(`${flowName}-end`);
      const measure = performance.measure(flowName, `${flowName}-start`, `${flowName}-end`);
      reportWebVitals({
        name: flowName,
        value: measure.duration,
        rating: measure.duration < 1000 ? 'good' : measure.duration < 3000 ? 'needs-improvement' : 'poor',
      } as Metric);
    },
  };
}

// Usage: const flow = measureUserFlow('checkout'); ... flow.end();
```

## Common Pitfalls

- **Optimizing without measuring**: Making changes based on assumptions rather than profiling data. A developer might spend days optimizing JavaScript bundle size when the actual bottleneck is a 3-second API call or unoptimized images. Always profile with Lighthouse, WebPageTest, or Chrome DevTools Performance tab first
- **Render-blocking resources in the head**: Loading large CSS files or synchronous JavaScript in `<head>` blocks first paint. Use `media` attributes for non-critical CSS, `async`/`defer` for scripts, and inline critical CSS for above-the-fold content
- **Layout shifts from unsized images and dynamic content**: Not setting `width` and `height` attributes on images causes layout shifts when they load. Similarly, injecting ads, banners, or dynamically loaded content above existing content pushes everything down. Reserve space with aspect-ratio containers
- **Over-splitting code bundles**: Splitting every component into its own chunk creates a waterfall of tiny requests. The overhead of HTTP requests (even with HTTP/2) and JavaScript parsing for many small files can exceed the cost of a slightly larger initial bundle. Split at route boundaries and for genuinely large libraries (>50KB)
- **Ignoring third-party script impact**: Analytics, chat widgets, A/B testing tools, and ad scripts often add 500KB-2MB of JavaScript and block the main thread for 200-500ms. Audit third-party scripts quarterly, load them with `async`, and consider using Partytown to move them to a web worker
- **Not leveraging browser caching**: Serving assets without proper `Cache-Control` headers means browsers re-download unchanged files on every visit. Use content-hashed filenames (`app.abc123.js`) with `Cache-Control: max-age=31536000, immutable` for static assets, and short TTLs for HTML documents

## Real-World Use Cases

**E-Commerce Product Pages**: A retailer reduced LCP from 4.2s to 1.8s by implementing: priority loading for hero product images with `fetchpriority="high"`, preconnecting to their image CDN, lazy loading below-fold product recommendations, and replacing a 400KB carousel library with a 12KB custom implementation using CSS scroll-snap. The result: 15% increase in conversion rate and improved Google search rankings.

**News Media Site**: A publisher serving 50M monthly visitors reduced CLS from 0.35 to 0.04 by reserving space for ads with CSS `min-height`, using `font-display: optional` to prevent FOIT (Flash of Invisible Text), and implementing a skeleton loading pattern for dynamically loaded article recommendations. They also reduced INP from 350ms to 120ms by breaking long JavaScript tasks into smaller chunks using `requestIdleCallback` and moving analytics processing to a web worker.

**SaaS Dashboard**: A B2B application with complex data visualizations reduced initial load from 8s to 2.5s by implementing route-based code splitting (the charting library loaded only on the analytics page), virtualizing long lists with react-window (rendering only visible rows from 10,000+ records), and using `content-visibility: auto` on off-screen dashboard panels. Service worker caching enabled instant subsequent loads.

## Interview Questions

**Q: Explain Core Web Vitals and how you would improve a poor LCP score.**

A: Core Web Vitals are Google's user-centric performance metrics: LCP measures loading (when the largest visible element renders), INP measures interactivity (delay between user input and visual response), and CLS measures visual stability (unexpected layout shifts). To improve poor LCP: First, identify the LCP element (usually a hero image, heading, or video poster) using Chrome DevTools Performance tab. Then optimize the critical path to that element: preload the LCP resource (`<link rel="preload">`), eliminate render-blocking CSS/JS before it, optimize server response time (TTFB), use a CDN for static assets, serve images in modern formats (WebP/AVIF) at appropriate sizes, and set `fetchpriority="high"` on the LCP image. For server-rendered apps, ensure the HTML contains the LCP element directly rather than requiring JavaScript to inject it. Target: LCP < 2.5s at the 75th percentile of page loads.

**Q: How would you implement an effective caching strategy for a single-page application?**

A: Layer caching at multiple levels. CDN layer: cache static assets (JS, CSS, images) with long TTLs (`max-age=31536000, immutable`) using content-hashed filenames for cache busting. Cache HTML with short TTL (`max-age=0, s-maxage=60`) so CDN serves stale content briefly while revalidating. Browser layer: leverage HTTP cache headers — `ETag` for conditional requests on API responses, `Cache-Control: private, max-age=300` for user-specific data. Service Worker layer: implement Stale While Revalidate for the app shell (instant load from cache, background update), Network First for API calls (fresh data with offline fallback), and Cache First for images and fonts. Application layer: use React Query or SWR for in-memory API response caching with configurable stale times, deduplication of concurrent requests, and background refetching. Key principle: static assets get aggressive caching with hash-based invalidation; dynamic content gets short TTLs with revalidation.

**Q: What causes Cumulative Layout Shift and how do you prevent it?**

A: CLS measures unexpected visual movement of page content. Common causes: images without dimensions (browser doesn't know size until loaded), dynamically injected content (ads, cookie banners, notifications pushed above content), web fonts causing text reflow (FOUT/FOIT), and late-loading CSS that changes element sizes. Prevention strategies: always set explicit `width` and `height` on images and videos (or use CSS `aspect-ratio`), reserve space for ads and embeds with `min-height` containers, use `font-display: swap` with size-adjusted fallback fonts (`size-adjust`, `ascent-override` in `@font-face`), avoid inserting content above existing content (append below or use overlays), and use CSS `contain: layout` on components that shouldn't affect siblings. For dynamic content like notifications, use fixed/sticky positioning or transform animations (transforms don't cause layout shifts). Monitor CLS in the field using the web-vitals library since lab tools may not capture all real-user layout shifts.

## Production Tips

- **Implement resource hints strategically**: Use `<link rel="preconnect">` for third-party origins you'll definitely use (CDN, API, fonts), `<link rel="preload">` for critical resources discovered late in the HTML (fonts referenced in CSS, hero images), and `<link rel="prefetch">` for resources needed on the next likely navigation. Over-using preload wastes bandwidth and can delay critical resources
- **Monitor real-user performance with RUM (Real User Monitoring)**: Lab tools (Lighthouse) test under controlled conditions but miss real-world variability — slow devices, congested networks, browser extensions. Collect Core Web Vitals from actual users using the web-vitals library, segment by device type, connection speed, and geography, and set alerts when p75 metrics degrade
- **Use HTTP/2 Server Push or 103 Early Hints** to send critical resources before the browser parses HTML and discovers them. Early Hints (103 status code) is preferred over Server Push as it works with CDNs and doesn't risk pushing resources the client already has cached. Configure your CDN to send Early Hints for CSS and font files

## Related Topics

- [Accessibility](./accessibility.md) — Performance and accessibility are complementary — fast sites that are inaccessible still fail users
- [REST API Design](../backend/rest-api-design.md) — API response optimization and caching strategies that affect frontend performance
- [Redis](../databases/redis.md) — Server-side caching that reduces API response times feeding into web performance
