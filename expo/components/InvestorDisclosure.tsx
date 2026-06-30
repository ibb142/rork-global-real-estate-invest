import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { AlertTriangle, ChevronDown, ChevronUp, Shield } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { paymentService } from '@/lib/payment-service';

interface InvestorDisclosureProps {
  compact?: boolean;
  showSimulatedWarning?: boolean;
}

export default function InvestorDisclosure({ compact = false, showSimulatedWarning = true }: InvestorDisclosureProps) {
  const [expanded, setExpanded] = useState(!compact);
  const isSimulated = paymentService.isSimulated();

  return (
    <View style={styles.container}>
      {isSimulated && showSimulatedWarning && (
        <View style={styles.simulatedBanner}>
          <AlertTriangle size={16} color={Colors.warning} />
          <Text style={styles.simulatedText}>
            Payment processing is in demo mode. No real funds will be moved. Connect a payment provider (Stripe/Plaid) to enable live transactions.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Shield size={16} color={Colors.textSecondary} />
          <Text style={styles.headerText}>Investment Risk Disclosure</Text>
        </View>
        {compact && (
          expanded
            ? <ChevronUp size={18} color={Colors.textSecondary} />
            : <ChevronDown size={18} color={Colors.textSecondary} />
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <Text style={styles.disclosureText}>
            All investments involve risk, including the possible loss of principal. Past performance does not guarantee future results. Projected returns are estimates only and are not guaranteed. Real estate investments are illiquid and may not be suitable for all investors.
          </Text>
          <Text style={styles.disclosureText}>
            IVX Holdings LLC does not provide investment advice. You should consult with a qualified financial advisor before making any investment decisions. By proceeding, you acknowledge that you understand and accept these risks.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  simulatedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.warning + '18',
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  simulatedText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '500' as const,
    lineHeight: 17,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  body: {
    paddingTop: 4,
    gap: 8,
  },
  disclosureText: {
    fontSize: 11,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
});
