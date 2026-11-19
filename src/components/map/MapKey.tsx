import React from 'react';
import { Modal, View } from 'react-native';
import type { AvailabilityStatus } from '../../lib/types';
import { useSettings } from '../../state/SettingsContext';
import { STATUS_SHAPE_LABEL, StatusIcon } from '../StatusIcon';
import { AppText, BigButton } from '../ui';

/** "Map key" explaining the marker colours and shapes. */
export function MapKey({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useSettings();
  const rows: { status: AvailabilityStatus; text: string }[] = [
    { status: 'available', text: 'Available now' },
    { status: 'closed', text: 'Closed right now' },
    { status: 'restricted', text: 'Private / restricted access' },
    { status: 'unknown', text: 'Opening hours not confirmed' },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: theme.space(5) }}>
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: theme.colors.background,
            borderRadius: theme.radius,
            padding: theme.space(4),
            gap: theme.space(3),
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.border,
          }}
        >
          <AppText variant="title" accessibilityRole="header">
            Map key
          </AppText>
          {rows.map((r) => (
            <View
              key={r.status}
              accessible
              accessibilityLabel={`${STATUS_SHAPE_LABEL[r.status]}: ${r.text}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}
            >
              <StatusIcon status={r.status} />
              <AppText variant="body" style={{ flex: 1 }}>
                {r.text}
              </AppText>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
            <StatusIcon status="available" community />
            <AppText variant="body" style={{ flex: 1 }}>
              Small blue badge = added by app users or from council open data (not OpenStreetMap)
            </AppText>
          </View>
          <BigButton label="Close" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
