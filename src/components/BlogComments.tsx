import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MessageSquare, Reply, Trash2, Pencil, Send, X, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface CommentProfile {
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface Comment {
  id: string;
  entity_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  profiles: CommentProfile | null;
}

interface Props {
  entityId: string;
  entityType: string;
  countTable?: string;
  allowComments?: boolean;
}

/** @deprecated Use EntityComments instead */
export function BlogComments({ postId, allowComments }: { postId: string; allowComments?: boolean }) {
  return <EntityComments entityId={postId} entityType="blog_post" countTable="blog_posts" allowComments={allowComments} />;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function EntityComments({ entityId, entityType, countTable, allowComments = true }: Props) {
  const { t } = useTranslation();
  const { user, isAdmin, hasRole } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles:user_id(full_name, avatar_url, role)')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      return;
    }
    setComments((data as unknown as Comment[]) || []);
    setLoading(false);
  }, [entityId, entityType]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmit = async () => {
    if (!user || !newComment.trim()) return;
    setSubmitting(true);

    const { error } = await supabase.from('comments').insert({
      entity_id: entityId,
      entity_type: entityType,
      user_id: user.id,
      content: newComment.trim(),
      parent_id: null,
    });

    if (error) {
      toast.error(t('blog.comments.errorPosting'));
      console.error(error);
    } else {
      setNewComment('');
      toast.success(t('blog.comments.posted'));
      await updateCommentCount(1);
      await fetchComments();
    }
    setSubmitting(false);
  };

  const handleReply = async () => {
    if (!user || !replyContent.trim() || !replyTo) return;
    setSubmitting(true);

    const { error } = await supabase.from('comments').insert({
      entity_id: entityId,
      entity_type: entityType,
      user_id: user.id,
      content: replyContent.trim(),
      parent_id: replyTo,
    });

    if (error) {
      toast.error(t('blog.comments.errorPosting'));
      console.error(error);
    } else {
      setReplyTo(null);
      setReplyContent('');
      toast.success(t('blog.comments.posted'));
      await updateCommentCount(1);
      await fetchComments();
    }
    setSubmitting(false);
  };

  const handleEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    setSubmitting(true);

    const { error } = await supabase
      .from('comments')
      .update({ content: editContent.trim(), updated_at: new Date().toISOString() })
      .eq('id', commentId);

    if (error) {
      toast.error(t('blog.comments.errorEditing'));
      console.error(error);
    } else {
      setEditingId(null);
      setEditContent('');
      toast.success(t('blog.comments.edited'));
      await fetchComments();
    }
    setSubmitting(false);
  };

  const handleDelete = async (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    const hasReplies = comments.some(c => c.parent_id === commentId && !c.is_deleted);

    if (hasReplies) {
      // Soft delete: mark as deleted so replies still have context
      const { error } = await supabase
        .from('comments')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), content: '' })
        .eq('id', commentId);

      if (error) {
        toast.error(t('blog.comments.errorDeleting'));
        console.error(error);
      } else {
        toast.success(t('blog.comments.deleted'));
        await fetchComments();
      }
    } else {
      // Hard delete: no replies, just remove
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        toast.error(t('blog.comments.errorDeleting'));
        console.error(error);
      } else {
        toast.success(t('blog.comments.deleted'));
        await updateCommentCount(-1);
        await fetchComments();
      }
    }
  };

  const updateCommentCount = async (delta: number) => {
    if (!countTable) return;
    const { data } = await supabase
      .from(countTable)
      .select('comment_count')
      .eq('id', entityId)
      .single();

    if (data) {
      await supabase
        .from(countTable)
        .update({ comment_count: Math.max(0, ((data as any).comment_count || 0) + delta) })
        .eq('id', entityId);
    }
  };

  const canModerate = isAdmin() || hasRole('moderator');

  // Build thread structure: top-level + replies
  const topLevel = comments.filter(c => !c.parent_id);
  const replies = comments.filter(c => c.parent_id);
  const repliesByParent = new Map<string, Comment[]>();
  for (const r of replies) {
    const arr = repliesByParent.get(r.parent_id!) || [];
    arr.push(r);
    repliesByParent.set(r.parent_id!, arr);
  }

  // Sort top-level newest first
  topLevel.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalVisible = comments.filter(c => !c.is_deleted).length;

  const renderComment = (comment: Comment, isReply = false) => {
    const isOwn = user?.id === comment.user_id;
    const canDelete = isOwn || canModerate;
    const canEdit = isOwn && !comment.is_deleted;
    const isEditing = editingId === comment.id;
    const p = comment.profiles;

    if (comment.is_deleted) {
      return (
        <div key={comment.id} className={`flex gap-3 ${isReply ? 'ml-10 mt-3' : 'mt-4'}`}>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground italic">
              {t('blog.comments.deletedComment')}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div key={comment.id} className={`flex gap-3 ${isReply ? 'ml-10 mt-3' : 'mt-4'}`}>
        <Avatar className="w-8 h-8 shrink-0">
          {p?.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name || ''} />}
          <AvatarFallback className="text-xs">{getInitials(p?.full_name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{p?.full_name || t('blog.comments.anonymous')}</span>
            {p?.role && (p.role === 'admin' || p.role === 'moderator') && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                {p.role}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
            {comment.updated_at !== comment.created_at && (
              <span className="text-xs text-muted-foreground italic">({t('blog.comments.editedLabel')})</span>
            )}
          </div>

          {isEditing ? (
            <div className="mt-2">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                maxLength={2000}
              />
              <div className="flex gap-2 mt-1.5">
                <Button size="sm" onClick={() => handleEdit(comment.id)} disabled={submitting || !editContent.trim()}>
                  {t('blog.comments.save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditContent(''); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{comment.content}</p>
          )}

          {!isEditing && (
            <div className="flex items-center gap-3 mt-1.5">
              {user && !isReply && (
                <button
                  onClick={() => { setReplyTo(replyTo === comment.id ? null : comment.id); setReplyContent(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <Reply className="w-3 h-3" />
                  {t('blog.comments.reply')}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => { setEditingId(comment.id); setEditContent(comment.content); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  {t('blog.comments.edit')}
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('blog.comments.delete')}
                </button>
              )}
            </div>
          )}

          {/* Inline reply form */}
          {replyTo === comment.id && (
            <div className="mt-3 flex gap-2">
              <textarea
                value={replyContent}
                onChange={e => setReplyContent(e.target.value)}
                placeholder={t('blog.comments.replyPlaceholder')}
                className="flex-1 rounded-lg border border-border bg-background p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={2}
                maxLength={2000}
              />
              <div className="flex flex-col gap-1">
                <Button size="sm" onClick={handleReply} disabled={submitting || !replyContent.trim()}>
                  <Send className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Replies */}
          {!isReply && repliesByParent.get(comment.id)?.map(r => renderComment(r, true))}
        </div>
      </div>
    );
  };

  if (!allowComments) return null;

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">
          {t('blog.comments.title')}
        </h3>
        {totalVisible > 0 && (
          <span className="text-sm text-muted-foreground">({totalVisible})</span>
        )}
      </div>

      {/* Comment form for logged-in users */}
      {user ? (
        <div className="flex gap-3 mb-6">
          <Avatar className="w-8 h-8 shrink-0">
            {user.user_metadata?.avatar_url && <AvatarImage src={user.user_metadata.avatar_url} alt={user.user_metadata?.name || ''} />}
            <AvatarFallback className="text-xs">{getInitials(user.user_metadata?.name || user.email || null)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={t('blog.comments.placeholder')}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              maxLength={2000}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">{newComment.length}/2000</span>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !newComment.trim()}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {t('blog.comments.submit')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg border border-border bg-muted/30">
          <LogIn className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline font-medium">
              {t('blog.comments.loginToComment')}
            </Link>
          </p>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('blog.comments.empty')}</p>
      ) : (
        <div className="space-y-0">
          {topLevel.map(c => renderComment(c))}
        </div>
      )}
    </section>
  );
}
