// src/hooks/useProposals.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Proposal,
  ProposalStatus,
  ContentType,
  ProposalData,
  Startup,
  Event,
  Community,
  Referent,
  Course
} from '@/types/proposals';
import { toast } from 'sonner';
import { notifyProposalSubmitted, notifyProposalApproved, notifyProposalRejected } from '@/services/notifications.service';

interface UseProposalsOptions {
  status?: ProposalStatus;
  contentType?: ContentType;
  userId?: string;
  autoFetch?: boolean;
}

export function useProposals(options: UseProposalsOptions = {}) {
  const {
    status,
    contentType,
    userId,
    autoFetch = true
  } = options;

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch proposals
  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🔍 useProposals: Fetching with filters:', { status, contentType, userId });

      // Primero intentamos sin los JOINs para debuggear
      let query = supabase
        .from('proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (contentType) query = query.eq('content_type', contentType);
      if (userId) query = query.eq('proposed_by', userId);

      const { data, error: fetchError } = await query;

      console.log('🔍 useProposals: Response:', { data, error: fetchError });

      if (fetchError) {
        console.error('❌ Full error details:', {
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code
        });
      }

      if (fetchError) throw fetchError;
      setProposals((data as Proposal[]) || []);
      console.log('✅ useProposals: Loaded', (data as Proposal[] || []).length, 'proposals');
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('❌ useProposals: Error fetching proposals:', error);
      toast.error('Error al cargar propuestas');
    } finally {
      setLoading(false);
    }
  }, [status, contentType, userId]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch) {
      fetchProposals();
    }
  }, [autoFetch, fetchProposals]);

  // Create proposal
  const createProposal = useCallback(async (
    proposalContentType: ContentType,
    contentData: ProposalData
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      const { data, error: insertError } = await supabase
        .from('proposals')
        .insert({
          content_type: proposalContentType,
          content_data: contentData,
          proposed_by: user.id,
          status: 'pending'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Enviar notificaciones por email
      const contentTitle = (contentData as any).title || (contentData as any).name || 'Sin título';
      notifyProposalSubmitted(user.email || '', proposalContentType, contentTitle)
        .catch(err => console.error('Error sending notification:', err));

      toast.success('Propuesta enviada correctamente');
      await fetchProposals();

      return { data: data as Proposal, error: null };
    } catch (err) {
      const error = err as Error;
      console.error('Error creating proposal:', error);
      toast.error('Error al crear propuesta');
      return { data: null, error };
    }
  }, [fetchProposals]);

  // Approve proposal
  const approveProposal = useCallback(async (
    proposalId: string,
    reviewNotes?: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      // Obtener la propuesta con el email del usuario
      const { data: proposal, error: fetchError } = await supabase
        .from('proposals')
        .select(`
          *,
          proposed_by_user:proposed_by(email)
        `)
        .eq('id', proposalId)
        .single();

      if (fetchError) throw fetchError;
      if (!proposal) throw new Error('Propuesta no encontrada');

      // Extraer email del usuario que propuso
      const proposerEmail = (proposal as any).proposed_by_user?.email;

      // Actualizar estado de la propuesta
      console.log('🔄 Attempting to update proposal:', proposalId, 'by user:', user.id);
      const { data: updateData, error: updateError } = await supabase
        .from('proposals')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes
        })
        .eq('id', proposalId)
        .select();

      console.log('🔄 Update response:', { data: updateData, error: updateError });

      if (updateError) {
        console.error('❌ Update error details:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        });
        throw updateError;
      }

      // Migrar contenido a la tabla correspondiente
      await migrateProposalToContent(proposal as Proposal);

      // Enviar notificación al usuario
      if (proposerEmail) {
        const contentTitle = proposal.content_data?.title || proposal.content_data?.name || 'Sin título';
        notifyProposalApproved(proposerEmail, proposal.content_type, contentTitle)
          .catch(err => console.error('Error sending approval notification:', err));
      }

      toast.success('Propuesta aprobada correctamente');
      await fetchProposals();

      return { error: null };
    } catch (err) {
      const error = err as Error;
      console.error('Error approving proposal:', error);
      toast.error('Error al aprobar propuesta');
      return { error };
    }
  }, [fetchProposals]);

  // Reject proposal
  const rejectProposal = useCallback(async (
    proposalId: string,
    reviewNotes: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      // Obtener la propuesta con el email del usuario
      const { data: proposal, error: fetchError } = await supabase
        .from('proposals')
        .select(`
          *,
          proposed_by_user:proposed_by(email)
        `)
        .eq('id', proposalId)
        .single();

      if (fetchError) throw fetchError;

      const proposerEmail = (proposal as any)?.proposed_by_user?.email;

      const { error: updateError } = await supabase
        .from('proposals')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes
        })
        .eq('id', proposalId);

      if (updateError) throw updateError;

      // Enviar notificación al usuario
      if (proposerEmail && proposal) {
        const contentTitle = proposal.content_data?.title || proposal.content_data?.name || 'Sin título';
        notifyProposalRejected(proposerEmail, proposal.content_type, contentTitle, reviewNotes)
          .catch(err => console.error('Error sending rejection notification:', err));
      }

      toast.success('Propuesta rechazada');
      await fetchProposals();

      return { error: null };
    } catch (err) {
      const error = err as Error;
      console.error('Error rejecting proposal:', error);
      toast.error('Error al rechazar propuesta');
      return { error };
    }
  }, [fetchProposals]);

  // Delete proposal
  const deleteProposal = useCallback(async (proposalId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('proposals')
        .delete()
        .eq('id', proposalId);

      if (deleteError) throw deleteError;

      toast.success('Propuesta eliminada');
      await fetchProposals();

      return { error: null };
    } catch (err) {
      const error = err as Error;
      console.error('Error deleting proposal:', error);
      toast.error('Error al eliminar propuesta');
      return { error };
    }
  }, [fetchProposals]);

  // Migrate proposal to content table
  const migrateProposalToContent = async (proposal: Proposal) => {
    try {
      const tableMap: Record<ContentType, string> = {
        startup: 'startups',
        event: 'events',
        community: 'communities',
        referent: 'defi_advocates',
        course: 'courses',
        blog: 'blog_posts',
        job: 'jobs'
      };

      const tableName = tableMap[proposal.content_type];
      if (!tableName) {
        throw new Error(`Tipo de contenido no soportado: ${proposal.content_type}`);
      }

      // Preparar datos según el tipo
      let insertData: any = {
        ...proposal.content_data,
        proposal_id: proposal.id,
        created_by: proposal.proposed_by
      };

      // Agregar campos específicos según el tipo
      switch (proposal.content_type) {
        case 'startup':
          // Generar slug desde el nombre
          const startupSlug = insertData.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

          insertData = {
            name: insertData.name,
            slug: startupSlug,
            description: insertData.description,
            long_description: insertData.long_description || insertData.description,
            tagline: insertData.tagline || '',
            website: insertData.website || '',
            logo_url: insertData.logo_url || '',
            cover_image_url: insertData.cover_image_url || '',
            categories: insertData.categories || [],
            tags: insertData.tags || [],
            city: insertData.city || '',
            country: insertData.country || 'Mexico',
            founded_date: insertData.founded_date || new Date().toISOString(),
            team_size: insertData.team_size || 0,
            funding_stage: insertData.funding_stage || null,
            funding_raised_usd: insertData.funding_raised_usd || 0,
            github_url: insertData.github_url || '',
            twitter_url: insertData.twitter_url || '',
            linkedin_url: insertData.linkedin_url || '',
            telegram_url: insertData.telegram_url || '',
            discord_url: insertData.discord_url || '',
            proposal_id: proposal.id,
            created_by: proposal.proposed_by,
            status: 'published', // Publicar automáticamente al aprobar
            verification_status: 'verified',
            is_featured: false,
            view_count: 0,
            like_count: 0,
            share_count: 0,
            total_users: 0,
            unique_visitors: 0
          };
          break;

        case 'event':
          // Generar slug desde el título
          const eventSlug = insertData.title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

          // Mapear event_type/format a valores válidos: 'presencial' | 'online' | 'hibrido'
          let mappedEventType = 'presencial'; // default
          const rawEventType = insertData.event_type || insertData.format || '';
          if (rawEventType.toLowerCase().includes('online') || rawEventType.toLowerCase().includes('virtual')) {
            mappedEventType = 'online';
          } else if (rawEventType.toLowerCase().includes('hybrid') || rawEventType.toLowerCase().includes('híbrido') || rawEventType.toLowerCase().includes('hibrido')) {
            mappedEventType = 'hibrido';
          }

          insertData = {
            title: insertData.title,
            slug: eventSlug,
            description: insertData.description,
            subtitle: insertData.subtitle || '',
            category: insertData.category || 'meetup',
            event_type: mappedEventType,
            start_date: insertData.start_date,
            start_time: insertData.start_time || '00:00',
            end_time: insertData.end_time || '23:59',
            timezone: insertData.timezone || 'America/Mexico_City',
            venue_name: insertData.venue_name || insertData.location || '',
            venue_address: insertData.venue_address || '',
            venue_city: insertData.venue_city || insertData.city || '',
            venue_country: insertData.venue_country || insertData.country || 'Mexico',
            venue_state: insertData.venue_state || '',
            online_url: insertData.online_url || '',
            online_platform: insertData.online_platform || '',
            organizer_name: insertData.organizer_name || insertData.organizer || '',
            organizer_email: insertData.organizer_email || '',
            is_free: insertData.is_free !== false,
            price: insertData.price || 0,
            currency: insertData.currency || 'MXN',
            capacity: insertData.max_attendees || insertData.capacity || 0,
            registration_required: insertData.registration_required !== false,
            registration_url: insertData.registration_url || '',
            image_url: insertData.image_url || insertData.cover_image_url || '',
            banner_url: insertData.banner_url || insertData.cover_image_url || '',
            tags: insertData.tags || [],
            sponsors: insertData.sponsors || [],
            partners: insertData.partners || [],
            language: insertData.language || ['es'],
            difficulty_level: insertData.difficulty_level || 'beginner',
            proposal_id: proposal.id,
            created_by: proposal.proposed_by,
            status: 'published', // Publicar automáticamente al aprobar
            is_featured: false,
            current_attendees: 0,
            waitlist_count: 0,
            waitlist_enabled: false,
            view_count: 0,
            share_count: 0,
            cancellation_reason: ''
          };
          break;

        case 'community':
          // Mapear campos de propuesta a schema de communities
          // Generar slug desde el nombre
          const communitySlug = insertData.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remover acentos
            .replace(/[^a-z0-9\s-]/g, '') // Remover caracteres especiales
            .trim()
            .replace(/\s+/g, '-') // Espacios a guiones
            .replace(/-+/g, '-'); // Multiples guiones a uno solo

          insertData = {
            name: insertData.name,
            slug: communitySlug,
            description: insertData.short_description || insertData.description,
            long_description: insertData.description,
            // Usar focus_area como category (defi, nft, etc.) y poner community_type en tags
            category: insertData.focus_area || 'defi',
            image_url: insertData.logo_url || insertData.cover_image_url || '',
            banner_url: insertData.cover_image_url || '',
            // Incluir community_type en tags si existe
            tags: [
              ...(insertData.tags || []),
              ...(insertData.community_type ? [insertData.community_type] : [])
            ],
            member_count: insertData.member_count || 0,
            links: {
              website: insertData.main_url || '',
              twitter: insertData.twitter_url || '',
              telegram: insertData.telegram_url || '',
              discord: insertData.discord_url || '',
              github: insertData.github_url || '',
            },
            proposal_id: proposal.id,
            created_by: proposal.proposed_by,
            is_featured: false,
            is_verified: true, // Marcar como verificada porque fue aprobada por un admin
            is_official: false,
            active_members_count: 0,
            post_count: 0,
            moderators: [],
            rules: []
          };
          break;

        case 'referent':
          // Generar slug desde el nombre
          const referentSlug = insertData.name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

          // Mapear categorías de español a inglés
          const categoryMap: Record<string, string> = {
            'programadores': 'developer',
            'abogados': 'lawyer',
            'financieros': 'financial',
            'diseñadores': 'designer',
            'marketers': 'marketer',
            'otros': 'other'
          };

          const rawCategory = insertData.category || insertData.track || 'otros';
          const mappedTrack = categoryMap[rawCategory.toLowerCase()] || 'other';

          insertData = {
            name: insertData.name,
            slug: referentSlug,
            bio: insertData.bio || insertData.description || '',
            email: insertData.email || '',
            location: insertData.location || insertData.city || '',
            expertise: insertData.expertise || insertData.expertise_areas?.join(', ') || '',
            track: mappedTrack,
            specializations: insertData.expertise_areas || insertData.specializations || [],
            achievements: insertData.achievements || [],
            avatar_url: insertData.avatar_url || insertData.photo_url || '',
            twitter_url: insertData.twitter_url || '',
            linkedin_url: insertData.linkedin_url || '',
            github_url: insertData.github_url || '',
            website: insertData.website || insertData.portfolio_url || '',
            proposal_id: proposal.id,
            created_by: proposal.proposed_by,
            is_active: true, // Activar automáticamente al aprobar
            is_featured: false,
            display_order: 999 // Al final por defecto
          };
          break;

        case 'course':
          insertData = {
            ...insertData,
            learning_outcomes: insertData.learning_outcomes || [],
            prerequisites: insertData.prerequisites || [],
            tags: insertData.tags || [],
            enrolled_count: 0,
            review_count: 0,
            is_featured: false,
            status: 'approved',
            language: insertData.language || 'es',
            currency: insertData.currency || 'MXN'
          };
          break;

        case 'blog':
          insertData = {
            ...insertData,
            tags: insertData.tags || [],
            author_id: proposal.proposed_by,
            status: 'approved',
            published_at: new Date().toISOString(),
            view_count: 0,
            is_featured: false
          };
          break;

        case 'job':
          insertData = {
            title: insertData.title,
            company: insertData.company,
            company_logo: insertData.company_logo || null,
            location: insertData.location || 'México',
            job_type: insertData.job_type || 'remote',
            category: insertData.category || 'Engineering',
            salary_min: insertData.salary_min || null,
            salary_max: insertData.salary_max || null,
            salary_currency: insertData.salary_currency || 'USD',
            experience_level: insertData.experience_level || 'Mid (2-4 años)',
            tags: insertData.tags || [],
            description: insertData.description || '',
            requirements: insertData.requirements || null,
            benefits: insertData.benefits || null,
            apply_url: insertData.apply_url || '',
            apply_email: insertData.apply_email || null,
            proposal_id: proposal.id,
            created_by: proposal.proposed_by,
            is_featured: false,
            status: 'published' // Publicar automáticamente al aprobar
          };
          break;
      }

      // Insertar en la tabla correspondiente
      console.log('🔄 Migration attempt:', {
        tableName,
        insertData: JSON.stringify(insertData, null, 2)
      });

      const { data, error: insertError } = await supabase
        .from(tableName)
        .insert(insertData)
        .select();

      console.log('🔄 Migration response:', { data, error: insertError });

      if (insertError) {
        console.error('❌ Migration error details:', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
          tableName,
          insertData
        });
        throw insertError;
      }

      console.log(`✅ Content migrated to ${tableName}`, { createdData: data });
    } catch (err) {
      console.error('Error migrating proposal to content:', err);
      throw err;
    }
  };

  // Get proposal by ID
  const getProposal = useCallback(async (proposalId: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('proposals')
        .select(`
          *,
          proposed_by_profile:profiles!proposed_by(
            id,
            email,
            full_name,
            avatar_url,
            role
          ),
          reviewed_by_profile:profiles!reviewed_by(
            id,
            email,
            full_name,
            avatar_url,
            role
          )
        `)
        .eq('id', proposalId)
        .single();

      if (fetchError) throw fetchError;

      return { data: data as Proposal, error: null };
    } catch (err) {
      const error = err as Error;
      console.error('Error fetching proposal:', error);
      return { data: null, error };
    }
  }, []);

  return {
    proposals,
    loading,
    error,
    fetchProposals,
    createProposal,
    approveProposal,
    rejectProposal,
    deleteProposal,
    getProposal,
    refetch: fetchProposals
  };
}
