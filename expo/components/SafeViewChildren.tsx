import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * Sanitize React children that are about to be rendered inside a <View>.
 *
 * React Native crashes with "Unexpected text node: ... A text node cannot be
 * a child of a <View>" when a string or number ends up as a direct child of
 * a View. This helper wraps any stray primitive children in <Text>, drops
 * empty whitespace strings, ignores booleans/null/undefined, and recurses
 * into Fragments so deeply-nested fragment children are also sanitized.
 */
export function renderSafeViewChildren(
  children: React.ReactNode,
  textStyle?: StyleProp<TextStyle>,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (child == null) {
      return null;
    }

    if (typeof child === 'boolean') {
      return null;
    }

    if (typeof child === 'string') {
      return child.trim().length > 0 ? <Text style={textStyle}>{child}</Text> : null;
    }

    if (typeof child === 'number') {
      if (!Number.isFinite(child)) {
        return null;
      }
      return <Text style={textStyle}>{child}</Text>;
    }

    if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment) {
      return <>{renderSafeViewChildren(child.props.children, textStyle)}</>;
    }

    return child;
  });
}

