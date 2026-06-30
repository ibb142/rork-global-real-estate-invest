import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Info, AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { RoomComposerNote } from '../services/roomCapabilityResolver';

type ComposerStatusNoteProps = {
  notes: RoomComposerNote[];
};

function ComposerStatusNoteInner({ notes }: ComposerStatusNoteProps) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} testID="chat-room-composer-notes">
      {notes.map((note) => (
        <View
          key={note.id}
          style={[styles.note, note.tone === 'warning' ? styles.noteWarning : styles.noteInfo]}
          testID={note.testID}
        >
          {note.tone === 'warning' ? (
            <AlertTriangle size={13} color={Colors.warning} />
          ) : (
            <Info size={13} color={Colors.info} />
          )}
          <Text style={[styles.noteText, note.tone === 'warning' ? styles.noteTextWarning : styles.noteTextInfo]}>
            {note.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const ComposerStatusNote = React.memo(ComposerStatusNoteInner);

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  noteWarning: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.2)',
  },
  noteInfo: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.2)',
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  noteTextWarning: {
    color: Colors.warning,
  },
  noteTextInfo: {
    color: Colors.info,
  },
});
