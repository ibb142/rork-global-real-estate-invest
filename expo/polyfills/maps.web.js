import React from 'react';
import { View } from 'react-native';

export function Marker() {
  return null;
}

export function Callout({ children }) {
  return children ?? null;
}

export function Circle() {
  return null;
}

export function Polygon() {
  return null;
}

export function Polyline() {
  return null;
}

export function PROVIDER_GOOGLE() {
  return 'google';
}

export default function MapView({ children, style, testID }) {
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}
