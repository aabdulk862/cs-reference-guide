# Accessibility

## Quick Reference

- WCAG 2.1 has three conformance levels: A (minimum), AA (standard for most legal requirements), AAA (enhanced)
- Color contrast ratios: 4.5:1 for normal text, 3:1 for large text (18px+ bold or 24px+ regular) at AA level
- All interactive elements must be keyboard accessible — focusable, operable, and have visible focus indicators
- ARIA (Accessible Rich Internet Applications) supplements HTML semantics — use native HTML elements first, ARIA only when needed
- Screen readers announce elements by their role, name, and state — ensure all three are correct for custom components
- `aria-live="polite"` announces dynamic content changes without interrupting; `aria-live="assertive"` interrupts immediately
- Skip navigation links (`<a href="#main-content">Skip to content</a>`) let keyboard users bypass repetitive navigation
- Form inputs must have associated labels — use `<label for="id">` or `aria-labelledby`; placeholder text is not a label

## When to Use

Accessibility is not optional — it applies to every web application. Legal requirements (ADA in the US, EAA in the EU, AODA in Canada) mandate WCAG 2.1 AA compliance for public-facing websites and increasingly for internal tools. Beyond compliance, accessible design improves usability for all users: keyboard navigation benefits power users, captions help users in noisy environments, high contrast helps users in bright sunlight, and clear structure helps users with cognitive load. Prioritize accessibility work when launching public-facing products (legal exposure), when serving government or education sectors (Section 508 compliance), when your analytics show users with assistive technologies (typically 5-15% of traffic uses some form of AT), or when redesigning components (cheaper to build accessible from the start than to retrofit). The cost of accessibility remediation increases 10-30x when done after launch versus during initial development.

> [!NOTE]
> Full WCAG compliance validation requires manual testing with assistive technologies and expert accessibility review. Automated tools catch only 30-50% of accessibility issues.

## Code Examples

### Accessible Modal Dialog

```typescript
import { useRef, useEffect, useCallback } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function AccessibleModal({ isOpen, onClose, title, children }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Trap focus within modal
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.addEventListener('keydown', handleKeyDown);
      // Focus the modal after render
      setTimeout(() => modalRef.current?.focus(), 0);
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Restore focus to trigger element
      previousFocusRef.current?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        tabIndex={-1}
        className="modal"
      >
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="modal__close"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <div id="modal-description" className="modal__body">
          {children}
        </div>
      </div>
    </>
  );
}
```

### Accessible Form with Validation

```typescript
import { useState, useId } from 'react';

interface FormErrors {
  [field: string]: string;
}

function AccessibleForm() {
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();
  const errorSummaryId = useId();

  const validate = (formData: FormData): FormErrors => {
    const newErrors: FormErrors = {};
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = 'Enter a valid email address';

    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8)
      newErrors.password = 'Password must be at least 8 characters';

    return newErrors;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const newErrors = validate(formData);
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      // Focus error summary for screen reader announcement
      document.getElementById(errorSummaryId)?.focus();
      return;
    }

    setSubmitted(true);
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Registration form">
      {/* Error summary — announced when focused */}
      {Object.keys(errors).length > 0 && (
        <div
          id={errorSummaryId}
          role="alert"
          aria-labelledby="error-heading"
          tabIndex={-1}
          className="error-summary"
        >
          <h3 id="error-heading">There are {Object.keys(errors).length} errors in this form</h3>
          <ul>
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>
                <a href={`#${field}`}>{message}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Success message */}
      {submitted && (
        <div role="status" aria-live="polite" className="success-message">
          Registration successful! Check your email for confirmation.
        </div>
      )}

      <div className="form-field">
        <label htmlFor={nameId}>
          Full name <span aria-hidden="true">*</span>
          <span className="visually-hidden">(required)</span>
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          required
          aria-required="true"
          autoComplete="name"
        />
      </div>

      <div className="form-field">
        <label htmlFor={emailId}>
          Email address <span aria-hidden="true">*</span>
          <span className="visually-hidden">(required)</span>
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? `${emailId}-error` : undefined}
          autoComplete="email"
        />
        {errors.email && (
          <span id={`${emailId}-error`} className="field-error" role="alert">
            {errors.email}
          </span>
        )}
      </div>

      <div className="form-field">
        <label htmlFor={passwordId}>
          Password <span aria-hidden="true">*</span>
          <span className="visually-hidden">(required)</span>
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          aria-required="true"
          aria-invalid={!!errors.password}
          aria-describedby={`${passwordId}-hint ${errors.password ? `${passwordId}-error` : ''}`}
          autoComplete="new-password"
          minLength={8}
        />
        <span id={`${passwordId}-hint`} className="field-hint">
          Must be at least 8 characters with one uppercase and one number
        </span>
        {errors.password && (
          <span id={`${passwordId}-error`} className="field-error" role="alert">
            {errors.password}
          </span>
        )}
      </div>

      <button type="submit">Create account</button>
    </form>
  );
}
```

### Accessible Data Table with Sorting

```typescript
import { useState } from 'react';

interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
}

interface AccessibleTableProps<T> {
  data: T[];
  columns: Column<T>[];
  caption: string;
}

function AccessibleTable<T extends Record<string, any>>({
  data, columns, caption
}: AccessibleTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');
  const [announcement, setAnnouncement] = useState('');

  const handleSort = (column: Column<T>) => {
    if (!column.sortable) return;

    const newDirection = sortColumn === column.key && sortDirection === 'ascending'
      ? 'descending' : 'ascending';

    setSortColumn(column.key);
    setSortDirection(newDirection);
    setAnnouncement(`Table sorted by ${column.label}, ${newDirection}`);
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0;
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'ascending' ? comparison : -comparison;
  });

  return (
    <>
      {/* Live region for sort announcements */}
      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {announcement}
      </div>

      <table aria-label={caption} role="grid">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={String(column.key)}
                scope="col"
                aria-sort={sortColumn === column.key ? sortDirection : undefined}
              >
                {column.sortable ? (
                  <button
                    onClick={() => handleSort(column)}
                    aria-label={`Sort by ${column.label}, currently ${
                      sortColumn === column.key ? sortDirection : 'unsorted'
                    }`}
                    className="sort-button"
                  >
                    {column.label}
                    <span aria-hidden="true" className="sort-icon">
                      {sortColumn === column.key
                        ? (sortDirection === 'ascending' ? '▲' : '▼')
                        : '⇅'}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={String(column.key)}>{String(row[column.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

### Skip Navigation and Landmark Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessible Page Structure</title>
  <style>
    /* Visually hidden but accessible to screen readers */
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Skip link visible on focus */
    .skip-link {
      position: absolute;
      top: -40px;
      left: 0;
      background: #000;
      color: #fff;
      padding: 8px 16px;
      z-index: 100;
      transition: top 0.2s;
    }
    .skip-link:focus {
      top: 0;
    }

    /* Visible focus indicators */
    :focus-visible {
      outline: 3px solid #4A90D9;
      outline-offset: 2px;
    }

    /* Minimum touch target size */
    button, a, input, select, textarea {
      min-height: 44px;
      min-width: 44px;
    }
  </style>
</head>
<body>
  <!-- Skip navigation -->
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <a href="#search" class="skip-link">Skip to search</a>

  <header role="banner">
    <nav aria-label="Primary navigation">
      <ul role="list">
        <li><a href="/" aria-current="page">Home</a></li>
        <li><a href="/products">Products</a></li>
        <li><a href="/about">About</a></li>
        <li><a href="/contact">Contact</a></li>
      </ul>
    </nav>
    <form role="search" id="search" aria-label="Site search">
      <label for="search-input" class="visually-hidden">Search</label>
      <input id="search-input" type="search" placeholder="Search..." aria-describedby="search-hint">
      <span id="search-hint" class="visually-hidden">Search products, articles, and help topics</span>
      <button type="submit" aria-label="Submit search">
        <svg aria-hidden="true" focusable="false"><!-- icon --></svg>
      </button>
    </form>
  </header>

  <nav aria-label="Breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li><a href="/products">Products</a></li>
      <li><a href="/products/electronics" aria-current="page">Electronics</a></li>
    </ol>
  </nav>

  <main id="main-content" tabindex="-1">
    <h1>Electronics</h1>
    <!-- Page content -->

    <section aria-labelledby="featured-heading">
      <h2 id="featured-heading">Featured Products</h2>
      <!-- Section content -->
    </section>
  </main>

  <aside aria-label="Related categories">
    <!-- Sidebar content -->
  </aside>

  <footer role="contentinfo">
    <nav aria-label="Footer navigation">
      <!-- Footer links -->
    </nav>
  </footer>
</body>
</html>
```

## Common Pitfalls

- **Using `div` and `span` for interactive elements**: Custom buttons built with `<div onclick="...">` lack keyboard support, focus management, and screen reader semantics. Use native `<button>` or `<a>` elements which provide these for free. If you must use a div, add `role="button"`, `tabindex="0"`, and keyboard event handlers for Enter and Space
- **Relying on color alone to convey information**: Red text for errors, green for success, or color-coded charts exclude colorblind users (8% of males). Always pair color with text labels, icons, or patterns. Error messages need text like "Error:" not just red styling
- **Missing or incorrect ARIA usage**: Adding `aria-label` to elements that already have visible text creates confusion (screen readers announce both). Using `role="button"` without implementing keyboard handlers creates a broken experience. The first rule of ARIA: don't use ARIA if native HTML provides the semantics
- **Inaccessible custom dropdowns and autocompletes**: Custom select components that don't implement the combobox or listbox ARIA pattern are unusable with screen readers. They need `role="combobox"`, `aria-expanded`, `aria-activedescendant`, and full keyboard navigation (arrow keys, Home, End, type-ahead)
- **Focus management failures in SPAs**: Client-side navigation doesn't trigger screen reader page announcements like traditional page loads. After route changes, programmatically move focus to the new page's heading or main content area, and announce the page title via an `aria-live` region
- **Hiding content incorrectly**: `display: none` and `visibility: hidden` hide from both visual users and screen readers. Use `.visually-hidden` CSS class (absolute positioning off-screen) for content that should be screen-reader-only. Use `aria-hidden="true"` for decorative content that should be hidden from screen readers but visible

## Real-World Use Cases

**Government Digital Services**: The UK's GOV.UK platform serves 4 million weekly users including many with disabilities. Their design system enforces WCAG 2.1 AA compliance with components tested across JAWS, NVDA, VoiceOver, and Dragon NaturallySpeaking. Every form follows a consistent error pattern: error summary at the top with links to each field, inline error messages associated via `aria-describedby`, and red left-border visual indicator. This pattern reduced form abandonment by 25%.

**E-Commerce Accessibility Remediation**: A major retailer faced a lawsuit under ADA Title III for inaccessible product pages. The remediation project involved: adding alt text to 500,000 product images using AI-generated descriptions reviewed by humans, implementing keyboard-navigable product carousels with proper ARIA roles, fixing color contrast on 200+ components, and adding screen reader announcements for cart updates and filter changes. Post-remediation, they saw a 12% increase in conversions from users with assistive technologies.

**Banking Application**: A financial institution built an accessible dashboard for account management. Complex data tables use proper `<th scope="col/row">` markup with sortable columns announced via `aria-sort`. Transaction filters use an accessible combobox pattern with type-ahead search. Real-time balance updates use `aria-live="polite"` to announce changes without disrupting the user's current task. The application passes automated testing (axe-core) and quarterly manual audits with screen reader users.

## Interview Questions

**Q: What is the difference between `aria-label`, `aria-labelledby`, and `aria-describedby`?**

A: `aria-label` provides an accessible name as a string directly on the element — use when there's no visible text label (icon buttons, search inputs with placeholder only). `aria-labelledby` references another element's ID whose text content becomes the accessible name — use when a visible heading or label exists elsewhere on the page (modal title labeling the dialog). `aria-describedby` provides supplementary description that screen readers announce after the name and role — use for hints, error messages, or additional context (password requirements, field format hints). Priority order for accessible name calculation: `aria-labelledby` > `aria-label` > native label (`<label for>`) > content. Key distinction: `aria-labelledby` and `aria-label` define what the element IS (its name), while `aria-describedby` provides additional context about it.

**Q: How do you make a single-page application accessible for screen reader users?**

A: SPAs break the traditional page load model that screen readers rely on for navigation announcements. Solutions: First, manage focus on route changes — move focus to the new page's `<h1>` or a skip-link target after navigation completes. Second, announce page changes using an `aria-live` region that updates with the new page title. Third, update `document.title` on every route change so screen reader users can identify their location. Fourth, ensure the browser's back/forward buttons work correctly and restore focus position. Fifth, use proper landmark regions (`<main>`, `<nav>`, `<aside>`) so users can navigate by landmarks. Sixth, implement loading states accessibly — announce "Loading" via `aria-live` and announce completion. Seventh, handle dynamic content updates (infinite scroll, live data) with appropriate `aria-live` politeness levels. Test with actual screen readers (NVDA on Windows, VoiceOver on macOS) — automated tools cannot verify the user experience of dynamic content.

**Q: Explain the accessibility tree and how browsers construct it.**

A: The accessibility tree is a simplified representation of the DOM that assistive technologies interact with. Browsers construct it by: mapping HTML elements to accessibility roles (e.g., `<button>` → role "button", `<nav>` → role "navigation"), computing accessible names from labels/content/ARIA attributes, determining states and properties (checked, expanded, disabled, required), and establishing relationships (labelledby, describedby, owns, controls). Elements with `aria-hidden="true"` or `display: none` are excluded from the tree. Custom elements without semantic HTML need explicit ARIA roles and properties to appear correctly. The tree exposes: role (what the element is), name (what it's called), state (its current condition), and value (for inputs). Chrome DevTools' Accessibility tab shows the computed tree, and the Accessibility Inspector in Firefox shows how each element maps. Understanding this tree is essential for debugging why screen readers announce elements incorrectly.

**Q: How do you test for accessibility and what tools do you use?**

A: Multi-layered testing approach. Automated testing (catches 30-50% of issues): axe-core integrated into CI/CD (via jest-axe or cypress-axe), Lighthouse accessibility audit, ESLint plugin jsx-a11y for compile-time checks. Manual testing (catches remaining issues): keyboard-only navigation (Tab, Shift+Tab, Enter, Space, Escape, Arrow keys), screen reader testing with NVDA (Windows), VoiceOver (macOS/iOS), TalkBack (Android), zoom to 200% and verify no content is lost, Windows High Contrast mode verification. Browser tools: Chrome DevTools Accessibility tab for inspecting the accessibility tree, Firefox Accessibility Inspector for contrast checking and tabbing order visualization, WAVE browser extension for visual overlay of issues. Process: run automated tests in CI on every PR, conduct manual screen reader testing for new components, perform quarterly full-site audits with assistive technology users, and maintain an accessibility checklist in the component library documentation.

## Production Tips

- **Integrate axe-core into your CI pipeline** to catch regressions automatically. Use `@axe-core/react` in development for real-time warnings, `jest-axe` in unit tests for component-level checks, and `cypress-axe` or `playwright` with axe for integration tests. Block PRs that introduce new violations. This catches ~40% of issues automatically, freeing manual testing time for the complex interactions that tools cannot evaluate
- **Maintain a component library with built-in accessibility**: Build accessible patterns once (modal, dropdown, tabs, accordion, toast notifications) and reuse them. Document the keyboard interaction pattern, ARIA attributes, and screen reader behavior for each component. This prevents individual developers from reinventing (and breaking) complex accessible interactions
- **Use `prefers-reduced-motion` media query** to respect user preferences for reduced animation. Users with vestibular disorders can experience nausea from parallax effects, auto-playing videos, and complex transitions. Wrap all animations in `@media (prefers-reduced-motion: no-preference)` and provide instant state changes as the default

## Related Topics

- [Web Performance](./web-performance.md) — Performance and accessibility are complementary concerns for user experience
- [REST API Design](../backend/rest-api-design.md) — API error responses that support accessible error display patterns
- [Security](../backend/security.md) — Authentication flows that must be accessible (CAPTCHA alternatives, MFA)
