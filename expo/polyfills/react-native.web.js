import React from 'react';
import * as RNWeb from 'react-native-web';
import AlertPolyfill from './alert.web';

function WebRefreshControl({ children }) {
  return children ?? null;
}

const RefreshControl = WebRefreshControl;
const Alert = AlertPolyfill;

export * from 'react-native-web';
export { Alert, RefreshControl };
export default RNWeb;
