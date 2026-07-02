import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Hand-styled element map instead of a typography plugin so article text
// uses the same tokens (muted-foreground, primary, card) as the rest of
// the site.
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h2 className="mt-10 text-2xl font-semibold tracking-tight first:mt-0">
            {children}
          </h2>
        ),
        h2: ({ children }) => (
          <h2 className="mt-10 text-2xl font-semibold tracking-tight first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-8 text-lg font-semibold tracking-tight">
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="leading-7">{children}</p>,
        a: ({ href, children }) => (
          <a
            href={href}
            className="font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="list-disc space-y-2 pl-6">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal space-y-2 pl-6">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-7">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-4 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-8" />,
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-lg bg-card p-4 font-mono text-sm ring-1 ring-foreground/10 [&_code]:bg-transparent [&_code]:p-0">
            {children}
          </pre>
        ),
        code: ({ children }) => (
          <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[0.85em] ring-1 ring-foreground/10">
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b px-3 py-2 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border/50 px-3 py-2">{children}</td>
        ),
        img: ({ src, alt }) => (
          // Content-repo images have unknown dimensions/hosts, which
          // next/image can't optimize without remotePatterns config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? ""} className="rounded-lg" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
