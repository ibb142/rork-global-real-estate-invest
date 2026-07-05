import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '😮', '😢', '🙏'] as const;

export type ReactionPickerProps = {
  visible: boolean;
  emojis: readonly string[];
  activeEmojis?: string[];
  onSelect: (emoji: string) => void;
  onClose: () => void;
  testID?: string;
};

export function ReactionPicker({
  visible,
  emojis,
  activeEmojis = [],
  onSelect,
  onClose,
  testID,
}: ReactionPickerProps) {
  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID ?? 'reaction-picker'}-backdrop`}>
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Add reaction</Text>
          <View style={styles.row}>
            {emojis.map((emoji) => {
              const isActive = activeEmojis.includes(emoji);
              return (
                <Pressable
                  key={emoji}
                  style={({ pressed }) => [
                    styles.emojiButton,
                    isActive ? styles.emojiButtonActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() => onSelect(emoji)}
                  testID={`${testID ?? 'reaction-picker'}-option-${emoji}`}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${emoji}`}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 18,
    gap: 12,
  },
  title: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  emojiButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButtonActive: {
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderColor: 'rgba(255,215,0,0.5)',
  },
  emoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
});
