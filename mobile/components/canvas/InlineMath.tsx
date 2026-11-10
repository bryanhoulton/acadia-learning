import React, { memo } from 'react';

import {
  Platform,
  View,
} from 'react-native';
import AutoHeightWebView from 'react-native-autoheight-webview';

const html = (latex: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>
  <style>
    body { margin:0; padding:0; }
    .wrap { display:inline-block; }
  </style>
</head>
<body>
  <span id="math" class="wrap"><\/span>
  <script>
    const latex = ${JSON.stringify(latex)};
    // Inline mode: no display style
    katex.render(latex, document.getElementById('math'), { throwOnError:false, displayMode:false });
  <\/script>
</body>
</html>`;

export const InlineMath = memo(
  ({ latex, fontSize = 16 }: { latex: string; fontSize?: number }) => {
    // Slight vertical nudge to align baseline with RN <Text>
    const yNudge = Platform.OS === "ios" ? 2 : 1;

    return (
      <View
        style={{ marginHorizontal: 2, transform: [{ translateY: yNudge }] }}
      >
        <AutoHeightWebView
          scrollEnabled={false}
          originWhitelist={["*"]}
          customStyle={`html{font-size:${fontSize}px;}`}
          source={{ html: html(latex) }}
        />
      </View>
    );
  }
);

InlineMath.displayName = "InlineMath";
