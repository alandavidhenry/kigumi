// First focusable element on every page: keyboard and switch users can jump
// past the sidebar and top bar straight to the page content (WCAG 2.4.1).
export function SkipLink() {
  return (
    <a
      href='#main'
      className='sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-pop focus:outline-none focus:ring-2 focus:ring-ring'
    >
      Skip to content
    </a>
  )
}
