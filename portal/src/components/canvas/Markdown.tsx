import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export default function MarkdownRenderer({ content }: { content: string }) {
  const formattedContent = content.replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  return (
    <div className="markdown-body">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        children={formattedContent}
      />
    </div>
  );
}
