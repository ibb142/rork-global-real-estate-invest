import { Platform, LogBox } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { getAuthToken } from './auth-store';
import logger from './logger';

LogBox.ignoreLogs(['expo-notifications: Android Push notificati']);

if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    logger.push.warn('Handler setup skipped:', e);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.push.log('Web platform - skipping native push registration');
    return null;
  }

  if (!Device.isDevice) {
    logger.push.log('Not a physical device - push notifications require a real device');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      logger.push.log('Requesting permission...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.push.log('Permission not granted:', finalStatus);
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    let tokenData;
    if (projectId) {
      tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    } else {
      tokenData = await Notifications.getExpoPushTokenAsync();
    }

    const token = tokenData.data;
    logger.push.log('Token obtained:', token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C5FF3C',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('investments', {
        name: 'Investment Updates',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('security', {
        name: 'Security Alerts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
      });

      logger.push.log('Android notification channels created');
    }

    return token;
  } catch (error) {
    logger.push.error('Registration error:', error);
    return null;
  }
}

export async function registerTokenWithBackend(token: string): Promise<boolean> {
  const authToken = getAuthToken();
  if (!authToken) {
    logger.push.log('No auth token - skipping backend registration');
    return false;
  }

  try {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.push.log('No Supabase user - skipping token registration');
      return false;
    }

    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,token' });

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01' || error.message?.includes('relation')) {
        logger.push.warn('push_tokens table does not exist in Supabase. Push token saved locally only. Run supabase-master-setup.sql to create the table.');
      } else {
        logger.push.log('Token registration note:', error.message);
      }
      return false;
    }

    logger.push.log('Token registered with Supabase');
    return true;
  } catch (error) {
    logger.push.error('Backend registration error:', error);
    return false;
  }
}

export async function unregisterTokenFromBackend(token: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('token', token);

    if (error) {
      logger.push.log('Token unregister note:', error.message);
      return false;
    }

    logger.push.log('Token unregistered from Supabase');
    return true;
  } catch (error) {
    logger.push.error('Backend unregister error:', error);
    return false;
  }
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function getBadgeCount(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  try {
    return await Notifications.getBadgeCountAsync();
  } catch {
    return 0;
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    logger.push.error('Set badge error:', error);
  }
}
