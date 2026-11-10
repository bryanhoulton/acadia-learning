import React, { useMemo } from 'react';

import {
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

import { DisplayMathSvg } from './DisplayMathSvg';
import { InlineMathSvg } from './InlineMathSvg';

interface MarkdownWebViewProps {
  content: string;
  style?: any;
}

// Simple markdown-it math plugin for LaTeX
const mathPlugin = (md: any) => {
  md.inline.ruler.push("math_inline", (state: any) => {
    const pos = state.pos;
    const maximum = state.posMax;

    if (state.src[pos] !== "$") return false;
    if (pos + 1 >= maximum) return false;
    if (state.src[pos + 1] === "$") return false; // skip display math here

    let end = pos + 1;
    while (end < maximum && state.src[end] !== "$") {
      if (state.src[end] === "\\") end += 2;
      else end += 1;
    }

    if (end >= maximum) return false;

    const token = state.push("math_inline", "math", 0);
    token.content = state.src.slice(pos + 1, end);
    token.markup = "$";

    state.pos = end + 1;
    return true;
  });

  md.block.ruler.before("fence", "math_block", (state: any) => {
    const pos = state.bMarks[state.line] + state.tShift[state.line];
    const maximum = state.eMarks[state.line];

    if (pos + 2 > maximum) return false;
    if (state.src[pos] !== "$" || state.src[pos + 1] !== "$") return false;

    let end = state.line;
    let content = "";

    // Collect the rest of the opening line after $$
    const firstLineEnd = state.eMarks[state.line];
    const firstLineContent = state.src.slice(pos + 2, firstLineEnd);
    content = firstLineContent;

    // Loop through subsequent lines
    while (end < state.lineMax) {
      end += 1;
      if (end >= state.lineMax) break;

      const lineStart = state.bMarks[end] + state.tShift[end];
      const lineEnd = state.eMarks[end];

      // Check if this line has the closing $$
      if (
        lineStart < lineEnd &&
        state.src[lineStart] === "$" &&
        state.src[lineStart + 1] === "$"
      ) {
        // Add content before the $$ on this line
        content +=
          "\n" + state.src.slice(lineStart - state.tShift[end], lineStart);
        break;
      } else {
        // Add the entire line
        const lineContent = state.src.slice(lineStart, lineEnd);
        content += (content ? "\n" : "") + lineContent;
      }
    }

    const token = state.push("math_block", "div", 0);
    token.content = content.trim();
    token.markup = "$$";
    token.map = [state.line, end + 1];

    state.line = end + 1;
    return true;
  });
};

export function MarkdownWebView({ content, style }: MarkdownWebViewProps) {
  const { width } = useWindowDimensions();

  const markdownItInstance = useMemo(
    () => MarkdownIt({ typographer: true }).use(mathPlugin),
    []
  );

  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          fontSize: 16,
          lineHeight: 24,
          color: "#111827",
        },
        heading1: {
          fontSize: 24,
          fontWeight: "bold",
          marginTop: 12,
          marginBottom: 8,
          color: "#000000",
        },
        heading2: {
          fontSize: 24,
          fontWeight: "bold",
          marginTop: 10,
          marginBottom: 6,
          color: "#111827",
        },
        heading3: {
          fontSize: 20,
          fontWeight: "bold",
          marginTop: 8,
          marginBottom: 4,
          color: "#374151",
        },
        paragraph: {
          marginVertical: 8,
          color: "#111827",
        },
        text: {
          color: "#111827",
        },
        strong: {
          fontWeight: "bold",
        },
        em: {
          fontStyle: "italic",
        },
        code_inline: {
          backgroundColor: "#f3f4f6",
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: 3,
          fontFamily: "Courier New",
          fontSize: 14,
          color: "#dc2626",
        },
        code_block: {
          backgroundColor: "#f3f4f6",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 4,
          marginVertical: 8,
          fontFamily: "Courier New",
          fontSize: 13,
          color: "#111827",
        },
        fence: {
          backgroundColor: "#f3f4f6",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 4,
          marginVertical: 8,
          fontFamily: "Courier New",
          fontSize: 13,
          color: "#111827",
        },
        list_item: {
          marginVertical: 4,
        },
        bullet_list: {
          marginVertical: 8,
          paddingLeft: 16,
        },
        ordered_list: {
          marginVertical: 8,
          paddingLeft: 16,
        },
        blockquote: {
          borderLeftColor: "#e5e7eb",
          borderLeftWidth: 4,
          paddingLeft: 12,
          marginLeft: 0,
          marginVertical: 8,
          backgroundColor: "#f9fafb",
          paddingVertical: 8,
          paddingRight: 8,
        },
        link: {
          color: "#2563eb",
        },
        image: {
          maxWidth: width - 32,
        },
        table: {
          borderColor: "#e5e7eb",
          borderWidth: 1,
          marginVertical: 8,
        },
        tableHeader: {
          backgroundColor: "#f3f4f6",
        },
        tableHeaderCell: {
          paddingHorizontal: 8,
          paddingVertical: 6,
          fontWeight: "bold",
        },
        tableRow: {},
        tableRowCell: {
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderColor: "#e5e7eb",
          borderBottomWidth: 1,
        },
        math_inline: {
          marginHorizontal: 4,
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: 3,
          minHeight: 24,
        },
        math_block: {
          alignItems: "center",
          marginVertical: 12,
          paddingVertical: 8,
          borderRadius: 4,
          paddingHorizontal: 8,
        },
      }),
    [width]
  );

  const renderRules = useMemo(
    () => ({
      math_inline: (node: any, children: any, parent: any, styles: any) => (
        <View key={node.key} style={styles.math_inline}>
          <InlineMathSvg latex={node.content} />
        </View>
      ),
      math_block: (node: any, children: any, parent: any, styles: any) => (
        <View key={node.key} style={styles.math_block}>
          <DisplayMathSvg latex={node.content} />
        </View>
      ),
    }),
    []
  );

  return (
    <View style={[{ width: "100%" }, style]}>
      <Markdown
        markdownit={markdownItInstance}
        style={markdownStyles}
        rules={renderRules}
      >
        {content}
      </Markdown>
    </View>
  );
}
