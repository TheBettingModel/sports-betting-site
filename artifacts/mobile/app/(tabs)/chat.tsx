import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  Keyboard
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import {
  useGetChatAccess,
  useGetChatMessages,
  useCreateChatMessage,
  useUpdateChatPreferences,
  getGetChatMessagesQueryKey,
  getGetChatAccessQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@/lib/revenuecat';

const formatTime = (isoString: string) => {
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAuth();
  const { hasServerEntitlement } = useSubscription();
  const queryClient = useQueryClient();

  const scopedAccessKey = [...getGetChatAccessQueryKey(), { viewerId: userId ?? 'signed-out', isSubscribed: hasServerEntitlement }];
  const { data: access, isLoading: accessLoading } = useGetChatAccess({
    query: {
      queryKey: scopedAccessKey,
      enabled: !!userId && hasServerEntitlement,
    }
  });

  const scopedMessagesKey = [...getGetChatMessagesQueryKey(), { viewerId: userId ?? 'signed-out', isSubscribed: hasServerEntitlement, canRead: access?.canRead ?? false }];
  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages, isRefetching } = useGetChatMessages({
    query: {
      queryKey: scopedMessagesKey,
      enabled: !!userId && hasServerEntitlement && access?.canRead === true,
    }
  });

  // Clear caches aggressively to prevent data leaks across accounts/entitlement transitions
  useEffect(() => {
    if (!userId || !hasServerEntitlement || access?.canRead === false) {
      queryClient.removeQueries({ queryKey: getGetChatMessagesQueryKey() });
    }
  }, [userId, hasServerEntitlement, access?.canRead, queryClient]);

  const createMsg = useCreateChatMessage();
  const updatePrefs = useUpdateChatPreferences();

  const [input, setInput] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const inputRef = useRef<TextInput>(null);
  
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Fail closed: until the server explicitly grants read access, never render
  // the message surface. This also prevents stale/error states from looking
  // like an unlocked but empty chat.
  const isFree = !hasServerEntitlement || access?.canRead !== true;
  const canPost = hasServerEntitlement && access?.canPost === true;

  const handleSend = useCallback(() => {
    if (!input.trim() || !canPost) return;
    const body = input.trim();
    setInput('');
    createMsg.mutate({ data: { body } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: scopedMessagesKey });
        inputRef.current?.focus();
      },
      onError: (err) => {
        console.error(err);
        setInput(body);
      }
    });
  }, [input, canPost, createMsg, queryClient, scopedMessagesKey]);

  const toggleNotifs = useCallback(() => {
    if (!access) return;
    const newVal = !access.chatNotificationsEnabled;
    updatePrefs.mutate({ data: { chatNotificationsEnabled: newVal } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: scopedAccessKey });
      }
    });
  }, [access, updatePrefs, queryClient, scopedAccessKey]);

  if (hasServerEntitlement && accessLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </View>
    );
  }

  if (isFree) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 16 : 0) }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>MODEL CHAT</Text>
        </View>
        <View style={styles.lockedContainer}>
          <View style={[styles.lockedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="lock" size={32} color={colors.gold} style={{ marginBottom: 16 }} />
            <Text style={[styles.lockedTitle, { color: colors.foreground }]}>PRO CHAT</Text>
            <Text style={[styles.lockedDesc, { color: colors.mutedForeground }]}>
              Unlock real-time updates, analysis, and injury news directly from the model owner.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.unlockBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              onPress={() => router.push('/membership')}
            >
              <Text style={styles.unlockBtnText}>Upgrade to Pro</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const canRead = hasServerEntitlement && access?.canRead === true;
  const messages = canRead ? (messagesData?.messages ?? []) : [];
  const tabBarHeight = Platform.OS === 'web' ? 84 : (insets.bottom + 60);
  const bottomPadding = isKeyboardVisible ? (Platform.OS === 'ios' ? 12 : 12) : tabBarHeight;
  
  // For Pro users who cannot post, we just pad the flatlist itself
  const listBottomPadding = canPost ? 24 : tabBarHeight + 24;

  const renderItem = ({ item }: { item: any }) => {
    return (
      <View style={[styles.messageBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.messageHeader}>
          <Text style={[styles.messageAuthor, { color: colors.primary }]}>{item.authorDisplayName}</Text>
          <Text style={[styles.messageTime, { color: colors.mutedForeground }]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
        <Text style={[styles.messageBody, { color: colors.foreground }]}>{item.body}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 16 : 0) }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>MODEL CHAT</Text>
        <Pressable 
          onPress={toggleNotifs} 
          style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.6 : 1 }]}
          accessibilityLabel={access?.chatNotificationsEnabled ? "Disable chat notifications" : "Enable chat notifications"}
        >
          <Feather name={access?.chatNotificationsEnabled ? "bell" : "bell-off"} size={20} color={access?.chatNotificationsEnabled ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
        inverted={false}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshing={isRefetching}
        onRefresh={() => refetchMessages()}
        ListEmptyComponent={
          !messagesLoading ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No messages yet.</Text>
            </View>
          ) : null
        }
      />

      {canPost && (
        <View style={[styles.inputContainer, { 
          backgroundColor: colors.card, 
          borderTopColor: colors.border,
          paddingBottom: bottomPadding
        }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { 
              backgroundColor: colors.background, 
              color: colors.foreground,
              borderColor: colors.border,
              height: Math.max(40, inputHeight)
            }]}
            placeholder="Send an update..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn, 
              { 
                backgroundColor: input.trim() ? colors.primary : colors.muted,
                opacity: (pressed || createMsg.isPending) ? 0.7 : 1 
              }
            ]}
            onPress={handleSend}
            disabled={!input.trim() || createMsg.isPending}
            accessibilityLabel="Send message"
          >
            {createMsg.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="send" size={16} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  bellBtn: {
    padding: 8,
    marginRight: -8,
  },
  listContent: {
    padding: 16,
    gap: 16,
  },
  messageBubble: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  messageAuthor: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  messageTime: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  messageBody: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockedContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  lockedCard: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  lockedTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    marginBottom: 12,
    letterSpacing: 1,
  },
  lockedDesc: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  unlockBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  unlockBtnText: {
    color: '#000000',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
});
