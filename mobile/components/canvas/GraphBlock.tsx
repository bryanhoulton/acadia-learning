import React from 'react';

import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { GraphBlock as GraphBlockType } from '../../types/blocks';

interface GraphBlockProps {
  data: GraphBlockType;
}

export function GraphBlock({ data }: GraphBlockProps) {
  const {
    equations = [],
    points = [],
    viewport_left,
    viewport_right,
    viewport_top,
    viewport_bottom,
  } = data;

  // Generate Desmos HTML
  const desmosHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <script src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=${encodeURIComponent(process.env.EXPO_PUBLIC_DESMOS_API_KEY || "")}"></script>
  <style>
    body { margin: 0; padding: 0; }
    #calculator { width: 100%; height: 400px; }
  </style>
</head>
<body>
  <div id="calculator"></div>
  <script>
    var elt = document.getElementById('calculator');
    var calculator = Desmos.GraphingCalculator(elt, {
      keypad: false,
      expressions: false,
      settingsMenu: false,
      zoomButtons: false,
    });

    // Set viewport
    calculator.setMathBounds({
      left: ${viewport_left},
      right: ${viewport_right},
      bottom: ${viewport_bottom},
      top: ${viewport_top}
    });

    // Add equations
    ${equations
      .map(
        (eq, i) => `
    calculator.setExpression({
      id: 'eq${i}',
      latex: '${eq.equation.replace(/\\/g, "\\\\")}',
      color: '${eq.color}'
    });`
      )
      .join("")}

    // Add points
    ${points
      .map(
        (pt, i) => `
    calculator.setExpression({
      id: 'pt${i}',
      latex: '(${pt.x},${pt.y})',
      color: '${pt.color}',
      label: ${pt.label ? `'${pt.label}'` : "undefined"},
      showLabel: ${!!pt.label}
    });`
      )
      .join("")}
  </script>
</body>
</html>
  `;

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        overflow: "hidden",
        height: 400,
      }}
    >
      <WebView
        originWhitelist={["*"]}
        source={{ html: desmosHTML }}
        style={{ flex: 1 }}
        scrollEnabled={false}
        javaScriptEnabled={true}
      />
    </View>
  );
}
