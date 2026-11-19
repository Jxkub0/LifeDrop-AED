/* eslint-disable react-hooks/refs, react-hooks/immutability --
 * Gesture handling: the pan responder's callbacks read and update refs only
 * while the user is dragging, never during render. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../state/SettingsContext";

/**
 * Google-Maps-style draggable sheet. Drag the handle (or tap it) to move
 * between snap heights; the content area scrolls on its own. Anything passed
 * as `floating` (map buttons) rides along just above the sheet's top edge.
 */
export function BottomSheet({
  snaps,
  index,
  onIndexChange,
  header,
  children,
  floating,
  style,
  testID,
}: {
  /** Heights in px, smallest first. */
  snaps: number[];
  index: number;
  onIndexChange: (i: number) => void;
  header?: React.ReactNode;
  children?: React.ReactNode;
  floating?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const theme = useTheme();
  const c = theme.colors;
  const safeIndex = Math.min(index, snaps.length - 1);
  const [height] = useState(() => new Animated.Value(snaps[safeIndex]));
  const current = useRef(snaps[safeIndex]);
  const snapsRef = useRef(snaps);
  const indexRef = useRef(safeIndex);
  const onIndexRef = useRef(onIndexChange);

  useEffect(() => {
    snapsRef.current = snaps;
    indexRef.current = safeIndex;
    onIndexRef.current = onIndexChange;
  });

  // Follow the requested snap point (e.g. a marker was selected).
  const target = snaps[safeIndex];
  useEffect(() => {
    current.current = target;
    Animated.spring(height, {
      toValue: target,
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [target, height]);

  const pan = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        start = current.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = snapsRef.current;
        const h = Math.max(s[0] * 0.8, Math.min(s[s.length - 1], start - g.dy));
        height.setValue(h);
      },
      onPanResponderRelease: (_e, g) => {
        const s = snapsRef.current;
        const h = start - g.dy - g.vy * 180; // fling carries on a little
        let best = 0;
        s.forEach((v, i) => {
          if (Math.abs(v - h) < Math.abs(s[best] - h)) best = i;
        });
        current.current = s[best];
        Animated.spring(height, {
          toValue: s[best],
          useNativeDriver: false,
          bounciness: 0,
          speed: 18,
        }).start();
        if (best !== indexRef.current) onIndexRef.current(best);
      },
    });
  }, [height]);

  const cycle = () => {
    const next =
      indexRef.current + 1 < snapsRef.current.length ? indexRef.current + 1 : 0;
    onIndexRef.current(next);
  };

  return (
    <>
      {/* Map buttons ride just above the sheet. Rendered as a sibling (not a child) so
          Android delivers touches to them – it ignores touches outside a parent's bounds. */}
      {floating ? (
        <Animated.View
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, right: 0, bottom: height }}
        >
          {floating}
        </Animated.View>
      ) : null}
      <Animated.View
        testID={testID}
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height,
            backgroundColor: c.background,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: theme.highContrast ? 3 : 0,
            borderColor: c.border,
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
            elevation: 16,
          },
          style,
        ]}
      >
        <View {...pan.panHandlers}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Results panel"
            accessibilityHint="Drag or tap to make the panel bigger or smaller"
            accessibilityActions={[
              { name: "increment" },
              { name: "decrement" },
            ]}
            onAccessibilityAction={(e) => {
              const i = indexRef.current;
              if (
                e.nativeEvent.actionName === "increment" &&
                i + 1 < snapsRef.current.length
              )
                onIndexRef.current(i + 1);
              if (e.nativeEvent.actionName === "decrement" && i > 0)
                onIndexRef.current(i - 1);
            }}
            onPress={cycle}
            style={{
              alignItems: "center",
              paddingTop: 8,
              paddingBottom: 6,
              minHeight: 24,
            }}
          >
            <View
              style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: c.border,
              }}
            />
          </Pressable>
          {header}
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      </Animated.View>
    </>
  );
}
