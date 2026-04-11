import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';

type TypingIndicatorProps = {
  isVisible: boolean;
  label: string;
};

function TypingDot({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  return <Animated.View style={[styles.dot, { opacity: anim }]} />;
}

function TypingIndicatorInner({ isVisible, label }: TypingIndicatorProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isVisible, slideAnim]);

  if (!isVisible && !label) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
      testID="chat-typing-indicator"
    >
      <View style={styles.dotsRow}>
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

export const TypingIndicator = memo(TypingIndicatorInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  label: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
});
