// src/services/notifications.service.ts
// Servicio para enviar notificaciones por email

import { supabase } from '@/lib/supabase';

export type NotificationType = 'proposal_submitted' | 'proposal_approved' | 'proposal_rejected';

export interface NotificationData {
  type: NotificationType;
  userEmail: string;
  userName?: string;
  contentType: string;
  contentTitle: string;
  reviewNotes?: string;
}

/**
 * Envía notificaciones por email usando Supabase Edge Function
 */
export async function sendNotificationEmail(data: NotificationData): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-notification-email', {
      body: data,
    });

    if (error) {
      console.error('Error calling notification function:', error);
      return { success: false, error: error.message };
    }

    console.log('Notification sent:', result);
    return { success: true };
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Envía notificación cuando se crea una nueva propuesta
 */
export async function notifyProposalSubmitted(
  userEmail: string,
  contentType: string,
  contentTitle: string,
  userName?: string
): Promise<void> {
  await sendNotificationEmail({
    type: 'proposal_submitted',
    userEmail,
    userName,
    contentType,
    contentTitle,
  });
}

/**
 * Envía notificación cuando se aprueba una propuesta
 */
export async function notifyProposalApproved(
  userEmail: string,
  contentType: string,
  contentTitle: string,
  userName?: string
): Promise<void> {
  await sendNotificationEmail({
    type: 'proposal_approved',
    userEmail,
    userName,
    contentType,
    contentTitle,
  });
}

/**
 * Envía notificación cuando se rechaza una propuesta
 */
export async function notifyProposalRejected(
  userEmail: string,
  contentType: string,
  contentTitle: string,
  reviewNotes?: string,
  userName?: string
): Promise<void> {
  await sendNotificationEmail({
    type: 'proposal_rejected',
    userEmail,
    userName,
    contentType,
    contentTitle,
    reviewNotes,
  });
}
