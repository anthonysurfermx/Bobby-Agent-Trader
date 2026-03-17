// src/services/forms.service.ts
import { supabase } from '../lib/supabase';
import { UUID, ISODateTime } from '../types/database.types';

// ====================================
// TYPE DEFINITIONS
// ====================================

export interface ContactForm {
  id: UUID;
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
  phone?: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  source: 'website' | 'social' | 'referral' | 'event' | 'other';
  created_at: ISODateTime;
  updated_at: ISODateTime;
  resolved_at?: ISODateTime;
  assigned_to?: UUID;
}

export interface ContactFormSubmission {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
  phone?: string;
  source?: string;
}

export interface EventRegistration {
  id: UUID;
  event_id: UUID;
  user_id?: UUID;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  dietary_restrictions?: string;
  accessibility_needs?: string;
  how_did_you_hear?: string;
  expectations?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'attended' | 'no_show';
  registration_date: ISODateTime;
  confirmation_sent_at?: ISODateTime;
  reminder_sent_at?: ISODateTime;
  check_in_time?: ISODateTime;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface EventRegistrationData {
  event_id: UUID;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  dietary_restrictions?: string;
  accessibility_needs?: string;
  how_did_you_hear?: string;
  expectations?: string;
}

export interface StartupApplication {
  id: UUID;
  startup_name: string;
  founder_name: string;
  founder_email: string;
  co_founders?: string;
  website?: string;
  linkedin_profile?: string;
  description: string;
  problem_statement: string;
  solution: string;
  target_market: string;
  business_model: string;
  traction: string;
  funding_stage: 'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'later' | 'bootstrap';
  funding_amount_sought?: number;
  team_size?: number;
  location: string;
  industry: string;
  technology_stack?: string;
  competitive_advantage: string;
  pitch_deck_url?: string;
  demo_url?: string;
  github_url?: string;
  additional_info?: string;
  status: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'waitlisted';
  review_notes?: string;
  submitted_at: ISODateTime;
  reviewed_at?: ISODateTime;
  reviewed_by?: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface StartupApplicationData {
  startup_name: string;
  founder_name: string;
  founder_email: string;
  co_founders?: string;
  website?: string;
  linkedin_profile?: string;
  description: string;
  problem_statement: string;
  solution: string;
  target_market: string;
  business_model: string;
  traction: string;
  funding_stage: 'pre_seed' | 'seed' | 'series_a' | 'series_b' | 'later' | 'bootstrap';
  funding_amount_sought?: number;
  team_size?: number;
  location: string;
  industry: string;
  technology_stack?: string;
  competitive_advantage: string;
  pitch_deck_url?: string;
  demo_url?: string;
  github_url?: string;
  additional_info?: string;
}

export interface NewsletterSubscriber {
  id: UUID;
  email: string;
  name?: string;
  interests?: string[];
  source: 'website' | 'event' | 'social' | 'referral' | 'import';
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained';
  subscribed_at: ISODateTime;
  unsubscribed_at?: ISODateTime;
  confirmed_at?: ISODateTime;
  last_email_sent?: ISODateTime;
  engagement_score?: number;
  metadata?: Record<string, any>;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface NewsletterSubscriptionData {
  email: string;
  name?: string;
  interests?: string[];
  source?: string;
}

// ====================================
// SERVICE CLASS
// ====================================

/**
 * Service for handling various form submissions and user interactions
 * Includes contact forms, event registrations, startup applications, and newsletter subscriptions
 */
class FormsService {
  
  // ====================================
  // CONTACT FORM METHODS
  // ====================================

  /**
   * Submit a contact form
   * @param formData - Contact form data
   * @returns Promise with the created contact form entry
   */
  async submitContactForm(formData: ContactFormSubmission): Promise<ContactForm> {
    try {
      // Validate required fields
      this.validateContactForm(formData);

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        company: formData.company?.trim() || null,
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        phone: formData.phone?.trim() || null,
        status: 'pending' as const,
        priority: this.determinePriority(formData),
        source: formData.source || 'website',
      };

      const { data, error } = await supabase
        .from('contact_forms')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error submitting contact form:', error);
        throw new Error(`Error submitting contact form: ${error.message}`);
      }

      // Send notification email (if you have email service set up)
      this.sendContactFormNotification(data);

      return data;
    } catch (error) {
      console.error('Error in submitContactForm:', error);
      throw error;
    }
  }

  /**
   * Get all contact forms with filtering and pagination
   */
  async getContactForms(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    priority?: string;
    search?: string;
  } = {}) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('contact_forms')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.priority) {
      query = query.eq('priority', params.priority);
    }

    if (params.search) {
      const searchTerm = params.search.trim();
      query = query.or(
        `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,subject.ilike.%${searchTerm}%,message.ilike.%${searchTerm}%`
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Error fetching contact forms: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // ====================================
  // EVENT REGISTRATION METHODS
  // ====================================

  /**
   * Register a user for an event
   * @param registrationData - Event registration data
   * @returns Promise with the created registration entry
   */
  async registerForEvent(registrationData: EventRegistrationData): Promise<EventRegistration> {
    try {
      // Validate required fields
      this.validateEventRegistration(registrationData);

      // Check if user is already registered
      const existingRegistration = await this.checkExistingEventRegistration(
        registrationData.event_id,
        registrationData.email
      );

      if (existingRegistration) {
        throw new Error('You are already registered for this event');
      }

      // Check event capacity
      const hasCapacity = await this.checkEventCapacity(registrationData.event_id);
      if (!hasCapacity) {
        throw new Error('This event is at full capacity');
      }

      const payload = {
        ...registrationData,
        email: registrationData.email.toLowerCase(),
        status: 'pending' as const,
        registration_date: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('event_registrations')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error registering for event:', error);
        throw new Error(`Error registering for event: ${error.message}`);
      }

      // Send confirmation email
      this.sendEventRegistrationConfirmation(data);

      return data;
    } catch (error) {
      console.error('Error in registerForEvent:', error);
      throw error;
    }
  }

  /**
   * Get event registrations with filtering
   */
  async getEventRegistrations(eventId: UUID, params: {
    status?: string;
    search?: string;
  } = {}) {
    let query = supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', eventId)
      .order('registration_date', { ascending: false });

    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.search) {
      const searchTerm = params.search.trim();
      query = query.or(
        `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error fetching event registrations: ${error.message}`);
    }

    return data || [];
  }

  // ====================================
  // STARTUP APPLICATION METHODS
  // ====================================

  /**
   * Submit a startup application
   * @param applicationData - Startup application data
   * @returns Promise with the created application entry
   */
  async submitStartupApplication(applicationData: StartupApplicationData): Promise<StartupApplication> {
    try {
      // Validate required fields
      this.validateStartupApplication(applicationData);

      // Check for duplicate applications
      const existingApplication = await this.checkExistingStartupApplication(
        applicationData.founder_email
      );

      if (existingApplication) {
        throw new Error('An application already exists for this email address');
      }

      const payload = {
        ...applicationData,
        founder_email: applicationData.founder_email.toLowerCase(),
        status: 'submitted' as const,
        submitted_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('startup_applications')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error submitting startup application:', error);
        throw new Error(`Error submitting startup application: ${error.message}`);
      }

      // Send confirmation email
      this.sendStartupApplicationConfirmation(data);

      return data;
    } catch (error) {
      console.error('Error in submitStartupApplication:', error);
      throw error;
    }
  }

  /**
   * Get startup applications with filtering and pagination
   */
  async getStartupApplications(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    industry?: string;
    funding_stage?: string;
    search?: string;
  } = {}) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(1, params.pageSize || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('startup_applications')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false });

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.industry) {
      query = query.eq('industry', params.industry);
    }

    if (params.funding_stage) {
      query = query.eq('funding_stage', params.funding_stage);
    }

    if (params.search) {
      const searchTerm = params.search.trim();
      query = query.or(
        `startup_name.ilike.%${searchTerm}%,founder_name.ilike.%${searchTerm}%,founder_email.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Error fetching startup applications: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // ====================================
  // NEWSLETTER SUBSCRIPTION METHODS
  // ====================================

  /**
   * Subscribe to newsletter
   * @param subscriptionData - Newsletter subscription data
   * @returns Promise with the created subscription entry
   */
  async subscribeNewsletter(subscriptionData: NewsletterSubscriptionData): Promise<NewsletterSubscriber> {
    try {
      // Validate email
      this.validateEmail(subscriptionData.email);

      const email = subscriptionData.email.toLowerCase().trim();

      // Check for existing subscription
      const existingSubscription = await this.getNewsletterSubscription(email);
      
      if (existingSubscription) {
        if (existingSubscription.status === 'active') {
          throw new Error('This email is already subscribed to our newsletter');
        } else {
          // Reactivate subscription
          return this.reactivateNewsletterSubscription(existingSubscription.id);
        }
      }

      const payload = {
        email,
        name: subscriptionData.name?.trim() || null,
        interests: subscriptionData.interests || [],
        source: subscriptionData.source || 'website',
        status: 'active' as const,
        subscribed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(), // Auto-confirm for now
        engagement_score: 0,
      };

      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Error subscribing to newsletter:', error);
        throw new Error(`Error subscribing to newsletter: ${error.message}`);
      }

      // Send welcome email
      this.sendNewsletterWelcomeEmail(data);

      return data;
    } catch (error) {
      console.error('Error in subscribeNewsletter:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from newsletter
   */
  async unsubscribeNewsletter(email: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        })
        .eq('email', email.toLowerCase());

      if (error) {
        throw new Error(`Error unsubscribing: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Error in unsubscribeNewsletter:', error);
      throw error;
    }
  }

  /**
   * Get newsletter subscribers with filtering
   */
  async getNewsletterSubscribers(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    interests?: string[];
    search?: string;
  } = {}) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact' })
      .order('subscribed_at', { ascending: false });

    // Apply filters
    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.interests?.length) {
      query = query.overlaps('interests', params.interests);
    }

    if (params.search) {
      const searchTerm = params.search.trim();
      query = query.or(`email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Error fetching newsletter subscribers: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  // ====================================
  // PRIVATE VALIDATION METHODS
  // ====================================

  private validateContactForm(data: ContactFormSubmission): void {
    if (!data.name?.trim()) {
      throw new Error('Name is required');
    }
    if (!data.email?.trim()) {
      throw new Error('Email is required');
    }
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }
    if (!data.subject?.trim()) {
      throw new Error('Subject is required');
    }
    if (!data.message?.trim()) {
      throw new Error('Message is required');
    }
    if (data.message.length < 10) {
      throw new Error('Message must be at least 10 characters long');
    }
  }

  private validateEventRegistration(data: EventRegistrationData): void {
    if (!data.event_id) {
      throw new Error('Event ID is required');
    }
    if (!data.name?.trim()) {
      throw new Error('Name is required');
    }
    if (!data.email?.trim()) {
      throw new Error('Email is required');
    }
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }
  }

  private validateStartupApplication(data: StartupApplicationData): void {
    const requiredFields = [
      'startup_name', 'founder_name', 'founder_email', 'description',
      'problem_statement', 'solution', 'target_market', 'business_model',
      'funding_stage', 'location', 'industry', 'competitive_advantage'
    ];

    for (const field of requiredFields) {
      if (!data[field as keyof StartupApplicationData]) {
        throw new Error(`${field.replace('_', ' ')} is required`);
      }
    }

    if (!this.isValidEmail(data.founder_email)) {
      throw new Error('Invalid founder email format');
    }
  }

  private validateEmail(email: string): void {
    if (!email?.trim()) {
      throw new Error('Email is required');
    }
    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // ====================================
  // PRIVATE HELPER METHODS
  // ====================================

  private determinePriority(formData: ContactFormSubmission): 'low' | 'medium' | 'high' | 'urgent' {
    const subject = formData.subject.toLowerCase();
    const message = formData.message.toLowerCase();

    // Urgent keywords
    if (subject.includes('urgent') || subject.includes('emergency') || 
        message.includes('urgent') || message.includes('emergency')) {
      return 'urgent';
    }

    // High priority keywords
    if (subject.includes('partnership') || subject.includes('investment') || 
        subject.includes('media') || subject.includes('press')) {
      return 'high';
    }

    // Medium priority keywords
    if (subject.includes('collaboration') || subject.includes('event') || 
        subject.includes('speaker')) {
      return 'medium';
    }

    return 'low';
  }

  private async checkExistingEventRegistration(eventId: UUID, email: string): Promise<boolean> {
    const { data } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('email', email.toLowerCase())
      .single();

    return !!data;
  }

  private async checkEventCapacity(eventId: UUID): Promise<boolean> {
    // Get event max capacity
    const { data: event } = await supabase
      .from('events')
      .select('max_attendees')
      .eq('id', eventId)
      .single();

    if (!event?.max_attendees) {
      return true; // No capacity limit
    }

    // Get current registration count
    const { count } = await supabase
      .from('event_registrations')
      .select('id', { count: 'exact' })
      .eq('event_id', eventId)
      .in('status', ['pending', 'confirmed']);

    return (count || 0) < event.max_attendees;
  }

  private async checkExistingStartupApplication(email: string): Promise<boolean> {
    const { data } = await supabase
      .from('startup_applications')
      .select('id')
      .eq('founder_email', email.toLowerCase())
      .single();

    return !!data;
  }

  private async getNewsletterSubscription(email: string): Promise<NewsletterSubscriber | null> {
    const { data } = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    return data;
  }

  private async reactivateNewsletterSubscription(id: UUID): Promise<NewsletterSubscriber> {
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .update({
        status: 'active',
        subscribed_at: new Date().toISOString(),
        unsubscribed_at: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Error reactivating subscription: ${error.message}`);
    }

    return data;
  }

  // ====================================
  // EMAIL NOTIFICATION METHODS (placeholders)
  // ====================================

  private async sendContactFormNotification(contactForm: ContactForm): Promise<void> {
    // TODO: Implement email notification logic
    console.log('Sending contact form notification:', contactForm.id);
  }

  private async sendEventRegistrationConfirmation(registration: EventRegistration): Promise<void> {
    // TODO: Implement email confirmation logic
    console.log('Sending event registration confirmation:', registration.id);
  }

  private async sendStartupApplicationConfirmation(application: StartupApplication): Promise<void> {
    // TODO: Implement email confirmation logic
    console.log('Sending startup application confirmation:', application.id);
  }

  private async sendNewsletterWelcomeEmail(subscriber: NewsletterSubscriber): Promise<void> {
    // TODO: Implement welcome email logic
    console.log('Sending newsletter welcome email:', subscriber.id);
  }
}

// Export singleton instance
export const formsService = new FormsService();