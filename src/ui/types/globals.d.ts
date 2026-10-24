// Globals index.html loads from vendored <script> tags (src/ui/vendor/),
// as far as converted code uses them. Optional because code checks for
// them before use (tests and early renders may run without them).
interface MarkedGlobal {
  parse(markdown: string): string;
}

interface DOMPurifyGlobal {
  sanitize(html: string, config?: Record<string, unknown>): string;
}

interface Window {
  marked?: MarkedGlobal;
  DOMPurify?: DOMPurifyGlobal;
}
