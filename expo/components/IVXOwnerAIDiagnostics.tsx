import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Cpu, GitBranch, Hash, Package, Server, Smartphone } from 'lucide-react-native';
import Constants from 'expo-constants';
import { getIVXBuildInfo, type IVXBuildInfo } from '@/constants/build-info';
import Colors from '@/constants/colors';
import { SafeIcon } from '@/lib/safe-icon';

export interface IVXOwnerAIDiagnosticsProps {
  apiEnvironment?: string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toISOString();
  } catch {
    return iso;
  }
}

export function IVXOwnerAIDiagnostics({ apiEnvironment }: IVXOwnerAIDiagnosticsProps): React.JSX.Element {
  const [buildInfo, setBuildInfo] = useState<IVXBuildInfo>(getIVXBuildInfo());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBuildInfo(getIVXBuildInfo());
  }, []);

  const packageName = Constants.expoConfig?.android?.package ?? Constants.expoConfig?.ios?.bundleIdentifier ?? 'unknown';
  const versionCode = String(Constants.expoConfig?.android?.versionCode ?? 'unknown');
  const apiEnv = apiEnvironment ?? process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? 'unknown';

  const diagnosticText = [
    `App: ${buildInfo.appVersion} (${buildInfo.commitShort})`,
    `versionCode: ${versionCode}`,
    `Package: ${packageName}`,
    `Build marker: ${buildInfo.buildMarker}`,
    `Build timestamp: ${formatDate(buildInfo.buildTimestamp)}`,
    `Bundle boot: ${new Date(buildInfo.bundleBootEpochMs).toISOString()}`,
    `Watchdog patch: ${buildInfo.watchdogPatchVersion}`,
    `API: ${apiEnv}`,
  ].join('\n');

  const handleCopy = async () => {
    await Clipboard.setStringAsync(diagnosticText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <SafeIcon icon={Smartphone} size={14} color={Colors.gold} />
        <Text style={styles.label}>Version</Text>
        <Text style={styles.value}>{buildInfo.appVersion}</Text>
      </View>
      <View style={styles.row}>
        <SafeIcon icon={Hash} size={14} color={Colors.gold} />
        <Text style={styles.label}>versionCode</Text>
        <Text style={styles.value}>{versionCode}</Text>
      </View>
      <View style={styles.row}>
        <SafeIcon icon={GitBranch} size={14} color={Colors.gold} />
        <Text style={styles.label}>Git SHA</Text>
        <Text style={styles.value}>{buildInfo.commitShort}</Text>
      </View>
      <View style={styles.row}>
        <SafeIcon icon={Cpu} size={14} color={Colors.gold} />
        <Text style={styles.label}>Build time</Text>
        <Text style={styles.value}>{formatDate(buildInfo.buildTimestamp)}</Text>
      </View>
      <View style={styles.row}>
        <SafeIcon icon={Server} size={14} color={Colors.gold} />
        <Text style={styles.label}>API env</Text>
        <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">{apiEnv}</Text>
      </View>
      <View style={styles.row}>
        <SafeIcon icon={Package} size={14} color={Colors.gold} />
        <Text style={styles.label}>Bundle</Text>
        <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">{packageName}</Text>
      </View>
      <View style={styles.row}>
        <SafeIcon icon={Cpu} size={14} color={Colors.gold} />
        <Text style={styles.label}>Watchdog</Text>
        <Text style={styles.value}>{buildInfo.watchdogPatchVersion}</Text>
      </View>
      <Pressable onPress={handleCopy} style={styles.copyButton}>
        <Text style={styles.copyText}>{copied ? 'Copied!' : 'Copy diagnostics'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    color: '#888',
    fontSize: 12,
    width: 90,
    marginLeft: 8,
  },
  value: {
    color: '#fff',
    fontSize: 12,
    flex: 1,
    fontWeight: '600' as const,
  },
  copyButton: {
    marginTop: 8,
    backgroundColor: '#333',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyText: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '600' as const,
  },
});
