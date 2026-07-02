"use client";

import { Icon, type IconifyIcon } from "@iconify/react";
import goIcon from "@iconify-icons/logos/go";
import pythonIcon from "@iconify-icons/logos/python";
import typescriptIcon from "@iconify-icons/logos/typescript-icon";
import curlIcon from "@iconify-icons/simple-icons/curl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Snippet = {
  value: string;
  label: string;
  icon: IconifyIcon;
  code: string;
};

const SNIPPETS: Snippet[] = [
  {
    value: "typescript",
    label: "TypeScript",
    icon: typescriptIcon,
    code: `const res = await fetch("https://api.betterfetch.co/v1/fetch", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.BETTER_FETCH_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url: "https://example.com" }),
});

const page = await res.json();
console.log(page.status, page.title, page.html);`,
  },
  {
    value: "python",
    label: "Python",
    icon: pythonIcon,
    code: `import os
import requests

res = requests.post(
    "https://api.betterfetch.co/v1/fetch",
    headers={"Authorization": f"Bearer {os.environ['BETTER_FETCH_API_KEY']}"},
    json={"url": "https://example.com"},
)

page = res.json()
print(page["status"], page["title"], page["html"])`,
  },
  {
    value: "go",
    label: "Go",
    icon: goIcon,
    code: `body := strings.NewReader(\`{"url": "https://example.com"}\`)
req, _ := http.NewRequest("POST", "https://api.betterfetch.co/v1/fetch", body)
req.Header.Set("Authorization", "Bearer "+os.Getenv("BETTER_FETCH_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, err := http.DefaultClient.Do(req)
if err != nil {
    log.Fatal(err)
}
defer res.Body.Close()`,
  },
  {
    value: "curl",
    label: "cURL",
    icon: curlIcon,
    code: `curl -s https://api.betterfetch.co/v1/fetch \\
  -H "Authorization: Bearer $BETTER_FETCH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example.com"}'`,
  },
];

export function CodeTabs() {
  return (
    <Tabs defaultValue="typescript" className="w-full">
      <TabsList>
        {SNIPPETS.map((snippet) => (
          <TabsTrigger key={snippet.value} value={snippet.value}>
            <Icon icon={snippet.icon} className="size-4" aria-hidden />
            {snippet.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SNIPPETS.map((snippet) => (
        <TabsContent key={snippet.value} value={snippet.value}>
          {/* Fixed height so switching tabs never reflows the sections below. */}
          <pre className="h-72 overflow-auto rounded-lg border bg-muted/50 p-4 text-left font-mono text-sm leading-relaxed">
            {snippet.code}
          </pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}
